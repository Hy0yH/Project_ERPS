import type { PatchMetaPoint } from "@/lib/meta-history";
export function PatchMetaHistory({ points }: { points: PatchMetaPoint[] }) {
  return <section className="panel stack"><h2>패치별 성과 변화</h2>
    <p className="muted">같은 랭크 범위·실험체·무기의 보관된 패치 집계입니다. 패치마다 기간과 표본 구성이 다르며, 변경의 인과 효과나 다음 패치 성적을 예측하지 않습니다.</p>
    {points.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="패치별 실험체 통계">
      <table><thead><tr><th>패치</th><th>표본</th><th>승률</th><th>TOP3</th><th>평균 순위</th><th>이전 대비 TOP3</th></tr></thead>
        <tbody>{points.map((point, index) => {
          const previous = points[index + 1];
          const delta = previous && previous.games >= 30 && point.games >= 30 ? (point.top3Rate - previous.top3Rate) * 100 : null;
          return <tr key={point.patch}><td>v{point.patch}</td><td>{point.games.toLocaleString()}판{point.games < 30 ? " · 표본 부족" : ""}</td>
            <td>{(point.winRate * 100).toFixed(1)}%</td><td>{(point.top3Rate * 100).toFixed(1)}%</td><td>{point.averageRank.toFixed(2)}위</td>
            <td>{delta === null ? "비교 보류" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%p`}</td></tr>;
        })}</tbody></table></div> : <p>보관된 패치 집계가 없습니다.</p>}
  </section>;
}
