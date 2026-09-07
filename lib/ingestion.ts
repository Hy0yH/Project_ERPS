import {
  ER_ANALYSIS_PEER_GAME_LIMIT,
  ER_ANALYSIS_PLAYER_MATCH_LIMIT,
  ER_COLLECTION_MAX_NEW_MATCHES,
  ER_DISCOVERY_RANKERS_PER_RUN,
  ER_DISCOVERY_TIME_BUDGET_MINUTES,
  ER_PLAYER_MATCH_LIMIT,
  ER_RANKER_MATCH_LIMIT,
  ER_SEASON_ID,
  MIN_MYTHRIL_MMR,
  getOptionalNumberEnv
} from "@/lib/env";
import {
  fetchGame,
  fetchGameData,
  fetchKoreanL10n,
  fetchTopRankers,
  fetchUserByNickname,
  fetchUserGamesPage,
  fetchUserGamesPageByUserId,
  getUserId,
  getUserNum,
  getRows
} from "@/lib/eternal-return";
import { getActivePatch, matchesPatch } from "@/lib/patch-version";
import {
  DEFAULT_RANK_SCOPE,
  RANK_SCOPE_OPTIONS,
  matchesRankScope,
  type RankScope
} from "@/lib/rank-scopes";
import { getSupabaseAdmin } from "@/lib/supabase";
import { confidenceScore, isTop3, ratio } from "@/lib/stats";
import {
  PLAYER_ANALYSIS_BASE_VERSION,
  PLAYER_ANALYSIS_VERSION,
  buildBenchmarkStats,
  mmrBucketStart
} from "@/lib/player-analysis";
import { classifyCharacterWeapon } from "@/lib/combat-archetypes";
import type { PatchVersion, PlayerDataScope } from "@/lib/types";
import {
  characterWeaponKey,
  isCharacterWeapon,
  parseCharacterWeaponKey,
  weaponCodeForType
} from "@/lib/weapons";

const RANKED_SQUAD_MODE = 3;

type PlayerIdentity = {
  userId: string | null;
  nickname: string;
};

type SaveGameOptions = {
  identity?: PlayerIdentity;
  patch?: PatchVersion | null;
};

type CandidateGame = {
  gameId: number;
  gameRow: Record<string, unknown>;
  sourceUserId: string | null;
  sourceNickname: string;
};

type CollectionCursor = {
  external_user_id: string;
  nickname: string;
  latest_game_id: number | null;
  last_scanned_at: string | null;
};

export type CollectionCursorState = {
  latestGameId: number | null;
  lastScannedAt: string | null;
};

type QueueWorkItem = {
  game_id: number;
  attempts: number;
};
const SNAPSHOT_PAGE_SIZE = 1000;

function nicknameCursorKey(nickname: string) {
  return `nickname:${nickname.trim().toLocaleLowerCase("ko-KR")}`;
}

function rankerCursorState(
  ranker: Record<string, unknown>,
  cursorByIdentity: Map<string, CollectionCursorState>
) {
  const userId = getUserId(ranker);
  const nickname = typeof ranker.nickname === "string" ? ranker.nickname : "";
  return (
    (userId ? cursorByIdentity.get(userId) : undefined) ??
    (nickname ? cursorByIdentity.get(nicknameCursorKey(nickname)) : undefined)
  );
}

export function selectRankersForDiscovery(
  rankers: Record<string, unknown>[],
  cursorByIdentity: Map<string, CollectionCursorState>,
  limit: number
) {
  return rankers
    .map((ranker, originalIndex) => ({
      ranker,
      originalIndex,
      scannedAt: rankerCursorState(ranker, cursorByIdentity)?.lastScannedAt ?? null
    }))
    .sort((left, right) => {
      if (left.scannedAt === right.scannedAt) {
        return left.originalIndex - right.originalIndex;
      }
      if (!left.scannedAt) return -1;
      if (!right.scannedAt) return 1;
      return Date.parse(left.scannedAt) - Date.parse(right.scannedAt);
    })
    .slice(0, Math.max(0, Math.floor(limit)))
    .map(({ ranker }) => ranker);
}

export async function syncCharacters() {
  const supabase = getSupabaseAdmin();
  const [characters, masteries, l10n] = await Promise.all([
    fetchGameData("Character", "v2"),
    fetchGameData("CharacterMastery", "v2"),
    fetchKoreanL10n()
  ]);
  const masteryByCharacter = new Map(
    masteries.map((item) => [Number(item.code), characterWeaponTypes(item)])
  );
  const rows = characters.map((item) => {
    const code = Number(item.code ?? item.characterCode ?? item.character_code);
    return {
      character_code: code,
      name_ko: l10n[`Character/Name/${code}`] ?? String(item.name ?? item.nameKo ?? code),
      name_en: String(item.name ?? item.nameEn ?? ""),
      role: String(item.role ?? ""),
      official_archetype_primary: nullableMetadataString(item.charArcheType1),
      official_archetype_secondary: nullableMetadataString(item.charArcheType2),
      official_range_type: nullableMetadataString(item.weaponRangeType),
      weapon_types: masteryByCharacter.get(code) ?? [],
      is_active: true
    };
  });
  const { error } = await supabase.from("characters").upsert(rows, {
    onConflict: "character_code"
  });
  if (error) throw error;
  await syncCharacterWeaponArchetypes(rows);
  return rows.length;
}

async function syncCharacterWeaponArchetypes(rows: Array<{
  character_code: number;
  official_archetype_primary: string | null;
  official_archetype_secondary: string | null;
  official_range_type: string | null;
  weapon_types: string[];
}>) {
  const supabase = getSupabaseAdmin();
  const { data: reviewed, error: reviewedError } = await supabase
    .from("character_weapon_archetypes")
    .select("character_code, weapon_code")
    .eq("review_status", "reviewed");
  if (reviewedError) throw reviewedError;
  const reviewedKeys = new Set(
    (reviewed ?? []).map((row) => `${Number(row.character_code)}:${Number(row.weapon_code)}`)
  );
  const classifications = rows.flatMap((character) => {
    const weapons = character.weapon_types.length ? character.weapon_types : [null];
    return weapons.flatMap((currentWeaponType) => {
      const currentWeaponCode = weaponCodeForType(currentWeaponType) ?? 0;
      if (reviewedKeys.has(`${character.character_code}:${currentWeaponCode}`)) return [];
      const classification = classifyCharacterWeapon({
        characterCode: character.character_code,
        weaponCode: currentWeaponCode,
        weaponType: currentWeaponType,
        officialPrimary: character.official_archetype_primary,
        officialSecondary: character.official_archetype_secondary,
        officialRangeType: character.official_range_type
      });
      return [{
        character_code: character.character_code,
        weapon_code: currentWeaponCode,
        range_profile: classification.rangeProfile,
        primary_function: classification.primaryFunction,
        secondary_function: classification.secondaryFunction,
        score_profile: classification.scoreProfile,
        review_status: classification.reviewStatus,
        confidence: classification.confidence,
        classification_source: classification.reviewStatus === "reviewed"
          ? "manual_review"
          : "official_api_v2",
        classification_version: classification.classificationVersion,
        review_reason: classification.reviewReason,
        evidence: {
          official_primary: character.official_archetype_primary,
          official_secondary: character.official_archetype_secondary,
          official_range_type: character.official_range_type,
          weapon_type: currentWeaponType
        },
        updated_at: new Date().toISOString()
      }];
    });
  });
  if (!classifications.length) return;
  const { error } = await supabase.from("character_weapon_archetypes").upsert(classifications, {
    onConflict: "character_code,weapon_code"
  });
  if (error) throw error;
}

export async function collectRankerMatches() {
  const supabase = getSupabaseAdmin();
  const seasonId = process.env.ER_SEASON_ID;
  if (!seasonId) throw new Error("ER_SEASON_ID is required");

  const run = await supabase
    .from("ingestion_runs")
    .insert({ job_name: "collect-rankers", status: "running" })
    .select("id")
    .single();
  if (run.error) throw run.error;

  let savedMatches = 0;
  try {
    await syncCharacters();
    const activePatch = await getActivePatch(supabase);
    await resetStaleQueueItems(supabase);

    const queueResult = await processQueuedMatches(
      supabase,
      activePatch,
      ER_COLLECTION_MAX_NEW_MATCHES
    );
    savedMatches = queueResult.savedMatches;

    const rankers = await fetchTopRankers(seasonId);
    if (!rankers.length) {
      throw new Error(
        `No rankers matched ER_SEASON_ID=${seasonId} and ER_MIN_MMR=${MIN_MYTHRIL_MMR}. Lower ER_MIN_MMR or verify ER_SEASON_ID.`
      );
    }

    const cursorByIdentity = await fetchCollectionCursors(supabase);
    const rankersForDiscovery = selectRankersForDiscovery(
      rankers,
      cursorByIdentity,
      ER_DISCOVERY_RANKERS_PER_RUN
    );
    const discoveryDeadline =
      Date.now() + Math.max(1, ER_DISCOVERY_TIME_BUDGET_MINUTES) * 60 * 1000;
    let attemptedUsers = 0;
    let skippedMissingIdentifier = 0;
    let failedRankers = 0;
    let discoveryTimeBudgetReached = false;
    const candidateGameIds = new Set<number>();
    const queuedGameIds = new Set<number>();
    const existingGameIds = new Set<number>();

    for (const ranker of rankersForDiscovery) {
      if (Date.now() >= discoveryDeadline) {
        discoveryTimeBudgetReached = true;
        break;
      }
      try {
        const resolved = await resolveRankerUser(ranker);
        if (!resolved.userId) {
          skippedMissingIdentifier += 1;
          continue;
        }

        attemptedUsers += 1;
        const nickname = String(ranker.nickname ?? resolved.nickname ?? "");
        const previousCursor =
          cursorByIdentity.get(resolved.userId) ??
          cursorByIdentity.get(nicknameCursorKey(nickname));
        const previousLatestGameId = previousCursor?.latestGameId ?? null;
        const rankerCandidates = new Map<number, CandidateGame>();
        let newestGameId: number | null = null;
        let inspectedForRanker = 0;
        let next: number | undefined;
        let stopRanker = false;
        let interruptedByDeadline = false;
        while (!stopRanker && inspectedForRanker < ER_RANKER_MATCH_LIMIT) {
          if (Date.now() >= discoveryDeadline) {
            discoveryTimeBudgetReached = true;
            interruptedByDeadline = true;
            break;
          }
          const page = await fetchUserGamesPageByUserId(resolved.userId, next);
          const games = page.userGames ?? [];
          if (!games.length) break;
          for (const gameRow of games) {
            const gameId = Number(gameRow.gameId ?? gameRow.game_id);
            if (gameId && previousLatestGameId && gameId === previousLatestGameId) {
              stopRanker = true;
              break;
            }
            if (!isRankedSquad(gameRow) || !isConfiguredSeason(gameRow)) continue;
            if (!matchesPatch(gameRow, activePatch)) {
              if (isOlderThanPatchStart(gameRow, activePatch)) stopRanker = true;
              continue;
            }
            inspectedForRanker += 1;
            if (gameId) {
              newestGameId ??= gameId;
              candidateGameIds.add(gameId);
              rankerCandidates.set(gameId, {
                gameId,
                gameRow,
                sourceUserId: resolved.userId,
                sourceNickname: nickname
              });
            }
            if (inspectedForRanker >= ER_RANKER_MATCH_LIMIT) {
              stopRanker = true;
              break;
            }
          }
          const nextCursor = getNextCursor(page as Record<string, unknown>);
          if (stopRanker || !nextCursor || nextCursor === next) break;
          next = nextCursor;
        }

        const completeForRanker = await findCompleteAnalysisGameIds(
          supabase,
          [...rankerCandidates.keys()]
        );
        for (const gameId of completeForRanker) existingGameIds.add(gameId);
        const queueCandidates = [...rankerCandidates.values()].filter(
          (candidate) => !completeForRanker.has(candidate.gameId)
        );
        for (const candidate of queueCandidates) queuedGameIds.add(candidate.gameId);
        await enqueueCandidateGames(supabase, queueCandidates);

        if (!interruptedByDeadline) {
          const lastScannedAt = new Date().toISOString();
          await upsertCollectionCursors(supabase, [{
            external_user_id: resolved.userId,
            nickname,
            mmr: Number(ranker.mmr ?? ranker.mmrAfter ?? 0),
            latest_game_id: newestGameId ?? previousLatestGameId,
            last_scanned_at: lastScannedAt
          }]);
          const cursorState = {
            latestGameId: newestGameId ?? previousLatestGameId,
            lastScannedAt
          };
          cursorByIdentity.set(resolved.userId, cursorState);
          cursorByIdentity.set(nicknameCursorKey(nickname), cursorState);
        }
      } catch {
        failedRankers += 1;
      }
    }

    const failedMatches = queueResult.failedMatches;
    const skippedExistingMatches = existingGameIds.size;
    const pendingMatches = await countPendingQueueItems(supabase);
    const warnings = [
      skippedMissingIdentifier
        ? `Skipped ${skippedMissingIdentifier} rankers without a usable identifier.`
        : "",
      failedRankers ? `${failedRankers} ranker history requests failed.` : "",
      failedMatches ? `${failedMatches} queued matches failed and will be retried.` : "",
      discoveryTimeBudgetReached
        ? `Ranker discovery stopped at the ${ER_DISCOVERY_TIME_BUDGET_MINUTES}-minute budget and will resume next run.`
        : ""
    ].filter(Boolean).join(" ") || null;

    await supabase
      .from("ingestion_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        saved_matches: savedMatches,
        error_message: warnings
      })
      .eq("id", run.data.id);
    return {
      savedMatches,
      attemptedUsers,
      skippedMissingIdentifier,
      failedRankers,
      failedMatches,
      skippedExistingMatches,
      candidateMatches: candidateGameIds.size,
      queuedMatches: queuedGameIds.size,
      pendingMatches,
      cappedNewMatches: pendingMatches,
      selectedRankers: rankersForDiscovery.length,
      discoveryTimeBudgetReached
    };
  } catch (error) {
    await supabase
      .from("ingestion_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error)
      })
      .eq("id", run.data.id);
    throw error;
  }
}

export async function collectPlayerRecentMatches(
  nickname: string,
  scope: PlayerDataScope = "season",
  limit = ER_PLAYER_MATCH_LIMIT
) {
  const trimmedNickname = nickname.trim();
  if (!trimmedNickname) {
    return { savedMatches: 0, skippedExistingMatches: 0, inspectedGames: 0, userId: null, scope };
  }

  const supabase = getSupabaseAdmin();
  const latestPatch = await getActivePatch(supabase);
  const user = await fetchUserByNickname(trimmedNickname);
  const userId = getUserId(user);
  const resolvedUserNum = getUserNum(user);
  if (!userId && !resolvedUserNum) {
    return { savedMatches: 0, skippedExistingMatches: 0, inspectedGames: 0, userId: null, scope };
  }

  let savedMatches = 0;
  let skippedExistingMatches = 0;
  let inspectedGames = 0;
  let next: number | undefined;

  while (inspectedGames < limit) {
    const gamesPayload = userId
      ? await fetchUserGamesPageByUserId(userId, next)
      : await fetchUserGamesPage(resolvedUserNum as number, next);
    const games = gamesPayload.userGames ?? [];
    if (!games.length) break;

    let shouldStop = false;
    for (const gameRow of games) {
      if (!isRankedSquad(gameRow)) continue;
      if (!isConfiguredSeason(gameRow)) {
        if (isOlderThanConfiguredSeason(gameRow)) shouldStop = true;
        continue;
      }
      if (!isWithinPlayerScope(gameRow, scope, latestPatch)) {
        if (isOlderThanPatchStart(gameRow, latestPatch)) shouldStop = true;
        continue;
      }

      const gameId = Number(gameRow.gameId ?? gameRow.game_id);
      if (!gameId) continue;

      inspectedGames += 1;
      if (await hasSavedGamePlayers(supabase, gameId)) {
        skippedExistingMatches += 1;
        continue;
      }

      try {
        const detail = await fetchGame(gameId);
        await saveGame(detail, {
          identity: { userId, nickname: trimmedNickname },
          patch: latestPatch
        });
        savedMatches += 1;
      } catch (error) {
        console.error(`Failed to save game ${gameId} for recent matches:`, error);
      }

      if (inspectedGames >= limit) {
        shouldStop = true;
        break;
      }
    }

    const nextCursor = getNextCursor(gamesPayload as Record<string, unknown>);
    if (shouldStop || !nextCursor || nextCursor === next) break;
    next = nextCursor;
  }

  return { savedMatches, skippedExistingMatches, inspectedGames, userId, scope };
}

export async function collectPlayerAnalysisMatches(
  nickname: string,
  limit = ER_ANALYSIS_PLAYER_MATCH_LIMIT,
  peerGameLimit = ER_ANALYSIS_PEER_GAME_LIMIT
) {
  const trimmedNickname = nickname.trim();
  if (!trimmedNickname) {
    return {
      savedMatches: 0,
      enrichedPeerGames: 0,
      queuedPeerGames: 0,
      inspectedGames: 0,
      currentPatchGames: 0,
      supplementalGames: 0,
      userId: null,
      userNum: null,
      playerRows: [] as Record<string, unknown>[]
    };
  }

  const supabase = getSupabaseAdmin();
  const activePatch = await getActivePatch(supabase);
  const user = await fetchUserByNickname(trimmedNickname);
  const userId = getUserId(user);
  const resolvedUserNum = getUserNum(user);
  if (!userId && !resolvedUserNum) {
    return {
      savedMatches: 0,
      enrichedPeerGames: 0,
      queuedPeerGames: 0,
      inspectedGames: 0,
      currentPatchGames: 0,
      supplementalGames: 0,
      userId: null,
      userNum: null,
      playerRows: [] as Record<string, unknown>[]
    };
  }

  const currentPatchRows: Record<string, unknown>[] = [];
  const seasonFallbackRows: Record<string, unknown>[] = [];
  let next: number | undefined;

  while (currentPatchRows.length + seasonFallbackRows.length < limit) {
    const payload = userId
      ? await fetchUserGamesPageByUserId(userId, next)
      : await fetchUserGamesPage(resolvedUserNum as number, next);
    const games = payload.userGames ?? [];
    if (!games.length) break;

    for (const row of games) {
      if (!isRankedSquad(row) || !isConfiguredSeason(row)) continue;
      if (!activePatch || matchesPatch(row, activePatch)) currentPatchRows.push(row);
      else seasonFallbackRows.push(row);
      if (currentPatchRows.length + seasonFallbackRows.length >= limit) break;
    }

    const nextCursor = getNextCursor(payload as Record<string, unknown>);
    if (!nextCursor || nextCursor === next) break;
    next = nextCursor;
  }

  const selectedRows = [...currentPatchRows, ...seasonFallbackRows].slice(0, limit);
  const identity = { userId, nickname: trimmedNickname };
  let savedMatches = 0;
  for (const row of selectedRows) {
    try {
      await saveGame(
        { gamePlayers: [row] },
        {
          identity,
          patch: activePatch
        }
      );
      savedMatches += 1;
    } catch (error) {
      console.error(`Failed to save partial game ${row.gameId ?? row.game_id} for analysis:`, error);
    }
  }

  let enrichedPeerGames = 0;
  for (const row of selectedRows.slice(0, Math.max(0, peerGameLimit))) {
    const gameId = Number(row.gameId ?? row.game_id);
    if (!gameId || (await hasCompleteAnalysisGame(supabase, gameId))) continue;
    try {
      const detail = await fetchGame(gameId);
      await saveGame(detail, { identity, patch: activePatch });
      enrichedPeerGames += 1;
    } catch (error) {
      console.error(`Failed to enrich peer game ${gameId} for analysis:`, error);
    }
  }

  const backgroundRows = selectedRows.slice(Math.max(0, peerGameLimit));
  const backgroundGameIds = backgroundRows
    .map((row) => Number(row.gameId ?? row.game_id))
    .filter((gameId) => gameId > 0);
  const completedBackgroundIds = await findCompleteAnalysisGameIds(supabase, backgroundGameIds);
  const backgroundCandidates = backgroundRows.flatMap((row) => {
    const gameId = Number(row.gameId ?? row.game_id);
    if (!gameId || completedBackgroundIds.has(gameId)) return [];
    return [{
      gameId,
      gameRow: row,
      sourceUserId: userId,
      sourceNickname: trimmedNickname
    } satisfies CandidateGame];
  });
  await enqueueCandidateGames(supabase, backgroundCandidates);

  const firstRow = selectedRows[0];
  return {
    savedMatches,
    enrichedPeerGames,
    queuedPeerGames: backgroundCandidates.length,
    inspectedGames: selectedRows.length,
    currentPatchGames: Math.min(currentPatchRows.length, limit),
    supplementalGames: Math.max(0, selectedRows.length - currentPatchRows.length),
    userId,
    userNum: firstRow ? resolvePlayerUserNum(firstRow, identity) : resolvedUserNum,
    playerRows: selectedRows
  };
}

export async function collectPlayerSeasonProfile(
  nickname: string,
  scope: PlayerDataScope = "season",
  limit = ER_PLAYER_MATCH_LIMIT
) {
  const trimmedNickname = nickname.trim();
  if (!trimmedNickname) {
    return { inspectedGames: 0, profileCount: 0, userId: null, scope };
  }

  const supabase = getSupabaseAdmin();
  const latestPatch = scope === "current_patch" ? await getActivePatch(supabase) : null;
  const user = await fetchUserByNickname(trimmedNickname);
  const userId = getUserId(user);
  if (!userId) {
    return { inspectedGames: 0, profileCount: 0, userId: null, scope };
  }

  const gameRows: Record<string, unknown>[] = [];
  let next: number | undefined;
  let shouldStop = false;

  while (gameRows.length < limit && !shouldStop) {
    const gamesPayload = await fetchUserGamesPageByUserId(userId, next);
    const games = gamesPayload.userGames ?? [];
    if (!games.length) break;

    for (const gameRow of games) {
      if (!isRankedSquad(gameRow)) continue;
      if (!isConfiguredSeason(gameRow)) {
        if (isOlderThanConfiguredSeason(gameRow)) shouldStop = true;
        continue;
      }
      if (!isWithinPlayerScope(gameRow, scope, latestPatch)) {
        if (isOlderThanPatchStart(gameRow, latestPatch)) shouldStop = true;
        continue;
      }

      gameRows.push(gameRow);
      if (gameRows.length >= limit) {
        shouldStop = true;
        break;
      }
    }

    const nextCursor = getNextCursor(gamesPayload as Record<string, unknown>);
    if (shouldStop || !nextCursor || nextCursor === next) break;
    next = nextCursor;
  }

  const seasonId = ER_SEASON_ID || Number(gameRows[0]?.seasonId ?? 0);
  const patchKey = scope === "current_patch" ? latestPatch?.patch_key ?? "" : "";
  const collectedAt = new Date().toISOString();
  const grouped = new Map<number, Record<string, unknown>[]>();
  for (const row of gameRows) {
    const characterCode = Number(row.characterNum ?? row.characterCode ?? row.character_code);
    if (!characterCode) continue;
    grouped.set(characterCode, [...(grouped.get(characterCode) ?? []), row]);
  }

  const profiles = [...grouped.entries()].map(([characterCode, rows]) => {
    const weaponCounts = new Map<number, number>();
    for (const row of rows) {
      const weaponCode = Number(row.bestWeapon ?? row.best_weapon ?? 0);
      weaponCounts.set(weaponCode, (weaponCounts.get(weaponCode) ?? 0) + 1);
    }

    const wins = rows.filter((row) => Number(row.gameRank ?? row.game_rank) === 1).length;
    const top3 = rows.filter((row) => Number(row.gameRank ?? row.game_rank) <= 3).length;

    return {
      external_user_id: userId,
      nickname: trimmedNickname,
      season_id: seasonId,
      scope,
      patch_key: patchKey,
      character_code: characterCode,
      weapon_code: [...weaponCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0,
      games: rows.length,
      wins,
      top3,
      win_rate: wins / rows.length,
      top3_rate: top3 / rows.length,
      average_rank: averagePlayerMetric(rows, "gameRank", "game_rank"),
      average_kills: averagePlayerMetric(rows, "playerKill", "player_kill"),
      average_assists: averagePlayerMetric(rows, "playerAssistant", "player_assistant"),
      average_damage_to_player: averagePlayerMetric(rows, "damageToPlayer"),
      average_damage_from_player: averagePlayerMetric(rows, "damageFromPlayer"),
      average_basic_damage: averagePlayerMetric(rows, "damageToPlayer_basic"),
      average_skill_damage: averagePlayerMetric(rows, "damageToPlayer_skill"),
      average_heal_amount: averagePlayerMetric(rows, "healAmount"),
      average_team_recover: averagePlayerMetric(rows, "teamRecover"),
      average_protect_absorb: averagePlayerMetric(rows, "protectAbsorb"),
      average_view_contribution: averagePlayerMetric(rows, "viewContribution"),
      average_vision_actions: averageVisionActions(rows),
      average_survivable_time: averagePlayerMetric(rows, "survivableTime"),
      average_cc_time_to_player: averagePlayerMetric(rows, "ccTimeToPlayer"),
      collected_at: collectedAt
    };
  });

  const deleteQuery = supabase
    .from("player_character_profiles")
    .delete()
    .eq("external_user_id", userId)
    .eq("season_id", seasonId)
    .eq("scope", scope)
    .eq("patch_key", patchKey);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;

  if (profiles.length) {
    const { error: insertError } = await supabase.from("player_character_profiles").insert(profiles);
    if (insertError) throw insertError;
  }

  return {
    inspectedGames: gameRows.length,
    profileCount: profiles.length,
    userId,
    scope
  };
}

function averagePlayerMetric(
  rows: Record<string, unknown>[],
  ...fieldNames: string[]
) {
  if (!rows.length) return 0;
  const total = rows.reduce((sum, row) => {
    const value = fieldNames.map((field) => row[field]).find((item) => item !== undefined);
    return sum + Number(value ?? 0);
  }, 0);
  return total / rows.length;
}

function averageVisionActions(rows: Record<string, unknown>[]) {
  if (!rows.length) return 0;
  const total = rows.reduce(
    (sum, row) =>
      sum +
      Number(row.addSurveillanceCamera ?? 0) +
      Number(row.addTelephotoCamera ?? 0) +
      Number(row.removeSurveillanceCamera ?? 0) +
      Number(row.removeTelephotoCamera ?? 0) +
      Number(row.useSecurityConsole ?? 0) +
      Number(row.useReconDrone ?? 0),
    0
  );
  return total / rows.length;
}

function latestCumulativeValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!Array.isArray(value)) return 0;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const numeric = Number(value[index]);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

async function hasSavedGamePlayers(supabase: ReturnType<typeof getSupabaseAdmin>, gameId: number) {
  const { count, error } = await supabase
    .from("match_players")
    .select("*", { count: "exact", head: true })
    .eq("game_id", gameId)
    .gte("analysis_data_version", PLAYER_ANALYSIS_VERSION);
  if (error) throw error;
  return Number(count ?? 0) >= 8;
}

async function hasCompleteAnalysisGame(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  gameId: number
) {
  const { count, error } = await supabase
    .from("match_players")
    .select("*", { count: "exact", head: true })
    .eq("game_id", gameId)
    .gte("analysis_data_version", PLAYER_ANALYSIS_VERSION);
  if (error) throw error;
  return Number(count ?? 0) >= 8;
}

async function findCompleteAnalysisGameIds(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  gameIds: number[]
) {
  const playerCounts = new Map<number, number>();
  for (let index = 0; index < gameIds.length; index += 500) {
    const batch = gameIds.slice(index, index + 500);
    if (!batch.length) continue;
    const { data, error } = await supabase
      .from("match_players")
      .select("game_id")
      .in("game_id", batch)
      .gte("analysis_data_version", PLAYER_ANALYSIS_VERSION);
    if (error) throw error;
    for (const row of data ?? []) {
      const gameId = Number(row.game_id);
      playerCounts.set(gameId, (playerCounts.get(gameId) ?? 0) + 1);
    }
  }
  return new Set(
    [...playerCounts.entries()]
      .filter(([, count]) => count >= 8)
      .map(([gameId]) => gameId)
  );
}

async function fetchCollectionCursors(
  supabase: ReturnType<typeof getSupabaseAdmin>
) {
  const cursors = new Map<string, CollectionCursorState>();
  for (let from = 0; ; from += SNAPSHOT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("ranker_collection_cursors")
      .select("external_user_id, nickname, latest_game_id, last_scanned_at")
      .range(from, from + SNAPSHOT_PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of (data ?? []) as CollectionCursor[]) {
      const state = {
        latestGameId: row.latest_game_id ? Number(row.latest_game_id) : null,
        lastScannedAt: row.last_scanned_at ? String(row.last_scanned_at) : null
      };
      cursors.set(String(row.external_user_id), state);
      if (row.nickname) cursors.set(nicknameCursorKey(row.nickname), state);
    }
    if (!data || data.length < SNAPSHOT_PAGE_SIZE) break;
  }
  return cursors;
}

async function upsertCollectionCursors(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rows: {
    external_user_id: string;
    nickname: string;
    mmr: number;
    latest_game_id: number | null;
    last_scanned_at: string;
  }[]
) {
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase
      .from("ranker_collection_cursors")
      .upsert(rows.slice(index, index + 500), { onConflict: "external_user_id" });
    if (error) throw error;
  }
}

async function enqueueCandidateGames(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  candidates: CandidateGame[]
) {
  const rows = candidates.map((candidate) => {
    const rawStartedAt = candidate.gameRow.startDtm ?? candidate.gameRow.start_dtm;
    const parsedStartedAt = rawStartedAt === undefined ? null : parseStartedAt(rawStartedAt);
    return {
      game_id: candidate.gameId,
      source_external_user_id: candidate.sourceUserId,
      source_nickname: candidate.sourceNickname,
      game_started_at:
        parsedStartedAt && Number.isFinite(parsedStartedAt.getTime())
          ? parsedStartedAt.toISOString()
          : null,
      status: "pending",
      attempts: 0,
      last_error: null,
      processed_at: null,
      updated_at: new Date().toISOString()
    };
  });

  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase
      .from("match_ingestion_queue")
      .upsert(rows.slice(index, index + 500), {
        onConflict: "game_id",
        ignoreDuplicates: true
      });
    if (error) throw error;
  }
}

async function resetStaleQueueItems(
  supabase: ReturnType<typeof getSupabaseAdmin>
) {
  const staleBefore = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("match_ingestion_queue")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("updated_at", staleBefore);
  if (error) throw error;
}

async function fetchQueueWork(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  limit: number
) {
  const { data, error } = await supabase
    .from("match_ingestion_queue")
    .select("game_id, attempts")
    .in("status", ["pending", "failed"])
    .lte("attempts", 3)
    .order("discovered_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    game_id: Number(row.game_id),
    attempts: Number(row.attempts ?? 0)
  })) as QueueWorkItem[];
}

async function processQueuedMatches(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  activePatch: PatchVersion | null,
  limit: number
) {
  const queueWork = await fetchQueueWork(supabase, limit);
  const alreadySavedQueueIds = await findCompleteAnalysisGameIds(
    supabase,
    queueWork.map((item) => item.game_id)
  );
  let savedMatches = 0;
  let failedMatches = 0;

  for (const item of queueWork) {
    if (alreadySavedQueueIds.has(item.game_id)) {
      await completeQueueItem(supabase, item.game_id);
      continue;
    }

    await beginQueueItem(supabase, item);
    try {
      const detail = await fetchGame(item.game_id);
      await saveGame(detail, { patch: activePatch });
      await completeQueueItem(supabase, item.game_id);
      savedMatches += 1;
    } catch (error) {
      failedMatches += 1;
      await failQueueItem(supabase, item.game_id, error);
    }
  }

  return { savedMatches, failedMatches };
}

async function beginQueueItem(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  item: QueueWorkItem
) {
  const { error } = await supabase
    .from("match_ingestion_queue")
    .update({
      status: "processing",
      attempts: item.attempts + 1,
      updated_at: new Date().toISOString(),
      last_error: null
    })
    .eq("game_id", item.game_id);
  if (error) throw error;
}

async function completeQueueItem(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  gameId: number
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("match_ingestion_queue")
    .update({
      status: "completed",
      processed_at: now,
      updated_at: now,
      last_error: null
    })
    .eq("game_id", gameId);
  if (error) throw error;
}

async function failQueueItem(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  gameId: number,
  errorValue: unknown
) {
  const { error } = await supabase
    .from("match_ingestion_queue")
    .update({
      status: "failed",
      updated_at: new Date().toISOString(),
      last_error: (errorValue instanceof Error ? errorValue.message : String(errorValue)).slice(0, 1000)
    })
    .eq("game_id", gameId);
  if (error) throw error;
}

async function countPendingQueueItems(
  supabase: ReturnType<typeof getSupabaseAdmin>
) {
  const { count, error } = await supabase
    .from("match_ingestion_queue")
    .select("*", { count: "exact", head: true })
    .in("status", ["pending", "failed"])
    .lte("attempts", 3);
  if (error) throw error;
  return Number(count ?? 0);
}

async function resolveRankerUser(ranker: Record<string, unknown>) {
  const directUserId = getUserId(ranker);
  if (directUserId) return { userId: directUserId };

  const nickname = typeof ranker.nickname === "string" ? ranker.nickname.trim() : "";
  if (!nickname) return { userId: null };

  const user = await fetchUserByNickname(nickname);
  return { userId: getUserId(user), userNum: getUserNum(user), nickname };
}

export async function saveGame(payload: Record<string, unknown>, options: SaveGameOptions = {}) {
  const supabase = getSupabaseAdmin();
  const players = getRows(payload, "gamePlayers").length
    ? getRows(payload, "gamePlayers")
    : getRows(payload, "userGames").length
      ? getRows(payload, "userGames")
      : getRows(payload, "players");
  if (!players.length) return;
  const first = players[0];
  const gameId = Number(first.gameId ?? payload.gameId ?? payload.game_id);

  const match = {
    game_id: gameId,
    season_id: Number(first.seasonId ?? payload.seasonId ?? 0),
    matching_mode: Number(first.matchingMode ?? 0),
    matching_team_mode: Number(first.matchingTeamMode ?? RANKED_SQUAD_MODE),
    version_season: Number(first.versionSeason ?? options.patch?.version_season ?? 0),
    version_major: Number(first.versionMajor ?? 0),
    version_minor: Number(first.versionMinor ?? 0),
    server_name: String(first.serverName ?? ""),
    started_at: parseStartedAt(first.startDtm ?? payload.startDtm).toISOString()
  };

  const { error: matchError } = await supabase.from("matches").upsert(match, {
    onConflict: "game_id"
  });
  if (matchError) throw matchError;

  const playerRows = players.map((player) => ({
    game_id: gameId,
    user_num: resolvePlayerUserNum(player, options.identity),
    external_user_id: resolvePlayerExternalUserId(player, options.identity),
    nickname: String(player.nickname ?? ""),
    team_number: Number(player.teamNumber ?? 0),
    character_code: Number(player.characterNum ?? player.characterCode ?? player.character_code),
    game_rank: Number(player.gameRank ?? player.game_rank),
    player_kill: Number(player.playerKill ?? 0),
    player_assistant: Number(player.playerAssistant ?? 0),
    mmr_before: Number(player.mmrBefore ?? 0),
    mmr_gain: Number(player.mmrGain ?? 0),
    mmr_after: Number(player.mmrAfter ?? 0),
    best_weapon: Number(player.bestWeapon ?? 0),
    equipment: equipmentWithAnalysisMetrics(player.equipment, player.viewContribution),
    character_level: Number(player.characterLevel ?? 0),
    player_deaths: Number(player.playerDeaths ?? 0),
    monster_kill: Number(player.monsterKill ?? 0),
    best_weapon_level: Number(player.bestWeaponLevel ?? 0),
    play_time: Number(player.playTime ?? player.totalTime ?? 0),
    team_kill: Number(player.teamKill ?? 0),
    damage_to_player: Number(player.damageToPlayer ?? 0),
    damage_from_player: Number(player.damageFromPlayer ?? 0),
    damage_to_monster: Number(player.damageToMonster ?? 0),
    heal_amount: Number(player.healAmount ?? 0),
    team_recover: Number(player.teamRecover ?? 0),
    protect_absorb: Number(player.protectAbsorb ?? 0),
    cc_time_to_player: Number(player.ccTimeToPlayer ?? 0),
    add_surveillance_camera: Number(player.addSurveillanceCamera ?? 0),
    add_telephoto_camera: Number(player.addTelephotoCamera ?? 0),
    remove_surveillance_camera: Number(player.removeSurveillanceCamera ?? 0),
    remove_telephoto_camera: Number(player.removeTelephotoCamera ?? 0),
    use_security_console: Number(player.useSecurityConsole ?? 0),
    use_hyper_loop: Number(player.useHyperLoop ?? 0),
    total_gain_vf_credit: Number(
      player.totalGainVFCredit ?? sumNumericArray(player.totalVFCredit)
    ),
    total_spent_vf_credit: sumNumericArray(player.usedVFCredit),
    route_id_of_start: Number(player.routeIdOfStart ?? 0),
    place_of_start: Number(player.placeOfStart ?? 0),
    analysis_data_version: player.viewContribution !== undefined && player.playTime !== undefined
      ? PLAYER_ANALYSIS_VERSION
      : player.damageToPlayer !== undefined || player.playTime !== undefined
        ? 1
        : 0
  }));

  const identifiedPlayer = options.identity?.userId
    ? playerRows.find((player) => player.external_user_id === options.identity?.userId)
    : null;
  if (identifiedPlayer && options.identity) {
    const { error: cleanupError } = await supabase
      .from("match_players")
      .delete()
      .eq("game_id", gameId)
      .ilike("nickname", options.identity.nickname)
      .neq("user_num", identifiedPlayer.user_num);
    if (cleanupError) throw cleanupError;
  }

  const { error: playersError } = await supabase.from("match_players").upsert(playerRows, {
    onConflict: "game_id,user_num"
  });
  if (playersError) throw playersError;
}

function equipmentWithAnalysisMetrics(equipment: unknown, viewContribution: unknown) {
  const base = equipment && typeof equipment === "object" && !Array.isArray(equipment)
    ? equipment as Record<string, unknown>
    : { items: equipment ?? {} };
  const previousAnalysis = base.__analysis && typeof base.__analysis === "object" && !Array.isArray(base.__analysis)
    ? base.__analysis as Record<string, unknown>
    : {};
  return {
    ...base,
    __analysis: {
      ...previousAnalysis,
      viewContribution: Number(viewContribution ?? 0)
    }
  };
}

export async function buildSnapshots(periodDays = 14) {
  const supabase = getSupabaseAdmin();
  const latestPatch = await getActivePatch(supabase);
  const since =
    latestPatch?.patch_start_at ||
    new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();
  const players = await fetchSnapshotPlayers(supabase, since, latestPatch);
  if (!players.length) {
    return {
      characters: 0,
      comps: 0,
      players: 0,
      scope: latestPatch ? "current_patch" : "rolling_period",
      patchKey: latestPatch?.patch_key ?? null
    };
  }

  const { data: characters, error: charactersError } = await supabase
    .from("characters")
    .select("character_code, weapon_types")
    .eq("is_active", true);
  if (charactersError) throw charactersError;
  const weaponTypesByCharacter = new Map(
    (characters ?? []).map((character) => [
      Number(character.character_code),
      (character.weapon_types ?? []) as string[]
    ])
  );
  const isValidWeaponPlayer = (player: any) =>
    isCharacterWeapon(
      weaponTypesByCharacter.get(Number(player.character_code)),
      Number(player.best_weapon ?? 0)
    );
  const characterRows = RANK_SCOPE_OPTIONS.flatMap(({ value: rankScope }) => {
    const scopedPlayers = players
      .filter((player) => matchesRankScope(Number(player.mmr_after), rankScope))
      .filter(isValidWeaponPlayer);
    return buildCharacterSnapshotRows(
      scopedPlayers,
      rankScope,
      periodDays,
      since,
      new Date().toISOString(),
      latestPatch
    );
  });
  const mythrilMinimum = 7400;
  const { metaPlayers, compPlayers } = splitSnapshotPlayers(players, mythrilMinimum);
  const validMetaPlayers = metaPlayers.filter(isValidWeaponPlayer);
  const validCompPlayers = compPlayers.filter((player) =>
    isValidWeaponPlayer(player)
  );
  const periodEnd = new Date().toISOString();
  const tierFilter = latestPatch ? `current_patch:${latestPatch.patch_key}` : "rolling_period";

  if (characterRows.length) {
    const { error: characterError } = await supabase
      .from("character_stats_snapshot")
      .upsert(characterRows, {
        onConflict: "character_code,weapon_code,period_days,period_start,rank_scope"
      });
    if (characterError) throw characterError;
  }

  const compRows = buildCompRows(
    validCompPlayers,
    periodDays,
    since,
    periodEnd,
    DEFAULT_RANK_SCOPE
  );
  if (compRows.length) {
    const { error: compError } = await supabase.from("team_comp_stats").upsert(compRows, {
      onConflict: "comp_key,period_days,period_start,rank_scope"
    });
    if (compError) throw compError;
  }
  const benchmarkRows = latestPatch
    ? buildMetricBenchmarkRows(players, latestPatch, since, periodEnd)
    : [];
  for (let index = 0; index < benchmarkRows.length; index += 500) {
    const { error: benchmarkError } = await supabase
      .from("player_metric_benchmarks")
      .upsert(benchmarkRows.slice(index, index + 500), {
        onConflict: "patch_key,mmr_bucket,segment_key,period_start"
      });
    if (benchmarkError) throw benchmarkError;
  }
  return {
    characters: characterRows.length,
    comps: compRows.length,
    players: validMetaPlayers.length,
    compPlayers: validCompPlayers.length,
    rejectedWeaponMappings:
      metaPlayers.length - validMetaPlayers.length + compPlayers.length - validCompPlayers.length,
    scope: latestPatch ? "current_patch" : "rolling_period",
    patchKey: latestPatch?.patch_key ?? null,
    rankScopes: RANK_SCOPE_OPTIONS.length,
    tierFilter,
    benchmarks: benchmarkRows.length
  };
}

function buildMetricBenchmarkRows(
  players: any[],
  patch: PatchVersion,
  periodStart: string,
  periodEnd: string
) {
  const eligible = players.filter(
    (player) => Number(player.analysis_data_version ?? 0) >= PLAYER_ANALYSIS_BASE_VERSION && Number(player.mmr_after ?? 0) > 0
  );
  const groups = new Map<string, { bucket: number; segmentKey: string; rows: any[] }>();

  for (const player of eligible) {
    const bucket = mmrBucketStart(Number(player.mmr_after));
    const segments = [
      { key: "all", characterCode: null, weaponCode: null },
      {
        key: `pick:${Number(player.character_code)}:${Number(player.best_weapon ?? 0)}`,
        characterCode: Number(player.character_code),
        weaponCode: Number(player.best_weapon ?? 0)
      }
    ];
    for (const segment of segments) {
      const groupKey = `${bucket}:${segment.key}`;
      const group = groups.get(groupKey) ?? {
        bucket,
        segmentKey: segment.key,
        rows: [] as any[]
      };
      group.rows.push(player);
      groups.set(groupKey, group);
    }
  }

  return [...groups.values()].map((group) => {
    const stats = buildBenchmarkStats(group.rows);
    const pickMatch = /^pick:(\d+):(\d+)$/.exec(group.segmentKey);
    return {
      patch_key: patch.patch_key,
      season_id: ER_SEASON_ID,
      period_start: periodStart,
      period_end: periodEnd,
      mmr_bucket: group.bucket,
      segment_key: group.segmentKey,
      character_code: pickMatch ? Number(pickMatch[1]) : null,
      weapon_code: pickMatch ? Number(pickMatch[2]) : null,
      sample_games: stats.sampleGames,
      sample_players: stats.samplePlayers,
      stats: stats.metrics
    };
  });
}

function buildCharacterSnapshotRows(
  players: any[],
  rankScope: RankScope,
  periodDays: number,
  periodStart: string,
  periodEnd: string,
  patch: PatchVersion | null
) {
  const total = players.length || 1;
  const tierFilter = patch ? `current_patch:${patch.patch_key}` : "rolling_period";
  const byCharacter = new Map<string, any[]>();
  for (const player of players) {
    const key = characterWeaponKey(
      Number(player.character_code),
      Number(player.best_weapon ?? 0)
    );
    byCharacter.set(key, [...(byCharacter.get(key) ?? []), player]);
  }

  return [...byCharacter.entries()].map(([key, rows]) => {
    const { characterCode, weaponCode } = parseCharacterWeaponKey(key);
    const wins = rows.filter((row) => Number(row.game_rank) === 1).length;
    const top3 = rows.filter((row) => isTop3(Number(row.game_rank))).length;
    const averageRank = rows.reduce((sum, row) => sum + Number(row.game_rank), 0) / rows.length;
    return {
      character_code: characterCode,
      weapon_code: weaponCode,
      period_days: periodDays,
      period_start: periodStart,
      period_end: periodEnd,
      season_id: getOptionalNumberEnv("ER_SEASON_ID", 0),
      tier_filter: tierFilter,
      rank_scope: rankScope,
      games: rows.length,
      pick_rate: ratio(rows.length, total),
      win_rate: ratio(wins, rows.length),
      top3_rate: ratio(top3, rows.length),
      average_rank: averageRank,
      confidence_score: confidenceScore(rows.length)
    };
  });
}

async function fetchSnapshotPlayers(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  since: string,
  patch: PatchVersion | null
) {
  const players: any[] = [];

  for (let from = 0; ; from += SNAPSHOT_PAGE_SIZE) {
    const to = from + SNAPSHOT_PAGE_SIZE - 1;
    let query = supabase
      .from("match_players")
      .select("*, matches!inner(started_at, version_season, version_major, version_minor)")
      .gte("matches.started_at", since);

    if (patch) {
      query = query
        .eq("matches.version_season", patch.version_season)
        .eq("matches.version_major", patch.version_major)
        .eq("matches.version_minor", patch.version_minor);
    }

    const { data, error } = await query.range(from, to);
    if (error) throw error;
    players.push(...(data ?? []));
    if (!data || data.length < SNAPSHOT_PAGE_SIZE) break;
  }

  return players;
}

export function splitSnapshotPlayers<T extends {
  game_id: number;
  team_number: number;
  mmr_after: number;
}>(players: T[], minimumMmr = MIN_MYTHRIL_MMR) {
  const metaPlayers = players.filter((player) => Number(player.mmr_after) >= minimumMmr);
  const anchoredTeams = new Set(
    metaPlayers.map((player) => `${player.game_id}:${player.team_number}`)
  );
  const compPlayers = players.filter((player) =>
    anchoredTeams.has(`${player.game_id}:${player.team_number}`)
  );
  return { metaPlayers, compPlayers };
}

function buildCompRows(
  players: any[],
  periodDays: number,
  periodStart: string,
  periodEnd: string,
  rankScope: RankScope
) {
  const byGameTeam = new Map<string, any[]>();
  for (const player of players) {
    const key = `${player.game_id}:${player.team_number}`;
    byGameTeam.set(key, [...(byGameTeam.get(key) ?? []), player]);
  }

  const compMap = new Map<string, any[]>();
  for (const team of byGameTeam.values()) {
    const keys = [
      ...new Set(
        team
          .map((player) =>
            characterWeaponKey(Number(player.character_code), Number(player.best_weapon ?? 0))
          )
          .filter((key) => !key.startsWith("0:"))
      )
    ];
    for (const size of [2, 3]) {
      for (const combo of combinations(keys, size)) {
        const key = buildWeaponCompKey(combo);
        if (key.split("|").length !== size) continue;
        compMap.set(key, [...(compMap.get(key) ?? []), team[0]]);
      }
    }
  }

  return [...compMap.entries()].map(([compKey, rows]) => {
    const characterWeaponKeys = compKey.split("|");
    const codes = [...new Set(characterWeaponKeys.map((key) => parseCharacterWeaponKey(key).characterCode))];
    const wins = rows.filter((row) => Number(row.game_rank) === 1).length;
    const top3 = rows.filter((row) => isTop3(Number(row.game_rank))).length;
    const avgRank = rows.reduce((sum, row) => sum + Number(row.game_rank), 0) / rows.length;
    return {
      comp_key: compKey,
      character_codes: codes,
      character_weapon_keys: characterWeaponKeys,
      comp_size: codes.length,
      period_days: periodDays,
      period_start: periodStart,
      period_end: periodEnd,
      rank_scope: rankScope,
      games: rows.length,
      wins,
      top3,
      win_rate: ratio(wins, rows.length),
      top3_rate: ratio(top3, rows.length),
      average_rank: avgRank,
      confidence_score: confidenceScore(rows.length, codes.length)
    };
  });
}

function buildWeaponCompKey(keys: string[]) {
  return [...new Set(keys)]
    .sort((a, b) => {
      const parsedA = parseCharacterWeaponKey(a);
      const parsedB = parseCharacterWeaponKey(b);
      if (parsedA.characterCode !== parsedB.characterCode) {
        return parsedA.characterCode - parsedB.characterCode;
      }
      return parsedA.weaponCode - parsedB.weaponCode;
    })
    .join("|");
}

function combinations<T>(values: T[], size: number): T[][] {
  if (values.length < size) return [];
  if (size === 1) return values.map((value) => [value]);
  return values.flatMap((value, index) =>
    combinations(values.slice(index + 1), size - 1).map((tail) => [value, ...tail])
  );
}

function isRankedSquad(row: Record<string, unknown>) {
  return Number(row.matchingTeamMode ?? row.matching_team_mode ?? RANKED_SQUAD_MODE) === RANKED_SQUAD_MODE;
}

function isConfiguredSeason(row: Record<string, unknown>) {
  if (!ER_SEASON_ID) return true;
  return Number(row.seasonId ?? row.season_id) === ER_SEASON_ID;
}

function isOlderThanConfiguredSeason(row: Record<string, unknown>) {
  if (!ER_SEASON_ID) return false;
  const seasonId = Number(row.seasonId ?? row.season_id);
  return Number.isFinite(seasonId) && seasonId < ER_SEASON_ID;
}

function isWithinPlayerScope(
  row: Record<string, unknown>,
  scope: PlayerDataScope,
  latestPatch: PatchVersion | null
) {
  if (scope !== "current_patch" || !latestPatch) return true;
  const major = Number(row.versionMajor ?? row.version_major);
  const minor = Number(row.versionMinor ?? row.version_minor);
  return major === latestPatch.version_major && minor === latestPatch.version_minor;
}

function isOlderThanPatchStart(row: Record<string, unknown>, latestPatch: PatchVersion | null) {
  if (!latestPatch?.patch_start_at) return false;
  const startedAt = parseStartedAt(row.startDtm ?? row.start_dtm).getTime();
  const patchStart = new Date(latestPatch.patch_start_at).getTime();
  return Number.isFinite(startedAt) && Number.isFinite(patchStart) && startedAt < patchStart;
}

function getNextCursor(payload: Record<string, unknown>) {
  const next = Number(payload.next ?? payload.nextGameId ?? payload.next_game_id);
  return Number.isFinite(next) && next > 0 ? next : undefined;
}

function parseStartedAt(value: unknown) {
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric);
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function sumNumericArray(value: unknown) {
  if (!Array.isArray(value)) return 0;
  return value.reduce<number>((sum, item) => {
    const numeric = Number(item);
    return Number.isFinite(numeric) ? sum + numeric : sum;
  }, 0);
}

export function resolvePlayerUserNum(
  player: Record<string, unknown>,
  identity?: PlayerIdentity
) {
  const nickname = normalizeNickname(player.nickname);
  if (identity && nickname === normalizeNickname(identity.nickname)) {
    return stablePositiveHash(`nickname:${nickname}`);
  }
  const userNum = getUserNum(player);
  if (userNum) return userNum;
  const externalUserId = getUserId(player);
  if (externalUserId) return stablePositiveHash(`uid:${externalUserId}`);
  return stablePositiveHash(`nickname:${nickname}`);
}

function resolvePlayerExternalUserId(
  player: Record<string, unknown>,
  identity?: PlayerIdentity
) {
  const nickname = normalizeNickname(player.nickname);
  if (identity?.userId && nickname === normalizeNickname(identity.nickname)) {
    return identity.userId;
  }
  return getUserId(player);
}

function normalizeNickname(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("ko-KR");
}

function stablePositiveHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function characterWeaponTypes(item: Record<string, unknown>) {
  return [item.weapon1, item.weapon2, item.weapon3, item.weapon4]
    .filter((value): value is string => typeof value === "string" && value !== "None")
    .filter((value, index, values) => values.indexOf(value) === index);
}

function nullableMetadataString(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized !== "None" ? normalized : null;
}
