import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: vi.fn()
}));
vi.mock("@/lib/patch-version", () => ({ getActivePatch: vi.fn() }));

import { getCharacterMeta, getSnapshotSummary, getTeamCompCount } from "@/lib/data";
import { getActivePatch } from "@/lib/patch-version";
import { getSupabaseAdmin } from "@/lib/supabase";

describe("snapshot selection after a patch update", () => {
  const filters: unknown[][] = [];

  beforeEach(() => {
    filters.length = 0;
    vi.mocked(getActivePatch).mockResolvedValue({
      patch_key: "12.5.0",
      version_season: 12,
      version_major: 5,
      version_minor: 0,
      patch_start_at: "2026-10-01T02:00:00.000Z",
      latest_match_at: ""
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: (table: string) => {
        let eligible = true;
        const oldSnapshot = {
          period_start: "2026-09-17T02:00:00.000Z",
          period_end: "2026-10-05T00:00:00.000Z",
          tier_filter: "current_patch:12.4.0"
        };
        const query: any = {
          select: () => query,
          order: () => query,
          limit: () => query,
          eq: (column: string, value: unknown) => {
            filters.push([table, column, value]);
            if (column === "tier_filter") eligible &&= oldSnapshot.tier_filter === value;
            return query;
          },
          gte: (column: string, value: string) => {
            filters.push([table, column, value]);
            if (column === "period_start") eligible &&= oldSnapshot.period_start >= value;
            return query;
          },
          maybeSingle: async () => ({ data: eligible ? oldSnapshot : null, error: null })
        };
        return query;
      }
    } as any);
  });

  it("keeps 12.4 character statistics out of the 12.5 homepage until new statistics exist", async () => {
    expect(await getCharacterMeta()).toEqual([]);
    expect(await getSnapshotSummary()).toBeNull();
    expect(filters).toContainEqual(["character_stats_snapshot", "tier_filter", "current_patch:12.5.0"]);
  });

  it("keeps old team statistics out of the current patch", async () => {
    expect(await getTeamCompCount()).toBe(0);
    expect(filters).toContainEqual(["team_comp_stats", "period_start", "2026-10-01T02:00:00.000Z"]);
  });
});
