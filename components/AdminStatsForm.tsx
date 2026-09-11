"use client";

import { FormEvent, useState } from "react";

export function AdminStatsForm() {
  const [token, setToken] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setCount(null);
    setError("");
    try {
      const response = await fetch("/api/admin/stats", {
        headers: { "x-admin-token": token },
        cache: "no-store"
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "통계를 불러오지 못했습니다.");
      setCount(json.data.characterWeaponCount);
    } catch (error) {
      setError(error instanceof Error ? error.message : "통계를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={onSubmit}>
      <label>
        관리자 토큰
        <input value={token} onChange={(event) => {
          setToken(event.target.value);
          setCount(null);
          setError("");
        }} type="password" required disabled={loading} />
      </label>
      <button type="submit" disabled={loading}>{loading ? "조회 중…" : "통계 조회"}</button>
      <div aria-live="polite">
        {error ? <p role="alert">{error}</p> : null}
        {count !== null ? (
          <div className="metric">
            <span className="muted">집계된 캐릭터·무기 수</span>
            <strong>{count.toLocaleString()}</strong>
            <p className="muted">기본 랭크 범위의 최신 통계에서 캐릭터와 무기 조합별로 1개씩 셉니다.</p>
          </div>
        ) : null}
      </div>
    </form>
  );
}
