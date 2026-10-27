import { describe, expect, it } from "vitest";
import evidence from "./fixtures/player-analysis-real-cases.json";
import { buildPlayerAnalysis } from "@/lib/player-analysis";
import { normalizeOfficialAnalysisRow } from "@/lib/player-analysis-source";
import { equipmentWithAnalysisMetrics } from "@/lib/ingestion";
import { buildPlayerStatistics } from "@/lib/player-statistics";

describe("official five-player source replay captured 2026-10-26", () => {
  it.each(evidence.cases)("reconciles $nickname against independently frozen arithmetic", (sample) => {
    const rows = sample.rows.map((row) => normalizeOfficialAnalysisRow(row, evidence.patch, evidence.seasonId));
    const analysis = buildPlayerAnalysis({ nickname: sample.nickname, userNum: 1, playerRows: rows,
      overallRows: [], samePickRows: [], seasonId: evidence.seasonId, patchKey: evidence.patch.patch_key,
      supplementalGames: 0, expandedBenchmark: false });
    expect(analysis.scope.analyzed_games).toBe(sample.rows.length);
    expect(analysis.statistics.metrics).toHaveLength(35);
    for (const [id, expected] of Object.entries(sample.expected)) {
      expect(analysis.statistics.metrics.find((metric) => metric.id === id)?.value, `${sample.nickname}:${id}`).toBeCloseTo(expected, 9);
    }
    for (const [id, expected] of Object.entries(sample.metrics)) {
      const actual = analysis.dimensions.flatMap((dimension) => dimension.metrics).find((metric) => metric.id === id)?.value;
      expect(Math.abs(Number(actual) - Number(expected)), `${sample.nickname}:${id}`).toBeLessThanOrEqual(0.0051);
    }
    const stored = buildPlayerStatistics(sample.rows.map((row) => ({
      game_rank: row.gameRank, total_spent_vf_credit: 0, equipment: equipmentWithAnalysisMetrics({}, row)
    })));
    expect(stored.metrics.find((metric) => metric.id === "credits_spent")?.value).toBeCloseTo(sample.expected.credits_spent, 9);
    expect(analysis.recent_matches.map((match) => match.game_id)).toEqual(sample.rows.map((row) => row.gameId));
  });
});
