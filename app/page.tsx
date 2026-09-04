import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { SetupNotice } from "@/components/SetupNotice";
import {
  getCharacterMeta,
  getSnapshotSummary,
  getTeamComps,
  getTeamCompCount,
  displayPercent
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [meta, comps, compCount, snapshotSummary] = await Promise.all([
    safeArray(getCharacterMeta()),
    safeArray(getTeamComps([])),
    safeNumber(getTeamCompCount()),
    safeValue(getSnapshotSummary(), null)
  ]);
  const topMeta = meta.slice(0, 5);
  const topComps = comps.slice(0, 5);

  return (
    <>
      <section className="page-head hero-head">
        <div className="headline-block">
          <span className="headline-slash" aria-hidden="true" />
          <h1>이터널 리턴 메타 추천</h1>
          <p>랭크 데이터로 더 나은 선택을</p>
        </div>
      </section>

      <div className="stack">
        <SetupNotice />
        <section className="panel search-panel">
          <SearchBox />
        </section>
      </div>

      <section className="metrics-strip">
        <div className="metric metric-cell">
          <span className="muted">기준 패치</span>
          <strong>{snapshotSummary?.patch_key ? `v${snapshotSummary.patch_key}` : "-"}</strong>
        </div>
        <div className="metric metric-cell">
          <span className="muted">캐릭터 표본</span>
          <strong>{(snapshotSummary?.sample_players ?? meta.reduce((sum, item) => sum + item.games, 0)).toLocaleString()}</strong>
        </div>
        <div className="metric metric-cell">
          <span className="muted">활성 티어 집계</span>
          <strong>{meta.length.toLocaleString()}</strong>
        </div>
        <div className="metric metric-cell">
          <span className="muted">조합 집계</span>
          <strong>{(snapshotSummary?.comp_count ?? compCount).toLocaleString()}</strong>
        </div>
      </section>

      <section className="rankings-grid">
        <section className="ranking-section">
          <h2 className="section-title">상위 캐릭터</h2>
          <div className="ranking-panel">
            {topMeta.length ? topMeta.map((item, index) => (
              <Link
                className="ranking-row"
                href={`/characters/${item.character_code}?weapon=${item.weapon_code}`}
                key={`${item.character_code}:${item.weapon_code}`}
              >
                <span className="rank-number">{index + 1}</span>
                <strong className="item-title">
                  <span className={`badge tier-${item.tier.toLowerCase()}`}>{item.tier}</span>
                  {item.display_name}
                </strong>
                <span className="muted item-stats">
                  TOP3 {displayPercent(item.top3_rate)} ·{" "}
                  <strong className="stat-strong">승률 {displayPercent(item.win_rate)}</strong> ·{" "}
                  {item.games.toLocaleString()}게임
                </span>
              </Link>
            )) : <div className="empty">아직 스냅샷 데이터가 없습니다.</div>}
          </div>
        </section>
        <section className="ranking-section">
          <h2 className="section-title">상위 조합</h2>
          <div className="ranking-panel">
            {topComps.length ? topComps.map((item, index) => (
              <div className="ranking-row" key={`${item.comp_key}:${item.character_weapon_keys.join("|")}`}>
                <span className="rank-number">{index + 1}</span>
                <strong className="item-title">
                  <span className={`badge tier-${item.tier.toLowerCase()}`}>{item.tier}</span>
                  {item.comp_name}
                </strong>
                <span className="muted item-stats">
                  TOP3 {displayPercent(item.top3_rate)} ·{" "}
                  <strong className="stat-strong">승률 {displayPercent(item.win_rate)}</strong> ·{" "}
                  {item.games.toLocaleString()}게임
                </span>
              </div>
            )) : <div className="empty">아직 조합 데이터가 없습니다.</div>}
          </div>
        </section>
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

async function safeNumber(promise: Promise<number>): Promise<number> {
  try {
    return await promise;
  } catch {
    return 0;
  }
}

async function safeValue<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}
