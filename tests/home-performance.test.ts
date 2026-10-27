import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: () => true, getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/patch-version", () => ({ getActivePatch: vi.fn() }));

import { getSupabaseAdmin } from "@/lib/supabase";
import { getActivePatch } from "@/lib/patch-version";
import { getTeamComps, getTopTeamComps, invalidateMetaReads } from "@/lib/data";
import { getPublicSnapshotStatus, invalidateOperationsStatus } from "@/lib/operations";

const patch = {
  patch_key: "12.6.0", version_season: 12, version_major: 6, version_minor: 0,
  patch_start_at: "2026-10-15T02:00:00.000Z", latest_match_at: ""
};

function makeComp(index: number, games: number, winRate = 0, confidence = 1) {
  return { comp_key: String(index).padStart(5, "0"), character_codes: [1, 2], character_weapon_keys: [], comp_size: 2,
    games, wins: 0, top3: 0, win_rate: winRate, top3_rate: winRate, average_rank: winRate ? 1 : 8,
    confidence_score: confidence };
}

function database(rows: ReturnType<typeof makeComp>[]) {
  const calls: Array<{ table: string; columns: string; from?: number; to?: number; filters: unknown[][] }> = [];
  let failPage = false;
  const db = {
    from(table: string) {
      const call = { table, columns: "", filters: [] as unknown[][] } as typeof calls[number];
      calls.push(call);
      const orders: Array<[string, boolean]> = [];
      let head = false;
      const result = () => {
        if (head) return { count: rows.length, data: null, error: null };
        if (table === "characters") return { data: [{ character_code: 1, name_ko: "아야" }, { character_code: 2, name_ko: "재키" }], error: null };
        if (failPage) { failPage = false; return { data: null, error: new Error("temporary read failure") }; }
        const sorted = [...rows].sort((a: any, b: any) => {
          for (const [column, ascending] of orders) {
            const compared = typeof a[column] === "number" ? a[column] - b[column] : String(a[column]).localeCompare(String(b[column]));
            if (compared) return ascending ? compared : -compared;
          }
          return 0;
        });
        return { data: sorted.slice(call.from ?? 0, (call.to ?? rows.length - 1) + 1), error: null };
      };
      const query: any = {
        select(columns: string, options?: { head?: boolean }) { call.columns = columns; head = options?.head ?? false; return query; },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return query; },
        gte(column: string, value: unknown) { call.filters.push([column, value]); return query; },
        order(column: string, options?: { ascending?: boolean }) { orders.push([column, options?.ascending ?? true]); return query; },
        limit() { return query; },
        range(from: number, to: number) { call.from = from; call.to = to; return query; },
        maybeSingle: async () => ({ data: { period_start: patch.patch_start_at, period_end: "2026-10-28T00:00:00Z" }, error: null }),
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(result()).then(resolve, reject); }
      };
      return query;
    }
  };
  return { db, calls, failNextPage: () => { failPage = true; } };
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidateMetaReads();
  invalidateOperationsStatus();
  vi.mocked(getActivePatch).mockResolvedValue(patch);
});

describe("homepage read performance without changing the rankings", () => {
  it("matches the full ranking and global tiers while skipping low-volume pages", async () => {
    const rows = Array.from({ length: 2200 }, (_, i) => makeComp(i, i < 5 ? 1000 - i : 1, i < 5 ? 1 : 0));
    const fixture = database(rows);
    vi.mocked(getSupabaseAdmin).mockReturnValue(fixture.db as never);
    const top = await getTopTeamComps();
    expect(fixture.calls.filter((call) => call.from !== undefined)).toHaveLength(1);
    expect(getActivePatch).toHaveBeenCalledTimes(1);
    const full = await getTeamComps([]);
    expect(top).toEqual(full.slice(0, 5));
    expect(top.every((item) => item.tier === "S")).toBe(true);
  });

  it("reads later pages when fewer games can still produce a better score", async () => {
    const rows = Array.from({ length: 1100 }, (_, i) => makeComp(i, 1000 - Math.min(i, 999)));
    rows[700] = makeComp(700, 300, 1);
    const fixture = database(rows);
    vi.mocked(getSupabaseAdmin).mockReturnValue(fixture.db as never);
    const top = await getTopTeamComps();
    expect(fixture.calls.filter((call) => call.from !== undefined).length).toBeGreaterThan(1);
    expect(top[0].comp_key).toBe(rows[700].comp_key);
    expect(top).toEqual((await getTeamComps([])).slice(0, 5));
  });

  it("preserves deterministic tie ordering across a page boundary", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => makeComp(i, 20, 0.5, 0.6));
    rows[500] = { ...rows[500], character_codes: [2, 1] };
    const fixture = database(rows);
    vi.mocked(getSupabaseAdmin).mockReturnValue(fixture.db as never);
    expect(await getTopTeamComps()).toEqual((await getTeamComps([])).slice(0, 5));
  });

  it("merges concurrent reads, separates rank scopes and refreshes after invalidation", async () => {
    const fixture = database([makeComp(1, 100, 1)]);
    vi.mocked(getSupabaseAdmin).mockReturnValue(fixture.db as never);
    const [first, second] = await Promise.all([getTopTeamComps(), getTopTeamComps()]);
    expect(first).toEqual(second);
    expect(fixture.calls.filter((call) => call.from !== undefined)).toHaveLength(1);
    await getTopTeamComps(14, "all");
    expect(fixture.calls.filter((call) => call.from !== undefined)).toHaveLength(2);
    expect(fixture.calls.some((call) => call.filters.some(([key, value]) => key === "rank_scope" && value === "all"))).toBe(true);
    invalidateMetaReads();
    await getTopTeamComps();
    expect(fixture.calls.filter((call) => call.from !== undefined)).toHaveLength(3);
  });

  it("retries a failed read instead of caching the error", async () => {
    const fixture = database([makeComp(1, 100, 1)]);
    vi.mocked(getSupabaseAdmin).mockReturnValue(fixture.db as never);
    fixture.failNextPage();
    await expect(getTopTeamComps()).rejects.toThrow("temporary read failure");
    expect(await getTopTeamComps()).toHaveLength(1);
  });

  it("keeps public snapshot status away from the queue, benchmarks and run logs", async () => {
    const fixture = database([]);
    vi.mocked(getSupabaseAdmin).mockReturnValue(fixture.db as never);
    const status = await getPublicSnapshotStatus();
    expect(status.database).toBe("ready");
    expect(fixture.calls.map((call) => call.table)).toEqual(["character_stats_snapshot", "team_comp_stats"]);
    expect(fixture.calls[0].filters).toContainEqual(["tier_filter", "current_patch:12.6.0"]);
  });
});
