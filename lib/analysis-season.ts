import type { getSupabaseAdmin } from "@/lib/supabase";

export function validSeasonId(value: unknown): number | null {
  const season = Number(value);
  return Number.isSafeInteger(season) && season > 0 ? season : null;
}

export function resolveAnalysisSeason(
  configured: unknown,
  stored: unknown,
  rows: Record<string, unknown>[] = []
): number | null {
  const explicit = validSeasonId(configured);
  if (explicit) return explicit;
  const candidates = [stored, ...rows.map((row) => row.seasonId ?? row.season_id)]
    .map(validSeasonId)
    .filter((season): season is number => season !== null);
  return candidates.length ? Math.max(...candidates) : null;
}

export async function getStoredAnalysisSeason(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  configured: unknown
): Promise<number | null> {
  const explicit = validSeasonId(configured);
  if (explicit) return explicit;
  const { data, error } = await supabase.from("matches")
    .select("season_id")
    .eq("matching_mode", 3)
    .eq("matching_team_mode", 3)
    .gt("season_id", 0)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return validSeasonId(data?.season_id);
}
