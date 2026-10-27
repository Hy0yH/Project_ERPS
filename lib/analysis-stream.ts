import type { PlayerAnalysis } from "@/lib/types";
import type { AnalysisProgress } from "@/lib/analysis-jobs";
export async function readAnalysisStream(response: Response, onProgress: (progress: AnalysisProgress) => void) {
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const json = await response.json();
    if (!response.ok || !json.data) throw new Error(json.error ?? "분석 데이터를 불러오지 못했습니다.");
    return json.data as PlayerAnalysis;
  }
  if (!response.body) throw new Error("분석 연결을 열지 못했습니다.");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", bytes = 0, result: PlayerAnalysis | null = null;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "progress") onProgress(event);
    if (event.type === "error") throw new Error(event.error ?? "분석 중 오류가 발생했습니다.");
    if (event.type === "result") result = event.data;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 10_000_000) throw new Error("분석 응답 크기가 너무 큽니다.");
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      lines.forEach(consume);
    }
    buffer += decoder.decode(); if (buffer.trim()) consume(buffer);
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  if (!result) throw new Error("분석 연결이 종료되었습니다. 다시 시도하면 진행 중인 작업을 이어 확인합니다.");
  return result as PlayerAnalysis;
}
