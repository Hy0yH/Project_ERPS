"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useId, useState } from "react";

export function SearchBox() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const hintId = useId();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!nickname.trim()) return;
    router.push(`/players/${encodeURIComponent(nickname.trim())}`);
  }

  return (
    <div className="search-box-wrapper">
      <form className="form-row feedback-search-form" onSubmit={onSubmit} aria-label="플레이어 피드백 조회">
        <label>
          플레이어 닉네임
          <input
            name="nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="게임 닉네임을 입력하세요"
            required
            pattern={".*\\S.*"}
            title="공백이 아닌 게임 닉네임을 입력해 주세요."
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            aria-describedby={hintId}
          />
        </label>
        <button type="submit">피드백 보기 <span aria-hidden="true">→</span></button>
      </form>
      <p id={hintId} className="feedback-search-hint">처음 조회하면 최근 전적을 불러오는 데 시간이 걸릴 수 있습니다.</p>
    </div>
  );
}
