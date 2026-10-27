import { randomUUID } from "node:crypto";
import type { PlayerAnalysis } from "@/lib/types";
export type AnalysisStage = "cache" | "collect" | "benchmark" | "calculate" | "explain" | "complete" | "failed";
export type AnalysisProgress = { jobId: string; stage: AnalysisStage; updatedAt: string };
type Job = { id: string; key: string; nickname: string; stage: AnalysisStage; startedAt: number; updatedAt: string;
  promise: Promise<PlayerAnalysis>; result?: PlayerAnalysis; listeners: Set<(progress: AnalysisProgress) => void> };
const jobs = new Map<string, Job>();
export class AnalysisBusyError extends Error {
  constructor() { super("다른 분석을 처리하고 있습니다. 잠시 후 다시 시도해 주세요."); }
}
export function runAnalysisJob(key: string, nickname: string,
  work: (report: (stage: AnalysisStage) => void) => Promise<PlayerAnalysis>, listener?: (progress: AnalysisProgress) => void) {
  for (const [id, job] of jobs) if (["complete", "failed"].includes(job.stage) && Date.now() - Date.parse(job.updatedAt) > 5 * 60_000) jobs.delete(id);
  const existing = [...jobs.values()].find((job) => job.key === key && !["complete", "failed"].includes(job.stage));
  if (existing) {
    if (listener) { existing.listeners.add(listener); listener({ jobId: existing.id, stage: existing.stage, updatedAt: existing.updatedAt }); }
    return existing.promise;
  }
  if ([...jobs.values()].filter((job) => !["complete", "failed"].includes(job.stage)).length >= 3) throw new AnalysisBusyError();
  if (jobs.size >= 20) { const finished = [...jobs.values()].find((job) => ["complete", "failed"].includes(job.stage)); if (finished) jobs.delete(finished.id); }
  const job = { id: randomUUID(), key, nickname: nickname.toLocaleLowerCase("ko-KR"), stage: "cache" as AnalysisStage,
    startedAt: Date.now(), updatedAt: new Date().toISOString(), listeners: new Set(listener ? [listener] : []) } as Job;
  const report = (stage: AnalysisStage) => { job.stage = stage; job.updatedAt = new Date().toISOString();
    for (const notify of job.listeners) { try { notify({ jobId: job.id, stage, updatedAt: job.updatedAt }); } catch { job.listeners.delete(notify); } } };
  jobs.set(job.id, job);
  job.promise = Promise.resolve().then(() => { report("cache"); return work(report); })
    .then((result) => { job.result = result; report("complete"); return result; }, (error) => { report("failed"); throw error; })
    .finally(() => job.listeners.clear());
  return job.promise;
}
export function getAnalysisJob(id: string, nickname: string) {
  const job = jobs.get(id);
  if (!job || job.nickname !== nickname.toLocaleLowerCase("ko-KR") ||
      ["complete", "failed"].includes(job.stage) && Date.now() - Date.parse(job.updatedAt) > 5 * 60_000) return null;
  return { jobId: job.id, stage: job.stage, updatedAt: job.updatedAt,
    persistence: "single_process" as const, ...(job.stage === "complete" ? { data: job.result } : {}) };
}
