import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  queries: [] as { table: string; filters: Record<string, unknown> }[],
  cache: null as any,
  written: null as any,
  storedSeason: 41 as number | null,
  collectedSeason: 41 as number | null,
  currentPatchGames: 50,
  omitVersionSeason: false,
  storedRows: [] as any[],
  storedError: false, cohortError: false,
  cohortRows: null as any[] | null, lastCohortGame: 1000
}));

vi.mock("@/lib/env", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/env")>(), ER_SEASON_ID: 0
}));
vi.mock("@/lib/patch-version", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/patch-version")>(),
  getActivePatch: vi.fn(async () => ({
    patch_key: "12.3.0", version_season: 12, version_major: 3, version_minor: 0,
    patch_start_at: "2026-09-03T00:00:00Z", latest_match_at: "2026-09-09T00:00:00Z"
  }))
}));
vi.mock("@/lib/ingestion", () => ({
  collectPlayerAnalysisMatches: vi.fn(async () => ({
    userId: "test-user", userNum: 1, seasonId: state.collectedSeason,
    playerRows: Array.from({ length: 50 }, (_, i) => ({
      gameId: i + 1, seasonId: state.collectedSeason, userNum: 1,
      matchingMode: 3, matchingTeamMode: 3,
      characterNum: i < state.currentPatchGames ? 1 : 2, bestWeapon: 15, gameRank: 3, mmrAfter: 7936,
      playTime: 1200, damageToPlayer: 12000, playerKill: 3, playerAssistant: 4,
      teamKill: 8, viewContribution: 25, versionSeason: state.omitVersionSeason ? undefined : 12, versionMajor: i < state.currentPatchGames ? 3 : 2, versionMinor: 0,
      damageToMonster: 5000, monsterKill: 12, ccTimeToPlayer: 20, bestWeaponLevel: 18, totalGainVFCredit: 1000,
      teamRecover: 0, protectAbsorb: 0, mmrBefore: 7900, mmrGain: 36,
      startDtm: "2026-09-09T00:00:00Z"
    }))
  }))
}));
vi.mock("@/lib/eternal-return", () => ({
  fetchUserRankByUserId: vi.fn(async () => ({ mmr: 7936, rank: 1234 })),
  fetchUserStatsByUserId: vi.fn(async () => []),
  fetchGameData: vi.fn(async () => []),
  isNicknameNotFoundError: () => false
}));
vi.mock("@/lib/openai", () => ({ explainPlayerAnalysis: async (value: unknown) => value }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ from: (table: string) => {
    const entry = { table, filters: {} as Record<string, unknown> };
    state.queries.push(entry);
    const result = () => {
      if (table === "matches") return { data: state.storedSeason ? { season_id: state.storedSeason,
        game_id: entry.filters["order:game_id"] === false ? state.lastCohortGame : 100 } : null, error: null };
      if (table === "player_analysis_cache") return { data: state.cache, error: null };
      if (table === "match_players" && entry.filters["gte:mmr_after"] !== undefined) {
        if (state.cohortError) return { data: null, error: { message: "statement timeout" } };
        if (state.cohortRows) {
          const cursor = String(entry.filters.cursor ?? "").match(/game_id\.gt\.(\d+).*user_num\.gt\.(\d+)/);
          const data = state.cohortRows.filter((row) => row.game_id >= Number(entry.filters["gte:game_id"] ?? 0) &&
            row.game_id <= Number(entry.filters["lte:game_id"] ?? Infinity) && (!cursor || row.game_id > Number(cursor[1]) ||
            (row.game_id === Number(cursor[1]) && row.user_num > Number(cursor[2]))));
          return { data: data.slice(0, Number(entry.filters["range:end"] ?? 999) + 1), error: null };
        }
        const data = Array.from({ length: 90 }, (_, i) => ({
          user_num: 100 + Math.floor(i / 3), game_rank: i % 8 + 1, mmr_after: 7800,
          character_code: 1, best_weapon: 15, play_time: 1200,
          damage_to_player: 14000 + i, view_contribution: 20, analysis_data_version: 2,
          matches: { version_season: 12, version_major: 3, version_minor: 0 }
        }));
        return { data: entry.filters["matches.season_id"] === 41 ? data : [], error: null };
      }
      if (table === "match_players") return state.storedError ? { data: null, error: { message: "statement timeout" } } : { data: state.storedRows, error: null };
      return { data: [], error: null };
    };
    const query: any = {
      select: () => query, limit: () => query,
      range: (_start: number, end: number) => { entry.filters["range:end"] = end; return query; },
      order: (key: string, options: { ascending: boolean }) => { entry.filters[`order:${key}`] = options.ascending; return query; },
      eq: (key: string, value: unknown) => { entry.filters[key] = value; return query; },
      ilike: (key: string, value: unknown) => { entry.filters[key] = value; return query; },
      gt: () => query, lt: () => query, neq: () => query,
      gte: (key: string, value: unknown) => { entry.filters[`gte:${key}`] = value; return query; },
      lte: (key: string, value: unknown) => { entry.filters[`lte:${key}`] = value; return query; },
      or: (value: string) => { entry.filters.cursor = value; return query; },
      maybeSingle: async () => result(),
      upsert: async (value: unknown) => { state.written = value; return { error: null }; },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject)
    };
    return query;
  } })
}));

import { getOrBuildPlayerAnalysis } from "@/lib/player-analysis-service";
import { collectPlayerAnalysisMatches } from "@/lib/ingestion";
import { fetchUserRankByUserId, fetchUserStatsByUserId } from "@/lib/eternal-return";
import { PLAYER_ANALYSIS_CACHE_VERSION } from "@/lib/player-analysis";

beforeEach(() => {
  vi.clearAllMocks();
  state.queries = [];
  state.cache = null;
  state.written = null;
  state.storedSeason = 41;
  state.collectedSeason = 41;
  state.currentPatchGames = 50;
  state.omitVersionSeason = false;
  state.storedRows = [];
  state.storedError = false;
  state.cohortError = false;
  state.cohortRows = null;
  state.lastCohortGame = 1000;
});

describe("analysis with missing season environment variable", () => {
  it("isolates a selected pick in metrics and cache while retaining all available pick choices", async () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({ gameId: index + 1, userNum: 1, seasonId: 41,
      matchingMode: 3, matchingTeamMode: 3, characterNum: index < 20 ? 1 : 2, bestWeapon: index < 20 ? 15 : 11,
      gameRank: 3, mmrAfter: 7936, playTime: 1200, damageToPlayer: 12000, playerKill: 3, playerAssistant: 4,
      teamKill: 8, versionSeason: 12, versionMajor: 3, versionMinor: 0, startDtm: "2026-09-09T00:00:00Z" }));
    vi.mocked(collectPlayerAnalysisMatches).mockResolvedValueOnce({ userId: "test-user", userNum: 1, seasonId: 41,
      playerRows: rows, savedMatches: 0, enrichedPeerGames: 0, queuedPeerGames: 0, inspectedGames: 50, currentPatchGames: 50, supplementalGames: 0 });
    const progress: string[] = [];
    const analysis = await getOrBuildPlayerAnalysis("선택픽검증", false, { characterCode: 2, weaponCode: 11 }, (event) => progress.push(event.stage));
    expect(analysis.scope).toMatchObject({ analyzed_games: 30, available_games: 50, selected_pick_key: "2:11" });
    expect(analysis.available_picks?.map((pick) => pick.games)).toEqual([30, 20]);
    expect(analysis.recent_matches.every((match) => match.character_code === 2 && match.weapon_code === 11)).toBe(true);
    expect(analysis.statistics.games).toBe(30); expect(state.written.cache_key).toContain(":2:11");
    expect(progress).toEqual(expect.arrayContaining(["collect", "benchmark", "calculate", "complete"]));
  });

  it("never substitutes an all-pick cache for a requested pick with no records", async () => {
    await getOrBuildPlayerAnalysis("다른범위캐시");
    state.cache = { payload: state.written.payload, expires_at: state.written.expires_at };
    await expect(getOrBuildPlayerAnalysis("다른범위캐시", false, { characterCode: 2, weaponCode: 11 })).rejects.toMatchObject({ code: "PLAYER_ANALYSIS_NO_MATCHES" });
    expect(collectPlayerAnalysisMatches).toHaveBeenCalledTimes(2);
  });
  it("uses season 41 consistently for player rows, peers, rank and cache", async () => {
    const analysis = await getOrBuildPlayerAnalysis("시즌확인");
    expect(analysis.scope.season_id).toBe(41);
    expect(analysis.scope.analyzed_games).toBe(50);
    expect(analysis.benchmark_coverage.overall_players).toBe(30);
    expect(analysis.dimensions.some((dimension) => dimension.score !== null)).toBe(true);
    expect(analysis.player.rank).toBe(1234);
    expect(collectPlayerAnalysisMatches).toHaveBeenCalledWith("시즌확인", undefined, undefined, 41);
    expect(fetchUserRankByUserId).toHaveBeenCalledWith("test-user", 41);
    expect(fetchUserStatsByUserId).toHaveBeenCalledWith("test-user", 41);
    const playerQueries = state.queries.filter((query) => query.table === "match_players");
    expect(playerQueries.length).toBeGreaterThan(1);
    expect(playerQueries.every((query) => query.filters["matches.season_id"] === 41)).toBe(true);
    expect(state.written.season_id).toBe(41);
    expect(state.written.analysis_version).toBe(PLAYER_ANALYSIS_CACHE_VERSION);
    state.cache = { payload: state.written.payload, expires_at: state.written.expires_at };
    expect((await getOrBuildPlayerAnalysis("시즌확인")).cache_status).toBe("fresh");
    expect(collectPlayerAnalysisMatches).toHaveBeenCalledTimes(1);
    await getOrBuildPlayerAnalysis("시즌확인", true);
    expect(collectPlayerAnalysisMatches).toHaveBeenCalledTimes(2);
  });

  it("rejects a fresh but incorrectly scoped season-zero cache", async () => {
    state.cache = { payload: { scope: { season_id: 0 } }, expires_at: "2099-01-01T00:00:00Z" };
    expect((await getOrBuildPlayerAnalysis("잘못된캐시")).scope.season_id).toBe(41);
    expect(collectPlayerAnalysisMatches).toHaveBeenCalledTimes(1);
  });

  it("can resolve the season from official rows when no stored season exists", async () => {
    state.storedSeason = null;
    expect((await getOrBuildPlayerAnalysis("첫조회")).scope.season_id).toBe(41);
    expect(state.written.season_id).toBe(41);
  });

  it("fails explicitly if no valid season can be established", async () => {
    state.storedSeason = null;
    state.collectedSeason = null;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getOrBuildPlayerAnalysis("시즌없음")).rejects.toMatchObject({ code: "PLAYER_ANALYSIS_UNAVAILABLE" });
    expect(fetchUserRankByUserId).not.toHaveBeenCalled();
    expect(state.queries.some((query) => query.table === "match_players")).toBe(false);
    expect(state.written).toBeNull();
    errorLog.mockRestore();
  });

  it("uses only current-patch games for the main pick, metrics and cached feedback", async () => {
    state.currentPatchGames = 12;
    const analysis = await getOrBuildPlayerAnalysis("패치분리");
    expect(analysis.scope).toMatchObject({ analyzed_games: 12, supplemental_games: 0, excluded_games: 38 });
    expect(analysis.pick_profile.picks.map((pick) => pick.character_code)).toEqual([1]);
    expect(analysis.dimensions.flatMap((dimension) => dimension.metrics).every((metric) =>
      metric.player_games === 12 && metric.player_scope.current_patch_games === 12 && metric.player_scope.supplemental_games === 0)).toBe(true);
    expect(state.written.payload.scope.excluded_games).toBe(38);
    expect(state.written.payload.scope.analyzed_games).toBe(12);
  });

  it("withholds scores and suggestions when only a few current-patch games are available", async () => {
    state.currentPatchGames = 3;
    const analysis = await getOrBuildPlayerAnalysis("새패치표본부족");
    expect(analysis.scope.analyzed_games).toBe(3);
    expect(analysis.scope.confidence).toBe("low");
    expect(analysis.dimensions.every((dimension) => dimension.score === null)).toBe(true);
    expect(analysis.strengths).toEqual([]);
    expect(analysis.improvement_priorities).toEqual([]);
    expect(analysis.feedback.status).toBe("insufficient_evidence");
    expect(analysis.feedback.message).toContain("현재 패치");
  });

  it("does not fall back to old-patch matches when there are no current-patch games", async () => {
    state.currentPatchGames = 0;
    await expect(getOrBuildPlayerAnalysis("이전패치만")).rejects.toMatchObject({ code: "PLAYER_ANALYSIS_NO_MATCHES" });
    expect(state.written).toBeNull();
  });

  it("keeps current official games that omit versionSeason using verified season, version and time", async () => {
    state.omitVersionSeason = true;
    const analysis = await getOrBuildPlayerAnalysis("공식패치일부누락");
    expect(analysis.scope.analyzed_games).toBe(50);
    expect(analysis.statistics.games).toBe(50);
    expect(analysis.statistics.metrics.find((item) => item.id === "damage_dealt")?.value).toBe(12000);
  });

  it("prefers fresh official values over a stale stored row for the same game", async () => {
    state.storedRows = [{ game_id: 1, user_num: 1, character_code: 1, best_weapon: 15, game_rank: 8,
      damage_to_player: 1, play_time: 1200, analysis_data_version: 2,
      matches: { season_id: 41, version_season: 12, version_major: 3, version_minor: 0 } }];
    const analysis = await getOrBuildPlayerAnalysis("공식원본우선");
    expect(analysis.statistics.metrics.find((item) => item.id === "damage_dealt")?.value).toBe(12000);
    expect(analysis.pick_profile.picks[0].top3_rate).toBe(1);
  });

  it("returns actual source statistics when persisted history or peer queries time out", async () => {
    state.storedError = true;
    state.cohortError = true;
    const analysis = await getOrBuildPlayerAnalysis("조회지연통계보존");
    expect(analysis.scope.analyzed_games).toBe(50);
    expect(analysis.statistics.metrics.find((metric) => metric.id === "damage_dealt")?.value).toBe(12000);
    expect(analysis.dimensions.every((dimension) => dimension.score === null)).toBe(true);
    expect(analysis.improvement_priorities).toEqual([]);
    expect(analysis.caveats.some((note) => note.includes("비교군 조회가 지연"))).toBe(true);
    expect(analysis.pick_profile.picks[0].evaluation.basis).toBe("match_results");
    expect(analysis.pick_profile.picks[0].evaluation.grade).not.toBeNull();
  });

  it("reads every cohort page without dropping players sharing the cursor game", async () => {
    state.cohortRows = Array.from({ length: 1100 }, (_, index) => ({
      game_id: 100 + Math.floor(index / 3), user_num: 100 + index, game_rank: 3, mmr_after: 7800,
      character_code: 1, best_weapon: 15, play_time: 1200, damage_to_player: 14000,
      matches: { version_season: 12, version_major: 3, version_minor: 0 }
    }));
    const analysis = await getOrBuildPlayerAnalysis("페이지경계검증");
    expect(analysis.benchmark_coverage.overall_games).toBe(1100);
    expect(analysis.benchmark_coverage.overall_players).toBe(1100);
    const pages = state.queries.filter((query) => query.filters["gte:mmr_after"] !== undefined);
    expect(pages).toHaveLength(2);
    expect(pages[0].filters["gte:game_id"]).toBe(100);
    expect(pages[1].filters.cursor).toBe("game_id.gt.433,and(game_id.eq.433,user_num.gt.1099)");
  });

  it("keeps both sides of each bounded game window exactly once", async () => {
    state.lastCohortGame = 20100;
    state.cohortRows = [100, 10099, 10100, 20099, 20100].map((game_id, index) => ({
      game_id, user_num: 100 + index, game_rank: 3, mmr_after: 7800, character_code: 1, best_weapon: 15,
      play_time: 1200, damage_to_player: 14000, matches: { version_season: 12, version_major: 3, version_minor: 0 }
    }));
    const analysis = await getOrBuildPlayerAnalysis("구간경계검증");
    expect(analysis.benchmark_coverage.overall_games).toBe(5);
    const windows = state.queries.filter((query) => query.filters["gte:mmr_after"] !== undefined);
    expect(windows.map((query) => [query.filters["gte:game_id"], query.filters["lte:game_id"]])).toEqual([
      [100, 10099], [10100, 20099], [20100, 20100]
    ]);
  });
});
