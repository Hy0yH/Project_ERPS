import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/eternal-return", () => ({ fetchUserGamesPageByUserId: vi.fn() }));
import { fetchUserGamesPageByUserId } from "@/lib/eternal-return";
import { discoverRankerGames, isRankedSquad } from "@/lib/ranker-discovery";

const patch = {
  patch_key: "12.5.0", version_season: 12, version_major: 5, version_minor: 0,
  patch_start_at: "2026-10-01T02:00:00Z", latest_match_at: ""
};
const game = (id: number) => ({
  gameId: id, matchingMode: 3, matchingTeamMode: 3, seasonId: 41,
  versionSeason: 12, versionMajor: 5, versionMinor: 0, startDtm: "2026-10-03T00:00:00Z"
});
const options = () => ({
  userId: "ranker", seasonId: 41, patch, latestGameId: 1, backfill: true,
  limit: 2, deadline: Date.now() + 60000
});

describe("resumable ranker discovery", () => {
  beforeEach(() => vi.mocked(fetchUserGamesPageByUserId).mockReset());

  it("processes the whole page at a limit and resumes older history without skipping it", async () => {
    vi.mocked(fetchUserGamesPageByUserId)
      .mockResolvedValueOnce({ userGames: [game(9), game(8), game(7)], next: 6 })
      .mockResolvedValueOnce({ userGames: [game(6), game(5)], next: 4 })
      .mockResolvedValueOnce({ userGames: [game(4), game(3), game(2), game(1)] });
    const first = await discoverRankerGames(options());
    expect(first.games.map((row) => row.gameId)).toEqual([9, 8, 7]);
    expect(first.latestGameId).toBe(1);
    const second = await discoverRankerGames({ ...options(), checkpoint: first.checkpoint });
    expect(fetchUserGamesPageByUserId).toHaveBeenLastCalledWith("ranker", 6);
    expect(second.games.map((row) => row.gameId)).toEqual([6, 5]);
    const last = await discoverRankerGames({ ...options(), checkpoint: second.checkpoint });
    expect(last.games.map((row) => row.gameId)).toEqual([4, 3, 2, 1]);
    expect(last.complete).toBe(true);
    expect(last.latestGameId).toBe(9);
    expect(last.checkpoint.backfillComplete).toBe(true);
  });

  it("backs up past an old high-water cursor once to repair earlier capped runs", async () => {
    vi.mocked(fetchUserGamesPageByUserId).mockResolvedValue({ userGames: [game(9), game(8), game(7)] });
    const result = await discoverRankerGames({ ...options(), latestGameId: 8 });
    expect(result.games.map((row) => row.gameId)).toEqual([9, 8, 7]);
  });

  it("uses incremental discovery after the current patch backfill is complete", async () => {
    vi.mocked(fetchUserGamesPageByUserId).mockResolvedValue({ userGames: [game(9), game(8), game(7)], next: 6 });
    const result = await discoverRankerGames({ ...options(), latestGameId: 8, checkpoint: {
      patchKey: "12.5.0", nextGameId: null, boundaryGameId: null, newestGameId: 8, backfillComplete: true
    } });
    expect(result.games.map((row) => row.gameId)).toEqual([9]);
    expect(result.complete).toBe(true);
  });

  it("stops at the patch boundary even if the boundary row is an unranked match", async () => {
    vi.mocked(fetchUserGamesPageByUserId).mockResolvedValue({ userGames: [game(9), {
      ...game(8), matchingMode: 2, startDtm: "2026-10-01T01:00:00Z"
    }], next: 7 });
    expect((await discoverRankerGames(options())).complete).toBe(true);
    expect(fetchUserGamesPageByUserId).toHaveBeenCalledTimes(1);
  });

  it("preserves continuation when the time budget expires between pages", async () => {
    const input = options();
    vi.mocked(fetchUserGamesPageByUserId).mockImplementation(async () => {
      input.deadline = Date.now() - 1;
      return { userGames: [game(9)], next: 8 };
    });
    const result = await discoverRankerGames(input);
    expect(result.deadlineReached).toBe(true);
    expect(result.checkpoint.nextGameId).toBe(8);
    expect(result.latestGameId).toBe(1);
  });

  it("rejects normal, cobalt and mode-less matches", () => {
    expect(isRankedSquad(game(1))).toBe(true);
    expect(isRankedSquad({ ...game(1), matchingMode: 2 })).toBe(false);
    expect(isRankedSquad({ ...game(1), matchingTeamMode: 4 })).toBe(false);
    expect(isRankedSquad({ matchingTeamMode: 3 })).toBe(false);
  });
});
