import { BUILD_GROUPS, type BuildGroup, type BuildMeta } from "@/lib/build-stats";

const labels: Record<BuildGroup, string> = {
  items: "종료 아이템", item_sets: "종료 장비 조합", traits: "선택 특성", trait_sets: "특성 조합",
  routes: "선택 루트", tactical_skills: "전술 스킬", skill_orders: "스킬 습득 순서", start_areas: "시작 지역"
};
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function BuildMetaPanel({ meta }: { meta: BuildMeta | null }) {
  if (!meta) return <section className="panel stack"><h2>아이템·특성·루트 통계</h2><p>현재 패치의 상세 통계가 아직 없습니다. 수집과 집계가 완료되면 표시됩니다.</p></section>;
  return <section className="panel stack" aria-label="아이템 특성 루트 통계">
    <h2>아이템·특성·루트 통계</h2>
    <p>패치 {meta.patch_key} · {meta.stats.games.toLocaleString()}판 · 집계 {new Date(meta.period_end).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST</p>
    <p className="muted">사용률은 해당 정보를 확인한 경기 기준입니다. 아이템은 같은 부위, 특성은 같은 분류를 분모로 사용하며 여러 보조 특성의 사용률 합계는 100%를 넘을 수 있습니다. 종료 장비의 성적에는 생존 시간과 성장 정도도 함께 반영됩니다.</p>
    {BUILD_GROUPS.map((group) => <details key={group} open={group === "items" || group === "traits"}>
      <summary>{labels[group]} · 확인 {meta.stats.coverage[group]} / {meta.stats.games}판</summary>
      {!meta.stats.groups[group].length ? <p className="muted">확인 가능한 기록이 없습니다.</p> : <>
        <div className="build-stats-scroll" tabIndex={0} role="region" aria-label={`${labels[group]} 통계표`}>
          <table><thead><tr><th scope="col">구성</th><th scope="col">경기</th><th scope="col">사용률</th><th scope="col">승률</th><th scope="col">TOP3</th><th scope="col">평균 순위</th></tr></thead>
            <tbody>{meta.stats.groups[group].slice(0, 10).map((stat) => <tr key={stat.key}>
              <th scope="row">{stat.slot ? `${stat.slot}: ` : ""}{stat.name ?? stat.codes.join(" · ")}</th>
              <td>{stat.games} / {stat.eligible_games}{stat.sample_status === "insufficient" ? " · 표본 부족" : ""}</td>
              <td>{percent(stat.pick_rate)}</td><td>{percent(stat.win_rate)}</td><td>{percent(stat.top3_rate)}</td><td>{stat.average_rank.toFixed(2)}</td>
            </tr>)}</tbody></table>
        </div>
        <p className="muted">사용 경기 수 순 상위 {Math.min(10, meta.stats.groups[group].length)}개 / 관측 구성 {meta.stats.variant_counts[group]}개</p>
      </>}
    </details>)}
    {meta.routes.length ? <details><summary>선택 루트의 설정 확인</summary>
      <p className="muted">조회 시점의 공유 루트 설정입니다. 실제 이동 기록이나 경기 당시의 구성을 보장하지 않습니다.</p>
      {meta.routes.map((route) => <article className="item-card" key={route.route_id}><strong>{route.title} · {route.route_id}</strong>
        <p>예정 지역: {route.paths?.join(" → ") || "기록 없음"}</p><p>목표 장비: {route.target_items?.join(" · ") || "기록 없음"}</p>
        <p className="muted">조회 {new Date(route.fetched_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST</p>
      </article>)}
    </details> : null}
    {meta.patch_changes.length ? <div className="stack"><h3>사용된 아이템·특성·전술 스킬의 현재 패치 변경</h3>
      {meta.patch_changes.map((change) => <article className="item-card" key={`${change.entity_type}:${change.target_name}:${change.raw_change_text}`}>
        <strong>{change.target_name}</strong><p>{change.raw_change_text}</p>
        {change.source_url ? <a href={change.source_url} target="_blank" rel="noopener noreferrer">공식 패치노트</a> : null}
      </article>)}
      <p className="muted">공식 변경과 실제 사용 기록을 연결한 정보입니다. 해당 변경이 승률 차이의 원인이라는 뜻은 아닙니다.</p>
    </div> : null}
  </section>;
}
