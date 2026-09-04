import { describe, expect, it } from "vitest";
import {
  classifyCharacterWeapon,
  combatMetricWeights,
  isRoleBenchmarkEligible
} from "@/lib/combat-archetypes";

describe("character weapon combat archetypes", () => {
  it("derives a melee damage profile from the official warrior metadata", () => {
    const result = classifyCharacterWeapon({
      characterCode: 1,
      weaponCode: 15,
      weaponType: "OneHandSword",
      officialPrimary: "Warrior",
      officialSecondary: "None",
      officialRangeType: "Melee"
    });
    expect(result).toMatchObject({
      rangeProfile: "melee",
      primaryFunction: "sustained_damage",
      secondaryFunction: null,
      scoreProfile: "melee_damage",
      reviewStatus: "auto",
      confidence: "high"
    });
    expect(isRoleBenchmarkEligible(result)).toBe(true);
  });

  it("separates melee engage characters from ordinary melee damage characters", () => {
    const result = classifyCharacterWeapon({
      characterCode: 4,
      weaponCode: 13,
      weaponType: "Hammer",
      officialPrimary: "Tanker",
      officialSecondary: "Warrior",
      officialRangeType: "Melee"
    });
    expect(result.scoreProfile).toBe("melee_engage");
    expect(result.primaryFunction).toBe("engage");
  });

  it("uses weapon-specific evidence for mage and marksman combinations", () => {
    const assaultRifle = classifyCharacterWeapon({
      characterCode: 2,
      weaponCode: 10,
      weaponType: "AssaultRifle",
      officialPrimary: "Mage",
      officialSecondary: "Marksman",
      officialRangeType: "Range"
    });
    const sniperRifle = classifyCharacterWeapon({
      characterCode: 2,
      weaponCode: 11,
      weaponType: "SniperRifle",
      officialPrimary: "Mage",
      officialSecondary: "Marksman",
      officialRangeType: "Range"
    });
    expect(assaultRifle.scoreProfile).toBe("ranged_sustained");
    expect(sniperRifle.scoreProfile).toBe("ranged_poke");
  });

  it("uses reviewed pistol overrides instead of guessing from the weapon alone", () => {
    const aya = classifyCharacterWeapon({
      characterCode: 2,
      weaponCode: 9,
      weaponType: "Pistol",
      officialPrimary: "Mage",
      officialSecondary: "Marksman",
      officialRangeType: "Range"
    });
    const isol = classifyCharacterWeapon({
      characterCode: 9,
      weaponCode: 9,
      weaponType: "Pistol",
      officialPrimary: "Marksman",
      officialSecondary: "Mage",
      officialRangeType: "Range"
    });
    const craver = classifyCharacterWeapon({
      characterCode: 89,
      weaponCode: 9,
      weaponType: "Pistol",
      officialPrimary: "Mage",
      officialSecondary: "Marksman",
      officialRangeType: "Range"
    });
    expect(aya).toMatchObject({ reviewStatus: "reviewed", scoreProfile: "ranged_poke" });
    expect(isol).toMatchObject({ reviewStatus: "reviewed", scoreProfile: "ranged_sustained" });
    expect(craver).toMatchObject({ reviewStatus: "reviewed", scoreProfile: "ranged_poke" });
    expect([aya, isol, craver].every(isRoleBenchmarkEligible)).toBe(true);
  });

  it("keeps officially hybrid characters in a separate profile", () => {
    const result = classifyCharacterWeapon({
      characterCode: 27,
      weaponCode: 2,
      weaponType: "Tonfa",
      officialPrimary: "Warrior",
      officialRangeType: "Both"
    });
    expect(result.rangeProfile).toBe("hybrid");
    expect(result.scoreProfile).toBe("hybrid_skirmisher");
    expect(isRoleBenchmarkEligible(result)).toBe(true);
  });

  it("uses the reviewed hybrid profile for the ranged warrior exception", () => {
    const result = classifyCharacterWeapon({
      characterCode: 64,
      weaponCode: 24,
      weaponType: "Arcana",
      officialPrimary: "Warrior",
      officialRangeType: "Range"
    });
    expect(result).toMatchObject({
      reviewStatus: "reviewed",
      rangeProfile: "hybrid",
      scoreProfile: "hybrid_skirmisher"
    });
    expect(isRoleBenchmarkEligible(result)).toBe(true);
  });

  it("falls back to weapon range but never invents a missing combat function", () => {
    const result = classifyCharacterWeapon({
      characterCode: 999,
      weaponCode: 7,
      weaponType: "Bow"
    });
    expect(result.rangeProfile).toBe("ranged");
    expect(result.scoreProfile).toBe("unclassified");
    expect(result.confidence).toBe("low");
    expect(isRoleBenchmarkEligible(result)).toBe(false);
  });

  it("keeps a weaponless official character out of role benchmarks", () => {
    const result = classifyCharacterWeapon({
      characterCode: 91,
      weaponCode: 0,
      officialPrimary: "Tanker",
      officialSecondary: "Supporter",
      officialRangeType: "Melee"
    });
    expect(result.reviewStatus).toBe("review_required");
    expect(result.reviewReason).toContain("공식 무기 정보");
    expect(isRoleBenchmarkEligible(result)).toBe(false);
  });

  it("maps official supporters to utility control", () => {
    const result = classifyCharacterWeapon({
      characterCode: 41,
      weaponCode: 24,
      weaponType: "Arcana",
      officialPrimary: "Supporter",
      officialRangeType: "Range"
    });
    expect(result.primaryFunction).toBe("support");
    expect(result.scoreProfile).toBe("utility_control");
  });

  it("keeps every combat profile weight normalized and role-sensitive", () => {
    const profiles = [
      "melee_damage",
      "melee_engage",
      "ranged_sustained",
      "ranged_poke",
      "utility_control",
      "hybrid_skirmisher"
    ] as const;
    for (const profile of profiles) {
      const weights = combatMetricWeights(profile);
      expect(Object.values(weights).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 8);
    }
    expect(combatMetricWeights("ranged_sustained").damage_per_minute).toBeGreaterThan(
      combatMetricWeights("melee_engage").damage_per_minute
    );
    expect(combatMetricWeights("melee_engage").cc_per_minute).toBeGreaterThan(
      combatMetricWeights("ranged_sustained").cc_per_minute
    );
    expect(combatMetricWeights("hybrid_skirmisher").damage_per_minute).toBeGreaterThan(
      combatMetricWeights("hybrid_skirmisher").cc_per_minute
    );
  });
});
