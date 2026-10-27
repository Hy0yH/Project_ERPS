import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import type { RankScope } from "@/lib/rank-scopes";

export type PatchMetaPoint = { patch: string; games: number; winRate: number; top3Rate: number; averageRank: number; updatedAt: string };
export function patchMetaPoints(rows: Array<Record<string, unknown>>): PatchMetaPoint[] {
  const points = new Map<string, PatchMetaPoint>();
  for (const row of rows) {
    const patch = String(row.tier_filter ?? "").match(/^current_patch:(\d+\.\d+\.\d+)$/)?.[1];
    if (!patch || points.has(patch)) continue;
    points.set(patch, { patch, games: Number(row.games), winRate: Number(row.win_rate), top3Rate: Number(row.top3_rate),
      averageRank: Number(row.average_rank), updatedAt: String(row.period_end) });
  }
  return [...points.values()].sort((a, b) => b.patch.localeCompare(a.patch, undefined, { numeric: true })).slice(0, 8);
}
export async function getCharacterPatchMeta(characterCode: number, weaponCode: number, rankScope: RankScope) {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabaseAdmin().from("character_stats_snapshot")
    .select("tier_filter,games,win_rate,top3_rate,average_rank,period_end")
    .eq("character_code", characterCode).eq("weapon_code", weaponCode).eq("rank_scope", rankScope)
    .eq("period_days", 14).order("period_end", { ascending: false }).limit(32);
  if (error) throw error;
  return patchMetaPoints(data ?? []);
}
