import { fetchUserGamesPageByUserId } from "@/lib/eternal-return";
import { matchesPatch } from "@/lib/patch-version";
import type { PatchVersion } from "@/lib/types";

export type DiscoveryCheckpoint = {
  patchKey: string;
  nextGameId: number | null;
  boundaryGameId: number | null;
  newestGameId: number | null;
  backfillComplete: boolean;
};

export function isRankedSquad(row: Record<string, unknown>) {
  return Number(row.matchingMode ?? row.matching_mode) === 3 &&
    Number(row.matchingTeamMode ?? row.matching_team_mode ?? 3) === 3;
}

export async function discoverRankerGames(options: {
  userId: string;
  seasonId: number;
  patch: PatchVersion | null;
  latestGameId: number | null;
  checkpoint?: DiscoveryCheckpoint;
  backfill: boolean;
  limit: number;
  deadline: number;
}) {
  const patchKey = options.patch?.patch_key ?? `season:${options.seasonId}`;
  const previous = options.checkpoint?.patchKey === patchKey ? options.checkpoint : undefined;
  const continuing = Boolean(previous?.nextGameId);
  const backfillComplete = previous?.backfillComplete ?? !options.backfill;
  const boundary = continuing ? previous!.boundaryGameId : backfillComplete ? options.latestGameId : null;
  let newest = continuing ? previous!.newestGameId : null;
  let next = continuing ? previous!.nextGameId! : undefined;
  let complete = false;
  let deadlineReached = false;
  let pages = 0;
  const games: Record<string, unknown>[] = [];

  while (games.length < Math.max(1, options.limit)) {
    if (Date.now() >= options.deadline) { deadlineReached = true; break; }
    const page = await fetchUserGamesPageByUserId(options.userId, next);
    pages += 1;
    const rows = page.userGames ?? [];
    if (!rows.length) { complete = true; break; }
    for (const row of rows) {
      const gameId = Number(row.gameId ?? row.game_id);
      const rawStart = row.startDtm ?? row.start_dtm;
      const startedAt = typeof rawStart === "number" ? rawStart : Date.parse(String(rawStart ?? ""));
      if ((boundary && gameId === boundary) ||
        (options.patch?.patch_start_at && startedAt < Date.parse(options.patch.patch_start_at))) {
        complete = true;
        break;
      }
      if (!isRankedSquad(row) || Number(row.seasonId ?? row.season_id) !== options.seasonId ||
        !matchesPatch(row, options.patch) || !gameId) continue;
      newest ??= gameId;
      games.push(row);
    }
    const nextCursor = Number(page.next ?? (page as any).nextGameId ?? (page as any).next_game_id);
    if (complete || !Number.isFinite(nextCursor) || nextCursor <= 0 || nextCursor === next) {
      complete = true;
      break;
    }
    // 한 페이지 전체를 큐에 넣은 뒤 이어받아, 한도에 걸린 페이지의 나머지를 놓치지 않습니다.
    next = nextCursor;
  }

  return {
    games,
    pages,
    deadlineReached,
    complete,
    latestGameId: complete ? newest ?? options.latestGameId : options.latestGameId,
    checkpoint: {
      patchKey,
      nextGameId: complete ? null : next ?? null,
      boundaryGameId: boundary,
      newestGameId: newest,
      backfillComplete: backfillComplete || complete
    } satisfies DiscoveryCheckpoint
  };
}
