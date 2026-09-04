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

describe("12.2 bundled patch changes", () => {
  it("covers every general-mode character balance change", () => {
    const patchChanges = BUNDLED_PATCH_CHANGES.filter((change) => change.patch_version === "12.2");
    expect(new Set(patchChanges.map((change) => change.character_code)).size).toBe(37);
    expect(patchChanges).toHaveLength(40);
  });

  it("only returns changes for Jackie's selected weapon", () => {
    expect(getBundledPatchChanges(1, 15).map((change) => change.patch_version)).toEqual([
      "12.2",
      "12.2b"
    ]);
    expect(getBundledPatchChanges(1, 14).map((change) => change.change_type)).toEqual(["buff"]);
    expect(getBundledPatchChanges(1, 18)).toEqual([]);
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
