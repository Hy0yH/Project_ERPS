import type { PlayerAnalysis, PlayerAnalysisDimensionKey, PlayerAnalysisStatistics } from "@/lib/types";
import { PlayerMatchDetails } from "@/components/PlayerMatchDetails";

const GROUPS: Array<[PlayerAnalysisDimensionKey, string]> = [
  ["combat", "전투"], ["growth", "성장·크레딧"], ["farming", "파밍"],
  ["team", "팀·회복"], ["vision", "시야"], ["stability", "생존·경기 결과"]
];

export function PlayerStatisticsHighlights({ statistics }: { statistics: PlayerAnalysisStatistics }) {
  const items = ["damage_dealt", "deaths", "credits_spent", "top3_rate"];
  return <section className="analysis-overview-grid" aria-label="전체 경기의 실제 평균">
    {items.map((id) => {
      const metric = statistics.metrics.find((value) => value.id === id)!;
      return <div className="analysis-overview-card" key={id}>
        <span>{metric.label}{metric.unit === "percent" ? "" : " · 경기당"}</span>
        <strong>{formatStatistic(metric.value, metric.unit)}</strong>
        <small>전체 기록 중 {metric.sample_games}/{statistics.games}판</small>
      </div>;
    })}
  </section>;
}

export function PlayerStatisticsPanel({ analysis }: { analysis: PlayerAnalysis }) {
  const { statistics } = analysis;
  return <section className="panel analysis-statistics" aria-labelledby="analysis-statistics-title">
    <div className="analysis-section-head compact">
      <div><span className="page-kicker">MATCH STATISTICS</span><h2 id="analysis-statistics-title">전체 {statistics.games}경기의 실제 지표</h2></div>
      <span className="muted">현재 패치 · 경기당 평균</span>
    </div>
    <p>{analysis.scope.selected_pick_key && analysis.scope.selected_pick_key !== "all" ? "선택한 실험체·무기 범위의 실제 평균입니다." : "여러 픽을 포함한 전체 분석 경기의 평균입니다. 아래 비교 점수의 주력 픽 표본과 다를 수 있습니다."} 값이 없는 경기는 해당 지표에서 제외하며, 0으로 채우지 않습니다.</p>
    <p className="analysis-statistics-note">활동 시간과 관전 시간을 구분합니다. 종료 레벨을 시간으로 나눈 값은 실제 성장 속도가 아니므로 성장 점수와 점검 제안에 사용하지 않습니다. 실제 RP 증감은 유효한 경기 전후 RP 차이를 우선하며, 전후 값이 없거나 0이면 공식 증감 값을 사용합니다.</p>
    <div className="analysis-statistics-groups">
      {GROUPS.map(([key, label]) => <details key={key} open={key === "combat"}>
        <summary>{label}<span>{statistics.metrics.filter((metric) => metric.group === key && metric.value !== null).length}개 지표 수집</span></summary>
        <dl>{statistics.metrics.filter((metric) => metric.group === key).map((metric) => <div key={metric.id}>
          <dt>{metric.label}</dt><dd>{formatStatistic(metric.value, metric.unit)}</dd>
          <small>유효 {metric.sample_games}/{statistics.games}판</small>
        </div>)}</dl>
      </details>)}
    </div>
    <details className="analysis-match-details"><summary>분석에 사용한 경기 {analysis.recent_matches.length}판 확인</summary>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="분석에 사용한 경기 목록">
        <table><thead><tr><th>경기</th><th>시작 시각 (KST)</th><th>실험체·무기</th><th>순위</th><th>가한 피해</th><th>사망</th><th>활동 시간</th><th>실제 RP</th><th>경기 상세</th></tr></thead>
          <tbody>{analysis.recent_matches.map((match, index) => {
            const pick = analysis.pick_profile.picks.find((value) => value.character_code === match.character_code && value.weapon_code === match.weapon_code);
            return <tr key={`${match.game_id}:${index}`}><td>{match.game_id || "미확인"}</td>
              <td>{formatMatchDate(match.started_at)}</td><td>{pick ? `${pick.character_name} · ${pick.weapon_name}` : match.character_code}</td>
              <td>{match.rank}위</td><td>{formatStatistic(match.damage, "count")}</td><td>{formatStatistic(match.deaths, "count")}</td>
              <td>{formatStatistic(match.active_seconds === null ? null : match.active_seconds / 60, "minutes")}</td>
              <td>{formatStatistic(match.mmr_gain, "mmr")}</td><td><PlayerMatchDetails details={match.details} /></td></tr>;
          })}</tbody></table>
      </div>
    </details>
  </section>;
}

function formatStatistic(value: number | null, unit: PlayerAnalysisStatistics["metrics"][number]["unit"]) {
  if (value === null) return "미수집";
  if (unit === "percent") return `${(value * 100).toFixed(1)}%`;
  const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
  if (unit === "minutes") return `${number}분`;
  if (unit === "seconds") return `${number}초`;
  if (unit === "mmr") return `${value > 0 ? "+" : ""}${number}`;
  if (unit === "rank") return `${number}위`;
  return number;
}

function formatMatchDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "미확인" : new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(date);
}
