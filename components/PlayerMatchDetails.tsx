import type { PlayerMatchDetails as Details } from "@/lib/match-details";
export function PlayerMatchDetails({ details }: { details?: Details }) {
  if (!details) return <span className="muted">상세 미수집</span>;
  return <details className="match-record"><summary>장비·스킬·시작 정보</summary>
    <dl><div><dt>종료 장비</dt><dd>{details.equipment === null ? "미수집" : details.equipment.length ?
      details.equipment.map((item) => `${item.slot}: ${item.name ?? `아이템 ${item.code}`}`).join(" · ") : "기록 없음"}</dd></div>
      <div><dt>특성</dt><dd>{details.traits === null ? "미수집" : (details.traitNames ?? details.traits.map((code) => `특성 ${code}`)).join(" · ") || "기록 없음"}</dd></div>
      <div><dt>스킬 습득 순서</dt><dd>{details.skills === null ? "미수집" : details.skills.map((skill) =>
        `${skill.order}. ${skill.name ?? `스킬 ${skill.code}`}`).join(" → ") || "기록 없음"}</dd></div>
      <div><dt>시작 루트</dt><dd>{details.routeId ? `루트 ${details.routeId}` : "미수집"}</dd></div>
      <div><dt>시작 지역</dt><dd>{details.startAreaName ?? details.startArea ?? "미수집"}</dd></div></dl>
    <p className="muted">종료 장비와 선택한 시작 정보입니다. 실제 이동 경로나 교전 타임라인을 뜻하지 않습니다. 이름을 확인하지 못한 항목은 원본 코드로 표시합니다.</p>
  </details>;
}
