import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/operations", () => ({ invalidateOperationsStatus: vi.fn() }));
import { runIngestionJob, IngestionBusyError } from "@/lib/ingestion-run";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("persisted job lifecycle", () => {
  it("rejects a database lease held by another worker", async () => {
    const db = { rpc: vi.fn(async () => ({ error: { code: "55P03" } })) };
    const work = vi.fn();
    await expect(runIngestionJob(db as any, "collect-rankers", work)).rejects.toBeInstanceOf(IngestionBusyError);
    expect(work).not.toHaveBeenCalled();
  });
  it("does not return successful results when finalization fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = { rpc: vi.fn(async (name: string) => name === "begin_ingestion_run"
      ? { data: 1, error: null } : { error: { code: "08006" } }) };
    await expect(runIngestionJob(db as any, "collect-rankers", async () => ({ result: 123 })))
      .rejects.toMatchObject({ code: "08006" });
    expect(db.rpc).toHaveBeenCalledTimes(3);
  });
  it("heartbeats active work, preserves counts, and stops the timer after completion", async () => {
    vi.useFakeTimers();
    const db = { rpc: vi.fn(async (name: string) => ({ data: name === "begin_ingestion_run" ? 7 : true, error: null })) };
    let release!: () => void;
    const running = runIngestionJob(db as any, "collect-rankers", async (run) => {
      run.progress("process_queue", 12);
      await new Promise<void>((resolve) => { release = resolve; });
      return { result: "done", status: "partial_success", savedMatches: 12 };
    });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(db.rpc).toHaveBeenCalledWith("heartbeat_ingestion_run", expect.objectContaining({ p_stage: "process_queue", p_saved_matches: 12 }));
    release(); await expect(running).resolves.toBe("done");
    expect(db.rpc).toHaveBeenCalledWith("finish_ingestion_run", expect.objectContaining({ p_status: "partial_success", p_saved_matches: 12 }));
    expect(vi.getTimerCount()).toBe(0);
  });
  it("fails interrupted work when its heartbeat loses ownership", async () => {
    vi.useFakeTimers();
    const db = { rpc: vi.fn(async (name: string) => ({ data: name === "begin_ingestion_run" ? 7 : name !== "heartbeat_ingestion_run", error: null })) };
    let release!: () => void;
    const running = runIngestionJob(db as any, "collect-rankers", async (run) => {
      await new Promise<void>((resolve) => { release = resolve; });
      run.progress("discovery");
      return { result: "must not return" };
    });
    const rejected = expect(running).rejects.toThrow("lease lost");
    await vi.advanceTimersByTimeAsync(31_000); release(); await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});
