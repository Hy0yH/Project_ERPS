import { describe, expect, it } from "vitest";
import { labelMatchDetails, matchDetailSource } from "@/lib/match-details";
import { equipmentWithAnalysisMetrics } from "@/lib/ingestion";
describe("inspectable match details", () => {
  it("preserves equipment, traits, skill ordering and starting choices through database metadata", () => {
    const row = { equipment: { 0: 101, 1: 202 }, traitFirstCore: 10, traitFirstSub: [20, 30], traitSecondSub: [40],
      skillOrderInfo: { 2: 102, 1: 101 }, routeIdOfStart: 12345, placeOfStart: "Forest" };
    const details = matchDetailSource(row);
    expect(details.skills).toEqual([{ order: 1, code: 101 }, { order: 2, code: 102 }]);
    expect(details.traits).toEqual([10, 20, 30, 40]);
    expect(matchDetailSource({ equipment: equipmentWithAnalysisMetrics(row.equipment, row) })).toEqual(details);
    const labeled = labelMatchDetails(details, { "Item/Name/101": "검", "Skill/Group/Name/101": "첫 스킬", "Area/Name/Forest": "숲" });
    expect(labeled.equipment?.[0].name).toBe("검"); expect(labeled.startAreaName).toBe("숲");
  });
  it("distinguishes unavailable fields from known empty records and excludes malformed codes", () => {
    expect(matchDetailSource({}).skills).toBeNull();
    expect(matchDetailSource({ skillOrderInfo: {}, traitFirstSub: [] }).skills).toEqual([]);
    expect(matchDetailSource({ skillOrderInfo: { 1: true, 2: -1, 3: 2.5 }, equipment: { 0: false, 1: 0 } }).equipment).toEqual([]);
    expect(matchDetailSource({ skillOrderInfo: { 1: true, 2: -1, 3: 2.5 } }).skills).toEqual([]);
  });
});
