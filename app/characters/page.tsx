import Link from "next/link";
import { SetupNotice } from "@/components/SetupNotice";
import { displayPercent, displayRank, getCharacterMeta } from "@/lib/data";
import { RANK_SCOPE_OPTIONS, parseRankScope, rankScopeLabel } from "@/lib/rank-scopes";

export default async function CharactersPage({
  searchParams
}: {
  searchParams: Promise<{ rankScope?: string }>;
}) {
  const params = await searchParams;
  const rankScope = parseRankScope(params.rankScope);
  const meta = await getCharacterMeta(14, rankScope).catch(() => []);

  return (
    <>
      <section className="page-head">
        <div className="headline-block">
          <span className="headline-slash" aria-hidden="true" />
          <h1>캐릭터 티어</h1>
          <p>최근 14일 {rankScopeLabel(rankScope)} 랭크 스쿼드 표본입니다.</p>
        </div>
      </section>
      <SetupNotice />
      <form className="panel split" method="get" style={{ marginTop: 16 }}>
        <label>
          <span className="field-label">랭크 표본 기준</span>
          <select name="rankScope" defaultValue={rankScope}>
            {RANK_SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button type="submit">기준 적용</button>
      </form>
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
                  <Link href={`/characters/${item.character_code}`}>{item.display_name}</Link>
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
        {!meta.length ? <div className="empty">표시할 캐릭터 통계가 없습니다.</div> : null}
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
