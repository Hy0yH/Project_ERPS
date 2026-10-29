import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/data", () => ({ getCharacterBuildMeta: vi.fn(), invalidateMetaReads: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn(), isSupabaseConfigured: () => true }));
import { getCharacterBuildMeta, invalidateMetaReads } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";
import { GET } from "@/app/api/characters/[characterCode]/builds/route";
import { PATCH } from "@/app/api/admin/patch-notes/import/route";

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("ADMIN_TOKEN", "qa-token"); });
afterEach(() => vi.unstubAllEnvs());
describe("build statistics API", () => {
  it.each(["", "?weapon=-1", "?weapon=1.5"])("requires a valid weapon: %s", async (suffix) => {
    expect((await GET(new NextRequest(`http://localhost/api/builds${suffix}`), { params: Promise.resolve({ characterCode: "1" }) })).status).toBe(400);
    expect(getCharacterBuildMeta).not.toHaveBeenCalled();
  });
  it("passes the selected character, weapon and rank scope and preserves an empty result", async () => {
    vi.mocked(getCharacterBuildMeta).mockResolvedValue(null);
    const result = await GET(new NextRequest("http://localhost/api/builds?weapon=15&rankScope=all"), { params: Promise.resolve({ characterCode: "1" }) });
    expect(await result.json()).toEqual({ data: null });
    expect(getCharacterBuildMeta).toHaveBeenCalledWith(1, 15, "all");
  });
  it("reports unavailable statistics without leaking database errors", async () => {
    vi.mocked(getCharacterBuildMeta).mockRejectedValue(new Error("private diagnostics"));
    const result = await GET(new NextRequest("http://localhost/api/builds?weapon=15"), { params: Promise.resolve({ characterCode: "1" }) });
    expect(result.status).toBe(503); expect(JSON.stringify(await result.json())).not.toContain("private");
  });
});

describe("build patch review", () => {
  const request = (body: string, token = "qa-token") => new NextRequest("http://localhost/api/admin/patch-notes/import", { method: "PATCH", headers: { "x-admin-token": token, "content-type": "application/json" }, body });
  it("requires admin authentication and validates JSON before database writes", async () => {
    expect((await PATCH(request('{"id":1,"reviewed":true}', "wrong"))).status).toBe(401);
    expect((await PATCH(request("{"))).status).toBe(400);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });
  it("rejects a target outside the official entity catalog and invalidates caches after a valid review", async () => {
    let allowed = false; const writes: unknown[] = [];
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: (table: string) => {
      const query: any = { select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: { id: 1, entity_type: "item", patch_version: "12.7", target_code: 101 }, error: null }),
        update: (value: unknown) => { writes.push(value); return query; },
        single: async () => ({ data: { id: 1, reviewed: true, target_code: 101 }, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "game_data_catalog" && allowed ? [{ meta_type: "ItemWeapon", name_ko: "검" }] : [], error: null }).then(resolve)
      }; return query;
    } } as never);
    expect((await PATCH(request('{"id":1,"reviewed":true}'))).status).toBe(400);
    expect(writes).toEqual([]);
    allowed = true;
    expect((await PATCH(request('{"id":1,"reviewed":true}'))).status).toBe(200);
    expect(writes).toEqual([{ reviewed: true, target_code: 101 }]);
    expect(invalidateMetaReads).toHaveBeenCalledOnce();
  });
});
