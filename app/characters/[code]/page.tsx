import { displayPercent, displayRank, getCharacterMeta, getPatchHistory, getTeamComps } from "@/lib/data";

export default async function CharacterDetailPage({
  params
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const characterCode = Number(code);
  const [meta, comps, patches] = await Promise.all([
    getCharacterMeta().catch(() => []),
    getTeamComps([characterCode]).catch(() => []),
    getPatchHistory(characterCode).catch(() => [])
  ]);
  const character = meta.find((item) => item.character_code === characterCode);

  return (
    <>
      <section className="page-head">
        <div>
          <h1>{character?.name_ko ?? `캐릭터 ${characterCode}`}</h1>
          <p>캐릭터 메타, 함께 좋은 조합, 최근 패치 히스토리입니다.</p>
        </div>
        {character ? <span className="badge">{character.tier}</span> : null}
      </section>

      {character ? (
        <section className="grid">
          <div className="panel span-3 metric">
            <span className="muted">게임 수</span>
            <strong>{character.games.toLocaleString()}</strong>
          </div>
          <div className="panel span-3 metric">
            <span className="muted">승률</span>
            <strong>{displayPercent(character.win_rate)}</strong>
          </div>
          <div className="panel span-3 metric">
            <span className="muted">TOP3</span>
            <strong>{displayPercent(character.top3_rate)}</strong>
          </div>
          <div className="panel span-3 metric">
            <span className="muted">평균 순위</span>
            <strong>{displayRank(character.average_rank)}</strong>
          </div>
        </section>
      ) : (
        <div className="empty">캐릭터 통계가 아직 없습니다.</div>
      )}

      <section className="grid" style={{ marginTop: 18 }}>
        <div className="span-6 stack">
          <h2>좋은 조합</h2>
          {comps.slice(0, 10).map((comp) => (
            <div className="item-card split" key={comp.comp_key}>
              <strong>{comp.comp_key}</strong>
              <span className="muted">
                {comp.games}게임 · TOP3 {displayPercent(comp.top3_rate)}
              </span>
            </div>
          ))}
          {!comps.length ? <div className="empty">조합 통계가 없습니다.</div> : null}
        </div>
        <div className="span-6 stack">
          <h2>패치 히스토리</h2>
          {patches.map((patch, index) => (
            <article className="item-card" key={`${patch.patch_version}-${index}`}>
              <div className="split">
                <strong>{patch.patch_version}</strong>
                <span className="badge">{patch.change_type}</span>
              </div>
              <p>{patch.raw_change_text}</p>
            </article>
          ))}
          {!patches.length ? <div className="empty">등록된 패치 히스토리가 없습니다.</div> : null}
        </div>
      </section>
    </>
  );
}
