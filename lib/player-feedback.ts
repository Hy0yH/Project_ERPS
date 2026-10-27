import type { PlayerAnalysis, PlayerAnalysisInsight, PlayerAnalysisMetric, PlayerAnalysisMetricId } from "@/lib/types";

type Task = { hypothesis: string; action: string };

const TASKS: Partial<Record<PlayerAnalysisMetricId, Task>> = {
  damage_per_minute: {
    hypothesis: "공격 기회를 충분히 활용했는지 확인할 필요가 있습니다. 낮은 피해량만으로 교전 판단의 원인을 확정할 수는 없습니다.",
    action: "다음 경기에서 피해를 주기 어려웠던 교전 한 번씩을 골라, 아군과 같은 대상을 공격할 수 있었는지 직접 메모해 보세요."
  },
  kill_participation: {
    hypothesis: "팀 교전에 참여할 수 있었던 시점과 위치를 확인할 필요가 있습니다. 합류가 늦었다고 단정하는 의미는 아닙니다.",
    action: "다음 경기에서 팀 교전 시작 당시 내 위치와 참여 가능 여부를 한 번씩 직접 메모해 보세요."
  },
  cc_per_minute: {
    hypothesis: "군중제어가 아군 공격으로 이어질 기회를 확인할 필요가 있습니다. 집계 수치로 스킬 적중 장면을 판단할 수는 없습니다.",
    action: "다음 경기에서 핵심 군중제어 사용 한 번씩을 골라, 아군이 이어서 공격할 수 있었는지 확인해 보세요."
  },
  credits_per_minute: {
    hypothesis: "크레딧 수급 기회를 놓친 구간이 있는지 확인할 필요가 있습니다. 수급 경로별 원인은 집계만으로 구분되지 않습니다.",
    action: "다음 경기에서 이동·대기 구간 한 번씩을 골라, 팀과 함께 할 수 있는 사냥·오브젝트·교전이 있었는지 확인해 보세요."
  },
  hunts_per_minute: {
    hypothesis: "이동 중 사냥 기회와 팀 활동 사이의 균형을 확인할 필요가 있습니다. 처치 수를 늘리는 것 자체가 목표는 아닙니다.",
    action: "다음 경기에서 교전이 없던 이동 구간 한 번씩을 골라, 팀 합류를 해치지 않는 사냥 기회가 있었는지 직접 메모해 보세요."
  },
  monster_damage_per_minute: {
    hypothesis: "팀 활동 사이에 야생동물과 오브젝트를 공격할 기회가 있었는지 확인할 필요가 있습니다.",
    action: "다음 경기에서 교전 사이 대기 구간 한 번씩을 골라, 팀과 함께 처리할 수 있는 야생동물이나 오브젝트가 있었는지 확인해 보세요."
  },
  view_contribution_per_minute: {
    hypothesis: "팀이 활동할 지역에서 시야를 확보할 기회를 확인할 필요가 있습니다. 시야 점수만으로 특정 설치나 제거 행동을 단정할 수는 없습니다.",
    action: "다음 경기에서 오브젝트 접근 한 번씩을 골라, 진입 전 확인한 시야와 확보할 수 있었던 시야를 직접 메모해 보세요."
  }
};

const GROWTH: PlayerAnalysisMetricId[] = ["credits_per_minute"];
const FARMING: PlayerAnalysisMetricId[] = ["hunts_per_minute", "monster_damage_per_minute"];

export function buildPlayerFeedback(metrics: PlayerAnalysisMetric[], candidates: PlayerAnalysisMetric[]) {
  const strengths = metrics.filter((metric) => metric.id !== "support_per_minute" &&
    reliable(metric) && Number(metric.relative_score) >= 65 && favorableDifference(metric) > 0)
    .sort((a, b) => Number(b.relative_score) - Number(a.relative_score)).slice(0, 2)
    .map((metric): PlayerAnalysisInsight => ({
      id: `strength:${metric.id}`, title: `${metric.label} 강점`, detail: observation(metric),
      metric_ids: [metric.id], hypothesis: null, action: null, review: null
    }));
  const improvements: PlayerAnalysisInsight[] = [];
  const used = new Set<PlayerAnalysisMetricId>();
  const ordered = candidates.filter((metric) => TASKS[metric.id] && reliable(metric) && Number(metric.relative_score) < 35 && favorableDifference(metric) < 0)
    .sort((a, b) => Number(a.relative_score) - Number(b.relative_score));
  for (const anchor of ordered) {
    if (used.has(anchor.id)) continue;
    const peers = ordered.filter((metric) => !used.has(metric.id) && sameScope(anchor, metric));
    const growth = peers.find((metric) => GROWTH.includes(metric.id));
    const farming = peers.find((metric) => FARMING.includes(metric.id));
    const damage = peers.find((metric) => metric.id === "damage_per_minute");
    const participation = peers.find((metric) => metric.id === "kill_participation");
    let evidence = [anchor];
    let id = anchor.id as string;
    let title = `${anchor.label} 점검`;
    let task = TASKS[anchor.id]!;

    if (damage && growth && farming && [damage, growth, farming].some((metric) => metric.id === anchor.id)) {
      id = "growth_before_combat";
      title = "전투 전 성장 공백 확인";
      evidence = [damage, growth, farming];
      task = {
        hypothesis: "피해량과 성장·파밍 지표가 함께 낮습니다. 전투 기회와 성장 과정 중 어디에 공백이 있었는지 함께 확인할 필요가 있습니다.",
        action: "다음 경기에서 불리했던 교전 한 번씩을 골라, 교전 직전 성장 상태와 그 이전의 이동·사냥 기회를 직접 메모해 보세요."
      };
    } else if (damage && participation && [damage.id, participation.id].includes(anchor.id)) {
      id = "combat_participation";
      title = "팀 교전 참여와 공격 기회 확인";
      const normalGrowth = metrics.find((metric) => GROWTH.includes(metric.id) &&
        reliable(metric) && Number(metric.relative_score) >= 45 && favorableDifference(metric) >= 0 && sameScope(anchor, metric));
      evidence = [damage, participation, ...(normalGrowth ? [normalGrowth] : [])];
      task = {
        hypothesis: `${normalGrowth ? "성장 지표는 비교 기준과 비슷하거나 높지만, " : ""}피해량과 킬 관여율은 함께 낮습니다. 팀 교전에 참여할 수 있었던 시점과 공격 대상을 점검해 보세요. 합류 지연이 원인이라고 확정할 수는 없습니다.`,
        action: "다음 경기에서 팀 교전 한 번씩을 골라, 시작 당시 내 위치·참여 가능 여부·아군과 같은 대상의 공격 가능 여부를 직접 메모해 보세요."
      };
    } else if (growth && farming && (GROWTH.includes(anchor.id) || FARMING.includes(anchor.id))) {
      id = "growth_continuity";
      title = "이동 사이 성장 기회 확인";
      evidence = [growth, farming];
      task = {
        hypothesis: "성장과 파밍 지표가 함께 낮습니다. 팀 활동 사이 성장 기회를 확인할 필요가 있습니다. 파밍 부족이 성적의 원인이라고 단정할 수는 없습니다.",
        action: "다음 경기에서 교전이 없는 이동·대기 구간 한 번씩을 골라, 팀 합류를 유지하면서 가능한 사냥이나 오브젝트 활동이 있었는지 직접 메모해 보세요."
      };
    }
    // Growth/farming measures overlap; keep the next task about a different activity.
    for (const metric of evidence) used.add(metric.id);
    if (evidence.some((metric) => Number(metric.relative_score) < 35 && (GROWTH.includes(metric.id) || FARMING.includes(metric.id)))) {
      for (const metric of peers.filter((metric) => GROWTH.includes(metric.id) || FARMING.includes(metric.id))) used.add(metric.id);
    }
    improvements.push({
      id: `improvement:${id}`, title, detail: evidence.map(observation).join(" "),
      metric_ids: evidence.map((metric) => metric.id), ...task,
      review: "같은 패치·같은 실험체와 무기의 유효 기록이 20경기 이상이면 최근 10경기와 이전 10경기의 지표를 비교합니다. 수행 여부를 추적하거나 제안 전후의 효과를 평가하는 비교는 아닙니다."
    });
    if (improvements.length === 2) break;
  }
  const actionable = metrics.filter((metric) => Boolean(TASKS[metric.id]));
  const trusted = actionable.filter(reliable);
  let status: PlayerAnalysis["feedback"]["status"] = "ready";
  let message = "관측 수치와 점검 가설을 바탕으로, 다음 경기에서 확인해 볼 행동을 최대 두 가지 제안합니다.";
  if (!improvements.length) {
    if (trusted.length < 2) {
      status = "insufficient_evidence";
      message = "현재 패치의 개인 경기 또는 비교 표본이 부족해 점검 제안을 보류합니다. 표본 부족은 약점이 없다는 의미가 아닙니다.";
    } else if (trusted.some((metric) => Number(metric.relative_score) < 35)) {
      status = "insufficient_action_evidence";
      message = "낮은 지표는 있지만 TOP3 기록과의 연관성을 뒷받침할 근거가 부족해 행동 제안을 보류합니다. 원인을 단정하지 않고 기록을 더 확인해 주세요.";
    } else if (trusted.length < actionable.length) {
      status = "insufficient_evidence";
      message = "일부 지표의 개인 경기 또는 비교 표본이 부족합니다. 확인 가능한 지표에서는 뚜렷한 약점이 없지만 전체 판단은 보류합니다.";
    } else {
      status = "no_clear_weakness";
      message = "충분한 표본으로 비교한 행동 지표에서 35점 미만의 뚜렷한 약점이 발견되지 않았습니다. 현재 플레이의 일관성과 이후 변화를 확인해 주세요.";
    }
  }
  return { strengths, improvements, state: { status, message, reliable_metrics: trusted.length, total_actionable_metrics: actionable.length } };
}

function reliable(metric: PlayerAnalysisMetric) {
  return metric.comparison_status === "available" && metric.relative_score !== null && metric.confidence !== "low" &&
    metric.player_scope.patch_key !== null && metric.player_games >= 10 &&
    metric.player_scope.current_patch_games === metric.player_games &&
    metric.player_scope.supplemental_games === 0 && metric.player_scope.unknown_patch_games === 0;
}

function favorableDifference(metric: PlayerAnalysisMetric) {
  return metric.reference_value === null ? 0 :
    (metric.value - metric.reference_value) * (metric.direction === "higher" ? 1 : -1);
}

function sameScope(a: PlayerAnalysisMetric, b: PlayerAnalysisMetric) {
  return a.player_scope.kind === b.player_scope.kind &&
    a.player_scope.character_code === b.player_scope.character_code &&
    a.player_scope.weapon_code === b.player_scope.weapon_code &&
    a.player_scope.patch_key === b.player_scope.patch_key &&
    a.player_games === b.player_games &&
    a.player_scope.current_patch_games === b.player_scope.current_patch_games &&
    a.player_scope.supplemental_games === b.player_scope.supplemental_games &&
    a.player_scope.unknown_patch_games === b.player_scope.unknown_patch_games;
}

function observation(metric: PlayerAnalysisMetric) {
  const delta = metric.delta_percent;
  const absolute = metric.delta_absolute;
  if ((delta !== null && Math.abs(delta) < 0.05) || (delta === null && absolute !== null && Math.abs(absolute) < 0.005)) {
    return `${metric.label} 지표가 비교 기준과 비슷하게 관측됩니다.`;
  }
  const difference = delta !== null
    ? `${Math.abs(delta).toFixed(1)}% ${delta >= 0 ? "높게" : "낮게"}`
    : absolute !== null ? `${Math.abs(absolute).toFixed(2)}만큼 ${absolute >= 0 ? "유리하게" : "불리하게"}` : "비슷하게";
  return `${metric.label} 지표가 비교 기준보다 ${difference} 관측됩니다.`;
}
