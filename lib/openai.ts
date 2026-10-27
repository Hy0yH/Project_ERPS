import OpenAI from "openai";
import { z } from "zod";
import {
  ER_RECOMMEND_HIGH_SAMPLE_GAMES,
  ER_RECOMMEND_MIN_SAMPLE_GAMES
} from "@/lib/env";
import type {
  PlayerAnalysis,
  PlayerAnalysisInsight,
  PlayerCharacterSummary,
  Recommendation
} from "@/lib/types";

export async function explainRecommendation(input: {
  nickname?: string;
  teammateNames: string[];
  recommendations: Recommendation[];
}) {
  return input.recommendations.map((recommendation) => ({
    characterCode: recommendation.character.character_code,
    explanation: buildEvidenceExplanation(recommendation, input.nickname)
  }));
}

export function buildEvidenceExplanation(
  recommendation: Recommendation,
  nickname?: string
) {
  const { character, confidence, context, metrics, patchSummary } = recommendation;
  const characterName = character.display_name ?? character.name_ko;
  const tier = character.tier ? `${character.tier}티어` : "메타 후보";
  const sentences: string[] = [];

  sentences.push(
    `현재 패치 상위권 ${formatNumber(metrics.metaGames)}판에서 ${characterName}의 기록은 ` +
      `TOP3 ${formatPercent(metrics.metaTop3Rate)}, 승률 ${formatPercent(metrics.metaWinRate)}, ` +
      `평균 순위 ${metrics.metaAverageRank.toFixed(2)}이며 현재 ${tier}입니다.`
  );

  if (context.playerPerformance) {
    sentences.push(playerPerformanceSentence(characterName, context.playerPerformance, nickname));
  }

  if (context.compName && typeof context.compGames === "number") {
    const top3Delta = (Number(context.compTop3Rate ?? 0) - metrics.metaTop3Rate) * 100;
    const deltaText = Math.abs(top3Delta) >= 0.1
      ? ` 단독 메타 대비 TOP3가 ${top3Delta >= 0 ? "+" : ""}${top3Delta.toFixed(1)}%p입니다.`
      : " 단독 메타와 비슷한 TOP3 성과입니다.";
    sentences.push(
      `${context.compName} 조합은 ${context.compGames}판에서 TOP3 ${formatPercent(context.compTop3Rate)}, ` +
        `승률 ${formatPercent(context.compWinRate)}, 평균 순위 ${formatRank(context.compAverageRank)}를 기록했습니다.${deltaText}`
    );
  } else if (context.baseCharacters.length) {
    const baseNames = context.baseCharacters.map((item) => item.name_ko).join(" + ");
    sentences.push(
      `${baseNames} 조합과 직접 연결되는 충분한 표본은 아직 없어, 조합 강점을 확정적으로 표현하지 않고 개인 기록과 실험체 메타를 우선했습니다.`
    );
  }

  if (patchSummary.length) {
    sentences.push(`최근 패치 근거로 ‘${patchSummary[0]}’을 함께 반영했습니다.`);
  }

  sentences.push(sampleSentence(confidence, metrics.games));
  return sentences.join(" ");
}

function playerPerformanceSentence(
  characterName: string,
  performance: PlayerCharacterSummary,
  nickname?: string
) {
  const facts = [
    `TOP3 ${formatPercent(performance.top3_rate)}`,
    `평균 순위 ${performance.average_rank.toFixed(2)}`
  ];

  if (Number(performance.average_damage_to_player ?? 0) > 0) {
    facts.push(`경기당 가한 피해 ${formatNumber(performance.average_damage_to_player)}`);
  }
  if (Number(performance.average_damage_from_player ?? 0) > 0) {
    facts.push(`받은 피해 ${formatNumber(performance.average_damage_from_player)}`);
  }
  if (Number(performance.average_heal_amount ?? 0) > 0) {
    facts.push(`자가 회복량 ${formatNumber(performance.average_heal_amount)}`);
  }
  const teamSustain =
    Number(performance.average_team_recover ?? 0) +
    Number(performance.average_protect_absorb ?? 0);
  if (teamSustain > 0) facts.push(`팀 회복·보호 ${formatNumber(teamSustain)}`);

  if (Number(performance.average_view_contribution ?? 0) > 0) {
    facts.push(`시야 기여 지표 ${formatNumber(performance.average_view_contribution)}`);
  } else if (Number(performance.average_vision_actions ?? 0) > 0) {
    facts.push(`카메라·콘솔 행동 ${Number(performance.average_vision_actions).toFixed(1)}회`);
  }

  if (Number(performance.average_cc_time_to_player ?? 0) > 0) {
    facts.push(`적 제어 ${Number(performance.average_cc_time_to_player).toFixed(1)}초`);
  }

  return `${nickname ? `${nickname} 님의` : "이 플레이어의"} 선택한 범위의 ${characterName} 전체 무기 사용 기록은 ` +
    `${performance.games}판이며, ${facts.join(", ")}입니다.`;
}

function sampleSentence(confidence: Recommendation["confidence"], games: number) {
  if (confidence === "low") {
    return `현재 근거 표본은 ${games}판으로 내부 최소 기준 ${ER_RECOMMEND_MIN_SAMPLE_GAMES}판보다 적어 신뢰도를 낮게 표시했습니다.`;
  }
  if (confidence === "medium") {
    return `현재 근거 표본은 ${games}판으로 최소 기준은 넘었지만, 높은 신뢰도 기준인 ${ER_RECOMMEND_HIGH_SAMPLE_GAMES}판에는 미치지 못합니다.`;
  }
  return `현재 근거 표본은 ${games}판으로 높은 신뢰도 기준 ${ER_RECOMMEND_HIGH_SAMPLE_GAMES}판을 충족합니다.`;
}

function formatPercent(value?: number) {
  return `${(Number(value ?? 0) * 100).toFixed(1)}%`;
}

function formatNumber(value?: number) {
  return Math.round(Number(value ?? 0)).toLocaleString("ko-KR");
}

function formatRank(value?: number) {
  return typeof value === "number" ? value.toFixed(2) : "-";
}

const playerAnalysisExplanationSchema = z.object({
  summary: z.string().min(1).max(700),
  strengths: z.array(z.object({
    candidateId: z.string().min(1).max(100),
    note: z.string().min(1).max(200),
    metricIds: z.array(z.string()).min(1).max(3)
  }).strict()).max(2),
  improvements: z.array(z.object({
    candidateId: z.string().min(1).max(100),
    note: z.string().min(1).max(200),
    metricIds: z.array(z.string()).min(1).max(3)
  }).strict()).max(2)
}).strict();

export async function explainPlayerAnalysis(analysis: PlayerAnalysis): Promise<PlayerAnalysis> {
  if (!process.env.OPENAI_API_KEY) return analysis;
  if (!analysis.strengths.length && !analysis.improvement_priorities.length) return analysis;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions:
        "당신은 이터널 리턴 플레이 코치다. 서버가 확정한 강점·점검 제안을 보충 설명한다. 수행 여부를 추적하거나 제안의 효과를 평가한다고 표현하지 않는다. 후보를 새로 만들거나 강점과 개선점 사이에서 이동하지 않는다. candidateId와 metricIds는 해당 후보의 값을 모두 그대로 복사한다. 제목·관측 수치·가설·행동 제안·기록 비교 안내은 서버가 표시하므로 수정하지 않는다. note에는 해당 후보를 실천할 때 참고할 짧은 설명만 쓴다. summary는 제공된 기본 요약의 의미를 유지한다. summary와 note에는 숫자·백분율·새로운 통계 판단을 쓰지 않는다. 실제 이동 경로, 특정 교전 장면, 매치업, 인과관계, 랭크 상승 보장을 만들지 않는다. 한국어 JSON 객체 하나만 반환한다.",
      input: JSON.stringify({
        confidence: analysis.scope.confidence,
        combatContext: analysis.combat_context,
        summary: analysis.ai_summary,
        feedback: analysis.feedback,
        allowedStrengths: analysis.strengths,
        allowedImprovements: analysis.improvement_priorities,
        outputShape: {
          summary: "string",
          strengths: [{ candidateId: "strength:metric_id", note: "string", metricIds: ["metric_id"] }],
          improvements: [{ candidateId: "improvement:task_id", note: "string", metricIds: ["metric_id"] }]
        }
      })
    }, { timeout: 5000 });
    const parsed = playerAnalysisExplanationSchema.parse(JSON.parse(response.output_text));
    const strengths = validateAnalysisInsights(parsed.strengths, analysis.strengths);
    const improvements = validateAnalysisInsights(parsed.improvements, analysis.improvement_priorities);
    const invalidCandidates = strengths.accepted !== parsed.strengths.length || improvements.accepted !== parsed.improvements.length;
    return {
      ...analysis,
      ai_summary: !invalidCandidates && analysis.scope.confidence !== "low" && safeCoachingText(parsed.summary)
        ? parsed.summary : analysis.ai_summary,
      strengths: strengths.items,
      improvement_priorities: improvements.items
    };
  } catch {
    return analysis;
  }
}

function validateAnalysisInsights(
  insights: { candidateId: string; note: string; metricIds: string[] }[],
  candidates: PlayerAnalysisInsight[]
) {
  const accepted = new Map<string, string>();
  for (const insight of insights) {
    const candidate = candidates.find((item) => item.id === insight.candidateId);
    if (!candidate || accepted.has(candidate.id) || !safeCoachingText(insight.note)) continue;
    const ids = new Set(insight.metricIds);
    if (ids.size !== insight.metricIds.length || ids.size !== candidate.metric_ids.length ||
        candidate.metric_ids.some((id) => !ids.has(id))) continue;
    accepted.set(candidate.id, insight.note);
  }
  return {
    accepted: accepted.size,
    items: candidates.map((candidate) => accepted.has(candidate.id)
      ? { ...candidate, coaching_note: accepted.get(candidate.id) } : candidate)
  };
}

function safeCoachingText(value: string) {
  return !/[\p{N}%％]|퍼센트|백분율|보장|반드시|확실히|때문|원인이다|원인입니다|분명|무조건/u.test(value);
}
