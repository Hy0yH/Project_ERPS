import { describe, expect, it } from "vitest";
import { actualMmrGain, normalizeOfficialAnalysisRow, readAnalysisNumber, spentCredits } from "@/lib/player-analysis-source";
import { equipmentWithAnalysisMetrics } from "@/lib/ingestion";
import { buildPlayerStatistics } from "@/lib/player-statistics";

const patch = { patch_key: "12.6.0", version_season: 12, version_major: 6, version_minor: 0,
  patch_start_at: "2026-10-15T02:00:00Z", latest_match_at: "" };
const official = { seasonId: 41, matchingMode: 3, matchingTeamMode: 3, versionMajor: 6, versionMinor: 0,
  startDtm: "2026-10-25T18:43:25.025+0900", playTime: 681, playerKill: 2, playerAssistant: 3,
  playerDeaths: 1, damageToPlayer: 4108, totalUseVFCredit: 385, viewContribution: 15 };

describe("official player analysis source reconciliation", () => {
  it("fills the omitted versionSeason only with matching ranked season, major/minor and patch boundary", () => {
    expect(normalizeOfficialAnalysisRow(official, patch, 41)).toMatchObject({ versionSeason: 12, analysis_patch_source: "verified_season_and_patch" });
    for (const row of [{ ...official, seasonId: 40 }, { ...official, matchingMode: 2 }, { ...official, versionMajor: 5 },
      { ...official, versionMinor: undefined }, { ...official, versionMinor: "" },
      { ...official, startDtm: "2026-10-01T00:00:00Z" }, { ...official, startDtm: "invalid" }]) {
      expect(normalizeOfficialAnalysisRow(row, patch, 41)).toBe(row);
    }
    expect(normalizeOfficialAnalysisRow({ ...official, versionSeason: 11 }, patch, 41).versionSeason).toBe(11);
  });

  it("preserves measured zero and missing values as distinct cases, including stored metadata", () => {
    const equipment = equipmentWithAnalysisMetrics({}, { ...official, teamRecover: 0 });
    expect(readAnalysisNumber({ equipment, team_recover: 999 }, "teamRecover", "team_recover")).toBe(0);
    expect(readAnalysisNumber({ equipment, protect_absorb: 0 }, "protectAbsorb", "protect_absorb")).toBeNull();
    expect(readAnalysisNumber({ playTime: null }, "playTime")).toBeNull();
    expect(readAnalysisNumber({ playTime: "invalid" }, "playTime")).toBeNull();
    expect(readAnalysisNumber({ equipment: { __analysis: { viewContribution: 17 } } }, "viewContribution")).toBe(17);
  });

  it("maps modern credit usage fields and persists raw evidence for additional metrics", () => {
    expect(spentCredits({ totalUseVFCredit: 385, sumUsedVFCredits: 400 })).toBe(385);
    expect(spentCredits({ sumUsedVFCredits: 385 })).toBe(385);
    expect(spentCredits({ usedVFCredits: [100, 200, 85] })).toBe(385);
    expect(spentCredits({ usedVFCredit: [100, 200, 85] })).toBe(385);
    expect(spentCredits({})).toBeNull();
    const equipment = equipmentWithAnalysisMetrics({ "0": 121503 }, official);
    expect(equipment.__analysis.raw.totalUseVFCredit).toBe(385);
    const stats = buildPlayerStatistics([{ equipment }]);
    expect(stats.metrics.find((metric) => metric.id === "credits_spent")?.value).toBe(385);
    expect(stats.metrics.find((metric) => metric.id === "damage_dealt")?.value).toBe(4108);
    expect(stats.metrics.find((metric) => metric.id === "shield_absorb")?.value).toBeNull();
  });

  it("reports actual RP changes separately from the base RP and does not treat a missing RP as zero", () => {
    expect(actualMmrGain({ mmrBefore: 5000, mmrAfter: 5050, mmrGain: 25 })).toBe(50);
    expect(actualMmrGain({ mmr_before: 0, mmr_after: 5050, mmr_gain: 25 })).toBe(25);
    expect(actualMmrGain({ mmrBefore: 7970, mmrAfter: 0, mmrGainGambit: 0, mmrGain: 0 })).toBe(0);
    expect(actualMmrGain({ mmrGainGambit: -40, mmrGain: -20 })).toBe(-40);
    expect(actualMmrGain({})).toBeNull();
  });
});
