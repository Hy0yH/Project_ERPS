import { getSupabaseAdmin } from "@/lib/supabase";
import { invalidateMetaReads } from "@/lib/data";
import { invalidateOperationsStatus } from "@/lib/operations";
export type SnapshotProgress = (stage: string, rows?: number, batch?: number) => void;
export class SnapshotBusyError extends Error {}
let running = false;
export async function runSnapshotBuild<T>(build: (progress: SnapshotProgress) => Promise<T>): Promise<T> {
  if (running) throw new SnapshotBusyError("집계가 이미 실행 중입니다.");
  running = true;
  let db: ReturnType<typeof getSupabaseAdmin> | null = null;
  let runId: number | null = null, stage = "starting", rowCount = 0, batchIndex = 0;
  const started = Date.now();
  const progress: SnapshotProgress = (next, rows = 0, batch = 0) => {
    stage = next; rowCount = rows; batchIndex = batch;
    console.info("snapshot-stage", JSON.stringify({ runId, stage, rows, batch, elapsedMs: Date.now() - started }));
  };
  try {
    db = getSupabaseAdmin();
    const inserted = await db.from("ingestion_runs").insert({ job_name: "build-snapshots", status: "running" }).select("id").single();
    if (inserted.error) throw inserted.error;
    runId = Number(inserted.data.id);
    invalidateOperationsStatus();
    const result = await build(progress);
    const finished = await db.from("ingestion_runs").update({ status: "success", finished_at: new Date().toISOString(), error_message: null }).eq("id", runId);
    if (finished.error) throw finished.error;
    return result;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).slice(0, 30) : "BUILD_FAILED";
    if (runId !== null && db) {
      try {
        await db.from("ingestion_runs").update({ status: "failed", finished_at: new Date().toISOString(),
          error_message: JSON.stringify({ stage, rows: rowCount, batch: batchIndex, code, elapsedMs: Date.now() - started }) }).eq("id", runId);
      } catch { console.warn("snapshot-failure-log-unavailable", { runId, stage, code }); }
    }
    throw error;
  } finally { running = false; invalidateMetaReads(); invalidateOperationsStatus(); }
}
export async function writeSnapshotBatches(db: ReturnType<typeof getSupabaseAdmin>, table: string,
  rows: Record<string, unknown>[], conflict: string, progress: SnapshotProgress, batchSize = 250) {
  for (let index = 0; index < rows.length; index += batchSize) {
    progress(`write:${table}`, rows.length, Math.floor(index / batchSize) + 1);
    const { error } = await db.from(table).upsert(rows.slice(index, index + batchSize), { onConflict: conflict });
    if (error) throw error;
  }
}
