import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/operations", () => ({ getOperationsStatus: vi.fn(), invalidateOperationsStatus: vi.fn() }));
vi.mock("@/lib/ingestion", () => ({ collectRankerMatches: vi.fn(), CollectionBusyError: class extends Error {} }));
import { getSupabaseAdmin } from "@/lib/supabase";
import { collectRankerMatches, CollectionBusyError } from "@/lib/ingestion";
import { POST as retry } from "@/app/api/admin/operations/route";
import { POST as collect } from "@/app/api/cron/collect-rankers/route";

const rpc = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("ADMIN_TOKEN", "test-admin"); vi.stubEnv("CRON_SECRET", "test-cron");
  vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc } as any);
  rpc.mockResolvedValue({ data: 2, error: null });
});
afterEach(() => vi.unstubAllEnvs());
const request = (body: string, token = "test-admin") => new NextRequest("http://localhost/api/admin/operations", {
  method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": token }, body
});

describe("selected match retry endpoint", () => {
  it("requires admin authorization before any work", async () => {
    expect((await retry(request('{"gameIds":[1]}', "invalid"))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["{", "{}", '{"gameIds":[]}', '{"gameIds":[0]}', '{"gameIds":[1.5]}', '{"gameIds":[1,1]}',
    '{"gameIds":["1"]}', JSON.stringify({ gameIds: Array.from({ length: 101 }, (_, i) => i + 1) })])
    ("rejects invalid retry selections before database writes: %s", async (body) => {
      expect((await retry(request(body))).status).toBe(400); expect(rpc).not.toHaveBeenCalled();
    });
  it("requeues the selected IDs only and returns the affected count", async () => {
    const response = await retry(request('{"gameIds":[100,101]}'));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("retry_ingestion_matches", { p_game_ids: [100, 101] });
    expect(await response.json()).toEqual({ data: { requeuedMatches: 2 } });
  });
  it("does not expose database diagnostic details", async () => {
    rpc.mockResolvedValue({ error: new Error("private database value") });
    const response = await retry(request('{"gameIds":[100]}'));
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("private");
  });
});

describe("collection endpoint status", () => {
  const cron = () => new NextRequest("http://localhost/api/cron/collect-rankers", { method: "POST", headers: { "x-cron-secret": "test-cron" } });
  it("returns a failure status when every collection attempt failed", async () => {
    vi.mocked(collectRankerMatches).mockResolvedValue({ status: "failed" } as any);
    expect((await collect(cron())).status).toBe(503);
  });
  it("preserves a usable partial result and distinguishes an active worker", async () => {
    vi.mocked(collectRankerMatches).mockResolvedValueOnce({ status: "partial_success" } as any);
    expect((await collect(cron())).status).toBe(200);
    vi.mocked(collectRankerMatches).mockRejectedValueOnce(new CollectionBusyError());
    expect((await collect(cron())).status).toBe(409);
  });
});
