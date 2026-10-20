import type { Metadata } from "next";
import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";

export const metadata: Metadata = {
  title: "플레이 피드백 | ERPS",
  description: "닉네임으로 현재 패치 전적의 강점과 점검할 행동을 확인하세요."
};

export default function PlayerFeedbackPage() {
  return (
    <>
      <section className="page-head">
        <div className="headline-block">
          <span className="headline-slash" aria-hidden="true" />
          <span className="page-kicker">PLAYER FEEDBACK</span>
          <h1>플레이 피드백</h1>
          <p>최근 전적에서 내 강점과 다음 경기에서 확인해 볼 점을 찾아보세요.</p>
        </div>
      </section>
      <section className="panel feedback-search-panel" aria-labelledby="feedback-search-title">
        <h2 id="feedback-search-title">닉네임으로 내 플레이 확인하기</h2>
        <p>현재 패치 기록을 비슷한 MMR대와 비교해 플레이스타일과 점검 제안을 보여드립니다.</p>
        <SearchBox />
      </section>
      <section className="feedback-preview-grid" aria-label="확인할 수 있는 피드백">
        <article><span className="page-kicker">01</span><h2>플레이스타일 비교</h2><p>전투·성장·파밍·시야·안정성 지표를 비슷한 조건의 플레이어와 비교합니다.</p></article>
        <article><span className="page-kicker">02</span><h2>근거가 있는 강점</h2><p>내 수치와 비교 기준, 개인 경기 수와 신뢰도를 함께 확인합니다.</p></article>
        <article><span className="page-kicker">03</span><h2>다음 경기의 점검 제안</h2><p>최근 전적을 바탕으로 확인할 행동을 제안합니다. 수행 여부를 추적하지는 않습니다.</p></article>
      </section>
      <Link className="feedback-secondary-link" href="/characters">현재 메타도 궁금하다면, 티어표 보기 <span aria-hidden="true">→</span></Link>
    </>
  );
}
