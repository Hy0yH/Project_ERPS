import {
  getBestCompForCandidate,
  getCharacterMeta,
  getCharacters,
  getPlayerSummary,
  getRecentPatchSummary,
  scoreFromMeta
} from "@/lib/data";
import {
  compPerformanceScore,
  confidenceFromGames,
  normalizePatchScore,
  userAffinityScore
} from "@/lib/stats";
import { explainRecommendation } from "@/lib/openai";
import type { Character, Recommendation, RecommendationInput } from "@/lib/types";

export async function buildRecommendations(input: RecommendationInput): Promise<Recommendation[]> {
  const teammateCodes = [...new Set(input.teammateCharacterCodes ?? [])];
  const preferredCodes = [...new Set(input.preferredCharacterCodes ?? [])];
  const limit = Math.max(1, Math.min(input.limit ?? 5, 10));

  const [characters, metaRows, playerSummary] = await Promise.all([
    getCharacters(),
    getCharacterMeta(),
    input.nickname ? getPlayerSummary(input.nickname) : Promise.resolve(null)
  ]);

  const playerFavorites = playerSummary?.favorite_characters ?? [];
  const selectedCodes = new Set(teammateCodes);
  const candidates = characters.filter((character) => !selectedCodes.has(character.character_code));

  const scored = await Promise.all(
    candidates.map(async (character) => {
      const meta = metaRows.find((item) => item.character_code === character.character_code);
      const comp = await getBestCompForCandidate(teammateCodes, character.character_code);
      const patchSummary = await getRecentPatchSummary(character.character_code);
      const patchScore = await getPatchScore(character.character_code);
      const userScore = Math.max(
        userAffinityScore(character.character_code, playerFavorites),
        preferredCodes.includes(character.character_code) ? 0.7 : 0
      );
      const metaScore = scoreFromMeta(meta);
      const compScore = compPerformanceScore(comp);
      const hasTeammates = teammateCodes.length > 0;
      const score = hasTeammates
        ? compScore * 0.5 + metaScore * 0.25 + userScore * 0.15 + patchScore * 0.1
        : metaScore * 0.55 + userScore * 0.3 + patchScore * 0.15;

      return {
        character,
        score,
        confidence: confidenceFromGames(comp?.games ?? meta?.games ?? 0, comp?.comp_size),
        metrics: {
          metaScore,
          compScore,
          userScore,
          patchScore,
          games: comp?.games ?? meta?.games ?? 0,
          winRate: comp?.win_rate ?? meta?.win_rate ?? 0,
          top3Rate: comp?.top3_rate ?? meta?.top3_rate ?? 0,
          averageRank: comp?.average_rank ?? meta?.average_rank ?? 0
        },
        explanation: "",
        patchSummary
      } satisfies Recommendation;
    })
  );

  const recommendations = scored.sort((a, b) => b.score - a.score).slice(0, limit);
  const explained = await explainRecommendation({
    nickname: input.nickname,
    teammateNames: teammateCodes.map((code) => characterName(characters, code)),
    recommendations
  });

  return recommendations.map((recommendation) => ({
    ...recommendation,
    explanation:
      explained.find((item) => item.characterCode === recommendation.character.character_code)
        ?.explanation ?? recommendation.explanation
  }));
}

async function getPatchScore(characterCode: number) {
  const { getPatchHistory } = await import("@/lib/data");
  const changes = await getPatchHistory(characterCode);
  if (!changes.length) return 0.5;
  const recent = changes.slice(0, 2);
  const sum = recent.reduce((acc, change) => acc + Number(change.impact_score ?? 0), 0);
  return normalizePatchScore(sum);
}

function characterName(characters: Character[], code: number) {
  return characters.find((character) => character.character_code === code)?.name_ko ?? String(code);
}
