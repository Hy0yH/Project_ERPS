import { getActivePatch } from "@/lib/patch-version";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { createAsyncCache } from "@/lib/async-cache";

export type OperationsStatus = {
  checkedAt: string; database: "ready" | "unavailable" | "unconfigured"; patch: string | null;
  snapshots: { characters: string | null; compositions: string | null; benchmarks: string | null };
  stale: boolean; inconsistent: boolean;
  queue: { pending: number | null; processing: number | null; failed: number | null };
  runs: Array<{ id: number; job: string; status: string; savedMatches: number; startedAt: string; finishedAt: string | null; hasWarnings: boolean;
    diagnostic: { stage: string; code: string; rows: number; batch: number } | null }>;
};
export function snapshotDiagnostic(value: unknown): OperationsStatus["runs"][number]["diagnostic"] {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || !/^(starting|read_patch|read_players|calculate|write:[a-z_]+)$/.test(parsed.stage) ||
      !/^[A-Z0-9_]{1,30}$/.test(parsed.code) || !Number.isSafeInteger(parsed.rows) || parsed.rows < 0 ||
      !Number.isSafeInteger(parsed.batch) || parsed.batch < 0) return null;
    return { stage: parsed.stage, code: parsed.code, rows: parsed.rows, batch: parsed.batch };
  } catch { return null; }
}
const cache = createAsyncCache<OperationsStatus>(30_000, 1);
type PublicSnapshotStatus = Pick<OperationsStatus, "database" | "snapshots" | "stale" | "inconsistent">;
const publicCache = createAsyncCache<PublicSnapshotStatus>(30_000, 1);
export function invalidateOperationsStatus() { cache.clear(); publicCache.clear(); }
export function summarizeFreshness(times: OperationsStatus["snapshots"], now = Date.now()) {
  const primary = [times.characters, times.compositions].map((value) => value ? Date.parse(value) : NaN);
  return { stale: primary.some((time) => !Number.isFinite(time) || now - time > 6 * 60 * 60_000),
    inconsistent: primary.some((time) => !Number.isFinite(time)) || Math.abs(primary[0] - primary[1]) > 15 * 60_000 };
}

// Public pages only need snapshot times, not ingestion logs and queue counts.
export function getPublicSnapshotStatus(): Promise<PublicSnapshotStatus> {
  return publicCache.get("snapshots", async () => {
    const initial: PublicSnapshotStatus = { database: "unconfigured",
      snapshots: { characters: null, compositions: null, benchmarks: null }, stale: true, inconsistent: true };
    if (!isSupabaseConfigured()) return initial;
    try {
      const db = getSupabaseAdmin();
      const patch = await getActivePatch(db);
      const snapshot = async (table: "character_stats_snapshot" | "team_comp_stats") => {
        let query = db.from(table).select("period_end").eq("rank_scope", "above:mythril").eq("period_days", 14);
        if (patch?.patch_start_at) query = query.gte("period_start", patch.patch_start_at);
        if (table === "character_stats_snapshot" && patch) query = query.eq("tier_filter", `current_patch:${patch.patch_key}`);
        const { data, error } = await query.order("period_end", { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        return data?.period_end ? String(data.period_end) : null;
      };
      const [characters, compositions] = await Promise.all([snapshot("character_stats_snapshot"), snapshot("team_comp_stats")]);
      const snapshots = { characters, compositions, benchmarks: null };
      return { database: "ready", snapshots, ...summarizeFreshness(snapshots) };
    } catch { return { ...initial, database: "unavailable" }; }
  });
}
export function getOperationsStatus(): Promise<OperationsStatus> {
  return cache.get("status", async () => {
    const initial: OperationsStatus = { checkedAt: new Date().toISOString(), database: "unconfigured", patch: null,
      snapshots: { characters: null, compositions: null, benchmarks: null }, stale: true, inconsistent: true,
      queue: { pending: null, processing: null, failed: null }, runs: [] };
    if (!isSupabaseConfigured()) return initial;
    const db = getSupabaseAdmin();
    try {
      const patch = await getActivePatch(db);
      const snapshot = async (table: string) => {
        let query = db.from(table).select("period_end");
        if (table === "player_metric_benchmarks") query = query.eq("patch_key", patch?.patch_key ?? "");
        else {
          query = query.eq("rank_scope", "above:mythril").eq("period_days", 14);
          if (patch?.patch_start_at) query = query.gte("period_start", patch.patch_start_at);
          if (table === "character_stats_snapshot" && patch) query = query.eq("tier_filter", `current_patch:${patch.patch_key}`);
        }
        const { data, error } = await query.order("period_end", { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        return data?.period_end ? String(data.period_end) : null;
      };
      const count = async (status: string) => { const result = await db.from("match_ingestion_queue").select("game_id", { count: "exact", head: true }).eq("status", status); return result.error ? null : result.count ?? 0; };
      const [characters, compositions, benchmarks, pending, processing, failed, runs] = await Promise.all([
        snapshot("character_stats_snapshot"), snapshot("team_comp_stats"), snapshot("player_metric_benchmarks"),
        count("pending"), count("processing"), count("failed"),
        db.from("ingestion_runs").select("id,job_name,status,saved_matches,started_at,finished_at,error_message").order("started_at", { ascending: false }).limit(10)
      ]);
      const snapshots = { characters, compositions, benchmarks };
      return { ...initial, database: "ready", patch: patch?.patch_key ?? null, snapshots, ...summarizeFreshness(snapshots),
        queue: { pending, processing, failed }, runs: (runs.data ?? []).map((run) => ({ id: Number(run.id), job: String(run.job_name),
          status: String(run.status), savedMatches: Number(run.saved_matches), startedAt: String(run.started_at),
          finishedAt: run.finished_at ? String(run.finished_at) : null, hasWarnings: Boolean(run.error_message),
          diagnostic: run.job_name === "build-snapshots" ? snapshotDiagnostic(run.error_message) : null })) };
    } catch { return { ...initial, database: "unavailable" }; }
  });
}
