import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { SetupNotice } from "@/components/SetupNotice";
import { getCharacterMeta, getTeamComps, displayPercent } from "@/lib/data";

export default async function HomePage() {
  const [meta, comps] = await Promise.all([
    safeArray(getCharacterMeta()),
    safeArray(getTeamComps([]))
  ]);
  const topMeta = meta.slice(0, 5);
  const topComps = comps.slice(0, 5);

  return (
    <>
      <section className="page-head">
        <div>
          <h1>이터널 리턴 메타 추천</h1>
          <p>미스릴 이상 랭크 스쿼드 데이터를 바탕으로 캐릭터, 조합, 패치 영향을 분석합니다.</p>
        </div>
        <Link className="button" href="/recommend">
          추천 열기
        </Link>
      </section>

      <div className="stack">
        <SetupNotice />
        <section className="panel">
          <SearchBox />
        </section>
      </div>

      <section className="grid" style={{ marginTop: 16 }}>
        <div className="panel span-4 metric">
          <span className="muted">캐릭터 표본</span>
          <strong>{meta.reduce((sum, item) => sum + item.games, 0).toLocaleString()}</strong>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">활성 티어 집계</span>
          <strong>{meta.length.toLocaleString()}</strong>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">조합 집계</span>
          <strong>{comps.length.toLocaleString()}</strong>
        </div>
      </section>

      <section className="grid" style={{ marginTop: 16 }}>
        <div className="span-6 stack">
          <h2>상위 캐릭터</h2>
          {topMeta.length ? (
            topMeta.map((item) => (
              <Link className="item-card split" href={`/characters/${item.character_code}`} key={item.character_code}>
                <strong>{item.name_ko}</strong>
                <span className="muted">
                  {item.tier} · TOP3 {displayPercent(item.top3_rate)}
                </span>
              </Link>
            ))
          ) : (
            <div className="empty">아직 스냅샷 데이터가 없습니다.</div>
          )}
        </div>
        <div className="span-6 stack">
          <h2>상위 조합</h2>
          {topComps.length ? (
            topComps.map((item) => (
              <div className="item-card split" key={item.comp_key}>
                <strong>{item.comp_key}</strong>
                <span className="muted">TOP3 {displayPercent(item.top3_rate)}</span>
              </div>
            ))
          ) : (
            <div className="empty">아직 조합 데이터가 없습니다.</div>
          )}
        </div>
      </section>
    </>
  );
}

async function safeArray<T>(promise: Promise<T[]>): Promise<T[]> {
  try {
    return await promise;
  } catch {
    return [];
  }
}
