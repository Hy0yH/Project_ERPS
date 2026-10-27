import { PICK_GRADE_BANDS, PICK_GRADE_MIN_GAMES } from "@/lib/player-pick-evaluation";
import type { PlayerAnalysis, PlayerAnalysisPick } from "@/lib/types";

export function PlayerPickRatings({ analysis }: { analysis: PlayerAnalysis }) {
  const picks = [...analysis.pick_profile.picks].sort((a, b) => b.games - a.games);
  const mostPlayed = picks.slice(0, 3);
  const otherPicks = picks.slice(3);
  const rated = picks.filter((pick) => pick.evaluation.grade !== null).length;
  return <section className="analysis-section pick-ratings" aria-labelledby="pick-ratings-title">
    <div className="analysis-section-head">
      <div><span className="page-kicker">PERSONAL PICK RATINGS</span><h2 id="pick-ratings-title">사용 실험체 성적 등급</h2></div>
      <span className="muted">총 {picks.length}개 실험체·무기 · 등급 {rated}개</span>
    </div>
    <p className="pick-rating-intro">현재 패치 최근 {analysis.scope.analyzed_games}경기 안에서 이 플레이어가 사용한 실험체·무기를 평가합니다.
      확보한 경기와 비교 기록을 바탕으로 계산하며, 기록이 쌓이면 등급도 달라집니다.</p>
    <details className="pick-rating-guide">
      <summary>등급 구간과 평가 기준 보기</summary>
      <p>평균 순위 50% · TOP3 비율 35% · 승률 15%. 비교 기록이 있으면 플레이어별 백분위를 표본 수에 따라 중간 점수 50 쪽으로 보정한 뒤 합산합니다.
        피해량·사망·RP는 해당 실험체의 플레이 기록으로 함께 표시합니다.</p>
      <p>현재 패치 {PICK_GRADE_MIN_GAMES}판부터 등급을 표시하고, 등급 확정에 필요한 추가 경기 수를 안내합니다.
        기록이 적을수록 점수를 보수적으로 보정합니다. 등급 확정 기준은 개인 20판 이상과 충분한 비교 표본이며, 비교군은 지표별 최소 50경기·30명이 필요합니다.</p>
      <p>비교 기록이 없으면 개인 경기 결과로 계산합니다. 평균 순위는 1~8위를 100~0점으로, TOP3와 승률은 0~100점으로 환산한 뒤 개인 경기 수로 보정합니다.</p>
      <ul className="pick-grade-scale" aria-label="실험체 성적 등급 구간">
        {PICK_GRADE_BANDS.map((band, index) => <li key={band.grade}>
          <strong className={`pick-grade-text grade-${band.grade[0].toLowerCase()}`}>{band.grade}</strong>
          <span>{band.minimum}{index === 0 ? "–100점" : `–${PICK_GRADE_BANDS[index - 1].minimum}점 미만`}</span>
        </li>)}
      </ul>
      <p className="muted">서로 다른 역할도 같은 경기 결과 기준으로 평가합니다. 각 실험체의 전투·지원 특성은 아래 상세 지표와 함께 확인하세요.</p>
    </details>
    <div className="pick-rating-grid">
      {mostPlayed.map((pick, index) => <PickRatingCard key={`${pick.character_code}:${pick.weapon_code}`} pick={pick} position={index + 1} />)}
    </div>
    {otherPicks.length ? <details className="pick-rating-more">
      <summary><span className="pick-more-closed">다른 실험체 펼쳐보기</span><span className="pick-more-open">다른 실험체 접기</span><span>{otherPicks.length}개</span></summary>
      <div className="pick-rating-compact-list">
        {otherPicks.map((pick) => <details className="pick-rating-compact-row" key={`${pick.character_code}:${pick.weapon_code}`}>
          <summary><div className="pick-rating-compact-head">
            <GradeBadge pick={pick} compact />
            <div><strong>{pickName(pick)}</strong><span>{pick.games}판 · {pick.evaluation.score?.toFixed(1) ?? "—"}점 · TOP3 {(pick.top3_rate * 100).toFixed(1)}%</span>
              <span>{pick.evaluation.reason}</span></div>
            <span className="pick-compact-chevron" aria-hidden="true">⌄</span>
          </div></summary>
          <div className="pick-rating-compact-body"><PickRecords pick={pick} /><PickEvidence pick={pick} /></div>
        </details>)}
      </div>
    </details> : null}
  </section>;
}

function PickRatingCard({ pick, position }: { pick: PlayerAnalysisPick; position: number }) {
  const evaluation = pick.evaluation;
  return <article className="pick-rating-card" aria-label={pickName(pick)}>
          <span className="pick-rating-most">모스트 {position}</span>
          <header>
            <div><h3>{pickName(pick)}</h3><span>{pick.games}판 · 사용 비율 {(pick.pick_rate * 100).toFixed(1)}%</span></div>
            <div className="pick-grade-wrap">
              <GradeBadge pick={pick} />
              <span>성적 등급{evaluation.score === null ? "" : ` · ${evaluation.score.toFixed(1)}점`}</span>
            </div>
          </header>
          <p className="pick-rating-reason">{evaluation.reason}</p>
          <PickRecords pick={pick} />
          <PickEvidence pick={pick} />
        </article>;
}

function PickRecords({ pick }: { pick: PlayerAnalysisPick }) {
  const evaluation = pick.evaluation;
  return <><dl className="pick-rating-results">
            <div><dt>승률</dt><dd>{(pick.win_rate * 100).toFixed(1)}%</dd></div>
            <div><dt>TOP3</dt><dd>{(pick.top3_rate * 100).toFixed(1)}%</dd></div>
            <div><dt>평균 순위</dt><dd>{pick.average_rank.toFixed(2)}위</dd></div>
          </dl>
          <dl className="pick-rating-records">
            <div><dt>분당 피해</dt><dd>{format(evaluation.details.damage_per_minute)}</dd></div>
            <div><dt>경기당 사망</dt><dd>{format(evaluation.details.deaths_per_game)}</dd></div>
            <div><dt>평균 실제 RP</dt><dd>{evaluation.details.mmr_gain_per_game !== null && evaluation.details.mmr_gain_per_game > 0 ? "+" : ""}{format(evaluation.details.mmr_gain_per_game)}</dd></div>
          </dl></>;
}

function PickEvidence({ pick }: { pick: PlayerAnalysisPick }) {
  const evaluation = pick.evaluation;
  return <details className="pick-rating-evidence"><summary>평가 근거 확인</summary>
            <p>실험체·무기별 개인 {pick.games}판 · {evaluation.basis === "mmr_results" ? "비슷한 MMR대 전체 픽의 플레이어별 성적과 비교" : "개인 경기 결과를 순위 환산 기준으로 평가"}</p>
            {evaluation.metrics.map((metric) => <div className="pick-rating-metric" key={metric.id}>
              <strong>{metric.label} <span>{Math.round(metric.weight * 100)}%</span></strong>
              <span>내 수치 {metric.id === "average_rank" ? `${metric.value.toFixed(2)}위` : `${(metric.value * 100).toFixed(1)}%`}
                {metric.reference_mean === null ? "" : ` · 비교 평균 ${metric.id === "average_rank" ? `${metric.reference_mean.toFixed(2)}위` : `${(metric.reference_mean * 100).toFixed(1)}%`}`}</span>
              <span>{metric.sample_games}경기·{metric.sample_players}명{metric.adjusted_score === null ? " · 점수 보류" : ` · 보정 점수 ${metric.adjusted_score.toFixed(1)}`}</span>
            </div>)}
          </details>;
}

function pickName(pick: PlayerAnalysisPick) {
  return `${pick.character_name} · ${pick.weapon_name || `무기 ${pick.weapon_code}`}`;
}

function GradeBadge({ pick, compact = false }: { pick: PlayerAnalysisPick; compact?: boolean }) {
  const grade = pick.evaluation.grade;
  return <strong className={`pick-grade-badge ${compact ? "pick-grade-compact " : ""}${grade ? `grade-${grade[0].toLowerCase()}` : "grade-pending"}`}
    aria-label={`${pickName(pick)} 성적 등급 ${grade ?? "기록 확인 중"}`}>{grade ?? "—"}</strong>;
}

function format(value: number | null) {
  return value === null ? "미수집" : new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
}
