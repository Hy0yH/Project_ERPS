"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { weaponCodeForType, weaponName } from "@/lib/weapons";
import type {
  Character,
  PlayerDataScope,
  Recommendation
} from "@/lib/types";

export function RecommendationForm({ characters }: { characters: Character[] }) {
  const [nickname, setNickname] = useState("");
  const [playerDataScope, setPlayerDataScope] = useState<PlayerDataScope>("season");
  const [teammateCodes, setTeammateCodes] = useState(["", ""]);
  const [teammateNicknames, setTeammateNicknames] = useState(["", ""]);
  const [teammateWeapons, setTeammateWeapons] = useState(["", ""]);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const [result, setResult] = useState<Recommendation[]>([]);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const characterOptions = useMemo(
    () =>
      [...characters].sort((a, b) =>
        a.name_ko.localeCompare(b.name_ko, "ko", { sensitivity: "base" })
      ),
    [characters]
  );
  const characterNameByCode = useMemo(
    () => new Map(characters.map((character) => [String(character.character_code), character.name_ko])),
    [characters]
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("추천을 계산하고 있습니다.");
    setIsLoading(true);
    setResult([]);
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;

    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          nickname: nickname.trim() || undefined,
          playerDataScope,
          teammates: teammateCodes.map((code, index) => ({ nickname: teammateNicknames[index].trim() || undefined,
            characterCode: Number(code) || undefined, weaponCode: Number(teammateWeapons[index]) || undefined }))
            .filter((item) => item.nickname || item.characterCode),
          limit: 5
        })
      });
      const json = await response.json();

      if (!response.ok) {
        setStatus(json.error ?? "추천 계산에 실패했습니다.");
        return;
      }

      setResult(json.data ?? []);
      setStatus((json.data ?? []).length ? "" : "조건에 맞는 추천 후보가 없습니다.");
    } catch {
      if (!controller.signal.aborted) setStatus("추천 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  }

  function updateTeammate(index: number, value: string) {
    setTeammateWeapons((current) => current.map((item, i) => i === index ? "" : item));
    setTeammateCodes((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item))
    );
  }

  const selectedTeammates = teammateCodes
    .map((code) => characterNameByCode.get(code))
    .filter((name): name is string => Boolean(name));
  const primaryContext = result[0]?.context;
  const contextNames = primaryContext?.baseCharacters.map((character) => character.name_ko) ?? [];
  const selectionLabel = selectedTeammates.length
    ? selectedTeammates.join(" + ")
    : contextNames.length
      ? contextNames.join(" + ")
      : "전체 상위권 조합 통계";

  if (result.length) {
    return (
      <div className="recommendation-results-layout">
        <aside className="result-context-panel">
          <span className="context-kicker">선택한 조건</span>
          <div className="context-item">
            <span>함께 볼 기준</span>
            <strong>{selectionLabel}</strong>
          </div>
          <div className="context-item">
            <span>데이터 범위</span>
            <strong>{playerDataScope === "current_patch" ? "현재 패치" : "이번 시즌 전체"}</strong>
          </div>
          {nickname.trim() ? (
            <div className="context-item">
              <span>플레이어</span>
              <strong>{nickname.trim()}</strong>
            </div>
          ) : null}
          <button className="secondary" type="button" onClick={() => setResult([])}>
            조건 수정
          </button>
        </aside>

        <section className="recommendation-results">
          <div className="results-heading">
            <div>
              <span className="page-kicker">RECOMMENDATION</span>
              <h2>추천 결과</h2>
            </div>
            <span className="results-count">{result.length}개 후보</span>
          </div>
          <RecommendationHero item={result[0]} />
          <RecommendationComparison items={result} />
          {result.slice(1).map((item, index) => (
            <RecommendationRow item={item} rank={index + 2} key={item.character.character_code} />
          ))}
        </section>
      </div>
    );
  }

  return (
    <div className="recommendation-workspace">
      <form className="panel recommendation-config" onSubmit={onSubmit}>
        <div className="recommendation-steps" aria-label="추천 진행 단계">
          <span className="active"><b>1</b> 내 정보</span>
          <i aria-hidden="true">›</i>
          <span><b>2</b> 팀 구성</span>
          <i aria-hidden="true">›</i>
          <span><b>3</b> 추천 결과</span>
        </div>

        <div className="form-stack">
          <label>
            플레이어 닉네임
            <input
              value={nickname}
              maxLength={64}
              disabled={isLoading}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="플레이어 닉네임을 입력하세요"
            />
          </label>

          <label>
            데이터 기준
            <select
              value={playerDataScope}
              disabled={isLoading}
              onChange={(event) => setPlayerDataScope(event.target.value as PlayerDataScope)}
            >
              <option value="season">이번 시즌 전체</option>
              <option value="current_patch">현재 패치</option>
            </select>
          </label>

          <fieldset className="teammate-fields">
            <legend>팀원 실험체</legend>
            {[0, 1].map((index) => (
              <div className="team-pick-input stack" key={index}><label>
                팀원 {index + 1} 닉네임 (선택)
                <input value={teammateNicknames[index]} maxLength={64} disabled={isLoading} placeholder="입력하면 실제 사용 기록 반영"
                  onChange={(event) => setTeammateNicknames((current) => current.map((item, i) => i === index ? event.target.value : item))} />
              </label><label>
                <span>팀원 {index + 1}</span>
                <CharacterSelect
                  characters={characterOptions}
                  value={teammateCodes[index]}
                  onChange={(value) => updateTeammate(index, value)}
                  placeholder="실험체를 선택하세요"
                  disabledCodes={teammateCodes.filter((_, itemIndex) => itemIndex !== index)}
                  disabled={isLoading}
                />
              </label><label>팀원 {index + 1} 무기 (선택)<select value={teammateWeapons[index]} disabled={!teammateCodes[index] || isLoading}
                onChange={(event) => setTeammateWeapons((current) => current.map((item, i) => i === index ? event.target.value : item))}>
                <option value="">사용 기록 또는 조합 기준</option>
                {(characters.find((item) => item.character_code === Number(teammateCodes[index]))?.weapon_types ?? []).map((type) => weaponCodeForType(type))
                  .filter((code): code is number => Boolean(code)).map((code) => <option key={code} value={code}>{weaponName(code)}</option>)}
              </select></label><small className="muted">닉네임만 입력하면 선택한 기간의 가장 많이 사용한 실험체·대표 무기를 적용합니다.</small></div>
            ))}
          </fieldset>
        </div>

        <button className="recommendation-open" type="submit" disabled={isLoading || !characters.length}>
          {isLoading ? "추천 분석 중" : "추천 열기"}
        </button>
        {status ? <p className="form-status" role="status">{status}</p> : null}
      </form>

      <section className="recommendation-intro">
        <div>
          <span className="page-kicker">SMART PICK</span>
          <h2>내 조합에 맞는 실험체를 찾아보세요</h2>
          <p>
            선택한 정보와 데이터 기준을 바탕으로 조합 시너지, 메타 성능, 플레이 성향을 함께 분석합니다.
          </p>
        </div>
        <div className="recommendation-criteria">
          <Criteria index="01" title="조합 궁합">선택한 팀 구성의 실제 조합 표본과 개인 사용 기록을 확인합니다.</Criteria>
          <Criteria index="02" title="현재 패치">현재 메타의 관측 성적과 표본을 확인합니다.</Criteria>
          <Criteria index="03" title="플레이 스타일">선택한 기간에 실제 사용한 실험체별 기록을 비교합니다.</Criteria>
        </div>
        <div className="recommendation-radar" aria-hidden="true"><span /></div>
        <div className="intro-callout">
          <strong>정보를 입력하면 추천이 시작됩니다</strong>
          <span>플레이어 추천은 실제 사용 기록 안에서 시작합니다.</span>
        </div>
      </section>
    </div>
  );
}

function Criteria({ index, title, children }: { index: string; title: string; children: React.ReactNode }) {
  return (
    <article>
      <span>{index}</span>
      <div><strong>{title}</strong><p>{children}</p></div>
    </article>
  );
}

function RecommendationHero({ item }: { item: Recommendation }) {
  const name = item.character.display_name ?? item.character.name_ko;
  const tier = item.character.tier?.toLowerCase() ?? "s";

  return (
    <article className="recommendation-hero-card">
      <div className="hero-rank">01</div>
      <span className={`badge tier-${tier} recommendation-tier`}>{item.character.tier ?? "S"}</span>
      <div className="hero-recommendation-main">
        <span className="recommendation-role-label">추천 실험체</span>
        <h3>{name}</h3>
        <span className="score-label">추천 점수</span>
        <strong className="recommendation-score">{(item.score * 100).toFixed(1)}</strong>
        <span className={`confidence confidence-${item.confidence}`}>{item.context.compGames ? "조합" : "메타"} 신뢰도 {confidenceLabel(item.confidence)}</span>
        {!item.context.compGames ? <span className="badge warn">선택 조합 미평가</span> : null}
        <p>{recommendationSummary(item)}</p>
      </div>
      <div className="hero-reference">
        <span className="synergy-label">{item.context.compGames ? "관측된 조합 구성" : "선택한 팀 구성"}</span>
        <SynergyPicks item={item} />
        <span className="synergy-source">{item.context.compGames ? item.context.compName ?? item.context.title : "아래 수치는 추천 실험체의 개별 메타 기준입니다."}</span>
        <RecommendationMetrics item={item} />
      </div>
      <details className="recommendation-details">
        <summary>선정 이유 자세히</summary>
        <p className="detailed-reason">{item.explanation}</p>
        <RecommendationEvidence item={item} />
      </details>
    </article>
  );
}

function RecommendationRow({ item, rank }: { item: Recommendation; rank: number }) {
  const name = item.character.display_name ?? item.character.name_ko;
  const tier = item.character.tier?.toLowerCase() ?? (rank === 2 ? "a" : "b");

  return (
    <article className="recommendation-compact-card">
      <span className="compact-rank">{String(rank).padStart(2, "0")}</span>
      <span className={`badge tier-${tier}`}>{item.character.tier ?? (rank === 2 ? "A" : "B")}</span>
      <div className="compact-character">
        <small>추천 실험체</small>
        <h3>{name}</h3>
        <span>추천 점수 <strong>{(item.score * 100).toFixed(1)}</strong></span>
        <div className="compact-synergy">
          <small>{item.context.compGames ? "관측된 조합 구성" : "선택한 팀 구성"}</small>
          <b>{synergyLabel(item)}</b>
        </div>
      </div>
      <span className={`confidence confidence-${item.confidence}`}>{item.context.compGames ? "조합" : "메타"} 신뢰도 {confidenceLabel(item.confidence)}{!item.context.compGames ? " · 조합 미평가" : ""}</span>
      <div className="compact-metrics">
        <span>TOP3 <strong>{displayPercent(item.metrics.top3Rate)}</strong></span>
        <span>승률 <strong>{displayPercent(item.metrics.winRate)}</strong></span>
        <span>평균 <strong>{item.metrics.averageRank.toFixed(2)}</strong></span>
        <span>표본 <strong>{item.metrics.games}</strong></span>
      </div>
      <details className="compact-details">
        <summary>선정 이유</summary>
        <p>{item.explanation}</p>
        <RecommendationEvidence item={item} />
      </details>
    </article>
  );
}

function SynergyPicks({ item }: { item: Recommendation }) {
  if (!item.context.baseCharacters.length) {
    return <p className="synergy-empty">확인된 조합 기준이 없습니다.</p>;
  }

  return (
    <div className="synergy-picks">
      {item.context.baseCharacters.map((character, index) => (
        <span key={character.character_code}>
          {index ? <i aria-hidden="true">+</i> : null}
          <b>{character.name_ko}</b>
        </span>
      ))}
    </div>
  );
}

function synergyLabel(item: Recommendation) {
  return item.context.baseCharacters.map((character) => character.name_ko).join(" + ") || "개별 메타 기준";
}

function recommendationSummary(item: Recommendation) {
  const player = item.context.playerPerformance;
  const facts = [
    player ? `플레이 기록 ${player.games}판` : null,
    `상위권 TOP3 ${displayPercent(item.metrics.metaTop3Rate)}`,
    item.context.compGames
      ? `${synergyLabel(item)} 조합 ${item.context.compGames}판`
      : `${synergyLabel(item)} 참고`
  ].filter(Boolean);
  return facts.join(" · ");
}

function RecommendationMetrics({ item }: { item: Recommendation }) {
  return (
    <div className="hero-metrics">
      <span><small>TOP3</small><strong>{displayPercent(item.metrics.top3Rate)}</strong></span>
      <span><small>승률</small><strong>{displayPercent(item.metrics.winRate)}</strong></span>
      <span><small>평균 순위</small><strong>{item.metrics.averageRank.toFixed(2)}</strong></span>
      <span><small>표본</small><strong>{item.metrics.games}</strong></span>
    </div>
  );
}

function RecommendationEvidence({ item }: { item: Recommendation }) {
  const { context } = item;

  return (
    <div className="evidence-box">
      <div className="evidence-head">
        <strong>추천 기준</strong>
        <span>{context.title}</span>
        <span className="badge">{context.dataScope === "current_patch" ? "현재 패치" : "이번 시즌 전체"}</span>
      </div>
      <RecommendationScoreBreakdown item={item} />
      {context.teammateProfiles?.length ? <div className="evidence-summary"><strong>팀원 사용 기록</strong>{context.teammateProfiles.map((profile) =>
        <span key={profile.nickname}>{profile.nickname} · {context.baseCharacters.find((pick) => pick.character_code === profile.characterCode)?.name_ko ?? profile.characterCode}
          {profile.weaponCode ? ` / ${weaponName(profile.weaponCode)}` : ""} · 실험체 전체 {profile.games}판</span>)}
        <small>무기는 대표 무기 또는 직접 선택한 조건입니다. 개인 사용 횟수는 실험체 전체 기록입니다.</small></div> : null}
      {context.playerPerformance ? (
        <div className="player-performance-evidence">
          <span>이 플레이어의 추천 실험체 전체 무기 기록</span>
          <div className="performance-facts">
            <PerformanceFact label="플레이" value={`${context.playerPerformance.games}판`} />
            <PerformanceFact label="가한 피해" value={formatNumber(context.playerPerformance.average_damage_to_player)} />
            <PerformanceFact label="받은 피해" value={formatNumber(context.playerPerformance.average_damage_from_player)} />
            <PerformanceFact label="자가 회복" value={formatNumber(context.playerPerformance.average_heal_amount)} />
            <PerformanceFact
              label="팀 회복·보호"
              value={formatNumber(
                Number(context.playerPerformance.average_team_recover ?? 0) +
                Number(context.playerPerformance.average_protect_absorb ?? 0)
              )}
            />
            <PerformanceFact
              label="시야 기여"
              value={formatNumber(context.playerPerformance.average_view_contribution)}
            />
          </div>
        </div>
      ) : null}
      {context.baseCharacters.length ? (
        <div className="evidence-picks">
          {context.baseCharacters.map((character) => (
            <div className="evidence-pick" key={character.character_code}>
              <strong>{character.name_ko}</strong>
              {typeof character.games === "number" ? (
                <span>
                  {character.games}판 · TOP3 {displayPercent(character.top3_rate)} · 승률 {displayPercent(character.win_rate)}
                  {Number(character.average_damage_to_player ?? 0) > 0
                    ? ` · 가한 피해 ${formatNumber(character.average_damage_to_player)}`
                    : ""}
                </span>
              ) : (
                <span>
                  {context.source === "global_comp"
                    ? "전체 상위권 조합 통계에서 선정"
                    : "선택된 팀원 픽"}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {context.compName ? (
        <div className="evidence-summary">
          <span>참고 조합</span>
          <strong>{context.compName}</strong>
          <span>표본 {context.compGames ?? 0}판 · TOP3 {displayPercent(context.compTop3Rate)} · 승률 {displayPercent(context.compWinRate)} · 평균 순위 {typeof context.compAverageRank === "number" ? context.compAverageRank.toFixed(2) : "-"}</span>
        </div>
      ) : null}
      <ul className="evidence-list">{context.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
    </div>
  );
}

function PerformanceFact({ label, value }: { label: string; value: string }) {
  return <span><small>{label}</small><strong>{value}</strong></span>;
}

function CharacterSelect({ characters, value, onChange, placeholder, disabledCodes = [], disabled = false }: {
  characters: Character[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabledCodes?: string[];
  disabled?: boolean;
}) {
  return (
    <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {characters.map((character) => {
        const value = String(character.character_code);
        return <option key={character.character_code} value={value} disabled={disabledCodes.includes(value)}>{character.name_ko}</option>;
      })}
    </select>
  );
}

function selectedNumbers(values: string[]) {
  return [...new Set(values.map((value) => Number(value)).filter(Boolean))];
}

function RecommendationScoreBreakdown({ item }: { item: Recommendation }) {
  if (!item.scoreBreakdown) return null;
  return <div className="score-breakdown"><strong>실제 점수 계산 근거</strong><div className="table-wrap" tabIndex={0} role="region" aria-label="추천 점수 기여도">
    <table><thead><tr><th>근거</th><th>근거 점수</th><th>반영 비중</th><th>최종 기여</th></tr></thead><tbody>{item.scoreBreakdown.map((part) =>
      <tr key={part.key}><td>{part.label}</td><td>{(part.score * 100).toFixed(1)}</td><td>{(part.weight * 100).toFixed(1)}%</td><td>{(part.contribution * 100).toFixed(1)}점</td></tr>)}</tbody></table></div>
    <p className="muted">합계 {(item.score * 100).toFixed(1)}점 · 반올림 전 가중합입니다. 추천 점수는 예상 승률을 의미하지 않습니다.</p>
  </div>;
}
function RecommendationComparison({ items }: { items: Recommendation[] }) {
  return <details className="panel recommendation-comparison"><summary>후보 {items.length}개를 같은 기준으로 비교</summary>
    <div className="table-wrap" tabIndex={0} role="region" aria-label="추천 후보 비교"><table><thead><tr><th>후보</th><th>추천 점수</th><th>메타 표본</th><th>조합 표본</th><th>개인 표본</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.character.character_code}><td>{item.character.display_name ?? item.character.name_ko}</td><td>{(item.score * 100).toFixed(1)}</td>
        <td>{item.metrics.metaGames}판</td><td>{item.context.compGames ? `${item.context.compGames}판` : "평가 보류"}</td><td>{item.context.playerPerformance ? `${item.context.playerPerformance.games}판 · 실험체 전체` : "개인 기록 없음"}</td></tr>)}</tbody></table></div>
  </details>;
}

function confidenceLabel(value: Recommendation["confidence"]) {
  if (value === "high") return "높음";
  if (value === "medium") return "보통";
  return "낮음";
}

function displayPercent(value?: number) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "-";
}

function formatNumber(value?: number) {
  return Math.round(Number(value ?? 0)).toLocaleString("ko-KR");
}
