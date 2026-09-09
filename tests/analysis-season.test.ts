import { describe, expect, it } from "vitest";
import { resolveAnalysisSeason, validSeasonId } from "@/lib/analysis-season";

describe("analysis season resolution", () => {
  it("uses stored ranked season when configuration is missing instead of season zero", () => {
    expect(resolveAnalysisSeason(0, 41)).toBe(41);
    expect(resolveAnalysisSeason(undefined, 41)).toBe(41);
  });

  it("uses official rows on an empty database and advances at season rollover", () => {
    expect(resolveAnalysisSeason(0, null, [{ seasonId: 41 }])).toBe(41);
    expect(resolveAnalysisSeason(0, 41, [{ season_id: 42 }, { seasonId: 40 }])).toBe(42);
  });

  it("preserves an explicit valid season even with rows from other seasons", () => {
    expect(resolveAnalysisSeason(41, 42, [{ seasonId: 42 }])).toBe(41);
  });

  it("does not fabricate a season from invalid or missing evidence", () => {
    for (const value of [0, -1, 41.5, NaN, Infinity, "invalid", null, undefined, ""]) {
      expect(validSeasonId(value)).toBeNull();
    }
    expect(resolveAnalysisSeason(0, null, [{ versionSeason: 12 }])).toBeNull();
  });
});
