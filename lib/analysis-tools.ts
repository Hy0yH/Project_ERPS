import type { PlayerAnalysis } from "@/lib/types";

export type AnalysisHistoryEntry = {
  id: string; nickname: string; season: number; patch: string | null; pick: string; generatedAt: string;
  version: number | null; games: number; gameIds: number[]; metrics: PlayerAnalysis["statistics"]["metrics"];
  note: string;
};
export function historyEntry(analysis: PlayerAnalysis, note = ""): AnalysisHistoryEntry {
  const pick = analysis.scope.selected_pick_key ?? "all";
  return { id: `${analysis.player.nickname}:${analysis.generated_at}:${pick}`, nickname: analysis.player.nickname,
    season: analysis.scope.season_id, patch: analysis.scope.patch_key, pick, generatedAt: analysis.generated_at,
    version: analysis.scope.analysis_version ?? null, games: analysis.scope.analyzed_games,
    gameIds: analysis.recent_matches.map((match) => match.game_id).filter((id) => Number.isSafeInteger(id) && id > 0),
    metrics: analysis.statistics.metrics, note: note.trim().slice(0, 500) };
}
export function readHistory(value: string | null): AnalysisHistoryEntry[] {
  try {
    const raw: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry): entry is AnalysisHistoryEntry => entry && typeof entry.id === "string" &&
      typeof entry.nickname === "string" && typeof entry.pick === "string" && /^(all|\d+:\d+)$/.test(entry.pick) && Number.isSafeInteger(entry.season) &&
      (entry.patch === null || typeof entry.patch === "string") && (entry.version === null || Number.isSafeInteger(entry.version) && entry.version > 0) &&
      Number.isSafeInteger(entry.games) && entry.games > 0 && entry.games <= 50 &&
      Number.isFinite(Date.parse(entry.generatedAt)) && Array.isArray(entry.gameIds) && entry.gameIds.length <= 50 &&
      entry.gameIds.every((id: unknown) => Number.isSafeInteger(id) && Number(id) > 0) && Array.isArray(entry.metrics) &&
      entry.metrics.length <= 50 && entry.metrics.every((metric: Record<string, unknown>) => metric && typeof metric.id === "string" &&
        typeof metric.label === "string" && ["count", "minutes", "seconds", "mmr", "percent", "rank"].includes(String(metric.unit)) &&
        (metric.value === null || typeof metric.value === "number" && Number.isFinite(metric.value))))
      .slice(0, 20).map((entry) => ({ ...entry, note: typeof entry.note === "string" ? entry.note.slice(0, 500) : "" }));
  } catch { return []; }
}
export function compareHistory(before: AnalysisHistoryEntry, after: AnalysisHistoryEntry) {
  if (before.nickname.toLocaleLowerCase("ko-KR") !== after.nickname.toLocaleLowerCase("ko-KR") ||
      before.season !== after.season || !before.patch || before.patch !== after.patch || before.pick !== after.pick)
    return { reason: "같은 플레이어·시즌·패치·픽 범위의 기록을 선택해 주세요.", changes: [] };
  if (!before.version || before.version !== after.version) return { reason: "분석 계산 버전이 달라 직접 비교하지 않습니다.", changes: [] };
  if (Date.parse(before.generatedAt) >= Date.parse(after.generatedAt)) return { reason: "이전 기록과 이후 기록의 순서를 확인해 주세요.", changes: [] };
  if (!before.gameIds.length || !after.gameIds.length || before.gameIds.length !== before.games || after.gameIds.length !== after.games)
    return { reason: "분석 경기 목록이 완전하지 않아 비교를 보류합니다.", changes: [] };
  if (before.gameIds.some((id) => after.gameIds.includes(id))) return { reason: "두 기록에 겹치는 경기가 있어 독립 기간 비교를 보류합니다.", changes: [] };
  const changes = after.metrics.flatMap((metric) => {
    const previous = before.metrics.find((item) => item.id === metric.id && item.unit === metric.unit);
    return previous?.value != null && metric.value != null ? [{ label: metric.label, before: previous.value,
      after: metric.value, delta: metric.value - previous.value, unit: metric.unit }] : [];
  });
  return { reason: "겹치지 않는 기록의 관측 변화입니다. 점검 행동의 수행 여부나 제안의 효과를 평가하지 않습니다.", changes };
}
export function analysisCsv(analysis: PlayerAnalysis) {
  const cell = (value: string | number | null) => {
    let text = value === null ? "미수집" : String(value);
    if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return "\uFEFF" + [["플레이어", "시즌", "패치", "분석 시각", "계산 버전", "픽 범위", "지표", "단위", "값", "유효 경기", "분석 경기"],
    ...analysis.statistics.metrics.map((metric) => [analysis.player.nickname, analysis.scope.season_id,
      analysis.scope.patch_key, analysis.generated_at, analysis.scope.analysis_version ?? null, analysis.scope.selected_pick_key ?? "all", metric.label,
      metric.unit, metric.value, metric.sample_games, analysis.scope.analyzed_games])].map((row) => row.map(cell).join(",")).join("\r\n");
}
export function answerAnalysisQuestion(question: string, analysis: PlayerAnalysis) {
  const text = question.trim().slice(0, 200);
  const scope = `현재 패치 ${analysis.scope.patch_key ?? "미확인"}, 선택 범위 ${analysis.scope.analyzed_games}판`;
  if (/영상|리플레이|이동.?경로|교전.?장면|원인|왜.*(졌|죽)/.test(text))
    return { answer: `${scope}의 종료 통계로 실제 장면이나 패배 원인을 확정할 수 없습니다. 경기 상세의 장비·시작 정보와 관측 지표를 함께 확인해 주세요.`, sources: ["분석 범위와 한계"] };
  if (/표본|신뢰|보류|기준/.test(text)) return { answer: `${scope}입니다. 비교군 전체 ${analysis.benchmark_coverage.overall_games}경기·${analysis.benchmark_coverage.overall_players}명, 같은 픽 ${analysis.benchmark_coverage.same_pick_games}경기·${analysis.benchmark_coverage.same_pick_players}명입니다. ${analysis.feedback.message}`, sources: ["비교 표본", "점검 제안 상태"] };
  if (/추천|개선|점검|해야|행동/.test(text)) return { answer: analysis.improvement_priorities.length ?
    analysis.improvement_priorities.map((item) => `${item.title}: ${item.detail} ${item.action ?? ""}`).join("\n\n") : analysis.feedback.message,
    sources: ["최근 전적 기반 점검 제안"] };
  const group = /전투|피해|킬|사망/.test(text) ? "combat" : /성장|크레딧|제작/.test(text) ? "growth" :
    /파밍|동물/.test(text) ? "farming" : /시야|카메라/.test(text) ? "vision" : /회복|지원|보호/.test(text) ? "team" : /순위|승률|TOP3|결과/i.test(text) ? "stability" : null;
  const metrics = analysis.statistics.metrics.filter((metric) => group ? metric.group === group : text.includes(metric.label)).slice(0, 5);
  if (!metrics.length) return { answer: "전투·성장·파밍·시야·표본·점검 제안에 대해 질문해 주세요. 현재 기록에서 확인할 수 있는 근거만 안내합니다.", sources: [] };
  const units = { count: "", minutes: "분", seconds: "초", mmr: "RP", percent: "%", rank: "위" };
  return { answer: `${scope}의 실제 관측값입니다.\n` + metrics.map((metric) => `${metric.label}: ${metric.value === null ? "미수집" :
    (metric.unit === "percent" ? `${(metric.value * 100).toFixed(1)}%` : `${metric.value.toFixed(2)}${units[metric.unit]}`)} · 유효 ${metric.sample_games}판`).join("\n"),
    sources: ["실제 지표", "유효 경기 수"] };
}
