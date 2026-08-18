import { describe, expect, it } from "vitest";
import {
  buildCompKey,
  characterMetaScore,
  compPerformanceScore,
  confidenceFromGames,
  isTop3,
  recommendationScore,
  teamCompRankingScore,
  tierFromRank,
  tierFromScore,
  userAffinityScore
} from "@/lib/stats";

describe("stats helpers", () => {
  it("dedupes and sorts comp keys", () => {
    expect(buildCompKey([32, 4, 12, 4])).toBe("4-12-32");
  });

  it("uses game_rank <= 3 as top3", () => {
    expect(isTop3(1)).toBe(true);
    expect(isTop3(3)).toBe(true);
    expect(isTop3(4)).toBe(false);
  });

  it("marks low sample combinations as low confidence", () => {
    expect(confidenceFromGames(9, 3)).toBe("low");
    expect(confidenceFromGames(10, 3)).toBe("medium");
    expect(confidenceFromGames(30, 2)).toBe("high");
  });

  it("uses seven score tier labels", () => {
    expect(tierFromScore(0.9, 10)).toBe("S");
    expect(tierFromScore(0.3, 150)).toBe("E");
    expect(tierFromScore(0.1, 150)).toBe("F");
  });

  it("uses seven rank tier labels", () => {
    expect(tierFromRank(0, 100)).toBe("S");
    expect(tierFromRank(10, 100)).toBe("A");
    expect(tierFromRank(25, 100)).toBe("B");
    expect(tierFromRank(45, 100)).toBe("C");
    expect(tierFromRank(65, 100)).toBe("D");
    expect(tierFromRank(85, 100)).toBe("E");
    expect(tierFromRank(95, 100)).toBe("F");
  });

  it("scores user affinity from volume and performance", () => {
    const score = userAffinityScore(7, [
      {
        character_code: 7,
        games: 20,
        wins: 4,
        top3: 12,
        win_rate: 0.2,
        top3_rate: 0.6,
        average_rank: 3
      }
    ]);
    expect(score).toBeGreaterThan(0.6);
  });

  it("shrinks one-game player affinity toward the baseline", () => {
    const onePerfectGame = userAffinityScore(7, [
      {
        character_code: 7,
        games: 1,
        wins: 1,
        top3: 1,
        win_rate: 1,
        top3_rate: 1,
        average_rank: 1
      }
    ]);
    const establishedPick = userAffinityScore(7, [
      {
        character_code: 7,
        games: 12,
        wins: 2,
        top3: 6,
        win_rate: 2 / 12,
        top3_rate: 0.5,
        average_rank: 3.8
      }
    ]);

    expect(establishedPick).toBeGreaterThan(onePerfectGame);
  });

  it("discounts high rates when sample confidence is low", () => {
    const tinyPerfectSample = characterMetaScore({
      winRate: 1,
      top3Rate: 1,
      averageRank: 1,
      confidence: 0.03
    });
    const reliableStrongSample = characterMetaScore({
      winRate: 0.24,
      top3Rate: 0.62,
      averageRank: 3,
      confidence: 1
    });

    expect(reliableStrongSample).toBeGreaterThan(tinyPerfectSample);
  });

  it("shrinks average rank for tiny character samples", () => {
    const onePerfectGame = characterMetaScore({
      winRate: 1,
      top3Rate: 1,
      averageRank: 1,
      confidence: 1 / 300
    });
    const observedAveragePerformance = characterMetaScore({
      winRate: 0.15,
      top3Rate: 0.4,
      averageRank: 4,
      confidence: 0.2
    });

    expect(observedAveragePerformance).toBeGreaterThan(onePerfectGame);
  });

  it("uses reliability-adjusted performance for team comps", () => {
    const tinyCompScore = compPerformanceScore({
      comp_key: "1-2-3",
      comp_name: "A / B / C",
      character_codes: [1, 2, 3],
      character_weapon_keys: ["1:1", "2:2", "3:3"],
      character_names: ["A", "B", "C"],
      tier: "F",
      comp_size: 3,
      games: 2,
      wins: 2,
      top3: 2,
      win_rate: 1,
      top3_rate: 1,
      average_rank: 1,
      confidence_score: 2 / 45
    });
    const reliableCompScore = compPerformanceScore({
      comp_key: "4-5-6",
      comp_name: "D / E / F",
      character_codes: [4, 5, 6],
      character_weapon_keys: ["4:4", "5:5", "6:6"],
      character_names: ["D", "E", "F"],
      tier: "S",
      comp_size: 3,
      games: 45,
      wins: 10,
      top3: 28,
      win_rate: 10 / 45,
      top3_rate: 28 / 45,
      average_rank: 3,
      confidence_score: 1
    });

    expect(reliableCompScore).toBeGreaterThan(tinyCompScore);
  });

  it("ranks team comps with observed evidence ahead of tiny perfect samples", () => {
    const tinyPerfectSample = teamCompRankingScore({
      comp_key: "1-2",
      comp_name: "A / B",
      character_codes: [1, 2],
      character_weapon_keys: ["1:1", "2:2"],
      character_names: ["A", "B"],
      tier: "F",
      comp_size: 2,
      games: 2,
      wins: 2,
      top3: 2,
      win_rate: 1,
      top3_rate: 1,
      average_rank: 1,
      confidence_score: 2 / 90
    });
    const moreObservedSample = teamCompRankingScore({
      comp_key: "3-4",
      comp_name: "C / D",
      character_codes: [3, 4],
      character_weapon_keys: ["3:3", "4:4"],
      character_names: ["C", "D"],
      tier: "S",
      comp_size: 2,
      games: 5,
      wins: 2,
      top3: 2,
      win_rate: 0.4,
      top3_rate: 0.4,
      average_rank: 4.4,
      confidence_score: 5 / 90
    });

    expect(moreObservedSample).toBeGreaterThan(tinyPerfectSample);
  });

  it("only applies composition scoring in proportion to its evidence", () => {
    const base = recommendationScore({
      metaScore: 0.5,
      userScore: 0.4,
      patchScore: 0.5,
      compScore: 0,
      compConfidence: 0
    });
    const oneGameComp = recommendationScore({
      metaScore: 0.5,
      userScore: 0.4,
      patchScore: 0.5,
      compScore: 0.9,
      compConfidence: 1 / 90
    });
    const establishedComp = recommendationScore({
      metaScore: 0.5,
      userScore: 0.4,
      patchScore: 0.5,
      compScore: 0.9,
      compConfidence: 1
    });

    expect(oneGameComp - base).toBeLessThan(0.01);
    expect(establishedComp).toBeGreaterThan(oneGameComp);
  });
});
