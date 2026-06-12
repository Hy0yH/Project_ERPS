import Link from "next/link";
import { SetupNotice } from "@/components/SetupNotice";
import { displayPercent, displayRank, getCharacterMeta } from "@/lib/data";

export default async function CharactersPage() {
  const meta = await getCharacterMeta().catch(() => []);

  return (
    <>
      <section className="page-head">
        <div>
          <h1>캐릭터 티어</h1>
          <p>최근 14일 미스릴 이상 랭크 스쿼드 기준입니다.</p>
        </div>
      </section>
      <SetupNotice />
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>티어</th>
              <th>캐릭터</th>
              <th>게임 수</th>
              <th>픽률</th>
              <th>승률</th>
              <th>TOP3</th>
              <th>평균 순위</th>
              <th>신뢰도</th>
            </tr>
          </thead>
          <tbody>
            {meta.map((item) => (
              <tr key={item.character_code}>
                <td>
                  <span className="badge">{item.tier}</span>
                </td>
                <td>
                  <Link href={`/characters/${item.character_code}`}>{item.name_ko}</Link>
                </td>
                <td>{item.games.toLocaleString()}</td>
                <td>{displayPercent(item.pick_rate)}</td>
                <td>{displayPercent(item.win_rate)}</td>
                <td>{displayPercent(item.top3_rate)}</td>
                <td>{displayRank(item.average_rank)}</td>
                <td>{(item.confidence_score * 100).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!meta.length ? <div className="empty">표시할 캐릭터 통계가 없습니다.</div> : null}
      </div>
    </>
  );
}
