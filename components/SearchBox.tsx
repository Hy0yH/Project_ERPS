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
  );
}
