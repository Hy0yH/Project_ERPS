import { describe, expect, it } from "vitest";
import {
  resolvePlayerUserNum,
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
