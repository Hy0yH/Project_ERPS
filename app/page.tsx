import Link from "next/link";
import { Suspense } from "react";
import { FeatureEntries } from "@/components/FeatureEntries";
import { SnapshotStatus } from "@/components/SnapshotStatus";
import { SetupNotice } from "@/components/SetupNotice";
import { getTargetPatchKey } from "@/lib/patch-version";
import {
  getCharacterMeta,
  getSnapshotSummary,
  getTopTeamComps,
  displayPercent
} from "@/lib/data";

export const revalidate = 60;

export default function HomePage() {
  return (
    <>
      <section className="page-head hero-head">
        <div className="headline-block">
          <span className="headline-slash" aria-hidden="true" />
          <h1>이터널 리턴 메타 추천</h1>
          <p>티어표로 픽을 고르고, 최근 전적으로 내 플레이를 확인하세요.</p>
        </div>
      </section>

      <FeatureEntries />
      <SetupNotice />
      <Suspense fallback={<p className="muted" role="status">통계 갱신 기준을 확인하고 있습니다.</p>}>
        <SnapshotStatus />
      </Suspense>
      <Suspense fallback={<section className="panel" role="status" aria-busy="true">메타 통계를 불러오고 있습니다. 티어표와 플레이 피드백을 먼저 이용할 수 있습니다.</section>}>
        <HomeStatistics />
      </Suspense>
    </>
  );
}

async function HomeStatistics() {
  const [meta, topComps, snapshotSummary] = await Promise.all([
    safeArray(getCharacterMeta()),
    safeArray(getTopTeamComps()),
    safeValue(getSnapshotSummary(), null)
  ]);
  const topMeta = meta.slice(0, 5);

  return (
    <>
      <section className="metrics-strip">
        <div className="metric metric-cell">
          <span className="muted">기준 패치</span>
          <strong>v{snapshotSummary?.patch_key ?? getTargetPatchKey()}</strong>
        </div>
        <div className="metric metric-cell">
          <span className="muted">캐릭터 표본</span>
          <strong>{(snapshotSummary?.sample_players ?? meta.reduce((sum, item) => sum + item.games, 0)).toLocaleString()}</strong>
        </div>
        <div className="metric metric-cell">
          <span className="muted">조합 집계</span>
          <strong>{snapshotSummary?.comp_count.toLocaleString() ?? "집계 확인 중"}</strong>
        </div>
      </section>

      <section className="rankings-grid">
        <section className="ranking-section">
          <div className="ranking-section-head">
            <h2 className="section-title">상위 캐릭터</h2>
            <Link className="ranking-all-link" href="/characters">티어표 전체 보기 <span aria-hidden="true">→</span></Link>
          </div>
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

async function safeValue<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}
