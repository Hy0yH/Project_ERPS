import type { Confidence, PlayerCharacterSummary, TeamCompStat } from "@/lib/types";
import {
  ER_RECOMMEND_HIGH_SAMPLE_GAMES,
  ER_RECOMMEND_MIN_SAMPLE_GAMES
} from "@/lib/env";

const BASELINE_WIN_RATE = 0.125;
const BASELINE_TOP3_RATE = 0.375;
const BASELINE_AVG_RANK_SCORE = 0.5;
const TIER_GRADES = ["S", "A", "B", "C", "D", "E", "F"] as const;

export function buildCompKey(characterCodes: number[]) {
  return [...new Set(characterCodes)].sort((a, b) => a - b).join("-");
}

export function isTop3(gameRank: number) {
  return gameRank <= 3;
}

export function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return numerator / denominator;
}

export function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function confidenceFromGames(games: number, compSize?: number): Confidence {
  void compSize;
  if (games >= ER_RECOMMEND_HIGH_SAMPLE_GAMES) return "high";
  if (games >= ER_RECOMMEND_MIN_SAMPLE_GAMES) return "medium";
  return "low";
}

export function confidenceScore(games: number, compSize?: number) {
  const target = compSize === 3 ? 45 : compSize === 2 ? 90 : 300;
  return Math.min(1, games / target);
}

export function avgRankScore(avgRank: number) {
  if (!avgRank) return 0;
  return Math.max(0, Math.min(1, (8 - avgRank) / 7));
}

export function tierFromScore(score: number, games = 0) {
  void games;
  if (score >= 0.75) return "S";
  if (score >= 0.65) return "A";
  if (score >= 0.55) return "B";
  if (score >= 0.45) return "C";
  if (score >= 0.35) return "D";
  if (score >= 0.25) return "E";
  return "F";
}

export function tierFromRank(index: number, total: number) {
  if (total <= 0) return "F";
  const percentile = (index + 1) / total;
  if (percentile <= 0.05) return TIER_GRADES[0];
  if (percentile <= 0.15) return TIER_GRADES[1];
  if (percentile <= 0.3) return TIER_GRADES[2];
  if (percentile <= 0.5) return TIER_GRADES[3];
  if (percentile <= 0.7) return TIER_GRADES[4];
  if (percentile <= 0.9) return TIER_GRADES[5];
  return TIER_GRADES[6];
}

export function characterMetaScore(input: {
  winRate: number;
  top3Rate: number;
  averageRank: number;
  confidence: number;
}) {
  const adjustedWinRate = reliabilityAdjustedRate(input.winRate, input.confidence, BASELINE_WIN_RATE);
  const adjustedTop3Rate = reliabilityAdjustedRate(input.top3Rate, input.confidence, BASELINE_TOP3_RATE);
  const adjustedAvgRankScore = reliabilityAdjustedRate(
    avgRankScore(input.averageRank),
    input.confidence,
    BASELINE_AVG_RANK_SCORE
  );
  return clamp01(
    adjustedWinRate * 0.32 +
      adjustedTop3Rate * 0.38 +
      adjustedAvgRankScore * 0.15 +
      input.confidence * 0.15
  );
}

export function compPerformanceScore(comp?: TeamCompStat | null) {
  if (!comp) return 0;
  const adjustedWinRate = reliabilityAdjustedRate(
    comp.win_rate,
    comp.confidence_score,
    BASELINE_WIN_RATE
  );
  const adjustedTop3Rate = reliabilityAdjustedRate(
    comp.top3_rate,
    comp.confidence_score,
    BASELINE_TOP3_RATE
  );
  const adjustedAvgRankScore = reliabilityAdjustedRate(
    avgRankScore(comp.average_rank),
    comp.confidence_score,
    BASELINE_AVG_RANK_SCORE
  );
  return clamp01(
    adjustedWinRate * 0.32 +
      adjustedTop3Rate * 0.38 +
      adjustedAvgRankScore * 0.15 +
      comp.confidence_score * 0.15
  );
}

export function characterRankingScore(input: {
  games: number;
  winRate: number;
  top3Rate: number;
  averageRank: number;
  confidence: number;
}) {
  return characterMetaScore(input) * Math.log1p(input.games);
}

export function teamCompRankingScore(comp?: TeamCompStat | null) {
  if (!comp) return 0;
  return compPerformanceScore(comp) * Math.log1p(comp.games);
}

export function recommendationScore(input: {
  metaScore: number;
  userScore: number;
  patchScore: number;
  compScore: number;
  compConfidence?: number;
}) {
  const baseScore =
    input.metaScore * 0.55 + input.userScore * 0.3 + input.patchScore * 0.15;
  const contextualScore =
    input.compScore * 0.5 +
    input.metaScore * 0.25 +
    input.userScore * 0.15 +
    input.patchScore * 0.1;
  const evidenceWeight = clamp01(input.compConfidence ?? 0);
  return baseScore * (1 - evidenceWeight) + contextualScore * evidenceWeight;
}

export function userAffinityScore(characterCode: number, summaries: PlayerCharacterSummary[]) {
  const summary = summaries.find((item) => item.character_code === characterCode);
  if (!summary) return 0;
  const volume = Math.min(1, summary.games / 20);
  const reliability = Math.min(1, summary.games / ER_RECOMMEND_MIN_SAMPLE_GAMES);
  const adjustedTop3Rate = reliabilityAdjustedRate(
    summary.top3_rate,
    reliability,
    BASELINE_TOP3_RATE
  );
  const adjustedRankScore = reliabilityAdjustedRate(
    avgRankScore(summary.average_rank),
    reliability,
    BASELINE_AVG_RANK_SCORE
  );
  return clamp01(volume * 0.45 + adjustedTop3Rate * 0.35 + adjustedRankScore * 0.2);
}

export function normalizePatchScore(score: number) {
  return clamp01((score + 5) / 10);
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function reliabilityAdjustedRate(rate: number, confidence: number, baseline: number) {
  const safeConfidence = clamp01(confidence);
  return baseline * (1 - safeConfidence) + rate * safeConfidence;
}
