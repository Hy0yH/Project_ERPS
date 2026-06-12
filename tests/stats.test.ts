import { describe, expect, it } from "vitest";
import {
  buildCompKey,
  confidenceFromGames,
  isTop3,
  tierFromScore,
  userAffinityScore
} from "@/lib/stats";

describe("stats helpers", () => {
  it("dedupes and sorts comp keys", () => {
    expect(buildCompKey([32, 4, 12, 4])).toBe("4-12-32");
  });

  it("uses game_rank <= 3 as top3", () => {
    expect(isTop3(1)).toBe(true);
    expect(isTop3(3)).toBe(true);
    expect(isTop3(4)).toBe(false);
  });

  it("marks low sample combinations as low confidence", () => {
    expect(confidenceFromGames(14, 3)).toBe("low");
    expect(confidenceFromGames(15, 3)).toBe("medium");
    expect(confidenceFromGames(30, 2)).toBe("medium");
  });

  it("uses sample size for tier labels", () => {
    expect(tierFromScore(0.9, 10)).toBe("표본 부족");
    expect(tierFromScore(0.8, 150)).toBe("S");
  });

  it("scores user affinity from volume and performance", () => {
    const score = userAffinityScore(7, [
      {
        character_code: 7,
        games: 20,
        wins: 4,
        top3: 12,
        win_rate: 0.2,
        top3_rate: 0.6,
        average_rank: 3
      }
    ]);
    expect(score).toBeGreaterThan(0.6);
  });
});
