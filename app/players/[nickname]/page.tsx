import { getPlayerSummary } from "@/lib/data";

export default async function PlayerPage({
  params
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = await params;
  const decoded = decodeURIComponent(nickname);
  const summary = await getPlayerSummary(decoded).catch(() => null);

  return (
    <>
      <section className="page-head">
        <div>
          <h1>{decoded}</h1>
          <p>저장된 매치 데이터 기준 개인 플레이 요약입니다.</p>
        </div>
      </section>
      {summary ? (
        <section className="stack">
          <div className="panel metric">
            <span className="muted">총 게임</span>
            <strong>{summary.total_games.toLocaleString()}</strong>
          </div>
          {summary.favorite_characters.map((item) => (
            <article className="item-card split" key={item.character_code}>
              <strong>캐릭터 {item.character_code}</strong>
              <span className="muted">
                {item.games}게임 · TOP3 {(item.top3_rate * 100).toFixed(1)}%
              </span>
            </article>
          ))}
        </section>
      ) : (
        <div className="empty">
          아직 저장된 플레이어 요약이 없습니다. 배치 수집 후 다시 확인하거나 API로 닉네임을 먼저 조회하세요.
        </div>
      )}
    </>
  );
}
