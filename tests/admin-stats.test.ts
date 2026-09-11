import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/data", () => ({ getCharacterMeta: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: vi.fn() }));

import { GET } from "@/app/api/admin/stats/route";
import { getCharacterMeta } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";

function request(token?: string) {
  return new NextRequest("http://localhost/api/admin/stats", {
    headers: token ? { "x-admin-token": token } : {}
  });
}

describe("internal statistics access", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_TOKEN", "test-admin-token");
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it("blocks access when the administrator token is not configured", async () => {
    vi.stubEnv("ADMIN_TOKEN", "");
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(getCharacterMeta).not.toHaveBeenCalled();
  });

  it.each([undefined, "wrong-token"])("blocks an unauthenticated request (%s)", async (token) => {
    const response = await GET(request(token));
    expect(response.status).toBe(401);
    expect(getCharacterMeta).not.toHaveBeenCalled();
  });

  it("returns the count only after authentication and prevents caching", async () => {
    vi.mocked(getCharacterMeta).mockResolvedValue([]);
    const response = await GET(request("test-admin-token"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ data: { characterWeaponCount: 0 } });
    expect(getCharacterMeta).toHaveBeenCalledOnce();
  });

  it("reports unavailable data without presenting a misleading zero", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    const response = await GET(request("test-admin-token"));
    expect(response.status).toBe(503);
    expect(getCharacterMeta).not.toHaveBeenCalled();
  });

  it("does not expose database error details", async () => {
    vi.mocked(getCharacterMeta).mockRejectedValue(new Error("private database details"));
    const response = await GET(request("test-admin-token"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "통계를 불러오지 못했습니다." });
  });
});
