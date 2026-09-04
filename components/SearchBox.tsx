"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function SearchBox() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!nickname.trim()) return;
    router.push(`/players/${encodeURIComponent(nickname.trim())}`);
  }

  return (
    <div className="search-box-wrapper">
      <p className="muted" style={{ marginBottom: "16px", fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
        플레이를 진단하고 싶은 플레이어의 닉네임을 입력해주세요!
      </p>
      <form className="form-row" onSubmit={onSubmit}>
        <label>
          닉네임
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="플레이어 닉네임"
          />
        </label>
        <button type="submit">검색</button>
      </form>
    </div>
  );
}
