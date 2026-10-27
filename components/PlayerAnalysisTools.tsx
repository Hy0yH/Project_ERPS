"use client";
import { useEffect, useState, type FormEvent } from "react";
import { analysisCsv, answerAnalysisQuestion, compareHistory, historyEntry, readHistory, type AnalysisHistoryEntry } from "@/lib/analysis-tools";
import type { PlayerAnalysis } from "@/lib/types";
const HISTORY_KEY = "erps.analysis-history.v1";

export function PlayerAnalysisTools({ analysis }: { analysis: PlayerAnalysis }) {
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]), [note, setNote] = useState("");
  const [message, setMessage] = useState(""), [before, setBefore] = useState(""), [after, setAfter] = useState("");
  const [question, setQuestion] = useState(""), [answer, setAnswer] = useState<ReturnType<typeof answerAnalysisQuestion> | null>(null);
  const [includeMatches, setIncludeMatches] = useState(false);
  useEffect(() => { try { setHistory(readHistory(localStorage.getItem(HISTORY_KEY))); } catch { setMessage("이 브라우저에서는 기록 저장을 사용할 수 없습니다."); } }, []);
  const own = history.filter((entry) => entry.nickname.toLocaleLowerCase("ko-KR") === analysis.player.nickname.toLocaleLowerCase("ko-KR"));
  function save() {
    try { const entry = historyEntry(analysis, note), current = readHistory(localStorage.getItem(HISTORY_KEY));
      const next = [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, 20);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); setHistory(next); setMessage("이 기기에 분석 요약과 점검 메모를 저장했습니다.");
    } catch { setMessage("저장 공간을 사용할 수 없습니다. JSON 내보내기로 보관할 수 있습니다."); }
  }
  function remove(id: string) {
    try { const next = readHistory(localStorage.getItem(HISTORY_KEY)).filter((entry) => entry.id !== id);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); setHistory(next); setMessage("선택한 저장 기록을 삭제했습니다.");
    } catch { setMessage("저장 기록을 변경하지 못했습니다."); }
  }
  function download(kind: "json" | "csv") {
    const payload = { schemaVersion: 1, exportedAt: new Date().toISOString(), scope: analysis.scope,
      player: { nickname: analysis.player.nickname }, statistics: analysis.statistics, pick_profile: analysis.pick_profile,
      benchmark_coverage: analysis.benchmark_coverage, ...(includeMatches ? { recent_matches: analysis.recent_matches } : {}) };
    const blob = new Blob([kind === "csv" ? analysisCsv(analysis) : JSON.stringify(payload, null, 2)],
      { type: kind === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = `ERPS-${analysis.player.nickname.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")}-${analysis.scope.patch_key}.${kind}`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(kind === "json" ? "선택한 범위의 JSON 파일을 내보냈습니다." : "지표와 유효 표본을 CSV로 내보냈습니다.");
  }
  async function share() {
    const url = new URL(`/players/${encodeURIComponent(analysis.player.nickname)}`, location.origin);
    if (analysis.scope.selected_pick_key && analysis.scope.selected_pick_key !== "all") url.searchParams.set("pick", analysis.scope.selected_pick_key);
    try { await navigator.clipboard.writeText(url.toString()); setMessage("조회 링크를 복사했습니다. 링크를 연 시점의 최신 결과이며, 저장한 결과를 공개 업로드하지 않습니다."); }
    catch { setMessage(`조회 링크: ${url}`); }
  }
  const earlier = own.find((entry) => entry.id === before), later = own.find((entry) => entry.id === after);
  const comparison = earlier && later ? compareHistory(earlier, later) : null;
  function ask(event: FormEvent) { event.preventDefault(); setAnswer(answerAnalysisQuestion(question, analysis)); }
  return <section className="analysis-section stack" aria-label="분석 저장과 근거 질문">
    <details className="panel stack"><summary>기록 저장·점검 메모·기간 비교</summary>
      <p>저장 버튼을 누른 기록만 이 브라우저에 최대 20개 보관합니다. 서버 계정 이력과 동기화되지 않으며 브라우저 데이터를 지우면 사라집니다.</p>
      <label>다음에 확인할 행동 메모<textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="확인할 행동이나 다음 점검 내용을 남겨보세요" /></label>
      <button type="button" onClick={save}>현재 분석을 이 기기에 저장</button>
      <ul className="saved-analysis-list">{own.map((entry) => <li key={entry.id}>
        <span>{new Date(entry.generatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · {entry.patch} · {entry.games}판 · {entry.pick === "all" ? "전체 픽" : entry.pick}</span>
        {entry.note ? <p>{entry.note}</p> : null}<button type="button" className="secondary" onClick={() => remove(entry.id)}>이 기록 삭제</button>
      </li>)}</ul>
      {!own.length ? <p className="muted">이 기기에 저장한 기록이 없습니다.</p> : null}
      {own.length >= 2 ? <>
        <div className="browse-controls"><label>이전 기록<select value={before} onChange={(event) => setBefore(event.target.value)}><option value="">선택</option>{own.map((entry) => <option value={entry.id} key={entry.id}>{entry.generatedAt} · {entry.games}판</option>)}</select></label>
          <label>이후 기록<select value={after} onChange={(event) => setAfter(event.target.value)}><option value="">선택</option>{own.map((entry) => <option value={entry.id} key={entry.id}>{entry.generatedAt} · {entry.games}판</option>)}</select></label></div>
        {comparison ? <div role="status"><p>{comparison.reason}</p>{comparison.changes.length ? <ul>{comparison.changes.map((change) =>
          <li key={change.label}>{change.label}: {(change.before * (change.unit === "percent" ? 100 : 1)).toFixed(2)}{change.unit === "percent" ? "%" : ""} → {(change.after * (change.unit === "percent" ? 100 : 1)).toFixed(2)}{change.unit === "percent" ? "%" : ""} · 차이 {change.delta > 0 ? "+" : ""}{(change.delta * (change.unit === "percent" ? 100 : 1)).toFixed(2)}{change.unit === "percent" ? "%p" : ""}</li>)}</ul> : null}</div> : null}
      </> : null}
    </details>
    <details className="panel stack"><summary>데이터 내보내기·조회 링크 공유</summary>
      <p>파일에는 닉네임·패치·분석 시각·유효 표본과 계산 버전을 포함합니다. 조회 링크는 결과 파일을 공개 저장하지 않습니다.</p>
      <label className="inline-choice"><input type="checkbox" checked={includeMatches} onChange={(event) => setIncludeMatches(event.target.checked)} />JSON에 경기 목록·장비 등 상세 포함</label>
      <div className="action-row"><button type="button" onClick={() => download("json")}>JSON 내보내기</button><button type="button" className="secondary" onClick={() => download("csv")}>지표 CSV 내보내기</button><button type="button" className="secondary" onClick={() => void share()}>조회 링크 복사</button></div>
    </details>
    <details className="panel stack"><summary>현재 기록에 대해 질문하기</summary>
      <p>현재 화면의 실제 지표와 비교 근거 안에서 답합니다. 별도 AI 호출 없이 표본·지표·점검 제안을 찾아 안내합니다.</p>
      <div className="action-row">{["전투 지표를 알려줘", "표본과 신뢰도 기준은?", "어떤 행동을 점검할까?"].map((text) => <button className="secondary" key={text} type="button" onClick={() => { setQuestion(text); setAnswer(answerAnalysisQuestion(text, analysis)); }}>{text}</button>)}</div>
      <form className="form-row" onSubmit={ask}><label>기록 질문<input value={question} maxLength={200} required onChange={(event) => setQuestion(event.target.value)} /></label><button type="submit">근거 확인</button></form>
      {answer ? <div className="evidence-box" role="status"><p style={{ whiteSpace: "pre-line" }}>{answer.answer}</p><small>확인 위치: {answer.sources.join(" · ") || "지원하는 질문 범위 안내"}</small></div> : null}
    </details>
    {message ? <p className="form-status" role="status">{message}</p> : null}
  </section>;
}
