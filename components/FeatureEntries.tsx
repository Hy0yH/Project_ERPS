import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";

export function FeatureEntries() {
  return (
    <section className="feature-entries" aria-label="티어표와 플레이 피드백">
      <Link className="feature-entry tier-entry" href="/characters" aria-labelledby="tier-entry-title">
        <div className="feature-entry-head">
          <span className="feature-entry-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20V12H8V20M10 20V4H14V20M16 20V8H20V20M3 20H21" />
            </svg>
          </span>
          <span className="page-kicker">CHARACTER TIERS</span>
        </div>
        <h2 id="tier-entry-title">실험체 티어표</h2>
        <p>지금 어떤 픽이 좋을까요? 실험체·무기별 티어와 승률을 랭크 구간별로 확인하세요.</p>
        <div className="feature-entry-footer">
          <span className="button secondary">티어표 바로 보기 <span aria-hidden="true">→</span></span>
          <span className="feature-entry-hint">닉네임 없이 바로 확인</span>
        </div>
      </Link>
      <article className="feature-entry feedback-entry" aria-labelledby="feedback-entry-title">
        <div className="feature-entry-head">
          <span className="feature-entry-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5A8.5 8.5 0 0 1 12.5 20H4L2 22V11.5A8.5 8.5 0 0 1 10.5 3H12.5A8.5 8.5 0 0 1 21 11.5Z" />
              <path d="M7 9H16M7 13H13" />
            </svg>
          </span>
          <span className="page-kicker">PLAYER FEEDBACK</span>
        </div>
        <h2 id="feedback-entry-title">플레이 피드백</h2>
        <p>내 플레이는 어떨까요? 닉네임으로 최근 전적의 강점과 점검할 행동을 확인하세요.</p>
        <SearchBox />
      </article>
    </section>
  );
}
