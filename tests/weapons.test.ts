import { describe, expect, it } from "vitest";
import { isCharacterWeapon, weaponName, weaponType } from "@/lib/weapons";

describe("weapon mastery mapping", () => {
  it("uses the official mastery codes after the reserved code 12", () => {
    expect(weaponName(14)).toBe("\ub3c4\ub07c");
    expect(weaponName(15)).toBe("\ub2e8\uac80");
    expect(weaponName(21)).toBe("\ub808\uc774\ud53c\uc5b4");
    expect(weaponName(23)).toBe("\uce74\uba54\ub77c");
    expect(weaponName(24)).toBe("\uc544\ub974\uce74\ub098");
  });

  it("matches BattleUserResult codes to CharacterMastery values", () => {
    expect(weaponType(21)).toBe("Rapier");
    expect(isCharacterWeapon(["Rapier", "TwoHandSword", "Spear"], 21)).toBe(true);
    expect(isCharacterWeapon(["Rapier", "TwoHandSword", "Spear"], 14)).toBe(false);
  });
});
