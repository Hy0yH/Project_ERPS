import Link from "next/link";
import { SetupNotice } from "@/components/SetupNotice";
import { displayPercent, displayRank, getCharacterMeta } from "@/lib/data";
import { RANK_SCOPE_OPTIONS, parseRankScope, rankScopeLabel } from "@/lib/rank-scopes";
import { browseCharacters, CHARACTER_SORTS, characterBrowseParams, parseCharacterBrowse, type CharacterBrowseQuery } from "@/lib/character-browser";

export default async function CharactersPage({
  searchParams
}: {
  searchParams: Promise<CharacterBrowseQuery>;
}) {
  const params = await searchParams;
  const query = parseCharacterBrowse(params);
  const rankScope = query.rankScope;
  const allMeta = await getCharacterMeta(14, rankScope);
  const meta = browseCharacters(allMeta, query);
  const weapons = [...new Map(allMeta.map((item) => [item.weapon_code, item.weapon_name])).entries()];
  const detailParams = characterBrowseParams(query);
  detailParams.delete("weapon");

  return (
    <>
      <section className="page-head">
        <div className="headline-block">
          <span className="headline-slash" aria-hidden="true" />
          <h1>실험체 티어표</h1>
          <p>현재 패치의 {rankScopeLabel(rankScope)} 랭크 스쿼드 표본입니다. 수집된 경기의 통계이며 전체 랭크 모집단을 의미하지 않습니다.</p>
        </div>
      </section>
      <SetupNotice />
      <form className="panel browse-controls" method="get" style={{ marginTop: 16 }}>
        <label><span className="field-label">실험체·무기 검색</span><input name="q" defaultValue={query.q} maxLength={60} placeholder="이름 또는 무기" /></label>
        <label>
          <span className="field-label">랭크 표본 기준</span>
          <select name="rankScope" defaultValue={rankScope}>
            {RANK_SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label><span className="field-label">무기</span><select name="weapon" defaultValue={query.weapon || ""}>
          <option value="">전체 무기</option>{weapons.map(([code, name]) => <option value={code} key={code}>{name}</option>)}
        </select></label>
        <label><span className="field-label">정렬 기준</span><select name="sort" defaultValue={query.sort}>
          {CHARACTER_SORTS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select></label>
        <label><span className="field-label">최소 표본</span><select name="minGames" defaultValue={query.minGames}>
          {[0, 30, 100, 300].map((count) => <option value={count} key={count}>{count ? `${count}판 이상` : "모든 표본"}</option>)}
        </select></label>
        <button type="submit">기준 적용</button>
        <Link className="muted" href="/characters">조건 초기화</Link>
      </form>
      <p className="muted" role="status">전체 {allMeta.length}개 실험체·무기 중 {meta.length}개 · 표본이 적은 지표는 변동이 클 수 있습니다.</p>
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="tier-table">
          <thead>
            <tr>
              <th>티어</th>
              <th>캐릭터</th>
              <th>게임 수</th>
              <th>픽률</th>
              <th>승률</th>
              <th>TOP3</th>
              <th>평균 순위</th>
              <th>표본 상태</th>
            </tr>
          </thead>
          <tbody>
            {meta.map((item) => (
              <tr key={`${item.character_code}:${item.weapon_code}`}>
                <td>
                  {item.tier === "-" ? (
                    <span className="muted">표본 부족</span>
                  ) : (
                    <span className={`badge tier-${item.tier.toLowerCase()}`}>{item.tier}</span>
                  )}
                </td>
                <td>
                  <Link href={`/characters/${item.character_code}?${detailParams.toString()}&weapon=${item.weapon_code}`}>
                    {item.display_name}
                  </Link>
                </td>
                <td>{item.games.toLocaleString()}</td>
                <td>{displayPercent(item.pick_rate)}</td>
                <td>{displayPercent(item.win_rate)}</td>
                <td>{displayPercent(item.top3_rate)}</td>
                <td>{displayRank(item.average_rank)}</td>
                <td>{sampleStatusLabel(item.sample_status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!meta.length ? <div className="empty">{allMeta.length ? "검색 조건에 맞는 실험체가 없습니다. 조건을 바꿔 확인해 주세요." : "현재 기준으로 집계된 캐릭터 통계가 없습니다."}</div> : null}
      </div>
    </>
  );
}

function sampleStatusLabel(status: "insufficient" | "provisional" | "standard" | "high") {
  if (status === "insufficient") return "부족 (<30)";
  if (status === "provisional") return "잠정 (30~99)";
  if (status === "standard") return "정식 (100~299)";
  return "높음 (300+)";
}
