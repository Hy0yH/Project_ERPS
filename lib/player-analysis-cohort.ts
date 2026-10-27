import { PLAYER_ANALYSIS_BASE_VERSION, type AnalysisRow } from "@/lib/player-analysis";
import type { getSupabaseAdmin } from "@/lib/supabase";
import type { PatchVersion } from "@/lib/types";

const COLUMNS = ["game_id", "user_num", "character_code", "best_weapon", "game_rank", "player_kill", "player_assistant",
  "team_kill", "play_time", "damage_to_player", "damage_from_player", "damage_to_monster", "cc_time_to_player", "monster_kill",
  "best_weapon_level", "total_gain_vf_credit", "team_recover", "protect_absorb", "mmr_before", "mmr_after", "mmr_gain",
  "view_contribution:equipment->__analysis->viewContribution",
  "matches!inner(season_id,matching_mode,matching_team_mode,version_season,version_major,version_minor,started_at)"].join(",");

export async function readAnalysisCohortRows(
  supabase: ReturnType<typeof getSupabaseAdmin>, patch: PatchVersion | null,
  mmrMin: number, mmrMax: number, excludedUserNum: number, seasonId: number
) {
  const bound = async (ascending: boolean) => {
    if (!patch) return null;
    const { data, error } = await supabase.from("matches").select("game_id")
      .eq("season_id", seasonId).eq("matching_mode", 3).eq("matching_team_mode", 3)
      .eq("version_season", patch.version_season).eq("version_major", patch.version_major).eq("version_minor", patch.version_minor)
      .gte("started_at", patch.patch_start_at).order("game_id", { ascending }).limit(1).maybeSingle();
    if (error) throw error;
    return Number(data?.game_id) > 0 ? Number(data?.game_id) : null;
  };
  const [firstGame, lastGame] = await Promise.all([bound(true), bound(false)]);
  const pageSize = 1000;
  // Restrict each index scan, including its final short page. A large joined
  // season scan can time out even with keyset pagination at sparse MMR ranges.
  const windowSize = 10_000;
  const windows: Array<{ start: number | null; end: number | null }> = [];
  if (firstGame !== null && lastGame !== null) {
    for (let start = firstGame; start <= lastGame; start += windowSize) windows.push({ start, end: Math.min(start + windowSize - 1, lastGame) });
  } else windows.push({ start: firstGame, end: lastGame });
  const readWindow = async ({ start: windowStart, end: windowEnd }: typeof windows[number]) => {
    const rows: AnalysisRow[] = [];
    let cursor: { game: number; user: number } | null = null;
    for (;;) {
      let query = supabase.from("match_players").select(COLUMNS)
        .eq("matches.season_id", seasonId).eq("matches.matching_mode", 3).eq("matches.matching_team_mode", 3)
        .gte("analysis_data_version", PLAYER_ANALYSIS_BASE_VERSION).gte("mmr_after", mmrMin).lt("mmr_after", mmrMax);
      if (windowStart !== null) query = query.gte("game_id", windowStart);
      if (windowEnd !== null) query = query.lte("game_id", windowEnd);
      if (cursor) query = query.gte("game_id", cursor.game)
        .or(`game_id.gt.${cursor.game},and(game_id.eq.${cursor.game},user_num.gt.${cursor.user})`);
      if (patch) query = query.eq("matches.version_season", patch.version_season)
        .eq("matches.version_major", patch.version_major).eq("matches.version_minor", patch.version_minor)
        .gte("matches.started_at", patch.patch_start_at);
      if (excludedUserNum > 0) query = query.neq("user_num", excludedUserNum);
      const { data, error } = await query.order("game_id", { ascending: true }).order("user_num", { ascending: true }).range(0, pageSize - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as unknown as AnalysisRow[]));
      if (!data || data.length < pageSize) break;
      const last = rows[rows.length - 1];
      const next = { game: Number(last.game_id), user: Number(last.user_num) };
      if (!Number.isSafeInteger(next.game) || !Number.isSafeInteger(next.user) || (cursor &&
          (next.game < cursor.game || (next.game === cursor.game && next.user <= cursor.user)))) {
        throw new Error("Invalid analysis cohort cursor");
      }
      cursor = next;
    }
    return rows;
  };
  const rows: AnalysisRow[] = [];
  // Windows are independent. Keep concurrency bounded and preserve their order.
  for (let index = 0; index < windows.length; index += 3) {
    const batch = await Promise.all(windows.slice(index, index + 3).map(readWindow));
    for (const windowRows of batch) rows.push(...windowRows);
  }
  return rows;
}
