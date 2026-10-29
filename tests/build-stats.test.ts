import { describe, expect, it } from "vitest";
import { buildUsageStats, labelBuildStats } from "@/lib/build-stats";
import { buildCharacterSnapshotRows, equipmentWithAnalysisMetrics } from "@/lib/ingestion";
import { matchDetailSource } from "@/lib/match-details";
import { parseBuildPatchChanges, parsePatchNote } from "@/lib/patch-notes";
import { BUNDLED_BUILD_PATCHES } from "@/lib/bundled-build-patches";

const complete = {
  gameId: 1, userNum: 1, gameRank: 1, equipment: { 0: 101, 1: 201, 2: 301, 3: 401, 4: 501 },
  traitFirstCore: 7001, traitFirstSub: [7002, 7003], traitSecondSub: [7004, 7005],
  routeIdOfStart: 123, placeOfStart: "3", tacticalSkillGroup: 20, tacticalSkillLevel: 2,
  skillOrderInfo: { 2: 102, 1: 101 }
};

describe("build detail collection and participant-game statistics", () => {
  it("retains trait categories, tactical skill and original detail through storage", () => {
    const stored = equipmentWithAnalysisMetrics(complete.equipment, complete);
    expect(matchDetailSource({ equipment: stored })).toEqual(matchDetailSource(complete));
    expect(matchDetailSource({ build_details: stored.__analysis.details })).toEqual(matchDetailSource(complete));
    expect(matchDetailSource({ equipment: stored })).toMatchObject({ collectionVersion: 2,
      traitGroups: { core: 7001, firstSub: [7002, 7003], secondSub: [7004, 7005] }, tacticalSkillCode: 20, tacticalSkillLevel: 2 });
  });

  it("uses observed slot/category denominators and ignores missing fields and duplicate participants", () => {
    const partial = { gameId: 2, userNum: 1, gameRank: 4, equipment: { 1: 202 }, traitFirstCore: 7101, traitFirstSub: [7002, 7002] };
    const stats = buildUsageStats([complete, complete, partial, { gameId: 3, userNum: 1, gameRank: 8 }]);
    expect(stats.games).toBe(3);
    expect(stats.coverage).toMatchObject({ items: 2, item_sets: 1, traits: 2, trait_sets: 1, routes: 1, tactical_skills: 1 });
    expect(stats.groups.items.find((entry) => entry.codes[0] === 101)).toMatchObject({ games: 1, eligible_games: 1, pick_rate: 1, wins: 1 });
    expect(stats.groups.items.find((entry) => entry.codes[0] === 202)).toMatchObject({ games: 1, eligible_games: 2, pick_rate: 0.5, win_rate: 0, average_rank: 4 });
    expect(stats.groups.traits.find((entry) => entry.key === "주 특성 보조:7002")).toMatchObject({ games: 2, eligible_games: 2, pick_rate: 1, win_rate: 0.5, top3_rate: 0.5, average_rank: 2.5 });
    expect(stats.groups.traits.find((entry) => entry.key === "core:7001")).toMatchObject({ games: 1, eligible_games: 2, pick_rate: 0.5 });
  });

  it("canonicalizes unordered sub-traits and equipment, while retaining skill order", () => {
    const stats = buildUsageStats([complete, { ...complete, gameId: 2, gameRank: 3, traitFirstSub: [7003, 7002], traitSecondSub: [7005, 7004], skillOrderInfo: { 1: 102, 2: 101 } }]);
    expect(stats.groups.trait_sets).toHaveLength(1);
    expect(stats.groups.trait_sets[0]).toMatchObject({ games: 2, win_rate: 0.5, top3_rate: 1, average_rank: 2 });
    expect(stats.groups.item_sets).toHaveLength(1);
    expect(stats.groups.skill_orders).toHaveLength(2);
    expect(labelBuildStats(stats, { "Item/Name/101": "검" }).groups.items.find((entry) => entry.codes[0] === 101)?.name).toBe("검");
  });

  it("retains legacy uncategorized traits without inventing a complete trait set", () => {
    const stats = buildUsageStats([{ game_rank: 2, equipment: { __analysis: { details: { equipment: [], traits: [7001, 7002], skills: null, routeId: null, startArea: null } } } }]);
    expect(stats.groups.traits).toHaveLength(2);
    expect(stats.groups.traits[0].slot).toBe("분류 미수집");
    expect(stats.groups.trait_sets).toEqual([]);
    expect(buildUsageStats([{ gameRank: 0 }, { gameRank: -1 }, { gameRank: null }]).games).toBe(0);
  });

  it("reports full variant counts while returning a bounded popular list", () => {
    const stats = buildUsageStats(Array.from({ length: 35 }, (_, i) => ({ gameId: i + 1, userNum: 1, gameRank: 2, routeIdOfStart: i + 1 })));
    expect(stats.groups.routes).toHaveLength(20);
    expect(stats.variant_counts.routes).toBe(35);
    expect(stats.coverage.routes).toBe(35);
  });

  it("writes detail statistics into the same patch/weapon/rank snapshot as character performance", () => {
    const snapshots = buildCharacterSnapshotRows([
      { game_id: 1, user_num: 1, character_code: 1, best_weapon: 15, game_rank: 1, equipment: equipmentWithAnalysisMetrics(complete.equipment, complete) },
      { game_id: 2, user_num: 1, character_code: 1, best_weapon: 18, game_rank: 6, equipment: {} }
    ], "all", 14, "2026-10-29T02:00:00Z", "2026-10-29T05:00:00Z", { patch_key: "12.7.0", version_season: 12, version_major: 7, version_minor: 0, patch_start_at: "2026-10-29T02:00:00Z", latest_match_at: "" });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({ weapon_code: 15, rank_scope: "all", tier_filter: "current_patch:12.7.0", build_stats: { games: 1, coverage: { items: 1, routes: 1 } } });
    expect(snapshots[1].build_stats.coverage.items).toBe(0);
    expect(buildUsageStats([{ gameRank: 1, placeOfStart: "Forest" }]).groups.start_areas[0].name).toBe("Forest");
    expect(buildUsageStats([0, -1, 1.5].map((placeOfStart) => ({ gameRank: 1, placeOfStart }))).coverage.start_areas).toBe(0);
  });
});

describe("general-mode build patch parsing", () => {
  it("extracts the patch version from a dated official title rather than the publication date", () => {
    expect(parsePatchNote("2026.10.29 - 12.7 패치노트 :: 이터널 리턴\n전술 스킬\n진실의 칼날\n쿨다운 10/8초 → 9/7초", "https://playeternalreturn.com/posts/news/3924").patchVersion).toBe("12.7");
    expect(parseBuildPatchChanges("코발트 프로토콜\n방어구\n모드용 장비\n피해량 10 → 20", "12.7")).toEqual([]);
  });
  it("handles inline items, formulas, cooldown direction, and excludes Cobalt and character sections", () => {
    const result = parseBuildPatchChanges(`전술 스킬\n진실의 칼날\n쿨다운 10/8초 → 9/7초\n실험체\n재키\n공격력 1 → 2\n방어구\n옷\n이단심판관\n차원 균열 - [고유 지속 효과]\n피해량 12(+스킬 증폭의 4%) → 12(+스킬 증폭의 5%)\n팔/장식\n서슬가시 체인 방어 관통 12 → 13\n특성\n테스트 특성\n피해량 20 → 10\n코발트 프로토콜\n방어구\n코발트 아이템\n공격력 10 → 20`, "12.7");
    expect(result.slice(0, 4).map((change) => [change.entity_type, change.target_name, change.change_type])).toEqual([
      ["tactical_skill", "진실의 칼날", "buff"], ["item", "이단심판관", "buff"], ["item", "서슬가시 체인", "buff"], ["trait", "테스트 특성", "nerf"]
    ]);
    expect(result.every((change) => !change.reviewed && change.target_code === null)).toBe(true);
    expect(result.some((change) => change.target_name === "재키")).toBe(false);
    expect(result.some((change) => change.target_name === "코발트 아이템")).toBe(false);
  });

  it("provides reviewed current official changes without guessed target codes", () => {
    expect(BUNDLED_BUILD_PATCHES.map((change) => change.target_name)).toEqual(["진실의 칼날", "이단심판관", "서슬가시 체인"]);
    expect(BUNDLED_BUILD_PATCHES.every((change) => change.reviewed && change.source_url?.includes("3924") && change.target_code === null)).toBe(true);
  });
});
