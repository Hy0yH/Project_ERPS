import { getSupabaseAdmin } from "@/lib/supabase";
import { invalidateMetaReads } from "@/lib/data";
import { runIngestionJob, IngestionBusyError, ingestionErrorCode } from "@/lib/ingestion-run";

export type SnapshotProgress = ((stage: string, rows?: number, batch?: number) => void) & {
  runId: number; leaseToken: string;
};
export class SnapshotBusyError extends Error {}
let running = false;

export async function runSnapshotBuild<T>(build: (progress: SnapshotProgress) => Promise<T>): Promise<T> {
  if (running) throw new SnapshotBusyError("집계가 이미 실행 중입니다.");
  running = true;
  try {
    const db = getSupabaseAdmin();
    return await runIngestionJob(db, "build-snapshots", async (run) => {
      const started = Date.now();
      let stage = "starting", rowCount = 0, batchIndex = 0;
      const progress: SnapshotProgress = Object.assign((next: string, rows = 0, batch = 0) => {
        run.progress(next);
        stage = next; rowCount = rows; batchIndex = batch;
        console.info("snapshot-stage", { runId: run.id, stage, rows, batch, elapsedMs: Date.now() - started });
      }, { runId: run.id, leaseToken: run.token });
      try {
        const result = await build(progress);
        invalidateMetaReads();
        return { result };
      } catch (error) {
        const diagnostic = { stage, rows: rowCount, batch: batchIndex, code: ingestionErrorCode(error) };
        throw Object.assign(error instanceof Error ? error : new Error(diagnostic.code), { code: diagnostic.code, diagnostic });
      }
    });
  } catch (error) {
    if (error instanceof IngestionBusyError) throw new SnapshotBusyError("집계가 이미 실행 중입니다.");
    throw error;
  } finally { running = false; }
}

export async function writeSnapshotBatches(db: ReturnType<typeof getSupabaseAdmin>, table: string,
  rows: Record<string, unknown>[], _conflict: string, progress: SnapshotProgress, batchSize = 250) {
  for (let index = 0; index < rows.length; index += batchSize) {
    const batchIndex = Math.floor(index / batchSize);
    progress(`write:${table}`, rows.length, batchIndex + 1);
    const { error } = await db.from("snapshot_staging_batches").upsert({
      run_id: progress.runId, table_name: table, batch_index: batchIndex, rows: rows.slice(index, index + batchSize)
    }, { onConflict: "run_id,table_name,batch_index" });
    if (error) throw error;
  }
}

export async function publishSnapshotBuild(db: ReturnType<typeof getSupabaseAdmin>, progress: SnapshotProgress,
  scope: { periodDays: number; periodStart: string; periodEnd: string; patchKey: string | null }, counts: Record<string, number>) {
  progress("publish");
  const { error } = await db.rpc("publish_snapshot_build", {
    p_run_id: progress.runId, p_lease_token: progress.leaseToken,
    p_period_days: scope.periodDays, p_period_start: scope.periodStart, p_period_end: scope.periodEnd,
    p_patch_key: scope.patchKey, p_expected_counts: counts
  });
  if (error) throw error;
}
