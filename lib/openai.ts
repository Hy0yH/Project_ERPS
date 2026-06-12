import OpenAI from "openai";
import type { Recommendation } from "@/lib/types";

export async function explainRecommendation(input: {
  nickname?: string;
  teammateNames: string[];
  recommendations: Recommendation[];
}) {
  if (!process.env.OPENAI_API_KEY) {
    return input.recommendations.map((recommendation) => ({
      characterCode: recommendation.character.character_code,
      explanation: fallbackExplanation(recommendation)
    }));
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    instructions:
      "You explain Eternal Return recommendations in Korean. Use only the provided statistics and patch notes. Do not invent facts, matchup details, or future certainty. Mention low sample size when confidence is low. Return strict JSON array with characterCode and explanation.",
    input: JSON.stringify({
      nickname: input.nickname,
      teammateNames: input.teammateNames,
      recommendations: input.recommendations.map((item) => ({
        characterCode: item.character.character_code,
        characterName: item.character.name_ko,
        score: item.score,
        confidence: item.confidence,
        metrics: item.metrics,
        patchSummary: item.patchSummary
      }))
    })
  });

  try {
    return JSON.parse(response.output_text) as { characterCode: number; explanation: string }[];
  } catch {
    return input.recommendations.map((recommendation) => ({
      characterCode: recommendation.character.character_code,
      explanation: response.output_text || fallbackExplanation(recommendation)
    }));
  }
}

function fallbackExplanation(recommendation: Recommendation) {
  const { character, confidence, metrics, patchSummary } = recommendation;
  const confidenceText = confidence === "low" ? "표본이 적어 확신은 낮지만" : "현재 수집된 표본 기준으로";
  const patchText = patchSummary.length ? ` 최근 패치 근거는 ${patchSummary[0]}입니다.` : "";
  return `${confidenceText} ${character.name_ko}는 TOP3 ${(metrics.top3Rate * 100).toFixed(
    1
  )}%, 승률 ${(metrics.winRate * 100).toFixed(1)}%, 평균 순위 ${metrics.averageRank.toFixed(
    2
  )}를 바탕으로 추천 후보에 올랐습니다.${patchText}`;
}
