import type { Confidence, PlayerCharacterSummary, TeamCompStat } from "@/lib/types";

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
  const high = compSize === 3 ? 45 : compSize === 2 ? 90 : 300;
  const medium = compSize === 3 ? 15 : compSize === 2 ? 30 : 100;
  if (games >= high) return "high";
  if (games >= medium) return "medium";
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

export function tierFromScore(score: number, games: number) {
  if (games < 100) return "표본 부족";
  if (score >= 0.76) return "S";
  if (score >= 0.66) return "A";
  if (score >= 0.56) return "B";
  if (score >= 0.46) return "C";
  return "D";
}

export function characterMetaScore(input: {
  winRate: number;
  top3Rate: number;
  averageRank: number;
  confidence: number;
}) {
  return clamp01(
    input.winRate * 0.25 +
      input.top3Rate * 0.35 +
      avgRankScore(input.averageRank) * 0.25 +
      input.confidence * 0.15
  );
}

export function compPerformanceScore(comp?: TeamCompStat | null) {
  if (!comp) return 0;
  return clamp01(
    comp.win_rate * 0.3 +
      comp.top3_rate * 0.4 +
      avgRankScore(comp.average_rank) * 0.2 +
      comp.confidence_score * 0.1
  );
}

export function userAffinityScore(characterCode: number, summaries: PlayerCharacterSummary[]) {
  const summary = summaries.find((item) => item.character_code === characterCode);
  if (!summary) return 0;
  const volume = Math.min(1, summary.games / 20);
  return clamp01(volume * 0.45 + summary.top3_rate * 0.35 + avgRankScore(summary.average_rank) * 0.2);
}

export function normalizePatchScore(score: number) {
  return clamp01((score + 5) / 10);
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
