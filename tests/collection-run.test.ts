import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/collection-state", () => ({
  collectionStatePath: () => null, loadCollectionState: async () => ({}), saveCollectionState: async () => {}
}));
vi.mock("@/lib/patch-version", () => ({
  getActivePatch: async () => ({ patch_key: "12.5.0", version_season: 12, version_major: 5, version_minor: 0,
    patch_start_at: "2026-10-01T02:00:00Z", latest_match_at: "" }),
  matchesPatch: (row: any) => row.versionMajor === 5
}));
vi.mock("@/lib/eternal-return", async (original) => ({
  ...await original<typeof import("@/lib/eternal-return")>(),
  fetchGame: vi.fn(), fetchTopRankers: vi.fn(), fetchUserGamesPageByUserId: vi.fn(),
  fetchGameData: async () => [], fetchKoreanL10n: async () => ({})
}));

import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchGame, fetchTopRankers, fetchUserGamesPageByUserId } from "@/lib/eternal-return";
import { collectRankerMatches, CollectionBusyError } from "@/lib/ingestion";

const tables: Record<string, any[]> = {};
const game = {
  gameId: 100, matchingMode: 3, matchingTeamMode: 3, seasonId: 41,
  versionSeason: 12, versionMajor: 5, versionMinor: 0, startDtm: "2026-10-03T00:00:00Z"
};

// Small storage fixture exercises discovery -> persistence -> claim -> completion in one run.
function database() {
  return { from: (table: string) => {
    tables[table] ??= [];
    const predicates: ((row: any) => boolean)[] = [];
    let operation: (() => any[]) | undefined;
    let limit = Infinity;
    let range = [0, Infinity];
    const selected = () => tables[table].filter((row) => predicates.every((predicate) => predicate(row)));
    const result = () => {
      const data = operation ? operation() : selected();
      return { data: data.slice(range[0], Math.min(range[1] + 1, limit)), error: null, count: data.length };
    };
    const query: any = {
      select: () => query, order: () => query, or: () => query,
      eq: (key: string, value: unknown) => { predicates.push((row) => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { predicates.push((row) => values.includes(row[key])); return query; },
      gte: (key: string, value: any) => { predicates.push((row) => row[key] >= value); return query; },
      lte: (key: string, value: any) => { predicates.push((row) => row[key] <= value); return query; },
      lt: (key: string, value: any) => { predicates.push((row) => row[key] < value); return query; },
      limit: (value: number) => { limit = value; return query; },
      range: (from: number, to: number) => { range = [from, to]; return query; },
      insert: (value: any) => {
        operation = () => { const row = { id: 1, ...value }; tables[table].push(row); return [row]; };
        return query;
      },
      update: (value: any) => {
        operation = () => { const rows = selected(); rows.forEach((row) => Object.assign(row, value)); return rows; };
        return query;
      },
      upsert: (values: any, options: any) => {
        operation = () => {
          const rows = Array.isArray(values) ? values : [values];
          for (const input of rows) {
            const keys = options.onConflict.split(",");
            const existing = tables[table].find((row) => keys.every((key: string) => row[key] === input[key]));
            if (existing && !options.ignoreDuplicates) Object.assign(existing, input);
            if (!existing) tables[table].push({ ...input });
          }
          return rows;
        };
        return query;
      },
      single: async () => { const value = result(); return { ...value, data: value.data[0] }; },
      maybeSingle: async () => { const value = result(); return { ...value, data: value.data[0] ?? null }; },
      then: (resolve: any) => Promise.resolve(result()).then(resolve)
    };
    return query;
  } };
}

describe("ranker collection pipeline", () => {
  beforeEach(() => {
    vi.stubEnv("ER_SEASON_ID", "41");
    for (const key of Object.keys(tables)) delete tables[key];
    vi.mocked(getSupabaseAdmin).mockReturnValue(database() as any);
    vi.mocked(fetchTopRankers).mockResolvedValue([{ uid: "ranker", nickname: "ranker", mmr: 8000 }]);
    vi.mocked(fetchUserGamesPageByUserId).mockResolvedValue({ userGames: [game] });
    vi.mocked(fetchGame).mockResolvedValue({ gamePlayers: Array.from({ length: 24 }, (_, index) => ({
      ...game, userNum: index + 1, nickname: `player-${index}`, teamNumber: Math.floor(index / 3) + 1,
      characterNum: 1, gameRank: 1, bestWeapon: 15, viewContribution: 10, playTime: 1000
    })) });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("saves newly discovered games immediately instead of waiting for the next schedule", async () => {
    const result = await collectRankerMatches();
    expect(result.savedMatches).toBe(1);
    expect(result.pendingMatches).toBe(0);
    expect(tables.match_ingestion_queue[0].status).toBe("completed");
    expect(tables.match_players).toHaveLength(24);
  });

  it("keeps an empty detail response in the retry queue rather than falsely completing it", async () => {
    vi.mocked(fetchGame).mockResolvedValue({ gamePlayers: [] });
    const result = await collectRankerMatches();
    expect(result.savedMatches).toBe(0);
    expect(result.failedMatches).toBe(1);
    expect(tables.match_ingestion_queue[0].status).toBe("failed");
    expect(tables.match_ingestion_queue[0].attempts).toBe(1);
  });

  it("skips an unranked queued match without deleting it or including it in meta", async () => {
    tables.match_ingestion_queue = [{ game_id: 100, status: "pending", attempts: 0, game_started_at: null }];
    vi.mocked(fetchUserGamesPageByUserId).mockResolvedValue({ userGames: [] });
    vi.mocked(fetchGame).mockResolvedValue({ gamePlayers: [{ ...game, matchingMode: 2 }] });
    const result = await collectRankerMatches();
    expect(result.savedMatches).toBe(0);
    expect(result.skippedUnwantedMatches).toBe(1);
    expect(tables.matches ?? []).toEqual([]);
    expect(tables.match_ingestion_queue[0].status).toBe("completed");
  });

  it("retries a truncated ranked game without saving a misleading partial match", async () => {
    vi.mocked(fetchGame).mockResolvedValue({ gamePlayers: [{ ...game, userNum: 1 }] });
    const result = await collectRankerMatches();
    expect(result.savedMatches).toBe(0);
    expect(result.failedMatches).toBe(1);
    expect(tables.matches ?? []).toEqual([]);
    expect(tables.match_ingestion_queue[0].status).toBe("failed");
    expect(tables.match_ingestion_queue[0].attempts).toBe(1);
  });

  it("refuses overlapping collection calls", async () => {
    let release!: (rows: any[]) => void;
    vi.mocked(fetchTopRankers).mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const running = collectRankerMatches();
    await expect(collectRankerMatches()).rejects.toBeInstanceOf(CollectionBusyError);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release([{ uid: "ranker", nickname: "ranker" }]);
    await running;
  });

  it("can enqueue the same game from another ranker after a queue write fails", async () => {
    const storage = database();
    let failOnce = true;
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: (table: string) => {
      const query = storage.from(table);
      if (table === "match_ingestion_queue") {
        const upsert = query.upsert;
        query.upsert = (...args: any[]) => {
          if (failOnce) { failOnce = false; return Promise.resolve({ error: new Error("Temporary queue write failure") }); }
          return upsert(...args);
        };
      }
      return query;
    } } as any);
    vi.mocked(fetchTopRankers).mockResolvedValue([{ uid: "ranker-a" }, { uid: "ranker-b" }]);
    const result = await collectRankerMatches();
    expect(result.failedRankers).toBe(1);
    expect(result.savedMatches).toBe(1);
    expect(tables.match_ingestion_queue[0].status).toBe("completed");
  });
});
