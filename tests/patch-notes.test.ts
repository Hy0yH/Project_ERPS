import { describe, expect, it } from "vitest";
import { parsePatchNote } from "@/lib/patch-notes";

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
