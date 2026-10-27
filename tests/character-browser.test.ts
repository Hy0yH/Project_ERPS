import { describe, expect, it } from "vitest";
import { browseCharacters, characterBrowseParams, parseCharacterBrowse } from "@/lib/character-browser";
import { patchMetaPoints } from "@/lib/meta-history";
import type { CharacterMeta } from "@/lib/types";
const meta = [
  { character_code: 1, weapon_code: 15, display_name: "재키 / 단검", name_en: "Jackie", games: 100, tier: "A", top3_rate: .4, win_rate: .1, average_rank: 4 },
  { character_code: 2, weapon_code: 11, display_name: "아야 / 저격총", name_en: "Aya", games: 20, tier: "S", top3_rate: .5, win_rate: .2, average_rank: 3 }
] as CharacterMeta[];
describe("character exploration", () => {
  it("combines search, weapon and sample constraints without rewriting tiers", () => {
    const query = parseCharacterBrowse({ q: "JACKIE", weapon: "15", minGames: "100", sort: "winRate", rankScope: "all" });
    expect(browseCharacters(meta, query)).toEqual([meta[0]]);
    const params = characterBrowseParams(query);
    expect(params.get("rankScope")).toBe("all"); expect(params.get("q")).toBe("JACKIE");
    expect(params.get("weapon")).toBe("15"); expect(meta[0].tier).toBe("A");
  });
  it("sorts the same observed records and rejects unsupported controls", () => {
    expect(browseCharacters(meta, parseCharacterBrowse({ sort: "averageRank" })).map((item) => item.character_code)).toEqual([2, 1]);
    expect(parseCharacterBrowse({ minGames: "-100", weapon: "NaN", sort: "malformed" })).toMatchObject({ minGames: 0, weapon: 0, sort: "tier" });
    expect(browseCharacters(meta, parseCharacterBrowse({ q: "없는실험체" }))).toEqual([]);
  });
  it("deduplicates patch snapshots and orders numeric patches without treating rolling data as a patch", () => {
    const row = { games: 40, win_rate: .1, top3_rate: .4, average_rank: 4, period_end: "2026-10-27" };
    expect(patchMetaPoints([{ ...row, tier_filter: "current_patch:12.10.0" }, { ...row, tier_filter: "current_patch:12.9.0" },
      { ...row, games: 1, tier_filter: "current_patch:12.10.0" }, { ...row, tier_filter: "rolling_period" }]).map((point) => [point.patch, point.games]))
      .toEqual([["12.10.0", 40], ["12.9.0", 40]]);
  });
});
