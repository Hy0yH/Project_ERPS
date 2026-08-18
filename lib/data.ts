import { DEFAULT_PERIOD_DAYS, ER_SEASON_ID } from "@/lib/env";
import { getActivePatch } from "@/lib/patch-version";
import { DEFAULT_RANK_SCOPE, parseRankScope, sampleStatus, type RankScope } from "@/lib/rank-scopes";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  avgRankScore,
  characterMetaScore,
  characterRankingScore,
  teamCompRankingScore,
  tierFromRank
} from "@/lib/stats";
import { parseCharacterWeaponKey, weaponName } from "@/lib/weapons";
import type {
  Character,
  CharacterMeta,
  PatchChange,
  PlayerDataScope,
  PlayerSummary,
  SnapshotSummary,
  TeamCompStat
} from "@/lib/types";

const TEAM_COMP_PAGE_SIZE = 1000;
const PATCH_CHANGE_PAGE_SIZE = 1000;

export async function getCharacters(): Promise<Character[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .eq("is_active", true)
    .order("name_ko");
  if (error) throw error;
  return (data ?? []) as Character[];
}

export async function getCharacterMeta(
  periodDays = DEFAULT_PERIOD_DAYS,
  requestedRankScope: RankScope = DEFAULT_RANK_SCOPE
): Promise<CharacterMeta[]> {
  if (!isSupabaseConfigured()) return [];
  const rankScope = parseRankScope(requestedRankScope);
  const supabase = getSupabaseAdmin();
  const latestSnapshot = await getLatestSnapshotInfo(
    supabase,
    "character_stats_snapshot",
    periodDays,
    rankScope
  );
  if (!latestSnapshot) return [];

  const { data, error } = await supabase
    .from("character_stats_snapshot")
    .select("*, characters(*)")
    .eq("period_days", periodDays)
    .eq("rank_scope", rankScope)
    .eq("period_start", latestSnapshot.period_start)
    .order("games", { ascending: false });
  if (error) throw error;

  const latestByCharacter = new Map<string, any>();
  for (const row of data ?? []) {
    const code = Number(row.character_code);
    const weaponCode = Number(row.weapon_code ?? 0);
    const key = `${code}:${weaponCode}`;
    if (!latestByCharacter.has(key)) latestByCharacter.set(key, row);
  }

  const meta = [...latestByCharacter.values()].map((row: any) => {
    const name = String(row.characters?.name_ko ?? row.name_ko ?? row.character_code);
    const currentWeaponName = weaponName(Number(row.weapon_code ?? 0));
    return {
      ...row.characters,
      weapon_code: Number(row.weapon_code ?? 0),
      weapon_name: currentWeaponName,
      display_name: `${name} / ${currentWeaponName}`,
      games: Number(row.games ?? 0),
      pick_rate: Number(row.pick_rate ?? 0),
      win_rate: Number(row.win_rate ?? 0),
      top3_rate: Number(row.top3_rate ?? 0),
      average_rank: Number(row.average_rank ?? 0),
      confidence_score: Number(row.confidence_score ?? 0),
      tier: "-",
      rank_scope: String(row.rank_scope ?? rankScope),
      sample_status: sampleStatus(Number(row.games ?? 0))
    } as CharacterMeta;
  }).sort(compareCharacterMeta);

  return assignCharacterRelativeTiers(meta);
}

export async function getTeamComps(
  characterCodes: number[],
  periodDays = DEFAULT_PERIOD_DAYS,
  requestedRankScope: RankScope = DEFAULT_RANK_SCOPE
) {
  if (!isSupabaseConfigured()) return [];
  const rankScope = parseRankScope(requestedRankScope);
  const supabase = getSupabaseAdmin();
  const latestSnapshot = await getLatestSnapshotInfo(
    supabase,
    "team_comp_stats",
    periodDays,
    rankScope
  );
  if (!latestSnapshot) return [];

  const normalizedCodes = [...new Set(characterCodes)].sort((a, b) => a - b);
  const data = await fetchTeamCompRows(
    supabase,
    normalizedCodes,
    periodDays,
    "*",
    latestSnapshot.period_start,
    rankScope
  );
  const characters = await getCharacters();
  const characterNameByCode = new Map(
    characters.map((character) => [character.character_code, character.name_ko])
  );
  const latestByComp = new Map<string, TeamCompStat>();
  for (const row of data ?? []) {
    const comp = attachCompNames(row as TeamCompStat, characterNameByCode);
    if (!latestByComp.has(comp.comp_key)) latestByComp.set(comp.comp_key, comp);
  }
  return assignRelativeTiers([...latestByComp.values()].sort(compareTeamComps));
}

export async function getTeamCompCount(
  periodDays = DEFAULT_PERIOD_DAYS,
  requestedRankScope: RankScope = DEFAULT_RANK_SCOPE
) {
  if (!isSupabaseConfigured()) return 0;
  const rankScope = parseRankScope(requestedRankScope);
  const supabase = getSupabaseAdmin();
  const latestSnapshot = await getLatestSnapshotInfo(
    supabase,
    "team_comp_stats",
    periodDays,
    rankScope
  );
  if (!latestSnapshot) return 0;
  const data = await fetchTeamCompRows(
    supabase,
    [],
    periodDays,
    "comp_key",
    latestSnapshot.period_start,
    rankScope
  );
  return new Set((data ?? []).map((row) => row.comp_key)).size;
}

export async function getSnapshotSummary(
  periodDays = DEFAULT_PERIOD_DAYS,
  requestedRankScope: RankScope = DEFAULT_RANK_SCOPE
): Promise<SnapshotSummary | null> {
  if (!isSupabaseConfigured()) return null;
  const rankScope = parseRankScope(requestedRankScope);
  const supabase = getSupabaseAdmin();
  const latestCharacterSnapshot = await getLatestSnapshotInfo(
    supabase,
    "character_stats_snapshot",
    periodDays,
    rankScope
  );
  if (!latestCharacterSnapshot) return null;

  const { data, error } = await supabase
    .from("character_stats_snapshot")
    .select("games, tier_filter")
    .eq("period_days", periodDays)
    .eq("rank_scope", rankScope)
    .eq("period_start", latestCharacterSnapshot.period_start);
  if (error) throw error;

  const latestPatch = await getActivePatch(supabase);
  const scopeLabel = String(data?.[0]?.tier_filter ?? "");
  const compCount = await getTeamCompCount(periodDays, rankScope);

  return {
    scope: scopeLabel.startsWith("current_patch") ? "current_patch" : "rolling_period",
    patch_key: scopeLabel.startsWith("current_patch:")
      ? scopeLabel.replace("current_patch:", "")
      : latestPatch?.patch_key ?? null,
    period_days: periodDays,
    period_start: String(latestCharacterSnapshot.period_start),
    period_end: String(latestCharacterSnapshot.period_end),
    sample_players: (data ?? []).reduce((sum, row) => sum + Number(row.games ?? 0), 0),
    character_count: data?.length ?? 0,
    comp_count: compCount,
    rank_scope: rankScope
  };
}

export async function getPatchHistory(characterCode: number): Promise<PatchChange[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("character_patch_changes")
    .select("*")
    .eq("character_code", characterCode)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as PatchChange[];
}

export async function getRecentPatchSummary(characterCode: number) {
  const changes = await getPatchHistory(characterCode);
  return changes.slice(0, 2).map((change) => change.raw_change_text);
}

export async function getAllPatchChanges(): Promise<PatchChange[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin();
  const rows: PatchChange[] = [];

  for (let from = 0; ; from += PATCH_CHANGE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("character_patch_changes")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PATCH_CHANGE_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as PatchChange[]));
    if (!data || data.length < PATCH_CHANGE_PAGE_SIZE) break;
  }

  return rows;
}

export async function getPlayerSummary(
  nickname: string,
  scope: PlayerDataScope = "season"
): Promise<PlayerSummary | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin();
  const profileRows = await fetchPlayerProfileRows(supabase, nickname, scope);
  if (profileRows.length) {
    const latestUserId = String(profileRows[0]?.external_user_id ?? "");
    const rows = profileRows.filter(
      (row) => String(row.external_user_id ?? "") === latestUserId
    );

    return {
      user_num: 0,
      nickname,
      total_games: rows.reduce((sum, row) => sum + Number(row.games ?? 0), 0),
      collected_at: String(rows[0]?.collected_at ?? ""),
      favorite_characters: rows.map((row) => ({
        character_code: Number(row.character_code),
        weapon_code: Number(row.weapon_code ?? 0),
        games: Number(row.games ?? 0),
        wins: Number(row.wins ?? 0),
        top3: Number(row.top3 ?? 0),
        win_rate: Number(row.win_rate ?? 0),
        top3_rate: Number(row.top3_rate ?? 0),
        average_rank: Number(row.average_rank ?? 0),
        average_kills: Number(row.average_kills ?? 0),
        average_assists: Number(row.average_assists ?? 0),
        average_damage_to_player: Number(row.average_damage_to_player ?? 0),
        average_damage_from_player: Number(row.average_damage_from_player ?? 0),
        average_basic_damage: Number(row.average_basic_damage ?? 0),
        average_skill_damage: Number(row.average_skill_damage ?? 0),
        average_heal_amount: Number(row.average_heal_amount ?? 0),
        average_team_recover: Number(row.average_team_recover ?? 0),
        average_protect_absorb: Number(row.average_protect_absorb ?? 0),
        average_view_contribution: Number(row.average_view_contribution ?? 0),
        average_vision_actions: Number(row.average_vision_actions ?? 0),
        average_survivable_time: Number(row.average_survivable_time ?? 0),
        average_cc_time_to_player: Number(row.average_cc_time_to_player ?? 0)
      }))
    };
  }

  const playerRows = await fetchPlayerSummaryRows(supabase, nickname, scope);
  if (!playerRows.length) return null;

  const grouped = new Map<number, any[]>();
  for (const row of playerRows) {
    const code = Number(row.character_code ?? 0);
    if (!code) continue;
    grouped.set(code, [...(grouped.get(code) ?? []), row]);
  }

  const favoriteCharacters = [...grouped.entries()]
    .map(([characterCode, rows]) => {
      const wins = rows.filter((row) => Number(row.game_rank) === 1).length;
      const top3 = rows.filter((row) => Number(row.game_rank) <= 3).length;
      const averageRank =
        rows.reduce((sum, row) => sum + Number(row.game_rank ?? 0), 0) / rows.length;
      const weaponCounts = new Map<number, number>();
      for (const row of rows) {
        const weaponCode = Number(row.best_weapon ?? 0);
        weaponCounts.set(weaponCode, (weaponCounts.get(weaponCode) ?? 0) + 1);
      }
      const weaponCode = [...weaponCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

      return {
        character_code: characterCode,
        weapon_code: weaponCode,
        games: rows.length,
        wins,
        top3,
        win_rate: wins / rows.length,
        top3_rate: top3 / rows.length,
        average_rank: averageRank
      };
    })
    .sort((a, b) => b.games - a.games)
    .slice(0, 8);

  return {
    user_num: Number(playerRows[0]?.user_num ?? 0),
    nickname,
    total_games: playerRows.length,
    favorite_characters: favoriteCharacters
  };
}

async function fetchPlayerProfileRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  nickname: string,
  scope: PlayerDataScope
) {
  const latestPatch = scope === "current_patch" ? await getActivePatch(supabase) : null;
  let query = supabase
    .from("player_character_profiles")
    .select("*")
    .ilike("nickname", nickname)
    .eq("season_id", ER_SEASON_ID)
    .eq("scope", scope)
    .order("collected_at", { ascending: false });

  query = query.eq("patch_key", scope === "current_patch" ? latestPatch?.patch_key ?? "" : "");
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getBestCompForCandidate(
  teammateCodes: number[],
  candidateCode: number,
  periodDays = DEFAULT_PERIOD_DAYS,
  requestedRankScope: RankScope = DEFAULT_RANK_SCOPE
) {
  if (!teammateCodes.length || !isSupabaseConfigured()) return null;
  const rankScope = parseRankScope(requestedRankScope);
  const targetCodes = [...new Set([...teammateCodes, candidateCode])];
  const supabase = getSupabaseAdmin();
  const latestSnapshot = await getLatestSnapshotInfo(
    supabase,
    "team_comp_stats",
    periodDays,
    rankScope
  );
  if (!latestSnapshot) return null;
  const data = await fetchTeamCompRows(
    supabase,
    targetCodes,
    periodDays,
    "*",
    latestSnapshot.period_start,
    rankScope
  );
  if (!data.length) return null;

  const characters = await getCharacters();
  const characterNameByCode = new Map(
    characters.map((character) => [character.character_code, character.name_ko])
  );
  return data
    .map((row) => attachCompNames(row as TeamCompStat, characterNameByCode))
    .sort(compareTeamComps)[0] ?? null;
}

export function displayPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function displayRank(value: number) {
  return value ? value.toFixed(2) : "-";
}

export function scoreFromMeta(meta?: CharacterMeta) {
  if (!meta) return 0;
  return characterMetaScore({
    winRate: meta.win_rate,
    top3Rate: meta.top3_rate,
    averageRank: meta.average_rank,
    confidence: meta.confidence_score
  });
}

export function emptyMetaScore() {
  return avgRankScore(0);
}

function attachCompNames(comp: TeamCompStat, characterNameByCode: Map<number, string>): TeamCompStat {
  const characterNames = getCompDisplayNames(comp, characterNameByCode);
  return {
    ...comp,
    tier: comp.tier ?? "F",
    character_weapon_keys: comp.character_weapon_keys ?? [],
    character_names: characterNames,
    comp_name: characterNames.join(" / ")
  };
}

function getCompDisplayNames(comp: TeamCompStat, characterNameByCode: Map<number, string>) {
  if (comp.character_weapon_keys?.length) {
    return comp.character_weapon_keys.map((key) => {
      const { characterCode, weaponCode } = parseCharacterWeaponKey(key);
      const characterName = characterNameByCode.get(characterCode) ?? `Character ${characterCode}`;
      return `${characterName}(${weaponName(weaponCode)})`;
    });
  }

  return comp.character_codes.map((code) => characterNameByCode.get(code) ?? `Character ${code}`);
}

function assignRelativeTiers<T extends { tier: string }>(items: T[]): T[] {
  return items.map((item, index) => ({
    ...item,
    tier: tierFromRank(index, items.length)
  }));
}

function assignCharacterRelativeTiers(items: CharacterMeta[]) {
  const eligible = items.filter((item) => item.games >= 30);
  const tierByKey = new Map(
    eligible.map((item, index) => [
      `${item.character_code}:${item.weapon_code}`,
      tierFromRank(index, eligible.length)
    ])
  );
  return items.map((item) => ({
    ...item,
    tier: tierByKey.get(`${item.character_code}:${item.weapon_code}`) ?? "-"
  }));
}

function compareCharacterMeta(a: CharacterMeta, b: CharacterMeta) {
  const scoreA = characterRankingScore({
    games: a.games,
    winRate: a.win_rate,
    top3Rate: a.top3_rate,
    averageRank: a.average_rank,
    confidence: a.confidence_score
  });
  const scoreB = characterRankingScore({
    games: b.games,
    winRate: b.win_rate,
    top3Rate: b.top3_rate,
    averageRank: b.average_rank,
    confidence: b.confidence_score
  });
  if (scoreB !== scoreA) return scoreB - scoreA;
  if (b.games !== a.games) return b.games - a.games;
  return a.name_ko.localeCompare(b.name_ko);
}

function compareTeamComps(a: TeamCompStat, b: TeamCompStat) {
  const scoreA = teamCompRankingScore(a);
  const scoreB = teamCompRankingScore(b);
  if (scoreB !== scoreA) return scoreB - scoreA;
  if (b.games !== a.games) return b.games - a.games;
  return a.comp_name.localeCompare(b.comp_name);
}

async function fetchTeamCompRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  characterCodes: number[],
  periodDays: number,
  columns = "*",
  periodStart?: string,
  rankScope: RankScope = DEFAULT_RANK_SCOPE
) {
  const rows: any[] = [];

  for (let from = 0; ; from += TEAM_COMP_PAGE_SIZE) {
    const to = from + TEAM_COMP_PAGE_SIZE - 1;
    let query = supabase
      .from("team_comp_stats")
      .select(columns)
      .eq("period_days", periodDays)
      .eq("rank_scope", rankScope)
      .order("period_end", { ascending: false })
      .range(from, to);

    if (periodStart) {
      query = query.eq("period_start", periodStart);
    }

    if (characterCodes.length > 0) {
      query = query.contains("character_codes", characterCodes);
    }

    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < TEAM_COMP_PAGE_SIZE) break;
  }

  return rows;
}

async function fetchPlayerSummaryRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  nickname: string,
  scope: PlayerDataScope
) {
  const rows: any[] = [];
  const latestPatch = scope === "current_patch" ? await getActivePatch(supabase) : null;

  for (let from = 0; ; from += TEAM_COMP_PAGE_SIZE) {
    const to = from + TEAM_COMP_PAGE_SIZE - 1;
    let query = supabase
      .from("match_players")
      .select(
        "user_num, nickname, character_code, best_weapon, game_rank, matches!inner(season_id, version_season, version_major, version_minor, started_at)"
      )
      .ilike("nickname", nickname)
      .range(from, to);

    if (ER_SEASON_ID) {
      query = query.eq("matches.season_id", ER_SEASON_ID);
    }
    if (latestPatch) {
      query = query
        .eq("matches.version_season", latestPatch.version_season)
        .eq("matches.version_major", latestPatch.version_major)
        .eq("matches.version_minor", latestPatch.version_minor)
        .gte("matches.started_at", latestPatch.patch_start_at);
    }

    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < TEAM_COMP_PAGE_SIZE) break;
  }

  return rows;
}

async function getLatestSnapshotInfo(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: "character_stats_snapshot" | "team_comp_stats",
  periodDays: number,
  rankScope: RankScope = DEFAULT_RANK_SCOPE
) {
  const { data, error } = await supabase
    .from(table)
    .select("period_start, period_end")
    .eq("period_days", periodDays)
    .eq("rank_scope", rankScope)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as { period_start: string; period_end: string } | null;
}
