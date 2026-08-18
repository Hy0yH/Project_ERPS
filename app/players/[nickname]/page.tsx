import { PlayerAnalysisPanel } from "@/components/PlayerAnalysisPanel";

export default async function PlayerPage({
  params
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = await params;
  const decoded = decodeURIComponent(nickname);

  return (
    <>
      <section className="page-head player-page-head">
        <div className="headline-block">
          <span className="headline-slash" aria-hidden="true" />
          <span className="page-kicker">PLAYER ANALYSIS</span>
          <h1>{decoded}</h1>
          <p>최근 랭크 스쿼드 기록을 비슷한 MMR대와 비교한 플레이스타일 분석입니다.</p>
        </div>
      </section>
      <PlayerAnalysisPanel nickname={decoded} />
    </>
  );
}
