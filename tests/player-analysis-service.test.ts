import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  queries: [] as { table: string; filters: Record<string, unknown> }[],
  cache: null as any,
  written: null as any,
  storedSeason: 41 as number | null,
  collectedSeason: 41 as number | null
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
      characterNum: 1, bestWeapon: 15, gameRank: 3, mmrAfter: 7936,
      playTime: 1200, damageToPlayer: 12000, playerKill: 3, playerAssistant: 4,
      teamKill: 8, viewContribution: 25, versionSeason: 12, versionMajor: 3, versionMinor: 0,
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
      if (table === "matches") return { data: state.storedSeason ? { season_id: state.storedSeason } : null, error: null };
      if (table === "player_analysis_cache") return { data: state.cache, error: null };
      if (table === "match_players" && entry.filters["gte:mmr_after"] !== undefined) {
        const data = Array.from({ length: 90 }, (_, i) => ({
          user_num: 100 + Math.floor(i / 3), game_rank: i % 8 + 1, mmr_after: 7800,
          character_code: 1, best_weapon: 15, play_time: 1200,
          damage_to_player: 14000 + i, view_contribution: 20, analysis_data_version: 2
        }));
        return { data: entry.filters["matches.season_id"] === 41 ? data : [], error: null };
      }
      return { data: [], error: null };
    };
    const query: any = {
      select: () => query, order: () => query, limit: () => query, range: () => query,
      eq: (key: string, value: unknown) => { entry.filters[key] = value; return query; },
      ilike: (key: string, value: unknown) => { entry.filters[key] = value; return query; },
      gt: () => query, lt: () => query, neq: () => query,
      gte: (key: string, value: unknown) => { entry.filters[`gte:${key}`] = value; return query; },
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
});

describe("analysis with missing season environment variable", () => {
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
});
