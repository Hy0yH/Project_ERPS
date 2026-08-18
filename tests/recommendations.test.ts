import { describe, expect, it } from "vitest";
import { resolveCompContextForCandidate } from "@/lib/recommendations";
import { buildEvidenceExplanation } from "@/lib/openai";
import type { Recommendation, TeamCompStat } from "@/lib/types";

describe("recommendation player context", () => {
  it("selects synergy partners from all collected comps, not the player's picks", () => {
    const comps: TeamCompStat[] = [
      compFixture("1-7", [1, 7], 20, 0.45, 0.1, 0.4),
      compFixture("7-8-9", [7, 8, 9], 80, 0.62, 0.2, 0.9)
    ];

    const context = resolveCompContextForCandidate([], 7, comps);

    expect(context.comp?.comp_key).toBe("7-8-9");
    expect(context.compContextCodes).toEqual([8, 9]);
  });

  it("keeps explicitly selected teammates as the composition constraint", () => {
    const comps: TeamCompStat[] = [
      compFixture("1-7", [1, 7], 20, 0.45, 0.1, 0.4),
      compFixture("7-8", [7, 8], 80, 0.62, 0.2, 0.9)
    ];

    const context = resolveCompContextForCandidate([1], 7, comps);

    expect(context.comp?.comp_key).toBe("1-7");
    expect(context.compContextCodes).toEqual([1]);
  });

  it("writes candidate-specific evidence from player and composition statistics", () => {
    const recommendation: Recommendation = {
      character: {
        character_code: 7,
        name_ko: "테스트 실험체",
        name_en: "Test",
        role: null,
        weapon_types: [],
        is_active: true,
        display_name: "테스트 실험체 / 단검",
        tier: "A"
      },
      score: 0.7,
      confidence: "medium",
      metrics: {
        metaScore: 0.6,
        compScore: 0.7,
        userScore: 0.8,
        patchScore: 0.5,
        games: 18,
        winRate: 0.2,
        top3Rate: 0.55,
        averageRank: 3.2,
        metaGames: 84,
        metaWinRate: 0.18,
        metaTop3Rate: 0.48,
        metaAverageRank: 3.7
      },
      context: {
        source: "global_comp",
        title: "전체 상위권 조합 통계 기준",
        dataScope: "season",
        baseCharacters: [{ character_code: 1, name_ko: "기준 실험체", games: 12 }],
        playerPerformance: {
          character_code: 7,
          games: 14,
          wins: 3,
          top3: 8,
          win_rate: 3 / 14,
          top3_rate: 8 / 14,
          average_rank: 3.4,
          average_damage_to_player: 12345,
          average_damage_from_player: 16789,
          average_survivable_time: 901,
          average_view_contribution: 42
        },
        compName: "기준 실험체 / 테스트 실험체",
        compGames: 18,
        compWinRate: 0.2,
        compTop3Rate: 0.55,
        compAverageRank: 3.2,
        details: []
      },
      explanation: "",
      patchSummary: []
    };

    const explanation = buildEvidenceExplanation(recommendation, "플레이어");

    expect(explanation).toContain("테스트 실험체 / 단검");
    expect(explanation).toContain("12,345");
    expect(explanation).toContain("받은 피해 16,789");
    expect(explanation).toContain("기준 실험체 / 테스트 실험체 조합");
    expect(explanation).toContain("높은 신뢰도 기준인 30판");
  });
});

function compFixture(
  compKey: string,
  characterCodes: number[],
  games: number,
  top3Rate: number,
  winRate: number,
  confidenceScore: number
): TeamCompStat {
  return {
    comp_key: compKey,
    character_codes: characterCodes,
    character_weapon_keys: [],
    character_names: characterCodes.map(String),
    comp_name: characterCodes.join(" / "),
    tier: "B",
    comp_size: characterCodes.length,
    games,
    wins: Math.round(games * winRate),
    top3: Math.round(games * top3Rate),
    win_rate: winRate,
    top3_rate: top3Rate,
    average_rank: 3.5,
    confidence_score: confidenceScore
  };
}
