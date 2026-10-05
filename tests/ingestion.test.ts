import { describe, expect, it } from "vitest";
import {
  resolvePlayerUserNum,
  fetchSnapshotPlayers,
  selectRankersForDiscovery,
  splitSnapshotPlayers,
  type CollectionCursorState
} from "@/lib/ingestion";

describe("incremental ranker discovery", () => {
  it("selects unscanned and least-recently scanned rankers first", () => {
    const rankers = [
      { uid: "newer", nickname: "최근" },
      { uid: "unscanned", nickname: "미확인" },
      { uid: "older", nickname: "오래됨" }
    ];
    const cursors = new Map<string, CollectionCursorState>([
      ["newer", { latestGameId: 30, lastScannedAt: "2026-08-19T03:00:00.000Z" }],
      ["older", { latestGameId: 10, lastScannedAt: "2026-08-18T03:00:00.000Z" }]
    ]);

    expect(
      selectRankersForDiscovery(rankers, cursors, 2).map((ranker) => ranker.uid)
    ).toEqual(["unscanned", "older"]);
  });

  it("uses the nickname cursor when rank rows omit the external user id", () => {
    const rankers = [{ nickname: "다시확인" }, { nickname: "처음확인" }];
    const cursors = new Map<string, CollectionCursorState>([
      [
        "nickname:다시확인",
        { latestGameId: 10, lastScannedAt: "2026-08-18T03:00:00.000Z" }
      ]
    ]);

    expect(selectRankersForDiscovery(rankers, cursors, 1)[0]?.nickname).toBe("처음확인");
  });
});

describe("snapshot player selection", () => {
  it("reuses stored 12.5 games with an October 1 boundary and exact version filters", async () => {
    const filters: unknown[][] = [];
    const query: any = {
      select: () => query, order: () => query,
      gte: (column: string, value: unknown) => { filters.push([column, value]); return query; },
      eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
      range: async () => ({ data: [{
        game_id: 100,
        started_at: "2026-10-01T08:00:00Z",
        version_season: 12, version_major: 5, version_minor: 0,
        match_players: [{ game_id: 100, user_num: 1 }]
      }], error: null })
    };
    const rows = await fetchSnapshotPlayers({ from: () => query } as any, "2026-10-01T02:00:00.000Z", {
      patch_key: "12.5.0", version_season: 12, version_major: 5, version_minor: 0,
      patch_start_at: "2026-10-01T02:00:00.000Z", latest_match_at: ""
    });
    expect(filters).toEqual([
      ["started_at", "2026-10-01T02:00:00.000Z"],
      ["version_season", 12], ["version_major", 5], ["version_minor", 0]
    ]);
    expect(rows[0].game_id).toBe(100);
  });

  it("paginates by matches without truncating complete teams at a player page boundary", async () => {
    const matches = Array.from({ length: 101 }, (_, index) => ({
      game_id: index + 1,
      started_at: "2026-09-17T08:00:00Z",
      version_season: 12, version_major: 4, version_minor: 0,
      match_players: Array.from({ length: 24 }, (_, player) => ({
        game_id: index + 1, user_num: player + 1, team_number: Math.floor(player / 3)
      }))
    }));
    const ranges: number[][] = [];
    const query: any = {
      select: () => query, gte: () => query, eq: () => query, order: () => query,
      range: async (from: number, to: number) => {
        ranges.push([from, to]);
        return { data: matches.slice(from, to + 1), error: null };
      }
    };
    const rows = await fetchSnapshotPlayers({ from: () => query } as any, "2026-09-17T02:00:00Z", null);
    expect(ranges).toEqual([[0, 99], [100, 199]]);
    expect(rows).toHaveLength(2424);
    expect(rows.filter((row) => row.game_id === 101)).toHaveLength(24);
    expect(rows[0].matches.version_major).toBe(4);
  });

  it("keeps complete teams anchored by a mythril-plus player", () => {
    const players = [
      { game_id: 1, team_number: 1, mmr_after: 8100, nickname: "ranker" },
      { game_id: 1, team_number: 1, mmr_after: 7600, nickname: "teammate-a" },
      { game_id: 1, team_number: 1, mmr_after: 7500, nickname: "teammate-b" },
      { game_id: 1, team_number: 2, mmr_after: 7000, nickname: "other" }
    ];

    const selected = splitSnapshotPlayers(players, 7800);

    expect(selected.metaPlayers.map((player) => player.nickname)).toEqual(["ranker"]);
    expect(selected.compPlayers.map((player) => player.nickname)).toEqual([
      "ranker",
      "teammate-a",
      "teammate-b"
    ]);
  });
});

describe("player identity", () => {
  it("keeps the target player's number stable across team and row positions", () => {
    const identity = { userId: "opaque-player-uid", nickname: "겜덕후" };
    const first = resolvePlayerUserNum(
      { nickname: "겜덕후", teamNumber: 1 },
      identity
    );
    const later = resolvePlayerUserNum(
      { nickname: "겜덕후", teamNumber: 8, userNum: null },
      identity
    );

    expect(later).toBe(first);
  });

  it("uses a nickname-stable fallback when the API omits all player identifiers", () => {
    expect(resolvePlayerUserNum({ nickname: "동일인", teamNumber: 1 })).toBe(
      resolvePlayerUserNum({ nickname: "동일인", teamNumber: 7 })
    );
  });
});
