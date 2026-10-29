import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn(), isSupabaseConfigured: () => true }));
vi.mock("@/lib/eternal-return", () => ({ fetchGameData: vi.fn(), fetchGameDataHashes: vi.fn(), fetchWeaponRoute: vi.fn() }));
vi.mock("@/lib/game-catalog", () => ({ getKoreanGameNames: async () => ({ "Item/Name/101": "검", "Trait/Name/7001": "핵심 특성" }) }));
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchGameData, fetchGameDataHashes, fetchWeaponRoute } from "@/lib/eternal-return";
import { collectRouteDefinitions, relevantBuildPatches, syncBuildCatalog } from "@/lib/build-data";
import { buildUsageStats, type BuildPatchChange } from "@/lib/build-stats";

const tables: Record<string, Record<string, any>[]> = {};
let catalogWrites = 0, failCatalogWrite = 0;
function database() {
  return { from(table: string) {
    tables[table] ??= [];
    const predicates: Array<(row: any) => boolean> = [];
    const query: any = {
      select: () => query,
      eq: (key: string, value: unknown) => { predicates.push((row) => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { predicates.push((row) => values.includes(row[key])); return query; },
      gte: (key: string, value: string) => { predicates.push((row) => row[key] >= value); return query; },
      maybeSingle: async () => ({ data: tables[table].find((row) => predicates.every((check) => check(row))) ?? null, error: null }),
      upsert: async (values: any, options: { onConflict: string }) => {
        if (table === "game_data_catalog" && ++catalogWrites === failCatalogWrite) return { error: new Error("batch failed") };
        for (const row of Array.isArray(values) ? values : [values]) {
          const index = tables[table].findIndex((entry) => options.onConflict.split(",").every((key) => entry[key] === row[key]));
          if (index < 0) tables[table].push(row); else tables[table][index] = row;
        }
        return { error: null };
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: tables[table].filter((row) => predicates.every((check) => check(row))), error: null }).then(resolve)
    };
    return query;
  } };
}
beforeEach(() => {
  vi.clearAllMocks(); for (const key of Object.keys(tables)) delete tables[key]; catalogWrites = 0; failCatalogWrite = 0;
  vi.mocked(getSupabaseAdmin).mockReturnValue(database() as never);
  vi.mocked(fetchGameDataHashes).mockResolvedValue({ ItemWeapon: 1, ItemArmor: 2, Trait: 3 });
  vi.mocked(fetchGameData).mockImplementation(async (type) => [{ code: type === "ItemWeapon" ? 101 : type === "ItemArmor" ? 201 : 7001, name: "source name" }]);
});
afterEach(() => vi.restoreAllMocks());

describe("official build catalog refresh", () => {
  it("preserves patch-specific metadata and skips fully saved, unchanged tables", async () => {
    expect(await syncBuildCatalog("12.7.0")).toMatchObject({ saved: 3, missing: ["TacticalSkillGroup"] });
    expect(tables.game_data_catalog[0]).toMatchObject({ code: 101, name_ko: "검", source_hash: "1", patch_key: "12.7.0" });
    expect(await syncBuildCatalog("12.7.0")).toMatchObject({ saved: 0, unchanged: 3 });
    expect(fetchGameData).toHaveBeenCalledTimes(3);
    await syncBuildCatalog("12.8.0");
    expect(tables.game_data_catalog).toHaveLength(6);
  });
  it("does not publish a hash for a partial batch and retries the full table", async () => {
    vi.mocked(fetchGameData).mockImplementation(async (type) => Array.from({ length: type === "ItemWeapon" ? 300 : 1 }, (_, index) => ({ code: index + 1 })));
    failCatalogWrite = 2;
    await expect(syncBuildCatalog("12.7.0")).rejects.toThrow("batch failed");
    expect(tables.game_catalog_versions).toHaveLength(0);
    failCatalogWrite = 0;
    await syncBuildCatalog("12.7.0");
    expect(tables.game_catalog_versions.find((row) => row.meta_type === "ItemWeapon")).toMatchObject({ row_count: 300 });
    expect(fetchGameData).toHaveBeenCalledWith("ItemWeapon", "v2");
    expect(vi.mocked(fetchGameData).mock.calls.filter(([type]) => type === "ItemWeapon")).toHaveLength(2);
  });
});

describe("shared route definitions", () => {
  it("defers enrichment when its time budget is exhausted so statistics can still be saved", async () => {
    expect(await collectRouteDefinitions([1, 2], "12.7.0", 20, 0)).toEqual({ saved: 0, unavailable: 0, failed: 0, deferred: 2 });
    expect(fetchWeaponRoute).not.toHaveBeenCalled();
  });
  it("bounds requests, caches deleted routes, and resumes uncached routes on the next run", async () => {
    vi.mocked(fetchWeaponRoute).mockImplementation(async (id) => id === 2 ? [] : [{ recommendedWeaponRoute: { id, paths: "[1,2]" } }]);
    expect(await collectRouteDefinitions([1, 1, 2, 3], "12.7.0", 2)).toEqual({ saved: 1, unavailable: 1, failed: 0, deferred: 1 });
    expect(fetchWeaponRoute).toHaveBeenCalledTimes(2);
    expect(await collectRouteDefinitions([1, 2, 3], "12.7.0", 2)).toEqual({ saved: 1, unavailable: 0, failed: 0, deferred: 0 });
    expect(fetchWeaponRoute).toHaveBeenLastCalledWith(3);
  });
  it("rejects mismatched IDs and records unavailable or failed lookups without inventing a route", async () => {
    vi.mocked(fetchWeaponRoute).mockResolvedValueOnce([{ recommendedWeaponRoute: { id: 999 } }]).mockRejectedValueOnce(new Error("unavailable"));
    expect(await collectRouteDefinitions([1, 2], "12.7.0")).toMatchObject({ saved: 0, unavailable: 1, failed: 1 });
    expect(tables.weapon_route_cache[0].payload).toEqual({ unavailable: true });
  });
});

it("links only reviewed patches for an observed item/trait/tactical skill", () => {
  const stats = buildUsageStats([{ gameRank: 1, equipment: { 0: 101 }, traitFirstCore: 7001 }]);
  const patch: BuildPatchChange = { patch_version: "12.7", entity_type: "item", target_code: 101, target_name: "검", raw_change_text: "피해량 증가", before_value: null, after_value: null, change_type: "buff", reviewed: true };
  expect(relevantBuildPatches(stats, [patch, { ...patch, reviewed: false }, { ...patch, target_code: 999 }, { ...patch, entity_type: "trait", target_code: null, target_name: "핵심 특성" }], { "Trait/Name/7001": "핵심 특성" })).toHaveLength(2);
});
