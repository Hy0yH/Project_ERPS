import { displayPercent, displayRank, getCharacterMeta, getPatchHistory, getTeamComps } from "@/lib/data";
import {
  patchChangeLabel,
  patchChangeSections,
  patchSourceUrl
} from "@/lib/bundled-patch-changes";

export default async function CharacterDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ weapon?: string }>;
}) {
  const { code } = await params;
  const { weapon } = await searchParams;
  const characterCode = Number(code);
  const requestedWeaponCode = Number(weapon);
  const [meta, comps] = await Promise.all([
    getCharacterMeta().catch(() => []),
    getTeamComps([characterCode]).catch(() => [])
  ]);
  const character = meta.find((item) =>
    item.character_code === characterCode &&
    Number.isFinite(requestedWeaponCode) &&
    requestedWeaponCode > 0 &&
    item.weapon_code === requestedWeaponCode
  ) ?? meta.find((item) => item.character_code === characterCode);
  const patches = await getPatchHistory(characterCode, character?.weapon_code).catch(() => []);

  return (
    <>
      <section className="page-head">
        <div className="headline-block">
          <span className="headline-slash" aria-hidden="true" />
          <h1>{character?.display_name ?? `캐릭터 ${characterCode}`}</h1>
          <p>캐릭터 메타, 함께 좋은 조합, 최근 패치 히스토리입니다.</p>
        </div>
        {character ? (
          <span className={`badge tier-${character.tier.toLowerCase()}`}>{character.tier}</span>
        ) : null}
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
            <div className="item-card split meta-row" key={`${comp.comp_key}:${comp.character_weapon_keys.join("|")}`}>
              <strong className="item-title">
                <span className={`badge tier-${comp.tier.toLowerCase()}`}>{comp.tier}</span>
                {comp.comp_name}
              </strong>
              <span className="muted item-stats">
                {comp.games}게임 · TOP3 {displayPercent(comp.top3_rate)} ·{" "}
                <strong className="stat-strong">승률 {displayPercent(comp.win_rate)}</strong>
              </span>
            </div>
          ))}
          {!comps.length ? <div className="empty">조합 통계가 없습니다.</div> : null}
        </div>
        <div className="span-6 stack">
          <h2>패치 히스토리</h2>
          {patches.map((patch, index) => {
            const sourceUrl = patchSourceUrl(patch.patch_version);
            return (
              <article
                className={`item-card patch-change-card patch-${patch.change_type}`}
                key={`${patch.patch_version}-${index}`}
              >
                <div className="split">
                  <strong>v{patch.patch_version}</strong>
                  <span className={`badge patch-type patch-type-${patch.change_type}`}>
                    {patchChangeLabel(patch.change_type)}
                  </span>
                </div>
                <div className="patch-change-sections">
                  {patchChangeSections(patch).map((section, sectionIndex) => (
                    <div className="patch-change-section" key={`${section.target}-${sectionIndex}`}>
                      {section.target ? <strong className="patch-target">{section.target}</strong> : null}
                      {section.details.map((detail, detailIndex) => (
                        <p className="patch-change-detail" key={`${detail}-${detailIndex}`}>{detail}</p>
                      ))}
                    </div>
                  ))}
                </div>
                {sourceUrl ? (
                  <a
                    className="patch-source-link"
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    공식 패치노트 <span aria-hidden="true">↗</span>
                  </a>
                ) : null}
              </article>
            );
          })}
          {!patches.length ? <div className="empty">등록된 패치 히스토리가 없습니다.</div> : null}
        </div>
      </section>
    </>
  );
}
