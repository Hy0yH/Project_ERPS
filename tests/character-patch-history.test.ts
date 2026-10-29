import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getBundledPatchChanges } from "@/lib/bundled-patch-changes";

vi.mock("@/lib/data", () => ({
  getCharacterMeta: vi.fn(async () => []),
  getCharacterBuildMeta: vi.fn(async () => null),
  getTeamComps: vi.fn(async () => []),
  getCharacters: vi.fn(async () => [{ character_code: 24, name_ko: "아델라", weapon_types: ["Rapier", "Bat"] }]),
  getPatchHistory: vi.fn(),
  displayPercent: vi.fn(),
  displayRank: vi.fn()
}));
vi.mock("@/lib/meta-history", () => ({ getCharacterPatchMeta: vi.fn(async () => []) }));

import CharacterDetailPage from "@/app/characters/[code]/page";
import { getPatchHistory } from "@/lib/data";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPatchHistory).mockImplementation(async (code, weapon) => getBundledPatchChanges(code, weapon));
});

describe("patch history before current-patch statistics exist", () => {
  it("shows the requested weapon's 12.7 changes and the character name without statistics", async () => {
    const html = renderToStaticMarkup(await CharacterDetailPage({
      params: Promise.resolve({ code: "24" }), searchParams: Promise.resolve({ weapon: "3" })
    }));
    expect(getPatchHistory).toHaveBeenCalledWith(24, 3);
    expect(html).toContain("아델라 / 방망이");
    expect(html).toContain("v12.7");
    expect(html).toContain("4.6% → 4.5%");
    expect(html).toContain("/posts/news/3924?hl=ko-KR");
    expect(html).toContain("캐릭터 통계가 아직 없습니다.");
  });

  it("rejects another character's weapon and defaults to a supported weapon", async () => {
    const html = renderToStaticMarkup(await CharacterDetailPage({
      params: Promise.resolve({ code: "24" }), searchParams: Promise.resolve({ weapon: "10" })
    }));
    expect(getPatchHistory).toHaveBeenCalledWith(24, 21);
    expect(html).toContain("아델라 / 레이피어");
    expect(html).not.toContain("v12.7");
    expect(html).not.toContain("4.6% → 4.5%");
  });
});
