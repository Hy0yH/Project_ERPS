import Link from "next/link";
import { notFound } from "next/navigation";
import { displayPercent, displayRank, getCharacterMeta, getCharacterBuildMeta, getCharacters, getPatchHistory, getTeamComps } from "@/lib/data";
import { BuildMetaPanel } from "@/components/BuildMetaPanel";
import { rankScopeLabel, DEFAULT_RANK_SCOPE } from "@/lib/rank-scopes";
import { characterBrowseParams, parseCharacterBrowse, type CharacterBrowseQuery } from "@/lib/character-browser";
import { getCharacterPatchMeta } from "@/lib/meta-history";
import { PatchMetaHistory } from "@/components/PatchMetaHistory";
import { isCharacterWeapon, weaponCodeForType, weaponName } from "@/lib/weapons";
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
  searchParams: Promise<CharacterBrowseQuery>;
}) {
  const { code } = await params;
  const query = parseCharacterBrowse(await searchParams);
  const rankScope = query.rankScope;
  const characterCode = Number(code);
  if (!Number.isSafeInteger(characterCode) || characterCode <= 0) notFound();
  const requestedWeaponCode = query.weapon;
  const [meta, comps, characters] = await Promise.all([
    getCharacterMeta(14, rankScope),
    getTeamComps([characterCode]),
    getCharacters()
  ]);
  const catalogCharacter = characters.find((item) => item.character_code === characterCode);
  if (characters.length && !catalogCharacter) notFound();
  const character = meta.find((item) =>
    item.character_code === characterCode &&
    Number.isFinite(requestedWeaponCode) &&
    requestedWeaponCode > 0 &&
    item.weapon_code === requestedWeaponCode
  ) ?? meta.find((item) => item.character_code === characterCode);
  const patchWeaponCode = character?.weapon_code ?? (
    isCharacterWeapon(catalogCharacter?.weapon_types, requestedWeaponCode)
      ? requestedWeaponCode
      : weaponCodeForType(catalogCharacter?.weapon_types?.[0])
  );
  const characterName = character?.display_name ?? (catalogCharacter
    ? `${catalogCharacter.name_ko}${patchWeaponCode ? ` / ${weaponName(patchWeaponCode)}` : ""}`
    : `캐릭터 ${characterCode}`);
  const [patches, buildMeta, trend] = await Promise.all([
    getPatchHistory(characterCode, patchWeaponCode).catch(() => []),
    patchWeaponCode ? getCharacterBuildMeta(characterCode, patchWeaponCode, rankScope).catch(() => undefined) : Promise.resolve(null),
    character ? getCharacterPatchMeta(characterCode, character.weapon_code, rankScope).catch(() => null) : Promise.resolve([])
  ]);
  const patchesByVersion = new Map<string, typeof patches>();
  for (const patch of patches) {
    const changes = patchesByVersion.get(patch.patch_version) ?? [];
    changes.push(patch);
    patchesByVersion.set(patch.patch_version, changes);
  }

  return (
    <>
      <section className="page-head">
        <div className="headline-block">
          <span className="headline-slash" aria-hidden="true" />
          <h1>{characterName}</h1>
          <p>현재 패치 {rankScopeLabel(rankScope)} 기준입니다. 실험체 통계와 선택한 무기를 유지해 표시합니다.</p>
          <Link href={`/characters?${characterBrowseParams(query)}`}>같은 조건의 티어표로 돌아가기</Link>
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

      <div style={{ marginTop: 18 }}>{buildMeta === undefined ? <p role="status">상세 메타 통계를 불러오지 못했습니다.</p> : <BuildMetaPanel meta={buildMeta} />}</div>
      <section className="grid" style={{ marginTop: 18 }}>
        <div className="span-6 stack">
          <h2>좋은 조합</h2>
          <p className="muted">조합은 {rankScopeLabel(DEFAULT_RANK_SCOPE)} 실험체가 포함된 완성 스쿼드 기준이며 실험체 통계의 랭크 필터와 다를 수 있습니다.</p>
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
          {[...patchesByVersion].map(([patchVersion, changes]) => {
            const sourceUrl = patchSourceUrl(patchVersion);
            const changeTypes = [...new Set(changes.map((change) => change.change_type))];
            const cardType = changeTypes.length === 1 ? changeTypes[0] : "adjustment";
            return (
              <article
                className={`item-card patch-change-card patch-${cardType}`}
                key={patchVersion}
              >
                <div className="split">
                  <strong>v{patchVersion}</strong>
                  <span className={`badge patch-type patch-type-${cardType}`}>
                    {changeTypes.map(patchChangeLabel).join(" · ")}
                  </span>
                </div>
                <div className="patch-change-sections">
                  {changes.flatMap(patchChangeSections).map((section, sectionIndex) => (
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
      <div style={{ marginTop: 18 }}>{trend === null ? <p role="status">패치별 집계를 불러오지 못했습니다. 현재 통계는 위에서 확인할 수 있습니다.</p> : <PatchMetaHistory points={trend} />}</div>
    </>
  );
}
