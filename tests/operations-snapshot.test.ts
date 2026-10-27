import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
import { getSupabaseAdmin } from "@/lib/supabase";
import { snapshotDiagnostic, summarizeFreshness } from "@/lib/operations";
import { runSnapshotBuild, writeSnapshotBatches } from "@/lib/snapshot-build";
import { assertAdminToken, assertCronSecret } from "@/lib/auth";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("operational freshness and batch failure evidence", () => {
  it("releases the build lock when database initialization fails", async () => {
    vi.mocked(getSupabaseAdmin).mockImplementation(() => { throw new Error("configuration unavailable"); });
    await expect(runSnapshotBuild(async () => {})).rejects.toThrow("configuration unavailable");
    await expect(runSnapshotBuild(async () => {})).rejects.toThrow("configuration unavailable");
  });
  it("exposes only bounded structured failure metadata", () => {
    expect(snapshotDiagnostic(JSON.stringify({ stage: "write:team_comp_stats", rows: 800, batch: 2, code: "57014", secret: "not for display" })))
      .toEqual({ stage: "write:team_comp_stats", rows: 800, batch: 2, code: "57014" });
    expect(snapshotDiagnostic("raw database error with private details")).toBeNull();
    expect(snapshotDiagnostic(JSON.stringify({ stage: "arbitrary message", rows: 1, batch: 1, code: "bad" }))).toBeNull();
  });
  it("distinguishes a delayed or mismatched snapshot from a healthy pair", () => {
    const now = Date.parse("2026-10-27T00:00:00Z");
    expect(summarizeFreshness({ characters: "2026-10-26T23:00:00Z", compositions: "2026-10-26T23:00:20Z", benchmarks: null }, now)).toEqual({ stale: false, inconsistent: false });
    expect(summarizeFreshness({ characters: "2026-10-26T23:00:00Z", compositions: "2026-10-20T00:00:00Z", benchmarks: null }, now)).toEqual({ stale: true, inconsistent: true });
    expect(summarizeFreshness({ characters: null, compositions: null, benchmarks: null }, now).stale).toBe(true);
  });
  it("records the exact failing batch and stops writing subsequent batches", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const writes: number[][] = [], updates: Array<Record<string, unknown>> = [];
    const db = { from: (table: string) => table === "ingestion_runs" ? {
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 9 }, error: null }) }) }),
      update: (value: Record<string, unknown>) => { updates.push(value); return { eq: async () => ({ error: null }) }; }
    } : { upsert: async (rows: Array<{ id: number }>) => { writes.push(rows.map((row) => row.id)); return { error: writes.length === 2 ? { code: "57014" } : null }; } } };
    vi.mocked(getSupabaseAdmin).mockReturnValue(db as never);
    await expect(runSnapshotBuild((progress) => writeSnapshotBatches(db as never, "team_comp_stats",
      [1, 2, 3, 4, 5].map((id) => ({ id })), "id", progress, 2))).rejects.toMatchObject({ code: "57014" });
    expect(writes).toEqual([[1, 2], [3, 4]]);
    expect(updates.at(-1)).toMatchObject({ status: "failed" });
    expect(JSON.parse(String(updates.at(-1)?.error_message))).toMatchObject({ stage: "write:team_comp_stats", batch: 2, code: "57014" });
  });
  it("fails closed for missing management credentials while accepting configured tokens", () => {
    vi.stubEnv("ADMIN_TOKEN", ""); vi.stubEnv("CRON_SECRET", "change-me");
    const request = new NextRequest("http://localhost/api/qa");
    expect(assertAdminToken(request)?.status).toBe(503); expect(assertCronSecret(request)?.status).toBe(503);
    vi.stubEnv("ADMIN_TOKEN", "qa-token");
    expect(assertAdminToken(new NextRequest("http://localhost/api/qa", { headers: { "x-admin-token": "qa-token" } }))).toBeNull();
    expect(assertAdminToken(request)?.status).toBe(401);
  });
});
