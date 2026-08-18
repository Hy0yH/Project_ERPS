import type {
  Confidence,
  PlayerAnalysis,
  PlayerAnalysisDimension,
  PlayerAnalysisDimensionKey,
  PlayerAnalysisInsight,
  PlayerAnalysisMetric,
  PlayerAnalysisMetricId
} from "@/lib/types";

export const PLAYER_ANALYSIS_VERSION = 1;
export const PLAYER_ANALYSIS_CACHE_VERSION = 4;
export const PLAYER_ANALYSIS_GAME_LIMIT = 30;
export const PLAYER_ANALYSIS_PEER_GAME_LIMIT = 5;
export const PLAYER_ANALYSIS_CACHE_HOURS = 6;
export const PLAYER_ANALYSIS_MMR_BUCKET = 500;
export const PLAYER_ANALYSIS_MIN_OVERALL_GAMES = 50;
export const PLAYER_ANALYSIS_MIN_OVERALL_PLAYERS = 30;
export const PLAYER_ANALYSIS_MIN_SAME_PICK_GAMES = 30;
export const PLAYER_ANALYSIS_MIN_SAME_PICK_PLAYERS = 15;
export const PLAYER_ANALYSIS_MIN_PLAYER_PICK_GAMES = 5;
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
  scoreMethod?: "percentile" | "sampling_distribution";
};

type NormalizedGame = {
  userNum: number;
  characterCode: number;
  weaponCode: number;
  gameRank: number;
  top3: number;
  win: number;
  playTimeMinutes: number;
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
  { id: "damage_per_minute", label: "분당 플레이어 피해", dimension: "combat", unit: "per_minute", direction: "higher", weight: 0.45, actionable: true },
  { id: "kill_participation", label: "킬 관여율", dimension: "combat", unit: "percent", direction: "higher", weight: 0.35, actionable: true },
  { id: "cc_per_minute", label: "분당 군중제어", dimension: "combat", unit: "per_minute", direction: "higher", weight: 0.2, actionable: true },
  { id: "weapon_level_per_minute", label: "분당 무기 숙련 성장", dimension: "growth", unit: "per_minute", direction: "higher", weight: 0.4, actionable: true },
  { id: "credits_per_minute", label: "분당 크레딧 획득", dimension: "growth", unit: "per_minute", direction: "higher", weight: 0.6, actionable: true },
  { id: "hunts_per_minute", label: "분당 야생동물 처치", dimension: "farming", unit: "per_minute", direction: "higher", weight: 0.5, actionable: true },
  { id: "monster_damage_per_minute", label: "분당 야생동물 피해", dimension: "farming", unit: "per_minute", direction: "higher", weight: 0.5, actionable: true },
  { id: "support_per_minute", label: "분당 회복·보호", dimension: "team", unit: "per_minute", direction: "higher", weight: 1, actionable: true, requiresSamePick: true },
  { id: "vision_actions_per_minute", label: "분당 시야 활동", dimension: "vision", unit: "per_minute", direction: "higher", weight: 1, actionable: true },
  { id: "top3_rate", label: "TOP3 비율", dimension: "stability", unit: "percent", direction: "higher", weight: 0.3, actionable: false, referenceStatistic: "mean", scoreMethod: "sampling_distribution" },
  { id: "win_rate", label: "승률", dimension: "stability", unit: "percent", direction: "higher", weight: 0.15, actionable: false, referenceStatistic: "mean", scoreMethod: "sampling_distribution" },
  { id: "average_rank", label: "평균 순위", dimension: "stability", unit: "rank", direction: "lower", weight: 0.25, actionable: false, allowPercentDelta: false, referenceStatistic: "mean", scoreMethod: "sampling_distribution" },
  { id: "mmr_gain", label: "평균 MMR 증감", dimension: "stability", unit: "mmr", direction: "higher", weight: 0.2, actionable: false, allowPercentDelta: false, referenceStatistic: "mean", scoreMethod: "sampling_distribution" },
  { id: "rank_stability", label: "순위 변동성", dimension: "stability", unit: "rank", direction: "lower", weight: 0.1, actionable: false, minimumPeerGames: PLAYER_ANALYSIS_MIN_STABILITY_GAMES, allowPercentDelta: false }
];

const DIMENSION_LABELS: Record<PlayerAnalysisDimensionKey, string> = {
  combat: "교전",
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
  const playTime = numeric(row, "play_time", "playTime", "total_time", "totalTime");
  const kills = numeric(row, "player_kill", "playerKill");
  const assists = numeric(row, "player_assistant", "playerAssistant");
  const teamKills = numeric(row, "team_kill", "teamKill");
  const gameRank = numeric(row, "game_rank", "gameRank");
  const visionActions =
    numeric(row, "add_surveillance_camera", "addSurveillanceCamera") +
    numeric(row, "add_telephoto_camera", "addTelephotoCamera") +
    numeric(row, "remove_surveillance_camera", "removeSurveillanceCamera") +
    numeric(row, "remove_telephoto_camera", "removeTelephotoCamera") +
    numeric(row, "use_security_console", "useSecurityConsole");

  return {
    userNum: numeric(row, "user_num", "userNum"),
    characterCode: numeric(row, "character_code", "characterNum", "characterCode"),
    weaponCode: numeric(row, "best_weapon", "bestWeapon"),
    gameRank,
    top3: gameRank > 0 && gameRank <= 3 ? 1 : 0,
    win: gameRank === 1 ? 1 : 0,
    playTimeMinutes: playTime > 0 ? playTime / 60 : 0,
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
      vision_actions_per_minute: perMinute(visionActions, playTime),
      top3_rate: gameRank > 0 && gameRank <= 3 ? 1 : 0,
      win_rate: gameRank === 1 ? 1 : 0,
      average_rank: gameRank,
      mmr_gain: numeric(row, "mmr_gain", "mmrGain"),
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
        (group) => group.length >= (definition.minimumPeerGames ?? 1)
      );
      const values = eligibleGroups.map((group) => aggregateNormalizedGames(group)[definition.id]);
      const eligibleGames = eligibleGroups.flat();
      const top3Values = eligibleGames
        .filter((game) => game.top3 === 1)
        .map((game) => game.metrics[definition.id]);
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
  characterNames?: Map<number, string>;
  rank?: { mmr?: number | null; rank?: number | null; serverRank?: number | null; rankPercent?: number | null };
  seasonId: number;
  patchKey: string | null;
  supplementalGames: number;
  expandedBenchmark: boolean;
  generatedAt?: string;
}): PlayerAnalysis {
  const normalizedPlayerGames = input.playerRows
    .map(normalizeAnalysisRow)
    .filter((game) => game.gameRank > 0)
    .slice(0, PLAYER_ANALYSIS_GAME_LIMIT);
  const playerAggregate = aggregateNormalizedGames(normalizedPlayerGames);
  const mainPick = mostPlayedNormalizedPick(normalizedPlayerGames);
  const mainPickPlayerGames = normalizedPlayerGames.filter(
    (game) => game.characterCode === mainPick.characterCode && game.weaponCode === mainPick.weaponCode
  );
  const mainPickPlayerAggregate = aggregateNormalizedGames(mainPickPlayerGames);
  const overall = buildBenchmarkStats(input.overallRows);
  const samePick = buildBenchmarkStats(input.samePickRows);
  const playerConfidence = confidenceFromAnalysisGames(normalizedPlayerGames.length);
  const samePickUsable = samePick.sampleGames >= PLAYER_ANALYSIS_MIN_SAME_PICK_GAMES &&
    samePick.samplePlayers >= PLAYER_ANALYSIS_MIN_SAME_PICK_PLAYERS;
  const overallUsable = overall.sampleGames >= PLAYER_ANALYSIS_MIN_OVERALL_GAMES &&
    overall.samplePlayers >= PLAYER_ANALYSIS_MIN_OVERALL_PLAYERS;
  const playerSamePickUsable = mainPickPlayerGames.length >= PLAYER_ANALYSIS_MIN_PLAYER_PICK_GAMES;

  const metrics = METRICS.map((definition) => {
    const overallCandidate = overall.metrics[definition.id];
    const samePickCandidate = samePick.metrics[definition.id];
    const overallStats = overallUsable && metricBenchmarkUsable(overallCandidate, "overall", definition)
      ? overallCandidate
      : null;
    const samePickStats = samePickUsable && metricBenchmarkUsable(samePickCandidate, "same_pick", definition)
      ? samePickCandidate
      : null;
    const canCompareSamePick = playerSamePickUsable && Boolean(samePickStats);
    const referenceType = canCompareSamePick
      ? "same_pick" as const
      : definition.requiresSamePick
        ? null
        : overallStats
          ? "mmr" as const
          : null;
    const reference = referenceType === "same_pick" ? samePickStats : referenceType === "mmr" ? overallStats : null;
    const playerGames = referenceType === "same_pick" ? mainPickPlayerGames.length : normalizedPlayerGames.length;
    const value = referenceType === "same_pick"
      ? mainPickPlayerAggregate[definition.id]
      : playerAggregate[definition.id];
    const playerHistoryEnough = definition.id !== "rank_stability" ||
      playerGames >= PLAYER_ANALYSIS_MIN_STABILITY_GAMES;
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
      ? definition.scoreMethod === "sampling_distribution"
        ? samplingDistributionScore(value, reference, playerGames, definition.direction)
        : percentileScore(value, reference.values, definition.direction)
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
        : "low"
    } satisfies PlayerAnalysisMetric;
  });

  const dimensions = buildDimensions(metrics);
  const scoredMetrics = metrics.filter((metric) => metric.relative_score !== null);
  const analysisConfidence = scoredMetrics.length
    ? lowestConfidence([playerConfidence, ...scoredMetrics.map((metric) => metric.confidence)])
    : "low";
  const picks = buildPickProfile(normalizedPlayerGames, input.characterNames ?? new Map());
  const strengths = buildStrengths(metrics);
  const improvementPriorities = buildImprovementPriorities(metrics, { overall, samePick });
  const latestGameAt = input.playerRows
    .map(startedAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
  const mmr = input.rank?.mmr ?? latestMmr(input.playerRows);
  const bucketStart = mmr ? mmrBucketStart(mmr) : null;
  const caveats = buildCaveats({
    games: normalizedPlayerGames.length,
    supplementalGames: input.supplementalGames,
    overallUsable,
    samePickUsable,
    expanded: input.expandedBenchmark,
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
      patch_key: input.patchKey,
      requested_games: PLAYER_ANALYSIS_GAME_LIMIT,
      analyzed_games: normalizedPlayerGames.length,
      supplemental_games: input.supplementalGames,
      latest_game_at: latestGameAt,
      confidence: analysisConfidence
    },
    pick_profile: picks,
    dimensions,
    strengths,
    improvement_priorities: improvementPriorities,
    ai_summary: fallbackAnalysisSummary(picks.concentration, dimensions, analysisConfidence),
    benchmark_coverage: {
      mmr_bucket_start: bucketStart,
      mmr_bucket_end: bucketStart === null ? null : bucketStart + PLAYER_ANALYSIS_MMR_BUCKET,
      expanded: input.expandedBenchmark,
      overall_games: overall.sampleGames,
      overall_players: overall.samplePlayers,
      same_pick_games: samePick.sampleGames,
      same_pick_players: samePick.samplePlayers,
      minimum_overall_games: PLAYER_ANALYSIS_MIN_OVERALL_GAMES,
      minimum_overall_players: PLAYER_ANALYSIS_MIN_OVERALL_PLAYERS,
      minimum_same_pick_games: PLAYER_ANALYSIS_MIN_SAME_PICK_GAMES,
      minimum_same_pick_players: PLAYER_ANALYSIS_MIN_SAME_PICK_PLAYERS
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
        ? weightedMean(games.map((game) => ({ value: game.metrics[id], weight: game.playTimeMinutes })))
        : mean(games.map((game) => game.metrics[id]))
    ])
  ) as Record<PlayerAnalysisMetricId, number>;
  values.rank_stability = standardDeviation(games.map((game) => game.gameRank));
  return values;
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

function buildDimensions(metrics: PlayerAnalysisMetric[]): PlayerAnalysisDimension[] {
  return (Object.keys(DIMENSION_LABELS) as PlayerAnalysisDimensionKey[]).map((key) => {
    const dimensionMetrics = metrics.filter((metric) => metricDefinition(metric.id).dimension === key);
    const scored = dimensionMetrics.filter((metric) => metric.relative_score !== null);
    const totalWeight = scored.reduce((sum, metric) => sum + metricDefinition(metric.id).weight, 0);
    const score = totalWeight
      ? scored.reduce((sum, metric) => sum + Number(metric.relative_score) * metricDefinition(metric.id).weight, 0) / totalWeight
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

function buildStrengths(metrics: PlayerAnalysisMetric[]): PlayerAnalysisInsight[] {
  return metrics
    .filter((metric) =>
      metric.relative_score !== null &&
      Number(metric.relative_score) >= 65 &&
      metric.confidence !== "low"
    )
    .sort((a, b) => Number(b.relative_score) - Number(a.relative_score))
    .slice(0, 2)
    .map((metric) => ({
      title: `${metric.label} 강점`,
      detail: comparisonText(metric, "관측됩니다"),
      metric_ids: [metric.id]
    }));
}

function buildImprovementPriorities(
  metrics: PlayerAnalysisMetric[],
  benchmarks: { overall: BenchmarkStats; samePick: BenchmarkStats }
): PlayerAnalysisInsight[] {
  return metrics
    .filter((metric) => {
      if (!metricDefinition(metric.id).actionable ||
          metric.relative_score === null ||
          metric.relative_score >= 35 ||
          metric.confidence === "low") return false;
      const benchmark = metric.reference_type === "same_pick" ? benchmarks.samePick : benchmarks.overall;
      const stats = benchmark.metrics[metric.id] ?? EMPTY_METRIC_STATS;
      const orientation = metric.direction === "higher" ? 1 : -1;
      return (stats.top3Mean - stats.mean) * orientation > Math.max(stats.stddev * 0.1, 0.0001);
    })
    .sort((a, b) => Number(a.relative_score) - Number(b.relative_score))
    .slice(0, 3)
    .map((metric) => ({
      title: `${metric.label} 우선 점검`,
      detail: `${comparisonText(metric, "관측됩니다")} ${adviceForMetric(metric.id)}`,
      metric_ids: [metric.id]
    }));
}

function buildCaveats(input: {
  games: number;
  supplementalGames: number;
  overallUsable: boolean;
  samePickUsable: boolean;
  expanded: boolean;
  mainPickGames: number;
  excludedMetrics: PlayerAnalysisMetric[];
}) {
  const caveats = [
    "운영 스타일은 공식 API의 경기 종료 지표를 바탕으로 한 추정이며 실제 이동·교전 타임라인을 재구성하지 않습니다.",
    "상대 점수는 비슷한 MMR대의 백분위 기반 참고 지표이며, 이후 MMR 상승을 예측하는 모델 정확도로 검증된 값은 아닙니다."
  ];
  if (input.games < 10) caveats.push("분석 경기 수가 10판 미만이라 개인 성향 판단의 신뢰도가 낮습니다.");
  if (input.supplementalGames > 0) caveats.push(`현재 패치 표본을 보완하기 위해 시즌 경기 ${input.supplementalGames}판을 포함했습니다.`);
  if (!input.samePickUsable && input.overallUsable) caveats.push(
    `같은 실험체·무기 표본이 ${PLAYER_ANALYSIS_MIN_SAME_PICK_GAMES}경기·${PLAYER_ANALYSIS_MIN_SAME_PICK_PLAYERS}명 기준에 미달해 역할 의존 지표는 제외하고 나머지는 비슷한 MMR대 전체와 비교했습니다.`
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
  type: "overall" | "same_pick",
  definition: MetricDefinition
) {
  const minimumGames = type === "same_pick"
    ? PLAYER_ANALYSIS_MIN_SAME_PICK_GAMES
    : PLAYER_ANALYSIS_MIN_OVERALL_GAMES;
  const baseMinimumPlayers = type === "same_pick"
    ? PLAYER_ANALYSIS_MIN_SAME_PICK_PLAYERS
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
  if (input.reference) return "available";
  if (input.definition.minimumPeerGames && input.overallUsable) return "insufficient_peer_history";
  return "insufficient_cohort";
}

function comparisonNote(status: PlayerAnalysisMetric["comparison_status"]) {
  const notes: Record<PlayerAnalysisMetric["comparison_status"], string | null> = {
    available: null,
    insufficient_cohort: "비교 경기와 플레이어 표본이 부족합니다.",
    same_pick_required: "역할 차이를 줄이기 위해 같은 실험체·무기 표본이 있을 때만 비교합니다.",
    insufficient_player_games: "개인 경기 수가 지표 계산 기준에 미달합니다.",
    insufficient_peer_history: "여러 경기를 보유한 비교 플레이어가 부족합니다."
  };
  return notes[status];
}

export function percentileScore(value: number, sortedValues: number[], direction: "higher" | "lower") {
  if (!sortedValues.length) return 50;
  let below = 0;
  let equal = 0;
  for (const candidate of sortedValues) {
    if (candidate < value) below += 1;
    else if (Math.abs(candidate - value) <= 0.000001) equal += 1;
  }
  const percentile = ((below + equal * 0.5) / sortedValues.length) * 100;
  return round(direction === "higher" ? percentile : 100 - percentile, 1);
}

export function samplingDistributionScore(
  value: number,
  stats: Pick<BenchmarkMetricStats, "mean" | "stddev">,
  playerGames: number,
  direction: "higher" | "lower"
) {
  const orientation = direction === "higher" ? 1 : -1;
  if (playerGames <= 0) return 50;
  const standardError = stats.stddev / Math.sqrt(playerGames);
  if (standardError <= 0.000001) {
    if (Math.abs(value - stats.mean) <= 0.000001) return 50;
    return value * orientation > stats.mean * orientation ? 75 : 25;
  }
  const zScore = ((value - stats.mean) / standardError) * orientation;
  return round(normalCdf(clamp(zScore, -6, 6)) * 100, 1);
}

export function scoreReliability(playerGames: number, samplePlayers: number, samePick: boolean) {
  const playerReliability = clamp(playerGames / 20, 0, 1);
  const cohortTarget = samePick ? 30 : 50;
  const cohortReliability = clamp(samplePlayers / cohortTarget, 0, 1);
  return Math.sqrt(playerReliability * cohortReliability);
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

function comparisonText(metric: PlayerAnalysisMetric, suffix: string) {
  const delta = metric.delta_percent;
  const absolute = metric.delta_absolute;
  const comparison = delta !== null
    ? `비교 기준보다 ${Math.abs(delta).toFixed(1)}% ${delta >= 0 ? "높게" : "낮게"}`
    : absolute !== null
      ? `비교 기준보다 ${Math.abs(absolute).toFixed(2)}만큼 ${absolute >= 0 ? "유리하게" : "불리하게"}`
      : "비교 기준 대비";
  return `${metric.label} 지표가 ${comparison} ${suffix}.`;
}

function adviceForMetric(id: PlayerAnalysisMetricId) {
  const advice: Partial<Record<PlayerAnalysisMetricId, string>> = {
    damage_per_minute: "불리한 추격보다 팀이 함께 때릴 수 있는 교전에 참여하는 빈도를 우선 점검해 보세요.",
    kill_participation: "팀 교전 합류 시점과 오브젝트 전후의 위치 선정을 먼저 점검해 보세요.",
    cc_per_minute: "핵심 스킬을 단독 견제보다 아군의 공격이 이어질 수 있는 순간에 사용하는지 확인해 보세요.",
    hunts_per_minute: "이동 중 비는 구간에 야생동물 캠프를 연결해 성장 공백을 줄이는 방향을 점검해 보세요.",
    monster_damage_per_minute: "교전이 없는 시간에 오브젝트와 야생동물에 투자하는 비율을 확인해 보세요.",
    weapon_level_per_minute: "초중반 숙련도 성장 속도가 끊기는 구간을 최근 경기에서 찾아보세요.",
    credits_per_minute: "야생동물·오브젝트·교전으로 이어지는 크레딧 수급 동선을 점검해 보세요.",
    support_per_minute: "같은 픽 이용자보다 아군 회복·보호 기여가 낮은 경기의 스킬 사용 시점을 확인해 보세요.",
    vision_actions_per_minute: "오브젝트 전 카메라와 보안 콘솔 사용을 습관화할 수 있는지 점검해 보세요."
  };
  return advice[id] ?? "최근 경기에서 이 지표가 낮아지는 장면을 우선 확인해 보세요.";
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

function numeric(row: AnalysisRow, ...keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      const value = Number(row[key]);
      if (Number.isFinite(value)) return value;
    }
  }
  return 0;
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

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = sign * (1 - polynomial * Math.exp(-x * x));
  return 0.5 * (1 + erf);
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
