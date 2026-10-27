import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/data", async (original) => ({ ...await original<typeof import("@/lib/data")>(),
  getCharacters: vi.fn(), getCharacterMeta: vi.fn(), getTeamComps: vi.fn(), getAllPatchChanges: vi.fn(), getPlayerSummary: vi.fn() }));
vi.mock("@/lib/ingestion", () => ({ collectPlayerSeasonProfile: vi.fn() }));
vi.mock("@/lib/openai", () => ({ explainRecommendation: async (input: { recommendations: Array<{ character: { character_code: number } }> }) =>
  input.recommendations.map((item) => ({ characterCode: item.character.character_code, explanation: "근거" })) }));
import { getCharacters, getCharacterMeta, getTeamComps, getAllPatchChanges, getPlayerSummary } from "@/lib/data";
import { collectPlayerSeasonProfile } from "@/lib/ingestion";
import { buildRecommendations, InvalidTeammateError } from "@/lib/recommendations";
import { recommendationBreakdown, recommendationScore } from "@/lib/stats";
import type { Character, CharacterMeta, PlayerSummary, TeamCompStat } from "@/lib/types";
const characters: Character[] = [
  { character_code: 1, name_ko: "재키", name_en: "Jackie", role: null, weapon_types: ["OneHandSword", "TwoHandSword"], is_active: true },
  { character_code: 2, name_ko: "아야", name_en: "Aya", role: null, weapon_types: ["SniperRifle"], is_active: true },
  { character_code: 3, name_ko: "검증픽", name_en: "QA", role: null, weapon_types: ["Glove"], is_active: true }
];
const summary = (code: number, weapon: number): PlayerSummary => ({ user_num: 1, nickname: "검증", total_games: 12,
  collected_at: new Date().toISOString(), favorite_characters: [{ character_code: code, weapon_code: weapon, games: 12,
    wins: 3, top3: 6, win_rate: .25, top3_rate: .5, average_rank: 3 }] });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCharacters).mockResolvedValue(characters);
  vi.mocked(getCharacterMeta).mockResolvedValue(characters.map((character, index) => ({ ...character,
    weapon_code: [15, 11, 1][index], weapon_name: "무기", display_name: character.name_ko,
    games: 100, pick_rate: .1, win_rate: .2, top3_rate: .5, average_rank: 3, confidence_score: 1, tier: "A",
    rank_scope: "above:mythril", sample_status: "standard" })) as CharacterMeta[]);
  vi.mocked(getAllPatchChanges).mockResolvedValue([]); vi.mocked(getTeamComps).mockResolvedValue([]);
  vi.mocked(getPlayerSummary).mockImplementation(async (nickname) => nickname === "팀원" ? summary(1, 15) : summary(3, 1));
  vi.mocked(collectPlayerSeasonProfile).mockResolvedValue({ inspectedGames: 12, profileCount: 1, userId: "qa", scope: "current_patch" });
});
describe("scope-aware teammate recommendations", () => {
  it("uses the selected scope for stored profiles and cold collection", async () => {
    vi.mocked(getPlayerSummary).mockResolvedValueOnce(null).mockResolvedValue(summary(3, 1));
    const result = await buildRecommendations({ nickname: "본인", playerDataScope: "current_patch" });
    expect(getPlayerSummary).toHaveBeenNthCalledWith(1, "본인", "current_patch");
    expect(collectPlayerSeasonProfile).toHaveBeenCalledWith("본인", "current_patch", expect.any(Number));
    expect(result[0].context.dataScope).toBe("current_patch");
  });
  it("resolves a teammate from real usage and constrains its weapon", async () => {
    const comp = { comp_key: "1:15|3:1", character_codes: [1, 3], character_weapon_keys: ["1:15", "3:1"],
      comp_size: 2, games: 40, win_rate: .2, top3_rate: .6, average_rank: 3, confidence_score: 1, comp_name: "조합" } as TeamCompStat;
    vi.mocked(getTeamComps).mockResolvedValue([{ ...comp, comp_key: "other-weapon", character_weapon_keys: ["1:16", "3:1"], top3_rate: 1 }, comp]);
    const result = await buildRecommendations({ nickname: "본인", teammates: [{ nickname: "팀원" }], playerDataScope: "current_patch" });
    expect(result).toHaveLength(1); expect(result[0].context.compTop3Rate).toBe(.6);
    expect(result[0].context.teammateProfiles?.[0]).toMatchObject({ nickname: "팀원", characterCode: 1, weaponCode: 15, games: 12 });
    expect(getPlayerSummary).toHaveBeenCalledWith("팀원", "current_patch");
    expect(result[0].scoreBreakdown!.reduce((sum, part) => sum + part.contribution, 0)).toBeCloseTo(result[0].score, 12);
  });
  it("rejects impossible teammate weapons and duplicate characters", async () => {
    await expect(buildRecommendations({ teammates: [{ characterCode: 1, weaponCode: 11 }] })).rejects.toBeInstanceOf(InvalidTeammateError);
    await expect(buildRecommendations({ teammates: [{ characterCode: 1 }, { characterCode: 1 }] })).rejects.toBeInstanceOf(InvalidTeammateError);
  });
  it("does not invent zero-rank recommendations or collect profiles when current metadata is absent", async () => {
    vi.mocked(getCharacterMeta).mockResolvedValue([]);
    expect(await buildRecommendations({ nickname: "본인", teammates: [{ nickname: "팀원" }] })).toEqual([]);
    expect(collectPlayerSeasonProfile).not.toHaveBeenCalled();
  });
  it("shows actual weighting at both composition-evidence endpoints", () => {
    const input = { metaScore: .8, userScore: .4, patchScore: .5, compScore: .7 };
    expect(recommendationBreakdown(input).map((part) => part.weight)).toEqual([.55, .3, .15, 0]);
    expect(recommendationBreakdown({ ...input, compConfidence: 1 }).map((part) => part.weight)).toEqual([.25, .15, .1, .5]);
    expect(recommendationBreakdown({ ...input, compConfidence: .5 }).reduce((sum, part) => sum + part.contribution, 0))
      .toBeCloseTo(recommendationScore({ ...input, compConfidence: .5 }), 12);
  });
});
