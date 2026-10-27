import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAnalysisStream } from "@/lib/analysis-stream";
import { playerFeedbackFixture } from "./fixtures/player-feedback";
beforeEach(() => vi.resetModules());
describe("analysis job lifecycle and streamed results", () => {
  it("merges the same running job and restricts job lookup to its player", async () => {
    const { runAnalysisJob, getAnalysisJob } = await import("@/lib/analysis-jobs");
    let finish!: (value: ReturnType<typeof playerFeedbackFixture>) => void;
    const work = vi.fn(() => new Promise<ReturnType<typeof playerFeedbackFixture>>((resolve) => { finish = resolve; }));
    let id = "";
    const first = runAnalysisJob("same", "플레이어", work, (progress) => { id = progress.jobId; });
    await Promise.resolve();
    const second = runAnalysisJob("same", "플레이어", work);
    expect(second).toBe(first); expect(work).toHaveBeenCalledOnce(); expect(getAnalysisJob(id, "다른플레이어")).toBeNull();
    finish(playerFeedbackFixture()); await first;
    expect(getAnalysisJob(id, "플레이어")?.stage).toBe("complete");
  });
  it("bounds distinct expensive jobs and makes failure visible without exposing an error payload", async () => {
    const { runAnalysisJob, AnalysisBusyError, getAnalysisJob } = await import("@/lib/analysis-jobs");
    const finish: Array<() => void> = [];
    const pending = [1, 2, 3].map((id) => runAnalysisJob(String(id), "QA", () => new Promise((resolve) => finish.push(() => resolve(playerFeedbackFixture())))));
    expect(() => runAnalysisJob("fourth", "QA", async () => playerFeedbackFixture())).toThrow(AnalysisBusyError);
    await Promise.resolve(); finish.forEach((resolve) => resolve()); await Promise.all(pending);
    let failedId = "";
    await expect(runAnalysisJob("failure", "QA", async () => { throw new Error("private database details"); }, (event) => { failedId = event.jobId; })).rejects.toThrow();
    expect(getAnalysisJob(failedId, "QA")).toMatchObject({ stage: "failed" });
    expect(JSON.stringify(getAnalysisJob(failedId, "QA"))).not.toContain("private database");
  });
  it("handles Korean UTF-8 chunks and detects a disconnected stream", async () => {
    const analysis = playerFeedbackFixture(), encoder = new TextEncoder();
    const bytes = encoder.encode(JSON.stringify({ type: "progress", jobId: "한글", stage: "collect" }) + "\n" + JSON.stringify({ type: "result", data: analysis }) + "\n");
    const response = new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close(); } }),
      { headers: { "content-type": "application/x-ndjson" } });
    const progress = vi.fn(); expect((await readAnalysisStream(response, progress)).scope.patch_key).toBe("12.6.0");
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ jobId: "한글" }));
    await expect(readAnalysisStream(new Response('{"type":"heartbeat"}\n', { headers: { "content-type": "application/x-ndjson" } }), vi.fn())).rejects.toThrow("연결이 종료");
  });
});
