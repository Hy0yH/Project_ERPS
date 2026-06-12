"use client";

import { FormEvent, useState } from "react";
import type { Character, Recommendation } from "@/lib/types";

export function RecommendationForm({ characters }: { characters: Character[] }) {
  const [nickname, setNickname] = useState("");
  const [preferred, setPreferred] = useState("");
  const [teammates, setTeammates] = useState("");
  const [result, setResult] = useState<Recommendation[]>([]);
  const [status, setStatus] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("추천 계산 중");
    setResult([]);
    const response = await fetch("/api/recommendations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nickname: nickname || undefined,
        preferredCharacterCodes: parseCodes(preferred),
        teammateCharacterCodes: parseCodes(teammates).slice(0, 2),
        limit: 5
      })
    });
    const json = await response.json();
    if (!response.ok) {
      setStatus(json.error ?? "추천 실패");
      return;
    }
    setResult(json.data ?? []);
    setStatus("");
  }

  return (
    <div className="grid">
      <form className="panel stack span-4" onSubmit={onSubmit}>
        <label>
          닉네임
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} />
        </label>
        <label>
          내 선호 캐릭터 코드
          <input
            value={preferred}
            onChange={(event) => setPreferred(event.target.value)}
            placeholder="예: 1, 12"
          />
        </label>
        <label>
          팀원 픽 코드 최대 2개
          <input
            value={teammates}
            onChange={(event) => setTeammates(event.target.value)}
            placeholder="예: 4, 28"
          />
        </label>
        <button type="submit">추천 받기</button>
        {status ? <p>{status}</p> : null}
      </form>
      <section className="span-8 stack">
        {result.length ? (
          result.map((item) => (
            <article className="item-card stack" key={item.character.character_code}>
              <div className="split">
                <div>
                  <h3>{item.character.name_ko}</h3>
                  <span className="muted">추천 점수 {(item.score * 100).toFixed(1)}</span>
                </div>
                <span className={`badge ${item.confidence === "low" ? "warn" : "ok"}`}>
                  {item.confidence}
                </span>
              </div>
              <p>{item.explanation}</p>
              <div className="grid">
                <span className="metric span-4">
                  <small className="muted">TOP3</small>
                  <strong>{(item.metrics.top3Rate * 100).toFixed(1)}%</strong>
                </span>
                <span className="metric span-4">
                  <small className="muted">승률</small>
                  <strong>{(item.metrics.winRate * 100).toFixed(1)}%</strong>
                </span>
                <span className="metric span-4">
                  <small className="muted">평균 순위</small>
                  <strong>{item.metrics.averageRank.toFixed(2)}</strong>
                </span>
              </div>
            </article>
          ))
        ) : (
          <div className="empty">
            {characters.length
              ? "닉네임, 선호 캐릭터, 팀원 픽을 입력하면 추천 결과가 표시됩니다."
              : "캐릭터 데이터가 아직 없습니다. 배치 수집과 스냅샷 생성 후 추천을 사용할 수 있습니다."}
          </div>
        )}
      </section>
    </div>
  );
}

function parseCodes(value: string) {
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter(Boolean);
}
