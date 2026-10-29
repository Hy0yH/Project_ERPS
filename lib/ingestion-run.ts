import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { invalidateOperationsStatus } from "@/lib/operations";

type Database = ReturnType<typeof getSupabaseAdmin>;
export type RunStatus = "success" | "partial_success" | "failed";
export type RunProgress = (stage: string, savedMatches?: number) => void;
export class IngestionBusyError extends Error {}

// Persist codes, never arbitrary upstream messages, URLs, or credentials.
export function ingestionErrorCode(error: unknown) {
  const value = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return /^[A-Z0-9_]{1,30}$/.test(value) ? value : "INGESTION_FAILED";
}

export async function runIngestionJob<T>(
  db: Database,
  job: "collect-rankers" | "build-snapshots",
  work: (run: { id: number; token: string; progress: RunProgress }) => Promise<{
    result: T; status?: RunStatus; savedMatches?: number; diagnostic?: Record<string, unknown> | null;
  }>
): Promise<T> {
  const token = randomUUID();
  const started = await db.rpc("begin_ingestion_run", { p_job_name: job, p_lease_token: token });
  if (started.error?.code === "55P03") throw new IngestionBusyError("작업이 이미 실행 중입니다.");
  if (started.error) throw started.error;
  const id = Number(started.data);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid ingestion run ID");
  let stage = "starting", savedMatches = 0, heartbeatError: unknown;
  let heartbeat = Promise.resolve();
  const progress: RunProgress = (next, saved) => {
    if (heartbeatError) throw heartbeatError;
    stage = next;
    if (saved !== undefined) savedMatches = saved;
  };
  const tick = () => {
    heartbeat = heartbeat.then(async () => {
      const reply = await db.rpc("heartbeat_ingestion_run", {
        p_run_id: id, p_lease_token: token, p_stage: stage, p_saved_matches: savedMatches
      });
      if (reply.error) throw reply.error;
      if (!reply.data) throw new Error("Ingestion lease lost");
    }).catch((error) => { heartbeatError = error; });
  };
  const timer = setInterval(tick, 30_000);
  timer.unref();
  invalidateOperationsStatus();
  async function finish(status: RunStatus, diagnostic: Record<string, unknown> | null) {
    const reply = await db.rpc("finish_ingestion_run", {
      p_run_id: id, p_lease_token: token, p_status: status, p_saved_matches: savedMatches,
      p_diagnostic: diagnostic
    });
    if (reply.error) throw reply.error;
    if (!reply.data) throw new Error("Ingestion lease lost during finalization");
  }
  try {
    const outcome = await work({ id, token, progress });
    clearInterval(timer);
    await heartbeat;
    if (heartbeatError) throw heartbeatError;
    savedMatches = outcome.savedMatches ?? savedMatches;
    await finish(outcome.status ?? "success", outcome.diagnostic ?? null);
    return outcome.result;
  } catch (error) {
    clearInterval(timer);
    await heartbeat;
    const diagnostic = error && typeof error === "object" && "diagnostic" in error
      ? error.diagnostic as Record<string, unknown> : { stage, code: ingestionErrorCode(error) };
    try { await finish("failed", diagnostic); }
    catch { console.warn("ingestion-finalization-unavailable", { runId: id, job, stage }); }
    throw error;
  } finally {
    clearInterval(timer);
    invalidateOperationsStatus();
  }
}
