import { ER_SEASON_ID, PLAYER_ANALYSIS_CACHE_HOURS } from "@/lib/env";
import {
  fetchUserRankByUserId,
  fetchUserStatsByUserId,
  isNicknameNotFoundError
} from "@/lib/eternal-return";
import { collectPlayerAnalysisMatches } from "@/lib/ingestion";
import { explainPlayerAnalysis } from "@/lib/openai";
import { getActivePatch } from "@/lib/patch-version";
import {
  PLAYER_ANALYSIS_GAME_LIMIT,
  PLAYER_ANALYSIS_CACHE_VERSION,
  PLAYER_ANALYSIS_MIN_OVERALL_GAMES,
  PLAYER_ANALYSIS_MIN_OVERALL_PLAYERS,
  PLAYER_ANALYSIS_MIN_SAME_PICK_GAMES,
  PLAYER_ANALYSIS_MIN_SAME_PICK_PLAYERS,
  PLAYER_ANALYSIS_MMR_BUCKET,
  PLAYER_ANALYSIS_VERSION,
  buildPlayerAnalysis,
  mmrBucketStart,
  type AnalysisRow
} from "@/lib/player-analysis";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import type { PatchVersion, PlayerAnalysis } from "@/lib/types";
import { weaponName } from "@/lib/weapons";

const PAGE_SIZE = 1000;
const inFlight = new Map<string, Promise<PlayerAnalysis>>();

export class PlayerAnalysisNotFoundError extends Error {
  readonly code = "PLAYER_NOT_FOUND";
  constructor(public readonly nickname: string) {
    super(`플레이어를 찾을 수 없습니다: ${nickname}`);
    this.name = "PlayerAnalysisNotFoundError";
  }
}

export class PlayerAnalysisNoMatchesError extends Error {
  readonly code = "PLAYER_ANALYSIS_NO_MATCHES";
  constructor(public readonly nickname: string) {
    super(`현재 패치 랭크 스쿼드 기록이 없습니다: ${nickname}`);
    this.name = "PlayerAnalysisNoMatchesError";
  }
}

export class PlayerAnalysisUnavailableError extends Error {
  readonly code = "PLAYER_ANALYSIS_UNAVAILABLE";
  constructor(message: string) {
    super(message);
    this.name = "PlayerAnalysisUnavailableError";
  }
}

export async function getOrBuildPlayerAnalysis(
  nickname: string,
  forceRefresh = false
): Promise<PlayerAnalysis> {
  const normalizedNickname = nickname.trim();
  if (!normalizedNickname) throw new PlayerAnalysisNotFoundError(nickname);
  if (!isSupabaseConfigured()) {
    throw new PlayerAnalysisUnavailableError("Supabase가 설정되지 않아 분석 데이터를 저장하거나 불러올 수 없습니다.");
  }

  const key = normalizedNickname.toLocaleLowerCase("ko-KR");
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = buildWithCache(normalizedNickname, forceRefresh).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

async function buildWithCache(nickname: string, forceRefresh: boolean) {
  const supabase = getSupabaseAdmin();
  const patch = await getActivePatch(supabase);
  let cached: Awaited<ReturnType<typeof readCachedAnalysis>> = null;
  try {
    cached = await readCachedAnalysis(nickname, patch?.patch_key ?? "");
  } catch {
    // The feature can still return a useful setup error before migration 004 is applied.
  }
  if (!forceRefresh && cached?.fresh) {
    return { ...cached.analysis, cache_status: "fresh" as const };
  }

  try {
    const collection = await collectPlayerAnalysisMatches(nickname);
    if (!collection.userId && !collection.userNum) throw new PlayerAnalysisNotFoundError(nickname);
    const userRows = await fetchPlayerRows(
      supabase,
      collection.userId,
      Number(collection.userNum ?? 0),
      nickname,
      patch
    );
    const currentPatchRows = patch
      ? userRows.filter((row) => rowMatchesPatch(row, patch))
      : userRows;
    if (!currentPatchRows.length) throw new PlayerAnalysisNoMatchesError(nickname);

    const selectedRows = [
      ...currentPatchRows,
      ...userRows.filter((row) => !currentPatchRows.includes(row))
    ].slice(0, PLAYER_ANALYSIS_GAME_LIMIT);
    const supplementalGames = selectedRows.filter(
      (row) => patch && !rowMatchesPatch(row, patch)
    ).length;
    const userNum = Number(collection.userNum ?? selectedRows[0]?.user_num ?? 0);
    const rank = await readPlayerRank(collection.userId);
    const mmr = Number(rank.mmr ?? selectedRows[0]?.mmr_after ?? 0);
    const bucket = mmrBucketStart(mmr);
    const expandedRows = await fetchCohortRows(
      supabase,
      patch,
      Math.max(0, bucket - PLAYER_ANALYSIS_MMR_BUCKET),
      bucket + PLAYER_ANALYSIS_MMR_BUCKET * 2,
      userNum
    );
    const initialRows = expandedRows.filter((row) => {
      const rowMmr = Number(row.mmr_after ?? 0);
      return rowMmr >= bucket && rowMmr < bucket + PLAYER_ANALYSIS_MMR_BUCKET;
    });
    const mainPick = mostPlayedPick(selectedRows);
    const samePickInitial = filterSamePick(initialRows, mainPick);
    const samePickExpanded = filterSamePick(expandedRows, mainPick);
    const samePickRows = cohortMeetsMinimums(
      samePickInitial,
      PLAYER_ANALYSIS_MIN_SAME_PICK_GAMES,
      PLAYER_ANALYSIS_MIN_SAME_PICK_PLAYERS
    ) ? samePickInitial : samePickExpanded;
    const overallRows = cohortMeetsMinimums(
      initialRows,
      PLAYER_ANALYSIS_MIN_OVERALL_GAMES,
      PLAYER_ANALYSIS_MIN_OVERALL_PLAYERS
    ) ? initialRows : expandedRows;
    const characters = await fetchCharacterNames(supabase);
    let analysis = buildPlayerAnalysis({
      nickname,
      userNum,
      playerRows: selectedRows,
      overallRows,
      samePickRows,
      characterNames: characters,
      rank,
      seasonId: ER_SEASON_ID,
      patchKey: patch?.patch_key ?? null,
      supplementalGames,
      expandedBenchmark: !cohortMeetsMinimums(
        samePickInitial,
        PLAYER_ANALYSIS_MIN_SAME_PICK_GAMES,
        PLAYER_ANALYSIS_MIN_SAME_PICK_PLAYERS
      ) && cohortMeetsMinimums(
        samePickExpanded,
        PLAYER_ANALYSIS_MIN_SAME_PICK_GAMES,
        PLAYER_ANALYSIS_MIN_SAME_PICK_PLAYERS
      )
    });
    analysis = {
      ...analysis,
      pick_profile: {
        ...analysis.pick_profile,
        picks: analysis.pick_profile.picks.map((pick) => ({
          ...pick,
          weapon_name: weaponName(pick.weapon_code)
        }))
      }
    };
    analysis = await explainPlayerAnalysis(analysis);
    try {
      await writeCachedAnalysis(supabase, analysis, selectedRows);
    } catch {
      analysis = {
        ...analysis,
        caveats: [...analysis.caveats, "분석 결과 캐시에 저장하지 못해 다음 조회에서 다시 계산될 수 있습니다."]
      };
    }
    return analysis;
  } catch (error) {
    if (error instanceof PlayerAnalysisNotFoundError ||
        error instanceof PlayerAnalysisNoMatchesError ||
        isNicknameNotFoundError(error)) {
      if (isNicknameNotFoundError(error)) throw new PlayerAnalysisNotFoundError(nickname);
      throw error;
    }
    if (cached) {
      return {
        ...cached.analysis,
        cache_status: "stale" as const,
        caveats: [
          ...cached.analysis.caveats,
          "공식 API 갱신에 실패해 이전 분석 결과를 표시합니다."
        ]
      };
    }
    const detail = describeAnalysisError(error);
    console.error(`Player analysis build failed: ${detail}`);
    throw new PlayerAnalysisUnavailableError(detail);
  }
}

function describeAnalysisError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error !== "object" || error === null) {
    return typeof error === "string" ? error : "플레이어 분석 데이터를 만들 수 없습니다.";
  }

  const record = error as Record<string, unknown>;
  const parts = [record.message, record.details, record.hint, record.code]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return parts.length ? parts.join(" · ") : "플레이어 분석 데이터를 만들 수 없습니다.";
}

async function fetchPlayerRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string | null,
  userNum: number,
  nickname: string,
  patch: PatchVersion | null
) {
  const rows: AnalysisRow[] = [];
  for (let from = 0; rows.length < PLAYER_ANALYSIS_GAME_LIMIT * 3; from += PAGE_SIZE) {
    let query = supabase
      .from("match_players")
      .select("*, matches!inner(season_id, matching_mode, matching_team_mode, version_season, version_major, version_minor, started_at)")
      .eq("matches.season_id", ER_SEASON_ID)
      .eq("matches.matching_mode", 3)
      .eq("matches.matching_team_mode", 3);
    query = userId
      ? query.eq("external_user_id", userId)
      : userNum > 0
        ? query.eq("user_num", userNum)
        : query.ilike("nickname", nickname);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as AnalysisRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows
    .filter((row) => Number(row.analysis_data_version ?? 0) >= 1)
    .sort((a, b) => rowStartedAt(b).localeCompare(rowStartedAt(a)))
    .sort((a, b) => Number(Boolean(patch && rowMatchesPatch(b, patch))) - Number(Boolean(patch && rowMatchesPatch(a, patch))));
}

async function fetchCohortRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  patch: PatchVersion | null,
  mmrMin: number,
  mmrMax: number,
  excludedUserNum: number
) {
  const rows: AnalysisRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from("match_players")
      .select("*, matches!inner(season_id, matching_mode, matching_team_mode, version_season, version_major, version_minor, started_at)")
      .eq("matches.season_id", ER_SEASON_ID)
      .eq("matches.matching_mode", 3)
      .eq("matches.matching_team_mode", 3)
      .gte("analysis_data_version", PLAYER_ANALYSIS_VERSION)
      .gte("mmr_after", mmrMin)
      .lt("mmr_after", mmrMax);
    if (patch) {
      query = query
        .eq("matches.version_season", patch.version_season)
        .eq("matches.version_major", patch.version_major)
        .eq("matches.version_minor", patch.version_minor)
        .gte("matches.started_at", patch.patch_start_at);
    }
    if (excludedUserNum > 0) query = query.neq("user_num", excludedUserNum);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as AnalysisRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchCharacterNames(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase.from("characters").select("character_code, name_ko");
  if (error) throw error;
  return new Map((data ?? []).map((row) => [Number(row.character_code), String(row.name_ko)]));
}

async function readPlayerRank(userId: string | null) {
  if (!userId || !ER_SEASON_ID) return {};

  let rank: Record<string, unknown> = {};
  let stats: Record<string, unknown> = {};
  try {
    rank = await fetchUserRankByUserId(userId, ER_SEASON_ID);
  } catch {
    // Match-derived MMR remains available when the rank endpoint is temporarily unavailable.
  }
  try {
    const rows = await fetchUserStatsByUserId(userId, ER_SEASON_ID);
    stats = rows.find((row) => Number(row.matchingTeamMode ?? 0) === 3) ?? rows[0] ?? {};
  } catch {
    // Rank data above is still useful when the stats endpoint is temporarily unavailable.
  }

  return {
    mmr: nullableNumber(rank.mmr ?? stats.mmr),
    rank: nullableNumber(rank.rank ?? stats.rank),
    serverRank: nullableNumber(rank.serverRank ?? stats.serverRank),
    rankPercent: nullableNumber(stats.rankPercent ?? rank.rankPercent)
  };
}

async function readCachedAnalysis(nickname: string, patchKey: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("player_analysis_cache")
    .select("payload, expires_at")
    .ilike("nickname", nickname)
    .eq("season_id", ER_SEASON_ID)
    .eq("patch_key", patchKey)
    .eq("analysis_version", PLAYER_ANALYSIS_CACHE_VERSION)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.payload) return null;
  return {
    analysis: data.payload as PlayerAnalysis,
    fresh: new Date(String(data.expires_at)).getTime() > Date.now()
  };
}

async function writeCachedAnalysis(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  analysis: PlayerAnalysis,
  rows: AnalysisRow[]
) {
  const expiresAt = new Date(
    Date.now() + Math.max(1, PLAYER_ANALYSIS_CACHE_HOURS) * 60 * 60 * 1000
  ).toISOString();
  const cacheKey = [
    analysis.player.user_num,
    analysis.scope.season_id,
    analysis.scope.patch_key ?? "none",
    PLAYER_ANALYSIS_CACHE_VERSION
  ].join(":");
  const latestGameId = rows.map((row) => Number(row.game_id ?? 0)).find(Boolean) ?? null;
  const { error } = await supabase.from("player_analysis_cache").upsert({
    cache_key: cacheKey,
    user_num: analysis.player.user_num,
    nickname: analysis.player.nickname,
    season_id: analysis.scope.season_id,
    patch_key: analysis.scope.patch_key ?? "",
    latest_game_id: latestGameId,
    analysis_version: PLAYER_ANALYSIS_CACHE_VERSION,
    payload: { ...analysis, cache_status: "fresh" },
    generated_at: analysis.generated_at,
    expires_at: expiresAt
  });
  if (error) throw error;
}

function mostPlayedPick(rows: AnalysisRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${Number(row.character_code ?? 0)}:${Number(row.best_weapon ?? 0)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [key = "0:0"] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const [characterCode, weaponCode] = key.split(":").map(Number);
  return { characterCode: characterCode ?? 0, weaponCode: weaponCode ?? 0 };
}

function filterSamePick(rows: AnalysisRow[], pick: { characterCode: number; weaponCode: number }) {
  return rows.filter(
    (row) => Number(row.character_code) === pick.characterCode && Number(row.best_weapon ?? 0) === pick.weaponCode
  );
}

function cohortMeetsMinimums(rows: AnalysisRow[], minimumGames: number, minimumPlayers: number) {
  if (rows.length < minimumGames) return false;
  return new Set(rows.map((row) => Number(row.user_num ?? 0)).filter((userNum) => userNum > 0)).size >= minimumPlayers;
}

function rowMatchesPatch(row: AnalysisRow, patch: PatchVersion) {
  const match = joinedMatch(row);
  return Number(match.version_season) === patch.version_season &&
    Number(match.version_major) === patch.version_major &&
    Number(match.version_minor) === patch.version_minor &&
    String(match.started_at ?? "") >= patch.patch_start_at;
}

function rowStartedAt(row: AnalysisRow) {
  return String(joinedMatch(row).started_at ?? "");
}

function joinedMatch(row: AnalysisRow): AnalysisRow {
  if (Array.isArray(row.matches)) return (row.matches[0] as AnalysisRow | undefined) ?? {};
  return row.matches && typeof row.matches === "object" ? row.matches as AnalysisRow : {};
}

function nullableNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
