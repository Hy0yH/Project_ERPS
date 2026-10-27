"use client";
import { useState, type FormEvent } from "react";
import type { OperationsStatus } from "@/lib/operations";
export function OperationsPanel() {
  const [token, setToken] = useState(""), [data, setData] = useState<OperationsStatus | null>(null);
  const [error, setError] = useState(""), [loading, setLoading] = useState(false);
  async function load(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setData(null);
    try { const response = await fetch("/api/admin/operations", { headers: { "x-admin-token": token }, cache: "no-store" });
      const json = await response.json(); if (!response.ok) throw new Error(json.error ?? "운영 상태 조회 실패"); setData(json.data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "운영 상태를 확인하지 못했습니다."); }
    finally { setLoading(false); }
  }
  const date = (value: string | null) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미확인";
  return <section className="stack"><form className="panel form-row" onSubmit={load}><label>관리자 토큰<input type="password" value={token} required disabled={loading}
    onChange={(event) => { setToken(event.target.value); setData(null); }} /></label><button disabled={loading}>{loading ? "조회 중…" : "운영 상태 조회"}</button></form>
    {error ? <p role="alert">{error}</p> : null}
    {data ? <><div className="panel stack"><h2>저장소와 집계</h2><p>저장소 {data.database === "ready" ? "조회 가능" : data.database === "unconfigured" ? "설정 필요" : "조회 실패"} · 패치 {data.patch ?? "미확인"}</p>
      <p>실험체 {date(data.snapshots.characters)}<br />조합 {date(data.snapshots.compositions)}<br />벤치마크 {date(data.snapshots.benchmarks)}</p>
      <p>{data.inconsistent ? "집계 시점 차이 확인 필요" : "실험체·조합 갱신 시점 일치 범위"} · {data.stale ? "갱신 지연 또는 집계 없음" : "최근 집계 있음"}</p>
      <p>경기 대기 {data.queue.pending ?? "미확인"} · 처리 중 {data.queue.processing ?? "미확인"} · 실패 {data.queue.failed ?? "미확인"}</p>
      <small>집계 기준 시각과 작업 성공을 함께 확인합니다. 실행 중인 작업을 이 화면에서 강제 종료하지 않습니다.</small></div>
      <div className="panel table-wrap" tabIndex={0} role="region" aria-label="최근 수집·집계 작업"><table><thead><tr><th>작업</th><th>상태</th><th>저장 경기</th><th>시작 (KST)</th><th>종료 (KST)</th><th>안내</th></tr></thead>
        <tbody>{data.runs.map((run) => <tr key={run.id}><td>{run.job}</td><td>{run.status === "running" ? "실행 중" : run.status === "success" ? "성공" : "실패"}</td><td>{run.savedMatches}</td><td>{date(run.startedAt)}</td><td>{date(run.finishedAt)}</td><td>{run.diagnostic ? `${run.diagnostic.stage} · 배치 ${run.diagnostic.batch} · 대상 ${run.diagnostic.rows}행 · 코드 ${run.diagnostic.code}` : run.hasWarnings ? "경고·진단 기록 있음" : "-"}</td></tr>)}</tbody></table>
        {!data.runs.length ? <p>조회 가능한 실행 이력이 없습니다.</p> : null}</div></> : null}
  </section>;
}
