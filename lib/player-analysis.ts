import type {
  Confidence,
  PlayerAnalysis,
  PlayerAnalysisDimension,
  PlayerAnalysisDimensionKey,
  PlayerAnalysisMetric,
  PlayerAnalysisMetricId
} from "@/lib/types";
import {
  combatMetricWeights,
  combatScoreProfileLabel,
  isRoleBenchmarkEligible,
  type CombatArchetypeClassification,
  type CombatScoreProfile
} from "@/lib/combat-archetypes";
import { buildPlayerFeedback } from "@/lib/player-feedback";
import { actualMmrGain, readAnalysisNumber } from "@/lib/player-analysis-source";
import { buildPlayerStatistics } from "@/lib/player-statistics";
import { percentileScore, scoreReliability } from "@/lib/player-analysis-score";
import { evaluatePlayerPicks } from "@/lib/player-pick-evaluation";
import { matchDetailSource } from "@/lib/match-details";
export { percentileScore, scoreReliability } from "@/lib/player-analysis-score";

export const PLAYER_ANALYSIS_BASE_VERSION = 1;
export const PLAYER_ANALYSIS_VERSION = 2;
export const PLAYER_ANALYSIS_CACHE_VERSION = 20;
export const PLAYER_ANALYSIS_GAME_LIMIT = 50;
export const PLAYER_ANALYSIS_PEER_GAME_LIMIT = 5;
export const PLAYER_ANALYSIS_CACHE_HOURS = 6;
export const PLAYER_ANALYSIS_MMR_BUCKET = 500;
export const PLAYER_ANALYSIS_MIN_OVERALL_GAMES = 50;
export const PLAYER_ANALYSIS_MIN_OVERALL_PLAYERS = 30;
export const PLAYER_ANALYSIS_MIN_SAME_PICK_GAMES = 30;
export const PLAYER_ANALYSIS_MIN_SAME_PICK_PLAYERS = 15;
export const PLAYER_ANALYSIS_MIN_ROLE_GAMES = 50;
export const PLAYER_ANALYSIS_MIN_ROLE_PLAYERS = 30;
export const PLAYER_ANALYSIS_MIN_PLAYER_PICK_GAMES = 5;
export const PLAYER_ANALYSIS_MIN_PLAYER_GAMES = 10;
export const PLAYER_ANALYSIS_MIN_COMBAT_PEER_GAMES = 3;
export const PLAYER_ANALYSIS_MIN_STABILITY_GAMES = 5;
export const PLAYER_ANALYSIS_MIN_STABILITY_PLAYERS = 20;

export type AnalysisRow = Record<string, unknown>;

type MetricDefinition = {
  id: PlayerAnalysisMetricId;
  label: string;
  dimension: PlayerAnalysisDimensionKey;
  unit: PlayerAnalysisMetric["unit"];
  direction: PlayerAnalysisMetric["direction"];
  weight: number;
  actionable: boolean;
  requiresSamePick?: boolean;
  minimumPeerGames?: number;
  allowPercentDelta?: boolean;
  referenceStatistic?: "mean" | "median";
  ignoreIfBaselineZero?: boolean;
  supplementaryOnly?: boolean;
};

type NormalizedGame = {
  patchKey: string | null;
  startedAt: string;
  userNum: number;
  characterCode: number;
  weaponCode: number;
  gameRank: number;
  top3: number;
  win: number;
  playTimeMinutes: number;
  viewContributionAvailable: boolean;
  availableMetrics: Set<PlayerAnalysisMetricId>;
  metrics: Record<PlayerAnalysisMetricId, number>;
};

export type BenchmarkMetricStats = {
  mean: number;
  stddev: number;
  p25: number;
  p50: number;
  p75: number;
  top3Mean: number;
  sampleGames: number;
  samplePlayers: number;
  values: number[];
};

export type BenchmarkStats = {
  sampleGames: number;
  samplePlayers: number;
  metrics: Record<PlayerAnalysisMetricId, BenchmarkMetricStats>;
};

const METRICS: MetricDefinition[] = [
  { id: "damage_per_minute", label: "분당 플레이어 피해", dimension: "combat", unit: "per_minute", direction: "higher", weight: 0.45, actionable: true, minimumPeerGames: PLAYER_ANALYSIS_MIN_COMBAT_PEER_GAMES },
  { id: "kill_participation", label: "킬 관여율", dimension: "combat", unit: "percent", direction: "higher", weight: 0.35, actionable: true, minimumPeerGames: PLAYER_ANALYSIS_MIN_COMBAT_PEER_GAMES },
  { id: "cc_per_minute", label: "분당 군중제어", dimension: "combat", unit: "per_minute", direction: "higher", weight: 0.2, actionable: true, minimumPeerGames: PLAYER_ANALYSIS_MIN_COMBAT_PEER_GAMES },
  { id: "weapon_level_per_minute", label: "종료 무기 숙련도/활동 분 (참고)", dimension: "growth", unit: "per_minute", direction: "higher", weight: 0.4, actionable: false, supplementaryOnly: true },
  { id: "credits_per_minute", label: "분당 크레딧 획득", dimension: "growth", unit: "per_minute", direction: "higher", weight: 0.6, actionable: true },
  { id: "hunts_per_minute", label: "분당 야생동물 처치", dimension: "farming", unit: "per_minute", direction: "higher", weight: 0.5, actionable: true },
  { id: "monster_damage_per_minute", label: "분당 야생동물 피해", dimension: "farming", unit: "per_minute", direction: "higher", weight: 0.5, actionable: true },
  { id: "support_per_minute", label: "분당 회복·보호", dimension: "team", unit: "per_minute", direction: "higher", weight: 0.2, actionable: false, requiresSamePick: true, referenceStatistic: "mean", ignoreIfBaselineZero: true, supplementaryOnly: true },
  { id: "view_contribution_per_minute", label: "분당 시야 기여 점수", dimension: "vision", unit: "per_minute", direction: "higher", weight: 1, actionable: true },
  { id: "top3_rate", label: "TOP3 비율", dimension: "stability", unit: "percent", direction: "higher", weight: 0.3, actionable: false, referenceStatistic: "mean" },
  { id: "win_rate", label: "승률", dimension: "stability", unit: "percent", direction: "higher", weight: 0.15, actionable: false, referenceStatistic: "mean" },
  { id: "average_rank", label: "평균 순위", dimension: "stability", unit: "rank", direction: "lower", weight: 0.25, actionable: false, allowPercentDelta: false, referenceStatistic: "mean" },
  { id: "mmr_gain", label: "평균 실제 RP 증감", dimension: "stability", unit: "mmr", direction: "higher", weight: 0.2, actionable: false, allowPercentDelta: false, referenceStatistic: "mean" },
  { id: "rank_stability", label: "순위 변동성", dimension: "stability", unit: "rank", direction: "lower", weight: 0.1, actionable: false, minimumPeerGames: PLAYER_ANALYSIS_MIN_STABILITY_GAMES, allowPercentDelta: false }
];

const DIMENSION_LABELS: Record<PlayerAnalysisDimensionKey, string> = {
  combat: "전투",
  growth: "성장",
  farming: "파밍",
  team: "팀 기여",
  vision: "시야",
  stability: "안정성"
};

const EMPTY_METRIC_STATS: BenchmarkMetricStats = {
  mean: 0,
  stddev: 0,
  p25: 0,
  p50: 0,
  p75: 0,
  top3Mean: 0,
  sampleGames: 0,
  samplePlayers: 0,
  values: []
};

export function perMinute(value: number, playTimeSeconds: number) {
  if (!Number.isFinite(value) || !Number.isFinite(playTimeSeconds) || playTimeSeconds <= 0) return 0;
  return value / (playTimeSeconds / 60);
}

export function confidenceFromAnalysisGames(games: number): Confidence {
  if (games >= 20) return "high";
  if (games >= 10) return "medium";
  return "low";
}

export function mmrBucketStart(mmr: number, bucketSize = PLAYER_ANALYSIS_MMR_BUCKET) {
  if (!Number.isFinite(mmr) || mmr <= 0) return 0;
  return Math.floor(mmr / bucketSize) * bucketSize;
}

export function normalizeAnalysisRow(row: AnalysisRow): NormalizedGame {
  const playTime = numeric(row, "play_time", "playTime");
  const kills = numeric(row, "player_kill", "playerKill");
  const assists = numeric(row, "player_assistant", "playerAssistant");
  const teamKills = numeric(row, "team_kill", "teamKill");
  const gameRank = numeric(row, "game_rank", "gameRank");
  const sourceFields: Partial<Record<PlayerAnalysisMetricId, string[]>> = {
    damage_per_minute: ["damageToPlayer", "damage_to_player"], cc_per_minute: ["ccTimeToPlayer", "cc_time_to_player"],
    hunts_per_minute: ["monsterKill", "monster_kill"], monster_damage_per_minute: ["damageToMonster", "damage_to_monster"],
    weapon_level_per_minute: ["bestWeaponLevel", "best_weapon_level"], credits_per_minute: ["totalGainVFCredit", "total_gain_vf_credit"]
  };
  const availableMetrics = new Set<PlayerAnalysisMetricId>(["top3_rate", "win_rate", "average_rank", "rank_stability"]);
  for (const [id, keys] of Object.entries(sourceFields)) {
    if (playTime > 0 && readAnalysisNumber(row, ...keys) !== null) availableMetrics.add(id as PlayerAnalysisMetricId);
  }
  if (teamKills > 0 && readAnalysisNumber(row, "playerKill", "player_kill") !== null &&
      readAnalysisNumber(row, "playerAssistant", "player_assistant") !== null) availableMetrics.add("kill_participation");
  if (playTime > 0 && readAnalysisNumber(row, "teamRecover", "team_recover") !== null &&
      readAnalysisNumber(row, "protectAbsorb", "protect_absorb") !== null) availableMetrics.add("support_per_minute");
  if (playTime > 0 && hasViewContribution(row)) availableMetrics.add("view_contribution_per_minute");
  if (actualMmrGain(row) !== null) availableMetrics.add("mmr_gain");
  return {
    patchKey: analysisRowPatchKey(row),
    startedAt: startedAt(row),
    userNum: numeric(row, "user_num", "userNum"),
    characterCode: numeric(row, "character_code", "characterNum", "characterCode"),
    weaponCode: numeric(row, "best_weapon", "bestWeapon"),
    gameRank,
    top3: gameRank > 0 && gameRank <= 3 ? 1 : 0,
    win: gameRank === 1 ? 1 : 0,
    playTimeMinutes: playTime > 0 ? playTime / 60 : 0,
    viewContributionAvailable: hasViewContribution(row),
    availableMetrics,
    metrics: {
      damage_per_minute: perMinute(numeric(row, "damage_to_player", "damageToPlayer"), playTime),
      kill_participation: teamKills > 0 ? clamp((kills + assists) / teamKills, 0, 1) : 0,
      cc_per_minute: perMinute(numeric(row, "cc_time_to_player", "ccTimeToPlayer"), playTime),
      hunts_per_minute: perMinute(numeric(row, "monster_kill", "monsterKill"), playTime),
      monster_damage_per_minute: perMinute(numeric(row, "damage_to_monster", "damageToMonster"), playTime),
      weapon_level_per_minute: perMinute(numeric(row, "best_weapon_level", "bestWeaponLevel"), playTime),
      credits_per_minute: perMinute(numeric(row, "total_gain_vf_credit", "totalGainVFCredit"), playTime),
      support_per_minute: perMinute(
        numeric(row, "team_recover", "teamRecover") + numeric(row, "protect_absorb", "protectAbsorb"),
        playTime
      ),
      view_contribution_per_minute: perMinute(
        viewContribution(row),
        playTime
      ),
      top3_rate: gameRank > 0 && gameRank <= 3 ? 1 : 0,
      win_rate: gameRank === 1 ? 1 : 0,
      average_rank: gameRank,
      mmr_gain: actualMmrGain(row) ?? 0,
      rank_stability: 0
    }
  };
}

export function buildBenchmarkStats(rows: AnalysisRow[]): BenchmarkStats {
  const games = rows.map(normalizeAnalysisRow).filter((game) => game.gameRank > 0);
  const byUser = new Map<number, NormalizedGame[]>();
  for (const game of games) {
    const key = game.userNum || -(byUser.size + 1);
    byUser.set(key, [...(byUser.get(key) ?? []), game]);
  }

  const metrics = Object.fromEntries(
    METRICS.map((definition) => {
      const eligibleGroups = [...byUser.values()].filter(
        (group) => group.filter((game) => metricAvailable(game, definition.id)).length >=
          (definition.minimumPeerGames ?? 1)
      ).map(
        (group) => group.filter((game) => metricAvailable(game, definition.id))
      );
      const values = eligibleGroups.map((group) => aggregateNormalizedGames(group)[definition.id]);
      const eligibleGames = eligibleGroups.flat();
      const top3Values = eligibleGroups.map((group) => group.filter((game) => game.top3 === 1))
        .filter((group) => group.length > 0).map((group) => aggregateNormalizedGames(group)[definition.id]);
      const sorted = [...values].sort((a, b) => a - b);
      return [definition.id, {
        mean: mean(values),
        stddev: standardDeviation(values),
        p25: quantile(sorted, 0.25),
        p50: quantile(sorted, 0.5),
        p75: quantile(sorted, 0.75),
        top3Mean: top3Values.length ? mean(top3Values) : mean(values),
        sampleGames: eligibleGames.length,
        samplePlayers: eligibleGroups.length,
        values: sorted
      } satisfies BenchmarkMetricStats];
    })
  ) as Record<PlayerAnalysisMetricId, BenchmarkMetricStats>;

  return {
    sampleGames: games.length,
    samplePlayers: byUser.size,
    metrics
  };
}

export function buildPlayerAnalysis(input: {
  nickname: string;
  userNum: number;
  playerRows: AnalysisRow[];
  overallRows: AnalysisRow[];
  samePickRows: AnalysisRow[];
  roleRows?: AnalysisRow[];
  combatClassification?: CombatArchetypeClassification | null;
  characterNames?: Map<number, string>;
  rank?: { mmr?: number | null; rank?: number | null; serverRank?: number | null; rankPercent?: number | null };
  seasonId: number;
  patchKey: string | null;
  /** Legacy input retained for callers; previous-patch games are always excluded. */
  supplementalGames: number;
  excludedGames?: number;
  expandedBenchmark: boolean;
  expandedRoleBenchmark?: boolean;
  generatedAt?: string;
}): PlayerAnalysis {
  const currentPatchPlayerRows = rowsForPatch(input.playerRows, input.patchKey);
  const excludedGames = (input.excludedGames ?? 0) + input.playerRows.length - currentPatchPlayerRows.length;
  const selectedRows = currentPatchPlayerRows
    .sort((a, b) => (Date.parse(startedAt(b)) || 0) - (Date.parse(startedAt(a)) || 0))
    .filter((row) => numeric(row, "game_rank", "gameRank") > 0)
    .slice(0, PLAYER_ANALYSIS_GAME_LIMIT);
  const normalizedPlayerGames = selectedRows
    .map(normalizeAnalysisRow)
    .filter((game) => game.gameRank > 0)
    .slice(0, PLAYER_ANALYSIS_GAME_LIMIT);
  const playerAggregate = aggregateNormalizedGames(normalizedPlayerGames);
  const mainPick = mostPlayedNormalizedPick(normalizedPlayerGames);
  const mainPickPlayerGames = normalizedPlayerGames.filter(
    (game) => game.characterCode === mainPick.characterCode && game.weaponCode === mainPick.weaponCode
  );
  const mainPickPlayerAggregate = aggregateNormalizedGames(mainPickPlayerGames);
  const overall = buildBenchmarkStats(rowsForPatch(input.overallRows, input.patchKey));
  const samePick = buildBenchmarkStats(rowsForPatch(input.samePickRows, input.patchKey));
  const role = buildBenchmarkStats(rowsForPatch(input.roleRows ?? [], input.patchKey));
  const combatClassification = input.combatClassification ?? null;
  const roleBenchmarkEligible = Boolean(
    combatClassification && isRoleBenchmarkEligible(combatClassification)
  );
  const playerConfidence = confidenceFromAnalysisGames(normalizedPlayerGames.length);
  const samePickUsable = samePick.sampleGames >= PLAYER_ANALYSIS_MIN_SAME_PICK_GAMES &&
    samePick.samplePlayers >= PLAYER_ANALYSIS_MIN_SAME_PICK_PLAYERS;
  const overallUsable = overall.sampleGames >= PLAYER_ANALYSIS_MIN_OVERALL_GAMES &&
    overall.samplePlayers >= PLAYER_ANALYSIS_MIN_OVERALL_PLAYERS;
  const roleUsable = roleBenchmarkEligible &&
    role.sampleGames >= PLAYER_ANALYSIS_MIN_ROLE_GAMES &&
    role.samplePlayers >= PLAYER_ANALYSIS_MIN_ROLE_PLAYERS;
  const playerSamePickUsable = mainPickPlayerGames.length >= PLAYER_ANALYSIS_MIN_PLAYER_PICK_GAMES;

  const metrics = METRICS.map((definition) => {
    const overallCandidate = overall.metrics[definition.id];
    const samePickCandidate = samePick.metrics[definition.id];
    const roleCandidate = role.metrics[definition.id];
    const overallStats = overallUsable && metricBenchmarkUsable(overallCandidate, "overall", definition)
      ? overallCandidate
      : null;
    const samePickStats = samePickUsable && metricBenchmarkUsable(samePickCandidate, "same_pick", definition)
      ? samePickCandidate
      : null;
    const roleStats = definition.dimension === "combat" && roleUsable &&
      metricBenchmarkUsable(roleCandidate, "role", definition)
      ? roleCandidate
      : null;
    const canCompareSamePick = playerSamePickUsable && Boolean(samePickStats);
    const canCompareRole = playerSamePickUsable && Boolean(roleStats);
    const referenceType = canCompareSamePick
      ? "same_pick" as const
      : definition.requiresSamePick
        ? null
        : definition.dimension === "combat" && canCompareRole
          ? "role" as const
          : definition.dimension === "combat" && combatClassification
            ? null
            : overallStats
              ? "mmr" as const
              : null;
    const reference = referenceType === "same_pick"
      ? samePickStats
      : referenceType === "role"
        ? roleStats
        : referenceType === "mmr"
          ? overallStats
          : null;
    const usesMainPick = referenceType === "same_pick" || referenceType === "role";
    const relevantPlayerGames = usesMainPick ? mainPickPlayerGames : normalizedPlayerGames;
    const availablePlayerGames = relevantPlayerGames.filter((game) => metricAvailable(game, definition.id));
    const playerGames = availablePlayerGames.length;
    const value = usesMainPick
      ? mainPickPlayerAggregate[definition.id]
      : playerAggregate[definition.id];
    const playerHistoryEnough = playerGames >= PLAYER_ANALYSIS_MIN_PLAYER_GAMES;
    const comparisonStatus = metricComparisonStatus({
      definition,
      reference,
      playerHistoryEnough,
      playerSamePickUsable,
      overallUsable
    });
    const available = comparisonStatus === "available" && Boolean(reference);
    const referenceValue = available
      ? Number(definition.referenceStatistic === "mean" ? reference?.mean : reference?.p50)
      : null;
    const rawPercentile = available && reference
      ? percentileScore(value, reference.values, definition.direction)
      : null;
    const reliability = available && reference
      ? scoreReliability(playerGames, reference.samplePlayers, referenceType === "same_pick")
      : 0;
    const relativeScore = rawPercentile === null
      ? null
      : round(50 + (rawPercentile - 50) * reliability, 1);
    const deltaPercent = referenceValue === null
      ? null
      : signedDeltaPercent(value, referenceValue, definition.direction, definition.allowPercentDelta !== false);
    return {
      id: definition.id,
      label: definition.label,
      value,
      unit: definition.unit,
      direction: definition.direction,
      cohort_mean: overallStats?.mean ?? null,
      same_pick_mean: samePickStats?.mean ?? null,
      role_mean: roleStats?.mean ?? null,
      reference_mean: reference?.mean ?? null,
      reference_value: referenceValue,
      reference_type: referenceType,
      delta_percent: deltaPercent,
      delta_absolute: referenceValue === null
        ? null
        : round((value - referenceValue) * (definition.direction === "higher" ? 1 : -1), 2),
      relative_score: relativeScore,
      raw_percentile: rawPercentile,
      score_reliability: round(reliability, 3),
      comparison_status: comparisonStatus,
      comparison_note: comparisonNote(comparisonStatus),
      player_games: playerGames,
      sample_games: reference?.sampleGames ?? 0,
      sample_players: reference?.samplePlayers ?? 0,
      confidence: available && reference
        ? confidenceFromEvidence(playerGames, reference.samplePlayers, referenceType === "same_pick")
        : "low",
      player_scope: {
        kind: usesMainPick ? "main_pick" : "all_picks",
        character_code: usesMainPick ? mainPick.characterCode : null,
        weapon_code: usesMainPick ? mainPick.weaponCode : null,
        patch_key: input.patchKey,
        current_patch_games: availablePlayerGames.filter((game) => isCurrentPatchGame(game, input)).length,
        supplemental_games: availablePlayerGames.filter((game) =>
          game.patchKey !== null && input.patchKey !== null && game.patchKey !== input.patchKey
        ).length,
        unknown_patch_games: availablePlayerGames.filter((game) =>
          !isCurrentPatchGame(game, input) && (game.patchKey === null || input.patchKey === null)
        ).length
      },
      recent_trend: buildRecentTrend(availablePlayerGames, definition.id, input)
    } satisfies PlayerAnalysisMetric;
  });

  const dimensions = buildDimensions(metrics, combatClassification?.scoreProfile ?? null);
  const scoredMetrics = metrics.filter((metric) =>
    metric.relative_score !== null && !metricDefinition(metric.id).supplementaryOnly
  );
  const analysisConfidence = scoredMetrics.length
    ? lowestConfidence([playerConfidence, ...scoredMetrics.map((metric) => metric.confidence)])
    : "low";
  const pickProfile = buildPickProfile(normalizedPlayerGames, input.characterNames ?? new Map());
  const picks = { ...pickProfile, picks: evaluatePlayerPicks(pickProfile.picks, selectedRows, overall) };
  const feedback = buildPlayerFeedback(metrics.filter((metric) => !metricDefinition(metric.id).supplementaryOnly),
    selectImprovementCandidates(metrics, { overall, samePick, role }));
  const latestGameAt = selectedRows.length ? startedAt(selectedRows[0]) || null : null;
  const mmr = input.rank?.mmr ?? latestMmr(currentPatchPlayerRows);
  const bucketStart = mmr ? mmrBucketStart(mmr) : null;
  const caveats = buildCaveats({
    games: normalizedPlayerGames.length,
    excludedGames,
    overallUsable,
    samePickUsable,
    roleUsable,
    combatCompared: metrics.some((metric) => metricDefinition(metric.id).dimension === "combat" && metric.comparison_status === "available"),
    combatRoleCompared: metrics.some((metric) => metricDefinition(metric.id).dimension === "combat" &&
      metric.comparison_status === "available" && metric.reference_type === "role"),
    roleBenchmarkEligible,
    hasCombatClassification: Boolean(combatClassification),
    expanded: input.expandedBenchmark,
    roleExpanded: Boolean(input.expandedRoleBenchmark),
    mainPickGames: mainPickPlayerGames.length,
    excludedMetrics: metrics.filter((metric) => metric.comparison_status !== "available")
  });

  return {
    player: {
      user_num: input.userNum,
      nickname: input.nickname,
      mmr: finiteOrNull(mmr),
      rank: finiteOrNull(input.rank?.rank),
      server_rank: finiteOrNull(input.rank?.serverRank),
      rank_percent: finiteOrNull(input.rank?.rankPercent)
    },
    scope: {
      season_id: input.seasonId,
      analysis_version: PLAYER_ANALYSIS_CACHE_VERSION,
      patch_key: input.patchKey,
      requested_games: PLAYER_ANALYSIS_GAME_LIMIT,
      analyzed_games: normalizedPlayerGames.length,
      supplemental_games: 0,
      excluded_games: excludedGames,
      latest_game_at: latestGameAt,
      confidence: analysisConfidence
    },
    pick_profile: picks,
    combat_context: combatClassification ? {
      score_profile: combatClassification.scoreProfile,
      label: combatScoreProfileLabel(combatClassification.scoreProfile),
      range_profile: combatClassification.rangeProfile,
      primary_function: combatClassification.primaryFunction,
      secondary_function: combatClassification.secondaryFunction,
      classification_confidence: combatClassification.confidence,
      review_status: combatClassification.reviewStatus,
      classification_version: combatClassification.classificationVersion,
      benchmark_eligible: roleBenchmarkEligible,
      metric_weights: combatMetricWeights(combatClassification.scoreProfile),
      reference_type: metrics.find((metric) =>
        metricDefinition(metric.id).dimension === "combat" && metric.reference_type
      )?.reference_type ?? null
    } : null,
    dimensions,
    statistics: buildPlayerStatistics(selectedRows),
    recent_matches: selectedRows.map((row) => ({
      game_id: numeric(row, "gameId", "game_id"), started_at: startedAt(row),
      character_code: numeric(row, "characterNum", "character_code"), weapon_code: numeric(row, "bestWeapon", "best_weapon"),
      rank: numeric(row, "gameRank", "game_rank"), damage: readAnalysisNumber(row, "damageToPlayer", "damage_to_player"),
      deaths: readAnalysisNumber(row, "playerDeaths", "player_deaths"), active_seconds: readAnalysisNumber(row, "playTime", "play_time"),
      mmr_gain: actualMmrGain(row), details: matchDetailSource(row)
    })),
    strengths: feedback.strengths,
    improvement_priorities: feedback.improvements,
    feedback: feedback.state,
    ai_summary: fallbackAnalysisSummary(picks.concentration, dimensions, analysisConfidence),
    benchmark_coverage: {
      mmr_bucket_start: bucketStart,
      mmr_bucket_end: bucketStart === null ? null : bucketStart + PLAYER_ANALYSIS_MMR_BUCKET,
      expanded: input.expandedBenchmark,
      overall_games: overall.sampleGames,
      overall_players: overall.samplePlayers,
      same_pick_games: samePick.sampleGames,
      same_pick_players: samePick.samplePlayers,
      role_games: role.sampleGames,
      role_players: role.samplePlayers,
      minimum_overall_games: PLAYER_ANALYSIS_MIN_OVERALL_GAMES,
      minimum_overall_players: PLAYER_ANALYSIS_MIN_OVERALL_PLAYERS,
      minimum_same_pick_games: PLAYER_ANALYSIS_MIN_SAME_PICK_GAMES,
      minimum_same_pick_players: PLAYER_ANALYSIS_MIN_SAME_PICK_PLAYERS,
      minimum_role_games: PLAYER_ANALYSIS_MIN_ROLE_GAMES,
      minimum_role_players: PLAYER_ANALYSIS_MIN_ROLE_PLAYERS,
      minimum_combat_peer_games: PLAYER_ANALYSIS_MIN_COMBAT_PEER_GAMES
    },
    caveats,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    cache_status: "miss"
  };
}

export function isKnownAnalysisMetricId(value: string): value is PlayerAnalysisMetricId {
  return METRICS.some((metric) => metric.id === value);
}

function aggregateNormalizedGames(games: NormalizedGame[]) {
  const values = Object.fromEntries(
    METRICS.map(({ id, unit }) => [
      id,
      unit === "per_minute"
        ? weightedMean(
          games
            .filter((game) => metricAvailable(game, id))
            .map((game) => ({ value: game.metrics[id], weight: game.playTimeMinutes }))
        )
        : mean(games.filter((game) => metricAvailable(game, id)).map((game) => game.metrics[id]))
    ])
  ) as Record<PlayerAnalysisMetricId, number>;
  values.rank_stability = standardDeviation(games.map((game) => game.gameRank));
  return values;
}

function isCurrentPatchGame(
  game: NormalizedGame,
  scope: { patchKey: string | null }
) {
  return scope.patchKey !== null && game.patchKey === scope.patchKey;
}

function rowsForPatch(rows: AnalysisRow[], patchKey: string | null) {
  return patchKey ? rows.filter((row) => analysisRowPatchKey(row) === patchKey) : [];
}

function buildRecentTrend(
  games: NormalizedGame[],
  id: PlayerAnalysisMetricId,
  scope: { patchKey: string | null }
): PlayerAnalysisMetric["recent_trend"] {
  if (id === "rank_stability") return null;
  const current = games.filter((game) => isCurrentPatchGame(game, scope))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 20);
  // A change of pick can change the raw metric even when play has not improved.
  if (current.length < 20 || new Set(current.map((game) => `${game.characterCode}:${game.weaponCode}`)).size !== 1) {
    return null;
  }
  const recent = aggregateNormalizedGames(current.slice(0, 10))[id];
  const previous = aggregateNormalizedGames(current.slice(10))[id];
  return {
    recent_games: 10,
    previous_games: 10,
    recent_value: recent,
    previous_value: previous,
    delta_absolute: recent - previous
  };
}

function mostPlayedNormalizedPick(games: NormalizedGame[]) {
  const counts = new Map<string, number>();
  for (const game of games) {
    const key = `${game.characterCode}:${game.weaponCode}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [key = "0:0"] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const [characterCode = 0, weaponCode = 0] = key.split(":").map(Number);
  return { characterCode, weaponCode };
}

function buildDimensions(
  metrics: PlayerAnalysisMetric[],
  combatProfile: CombatScoreProfile | null
): PlayerAnalysisDimension[] {
  return (Object.keys(DIMENSION_LABELS) as PlayerAnalysisDimensionKey[]).map((key) => {
    const dimensionMetrics = metrics.filter((metric) => metricDefinition(metric.id).dimension === key);
    const scored = dimensionMetrics.filter((metric) =>
      metric.relative_score !== null && !metricDefinition(metric.id).supplementaryOnly
    );
    const totalWeight = scored.reduce(
      (sum, metric) => sum + analysisMetricWeight(metric.id, combatProfile),
      0
    );
    const score = totalWeight
      ? scored.reduce(
        (sum, metric) => sum + Number(metric.relative_score) * analysisMetricWeight(metric.id, combatProfile),
        0
      ) / totalWeight
      : null;
    return {
      key,
      label: DIMENSION_LABELS[key],
      score: score === null ? null : round(score, 1),
      confidence: scored.length ? lowestConfidence(scored.map((metric) => metric.confidence)) : "low",
      available_metrics: scored.length,
      total_metrics: dimensionMetrics.length,
      metrics: dimensionMetrics.map(roundMetric)
    };
  });
}

function analysisMetricWeight(id: PlayerAnalysisMetricId, combatProfile: CombatScoreProfile | null) {
  const definition = metricDefinition(id);
  if (definition.dimension !== "combat") return definition.weight;
  const weights = combatMetricWeights(combatProfile);
  return id in weights ? weights[id as keyof typeof weights] : definition.weight;
}

function buildPickProfile(games: NormalizedGame[], names: Map<number, string>) {
  const grouped = new Map<string, NormalizedGame[]>();
  for (const game of games) {
    const key = `${game.characterCode}:${game.weaponCode}`;
    grouped.set(key, [...(grouped.get(key) ?? []), game]);
  }
  const picks = [...grouped.values()]
    .map((rows) => ({
      character_code: rows[0]?.characterCode ?? 0,
      character_name: names.get(rows[0]?.characterCode ?? 0) ?? `실험체 ${rows[0]?.characterCode ?? 0}`,
      weapon_code: rows[0]?.weaponCode ?? 0,
      weapon_name: "",
      games: rows.length,
      pick_rate: games.length ? rows.length / games.length : 0,
      win_rate: mean(rows.map((row) => row.win)),
      top3_rate: mean(rows.map((row) => row.top3)),
      average_rank: mean(rows.map((row) => row.gameRank))
    }))
    .sort((a, b) => b.games - a.games);
  return {
    concentration: picks[0]?.pick_rate ?? 0,
    unique_picks: picks.length,
    picks
  };
}

function selectImprovementCandidates(
  metrics: PlayerAnalysisMetric[],
  benchmarks: { overall: BenchmarkStats; samePick: BenchmarkStats; role: BenchmarkStats }
): PlayerAnalysisMetric[] {
  return metrics
    .filter((metric) => {
      if (metricDefinition(metric.id).supplementaryOnly ||
          !metricDefinition(metric.id).actionable ||
          metric.relative_score === null ||
          metric.relative_score >= 35 ||
          metric.confidence === "low") return false;
      const benchmark = metric.reference_type === "same_pick"
        ? benchmarks.samePick
        : metric.reference_type === "role"
          ? benchmarks.role
          : benchmarks.overall;
      const stats = benchmark.metrics[metric.id] ?? EMPTY_METRIC_STATS;
      const orientation = metric.direction === "higher" ? 1 : -1;
      return (stats.top3Mean - stats.mean) * orientation > Math.max(stats.stddev * 0.1, 0.0001);
    })
    .sort((a, b) => Number(a.relative_score) - Number(b.relative_score));
}

function buildCaveats(input: {
  games: number;
  excludedGames: number;
  overallUsable: boolean;
  samePickUsable: boolean;
  roleUsable: boolean;
  combatCompared: boolean;
  combatRoleCompared: boolean;
  roleBenchmarkEligible: boolean;
  hasCombatClassification: boolean;
  expanded: boolean;
  roleExpanded: boolean;
  mainPickGames: number;
  excludedMetrics: PlayerAnalysisMetric[];
}) {
  const caveats = [
    "개인 지표와 비교군은 현재 패치가 확인된 경기만 사용하며, 이전 패치와 패치를 확인할 수 없는 기록은 분석에서 제외합니다.",
    "운영 스타일은 공식 API의 경기 종료 지표를 바탕으로 한 추정이며 실제 이동·교전 타임라인을 재구성하지 않습니다.",
    `전투 백분위는 같은 비교군에서 최소 ${PLAYER_ANALYSIS_MIN_COMBAT_PEER_GAMES}경기를 보유한 플레이어만 사용합니다.`,
    "상대 점수는 비슷한 MMR대의 백분위 기반 참고 지표이며, 이후 MMR 상승을 예측하는 모델 정확도로 검증된 값은 아닙니다."
  ];
  if (input.games < PLAYER_ANALYSIS_MIN_PLAYER_GAMES) caveats.push(`현재 패치 개인 기록이 ${PLAYER_ANALYSIS_MIN_PLAYER_GAMES}판 미만이라 플레이스타일 비교 점수와 점검 제안을 보류합니다.`);
  if (input.excludedGames > 0) caveats.push(`이전 패치 또는 패치 미확인 개인 기록 ${input.excludedGames}판을 분석에서 제외했습니다.`);
  if (!input.samePickUsable && input.combatRoleCompared) caveats.push(
    `같은 실험체·무기 표본이 기준에 미달해 전투는 같은 역할군, 나머지 영역은 비슷한 MMR대와 비교했습니다.`
  );
  if (!input.samePickUsable && input.hasCombatClassification && !input.combatCompared) caveats.push(
    input.roleBenchmarkEligible
      ? input.roleUsable
        ? "같은 역할군 전체 표본은 확보했지만, 전투 지표별 유효 표본이 부족해 전투 점수를 보류했습니다."
        : `같은 역할군 표본이 ${PLAYER_ANALYSIS_MIN_ROLE_GAMES}경기·${PLAYER_ANALYSIS_MIN_ROLE_PLAYERS}명 기준에 미달해 전투 점수를 보류했습니다.`
      : "주력 픽 역할 분류가 검토 대상이라 같은 픽 표본이 부족할 때 전투 점수를 보류합니다."
  );
  if (!input.samePickUsable && !input.hasCombatClassification && input.overallUsable) caveats.push(
    "역할군 분류 데이터가 없어 전투를 포함한 지표를 비슷한 MMR대 전체와 비교했습니다."
  );
  if (input.mainPickGames < PLAYER_ANALYSIS_MIN_PLAYER_PICK_GAMES) caveats.push(
    `주력 픽 개인 기록이 ${PLAYER_ANALYSIS_MIN_PLAYER_PICK_GAMES}판 미만이라 같은 픽 비교를 적용하지 않았습니다.`
  );
  if (!input.overallUsable) caveats.push(
    `비슷한 MMR대 표본이 ${PLAYER_ANALYSIS_MIN_OVERALL_GAMES}경기·${PLAYER_ANALYSIS_MIN_OVERALL_PLAYERS}명 기준에 미달해 평균 비교를 표시하지 않았습니다.`
  );
  if (input.excludedMetrics.some((metric) => metric.id === "rank_stability")) caveats.push(
    `순위 변동성은 플레이어별 최소 ${PLAYER_ANALYSIS_MIN_STABILITY_GAMES}경기가 확보된 비교 플레이어가 충분할 때만 점수에 포함합니다.`
  );
  if (input.expanded) caveats.push("같은 픽 표본을 확보하기 위해 인접 MMR 구간까지 비교 범위를 넓혔습니다.");
  if (input.roleExpanded) caveats.push("같은 역할군 표본을 확보하기 위해 인접 MMR 구간까지 비교 범위를 넓혔습니다.");
  return caveats;
}

function fallbackAnalysisSummary(
  concentration: number,
  dimensions: PlayerAnalysisDimension[],
  confidence: Confidence
) {
  const scored = dimensions.filter((dimension) => dimension.score !== null).sort((a, b) => Number(b.score) - Number(a.score));
  const pickText = concentration >= 0.65 ? "주력 픽 집중도가 높은" : concentration >= 0.4 ? "주력 픽이 뚜렷한" : "여러 픽을 폭넓게 사용하는";
  const dimensionText = scored[0] ? `${scored[0].label} 지표가 상대적으로 두드러지는` : "비교 표본이 아직 부족한";
  const confidenceText = confidence === "low" ? " 표본이 적어 방향성 위주로 확인해 주세요." : " 수치가 낮은 영역부터 한 가지씩 점검하는 것이 좋습니다.";
  return `${pickText} 플레이어이며, ${dimensionText} 경향으로 관측됩니다.${confidenceText}`;
}

function metricBenchmarkUsable(
  stats: BenchmarkMetricStats,
  type: "overall" | "same_pick" | "role",
  definition: MetricDefinition
) {
  const minimumGames = type === "same_pick"
    ? PLAYER_ANALYSIS_MIN_SAME_PICK_GAMES
    : type === "role"
      ? PLAYER_ANALYSIS_MIN_ROLE_GAMES
      : PLAYER_ANALYSIS_MIN_OVERALL_GAMES;
  const baseMinimumPlayers = type === "same_pick"
    ? PLAYER_ANALYSIS_MIN_SAME_PICK_PLAYERS
    : type === "role"
      ? PLAYER_ANALYSIS_MIN_ROLE_PLAYERS
      : PLAYER_ANALYSIS_MIN_OVERALL_PLAYERS;
  const minimumPlayers = definition.id === "rank_stability"
    ? Math.max(baseMinimumPlayers, PLAYER_ANALYSIS_MIN_STABILITY_PLAYERS)
    : baseMinimumPlayers;
  const stabilityGames = definition.id === "rank_stability"
    ? minimumPlayers * PLAYER_ANALYSIS_MIN_STABILITY_GAMES
    : minimumGames;
  return stats.sampleGames >= Math.max(minimumGames, stabilityGames) &&
    stats.samplePlayers >= minimumPlayers &&
    stats.values.length >= minimumPlayers;
}

function metricComparisonStatus(input: {
  definition: MetricDefinition;
  reference: BenchmarkMetricStats | null;
  playerHistoryEnough: boolean;
  playerSamePickUsable: boolean;
  overallUsable: boolean;
}): PlayerAnalysisMetric["comparison_status"] {
  if (!input.playerHistoryEnough) return "insufficient_player_games";
  if (input.definition.requiresSamePick && !input.playerSamePickUsable) return "insufficient_player_games";
  if (input.definition.requiresSamePick && !input.reference) return "same_pick_required";
  if (input.reference) {
    if (input.definition.ignoreIfBaselineZero && Math.abs(input.reference.mean) < 0.1) {
      return "not_applicable";
    }
    return "available";
  }
  if (input.definition.minimumPeerGames && input.overallUsable) return "insufficient_peer_history";
  return "insufficient_cohort";
}

function comparisonNote(status: PlayerAnalysisMetric["comparison_status"]) {
  const notes: Record<PlayerAnalysisMetric["comparison_status"], string | null> = {
    available: null,
    insufficient_cohort: "비교 경기와 플레이어 표본이 부족합니다.",
    same_pick_required: "역할 차이를 줄이기 위해 같은 실험체·무기 표본이 있을 때만 비교합니다.",
    insufficient_player_games: "개인 경기 수가 지표 계산 기준에 미달합니다.",
    insufficient_peer_history: "여러 경기를 보유한 비교 플레이어가 부족합니다.",
    not_applicable: "이 실험체는 해당 지표가 유효하지 않아 평가에서 제외합니다."
  };
  return notes[status];
}

function confidenceFromEvidence(playerGames: number, samplePlayers: number, samePick: boolean): Confidence {
  const reliability = scoreReliability(playerGames, samplePlayers, samePick);
  if (playerGames >= 20 && reliability >= 0.85) return "high";
  if (playerGames >= 10 && reliability >= 0.55) return "medium";
  return "low";
}

function signedDeltaPercent(
  value: number,
  reference: number,
  direction: "higher" | "lower",
  allowed: boolean
) {
  if (!allowed || Math.abs(reference) <= 0.000001) return null;
  const raw = ((value - reference) / Math.abs(reference)) * 100;
  const oriented = direction === "higher" ? raw : -raw;
  if (Math.abs(oriented) > 300) return null;
  return round(oriented, 1);
}

function metricDefinition(id: PlayerAnalysisMetricId) {
  return METRICS.find((metric) => metric.id === id) as MetricDefinition;
}

function roundMetric(metric: PlayerAnalysisMetric): PlayerAnalysisMetric {
  return {
    ...metric,
    value: round(metric.value, metric.unit === "percent" ? 4 : 2),
    cohort_mean: metric.cohort_mean === null ? null : round(metric.cohort_mean, metric.unit === "percent" ? 4 : 2),
    same_pick_mean: metric.same_pick_mean === null ? null : round(metric.same_pick_mean, metric.unit === "percent" ? 4 : 2),
    role_mean: metric.role_mean === null ? null : round(metric.role_mean, metric.unit === "percent" ? 4 : 2),
    reference_mean: metric.reference_mean === null ? null : round(metric.reference_mean, metric.unit === "percent" ? 4 : 2),
    reference_value: metric.reference_value === null ? null : round(metric.reference_value, metric.unit === "percent" ? 4 : 2)
  };
}

function lowestConfidence(values: Confidence[]): Confidence {
  if (values.includes("low")) return "low";
  if (values.includes("medium")) return "medium";
  return "high";
}

function latestMmr(rows: AnalysisRow[]) {
  return rows
    .map((row) => numeric(row, "mmr_after", "mmrAfter"))
    .filter((value) => value > 0)
    .at(0) ?? null;
}

function startedAt(row: AnalysisRow) {
  const match = row.matches;
  if (Array.isArray(match)) return String((match[0] as AnalysisRow | undefined)?.started_at ?? "");
  if (match && typeof match === "object") return String((match as AnalysisRow).started_at ?? "");
  return String(row.started_at ?? row.startDtm ?? "");
}

export function analysisRowPatchKey(row: AnalysisRow) {
  const joined = Array.isArray(row.matches) ? row.matches[0] : row.matches;
  const source = joined && typeof joined === "object" ? { ...row, ...joined as AnalysisRow } : row;
  const parts = [source.version_season ?? source.versionSeason,
    source.version_major ?? source.versionMajor, source.version_minor ?? source.versionMinor];
  if (parts.some((value) => value === undefined || value === null || value === "" ||
      !Number.isInteger(Number(value)) || Number(value) < 0)) return null;
  return Number(parts[0]) > 0 ? parts.map(Number).join(".") : null;
}

function numeric(row: AnalysisRow, ...keys: string[]) {
  return readAnalysisNumber(row, ...keys) ?? 0;
}

function viewContribution(row: AnalysisRow) {
  return readAnalysisNumber(row, "viewContribution", "view_contribution") ?? 0;
}

function hasViewContribution(row: AnalysisRow) {
  return readAnalysisNumber(row, "viewContribution", "view_contribution") !== null;
}

function metricAvailable(game: NormalizedGame, id: PlayerAnalysisMetricId) {
  return game.availableMetrics.has(id);
}

function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedMean(values: Array<{ value: number; weight: number }>) {
  const valid = values.filter((item) => Number.isFinite(item.value) && item.weight > 0);
  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return valid.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function quantile(sorted: number[], percentile: number) {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? 0;
  const ratio = index - lower;
  return (sorted[lower] ?? 0) * (1 - ratio) + (sorted[upper] ?? 0) * ratio;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function finiteOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
