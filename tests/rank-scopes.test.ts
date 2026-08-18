import { describe, expect, it } from "vitest";
import { matchesRankScope, parseRankScope, sampleStatus } from "@/lib/rank-scopes";

describe("rank scopes", () => {
  it("classifies exact and above scopes at tier boundaries", () => {
    expect(matchesRankScope(6399, "exact:diamond")).toBe(true);
    expect(matchesRankScope(6400, "exact:diamond")).toBe(false);
    expect(matchesRankScope(6400, "above:diamond")).toBe(true);
    expect(matchesRankScope(7399, "exact:meteorite")).toBe(true);
    expect(matchesRankScope(7400, "above:mythril")).toBe(true);
  });

  it("falls back to the default scope for invalid input", () => {
    expect(parseRankScope("unknown")).toBe("above:mythril");
  });

  it("uses publishing thresholds for sample status", () => {
    expect(sampleStatus(29)).toBe("insufficient");
    expect(sampleStatus(30)).toBe("provisional");
    expect(sampleStatus(100)).toBe("standard");
    expect(sampleStatus(300)).toBe("high");
  });
});
