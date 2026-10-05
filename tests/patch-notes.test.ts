import { describe, expect, it } from "vitest";
import { parsePatchNote } from "@/lib/patch-notes";
import {
  BUNDLED_PATCH_CHANGES,
  getBundledPatchChanges,
  patchChangeLabel,
  patchChangeSections,
  patchSourceUrl
} from "@/lib/bundled-patch-changes";

describe("patch note parser", () => {
  it("extracts numeric before/after changes", () => {
    const parsed = parsePatchNote(
      `
      Version 1.35
      Characters
      레온
      피해량 30 -> 36 증가
      쿨다운 12 -> 10 감소
      Items
      기타 변경
      `,
      "https://playeternalreturn.com/posts/news/3606"
    );

    expect(parsed.patchVersion).toBe("1.35");
    expect(parsed.changes.length).toBe(2);
    expect(parsed.changes[0].before_value).toBe("30");
    expect(parsed.changes[0].after_value).toBe("36");
  });
});

describe("bundled patch changes", () => {
  it("covers all 33 characters in the official 12.5 general-mode balance section", () => {
    const changes = BUNDLED_PATCH_CHANGES.filter((change) => change.patch_version === "12.5");
    expect([...new Set(changes.map((change) => change.character_code))].sort((a, b) => a - b)).toEqual([
      2, 3, 4, 7, 8, 9, 11, 12, 14, 17, 20, 22, 23, 26, 28, 31, 33,
      35, 37, 39, 50, 51, 53, 66, 73, 78, 79, 80, 81, 84, 86, 88, 89
    ]);
    expect(changes).toHaveLength(37);
    expect(changes.filter((change) => change.change_type === "buff")).toHaveLength(16);
    expect(changes.filter((change) => change.change_type === "nerf")).toHaveLength(17);
    expect(changes.filter((change) => change.change_type === "bugfix")).toHaveLength(4);
    expect(patchSourceUrl("12.5")).toContain("/posts/news/3867");
  });

  it("limits 12.5 mastery nerfs to the affected weapon", () => {
    const changesFor = (character: number, weapon: number) => getBundledPatchChanges(character, weapon)
      .filter((change) => change.patch_version === "12.5");
    expect(changesFor(11, 16)[0].target_name).toBe("양손검 무기 숙련도");
    expect(changesFor(11, 18)[0].target_name).toBe("쌍검 무기 숙련도");
    expect(changesFor(39, 18)).toEqual([]);
    expect(changesFor(39, 21)).toHaveLength(1);
    expect(changesFor(23, 15)).toEqual([]);
    expect(changesFor(23, 18)).toHaveLength(1);
  });

  it("preserves the direction of 12.5 combat bug fixes", () => {
    for (const character of [81, 53, 3]) {
      const change = getBundledPatchChanges(character).find((item) => item.patch_version === "12.5")!;
      expect(change.change_type).toBe("bugfix");
      expect(change.impact_score).toBeGreaterThan(0);
    }
    const guard = getBundledPatchChanges(33).find((item) => item.patch_version === "12.5" && item.change_type === "bugfix")!;
    expect(guard.impact_score).toBeLessThan(0);
  });

  it("covers the 35 characters in the 12.4 general-mode section", () => {
    const changes = BUNDLED_PATCH_CHANGES.filter((change) => change.patch_version === "12.4");
    expect(new Set(changes.map((change) => change.character_code)).size).toBe(35);
    expect(changes).toHaveLength(36);
    expect(changes.filter((change) => change.change_type === "buff")).toHaveLength(18);
    expect(changes.filter((change) => change.change_type === "nerf")).toHaveLength(17);
    expect(patchSourceUrl("12.4")).toContain("/posts/news/3838");
  });

  it("keeps Sissela's opposite 12.4 mastery changes separate by weapon", () => {
    const changesFor = (weapon: number) => getBundledPatchChanges(15, weapon)
      .filter((change) => change.patch_version === "12.4");
    expect(changesFor(5).map((change) => change.change_type)).toEqual(["nerf"]);
    expect(changesFor(6).map((change) => change.change_type)).toEqual(["buff"]);
    expect(changesFor(9)).toEqual([]);
  });

  it("treats Adina's damage correction as a bugfix with a negative impact", () => {
    const change = getBundledPatchChanges(52).find((item) => item.patch_version === "12.4")!;
    expect(change.change_type).toBe("bugfix");
    expect(change.impact_score).toBeLessThan(0);
    expect(change.raw_change_text).toContain("2타");
  });

  it("covers every 12.3 general-mode character balance change", () => {
    const patchChanges = BUNDLED_PATCH_CHANGES.filter((change) => change.patch_version === "12.3");
    expect(new Set(patchChanges.map((change) => change.character_code)).size).toBe(39);
    expect(patchChanges).toHaveLength(48);
    expect(patchSourceUrl("12.3")).toContain("/posts/news/3813");
  });

  it("covers every general-mode character balance change", () => {
    const patchChanges = BUNDLED_PATCH_CHANGES.filter((change) => change.patch_version === "12.2");
    expect(new Set(patchChanges.map((change) => change.character_code)).size).toBe(37);
    expect(patchChanges).toHaveLength(40);
  });

  it("only returns changes for Jackie's selected weapon", () => {
    expect(getBundledPatchChanges(1, 15).map((change) => change.patch_version)).toEqual([
      "12.3",
      "12.3",
      "12.2",
      "12.2b"
    ]);
    expect(getBundledPatchChanges(1, 14).slice(0, 2).map((change) => change.change_type)).toEqual([
      "buff",
      "nerf"
    ]);
    expect(getBundledPatchChanges(1, 18).slice(0, 2).map((change) => change.change_type)).toEqual([
      "buff",
      "nerf"
    ]);
  });

  it("scopes 12.3 weapon-specific changes and preserves mixed adjustments", () => {
    expect(getBundledPatchChanges(6, 7).filter((change) => change.patch_version === "12.3")).toEqual([]);
    expect(getBundledPatchChanges(6, 8).filter((change) => change.patch_version === "12.3")).toHaveLength(1);
    expect(getBundledPatchChanges(52).filter((change) => change.patch_version === "12.3").map((change) => change.change_type)).toEqual([
      "adjustment",
      "buff",
      "buff"
    ]);
    expect(getBundledPatchChanges(89).filter((change) => change.patch_version === "12.3").map((change) => change.change_type)).toEqual([
      "nerf",
      "nerf",
      "buff",
      "buff"
    ]);
  });

  it("provides Korean change labels", () => {
    expect(patchChangeLabel("buff")).toBe("버프");
    expect(patchChangeLabel("nerf")).toBe("너프");
  });

  it("separates different skills into readable sections", () => {
    const suaChange = getBundledPatchChanges(28).find((change) => change.patch_version === "12.2")!;
    expect(patchChangeSections(suaChange)).toHaveLength(3);
    expect(patchChangeSections(suaChange).map((section) => section.target)).toEqual([
      "마음의 양식(P)",
      "오딧세이(Q)",
      "돈키호테(E)"
    ]);
  });

  it("includes only the 12.2b character balance changes", () => {
    const hotfixChanges = BUNDLED_PATCH_CHANGES.filter((change) => change.patch_version === "12.2b");
    expect(hotfixChanges).toHaveLength(5);
    expect([...new Set(hotfixChanges.map((change) => change.character_code))].sort()).toEqual([
      1,
      89,
      90
    ]);
    expect(patchSourceUrl("12.2b")).toContain("/posts/news/3801");
  });
});
