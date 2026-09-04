import OpenAI from "openai";
import { z } from "zod";
import {
  ER_RECOMMEND_HIGH_SAMPLE_GAMES,
  ER_RECOMMEND_MIN_SAMPLE_GAMES
} from "@/lib/env";
import { isKnownAnalysisMetricId } from "@/lib/player-analysis";
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
    `이번 시즌 상위권 ${formatNumber(metrics.metaGames)}판에서 ${characterName}의 기록은 ` +
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

  return `${nickname ? `${nickname} 님의` : "이 플레이어의"} 이번 시즌 ${characterName} 사용 기록은 ` +
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
    title: z.string().min(1).max(80),
    detail: z.string().min(1).max(350),
    metricIds: z.array(z.string()).min(1).max(3)
  })).max(2),
  improvements: z.array(z.object({
    title: z.string().min(1).max(80),
    detail: z.string().min(1).max(350),
    metricIds: z.array(z.string()).min(1).max(3)
  })).max(3)
});

export async function explainPlayerAnalysis(analysis: PlayerAnalysis): Promise<PlayerAnalysis> {
  if (!process.env.OPENAI_API_KEY) return analysis;

  const allowedMetricIds = new Set(
    analysis.dimensions.filter((dimension) => dimension.key !== "team").flatMap((dimension) =>
      dimension.metrics
        .filter((metric) => metric.comparison_status === "available")
        .map((metric) => metric.id)
    )
  );
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions:
        "당신은 이터널 리턴 플레이 코치다. 입력의 집계 수치와 허용된 후보만 사용한다. 실제 이동 경로, 특정 교전 장면, 매치업, 인과관계, 랭크 상승 보장을 만들지 않는다. 한국어 JSON 객체 하나만 반환하며 모든 강점과 조언에는 근거 metricIds를 하나 이상 포함한다. summary, strengths, improvements 이외의 키를 만들지 않는다.",
      input: JSON.stringify({
        confidence: analysis.scope.confidence,
        pickProfile: analysis.pick_profile,
        combatContext: analysis.combat_context,
        metrics: analysis.dimensions.filter((dimension) => dimension.key !== "team").flatMap((dimension) =>
          dimension.metrics
            .filter((metric) => metric.comparison_status === "available")
            .map((metric) => ({
            id: metric.id,
            label: metric.label,
            value: metric.value,
            referenceValue: metric.reference_value,
            referenceType: metric.reference_type,
            deltaPercent: metric.delta_percent,
            deltaAbsolute: metric.delta_absolute,
            relativeScore: metric.relative_score,
            confidence: metric.confidence,
            playerGames: metric.player_games,
            samplePlayers: metric.sample_players
          }))
        ),
        allowedStrengths: analysis.strengths,
        allowedImprovements: analysis.improvement_priorities,
        outputShape: {
          summary: "string",
          strengths: [{ title: "string", detail: "string", metricIds: ["metric_id"] }],
          improvements: [{ title: "string", detail: "string", metricIds: ["metric_id"] }]
        }
      })
    }, { timeout: 5000 });
    const parsed = playerAnalysisExplanationSchema.parse(JSON.parse(response.output_text));
    const strengths = validateAnalysisInsights(parsed.strengths, allowedMetricIds);
    const improvements = validateAnalysisInsights(parsed.improvements, allowedMetricIds);
    return {
      ...analysis,
      ai_summary: parsed.summary,
      strengths: strengths.length ? strengths : analysis.strengths,
      improvement_priorities: improvements.length
        ? improvements
        : analysis.improvement_priorities
    };
  } catch {
    return analysis;
  }
}

function validateAnalysisInsights(
  insights: { title: string; detail: string; metricIds: string[] }[],
  allowedMetricIds: Set<string>
): PlayerAnalysisInsight[] {
  return insights.flatMap((insight) => {
    const metricIds = insight.metricIds
      .filter((id) => allowedMetricIds.has(id))
      .filter(isKnownAnalysisMetricId);
    if (!metricIds.length) return [];
    return [{
      title: insight.title,
      detail: insight.detail,
      metric_ids: metricIds
    }];
  });
}
