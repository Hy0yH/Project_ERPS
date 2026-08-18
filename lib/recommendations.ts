import {
  getAllPatchChanges,
  getCharacterMeta,
  getCharacters,
  getPlayerSummary,
  getTeamComps,
  scoreFromMeta
} from "@/lib/data";
import {
  compPerformanceScore,
  confidenceFromGames,
  normalizePatchScore,
  recommendationScore,
  teamCompRankingScore,
  userAffinityScore
} from "@/lib/stats";
import {
  ER_RECOMMEND_HIGH_SAMPLE_GAMES,
  ER_RECOMMEND_MIN_SAMPLE_GAMES,
  ER_RECOMMEND_PLAYER_MATCH_LIMIT,
  ER_SEASON_ID
} from "@/lib/env";
import { collectPlayerSeasonProfile } from "@/lib/ingestion";
import { isNicknameNotFoundError } from "@/lib/eternal-return";
import { explainRecommendation } from "@/lib/openai";
import type {
  Character,
  CharacterMeta,
  PlayerDataScope,
  PlayerCharacterSummary,
  Recommendation,
  RecommendationContext,
  RecommendationInput,
  RecommendedCharacter,
  PatchChange,
  TeamCompStat
} from "@/lib/types";
import { parseCharacterWeaponKey } from "@/lib/weapons";

export class PlayerNotFoundError extends Error {
  readonly code = "PLAYER_NOT_FOUND";

  constructor(public readonly nickname: string) {
    super(`플레이어를 찾을 수 없습니다: ${nickname}`);
    this.name = "PlayerNotFoundError";
  }
}

export class PlayerHistoryUnavailableError extends Error {
  readonly code = "PLAYER_HISTORY_UNAVAILABLE";

  constructor(public readonly nickname: string) {
    super(`플레이어 경기 기록이 없습니다: ${nickname}`);
    this.name = "PlayerHistoryUnavailableError";
  }
}

export async function buildRecommendations(input: RecommendationInput): Promise<Recommendation[]> {
  const teammateCodes = [...new Set(input.teammateCharacterCodes ?? [])];
  const limit = Math.max(1, Math.min(input.limit ?? 5, 10));
  const nickname = input.nickname?.trim();
  const playerDataScope = input.playerDataScope ?? "season";

  const [characters, metaRows, allComps, patchChanges, initialPlayerSummary] = await Promise.all([
    getCharacters(),
    getCharacterMeta(),
    getTeamComps([]),
    getAllPatchChanges(),
    nickname ? getPlayerSummary(nickname, "season") : Promise.resolve(null)
  ]);
  const playerResult = await ensurePlayerSummary(nickname, initialPlayerSummary);
  const playerSummary = playerResult.summary;

  const playerFavorites = playerSummary?.favorite_characters ?? [];
  const playedCharacterCodes = [...playerFavorites]
    .sort((a, b) => b.games - a.games)
    .map((item) => item.character_code);

  if (nickname && !playedCharacterCodes.length) {
    throw new PlayerHistoryUnavailableError(nickname);
  }

  const selectedCodes = new Set(teammateCodes);
  const playedCodeSet = new Set(playedCharacterCodes);
  const patchChangesByCharacter = groupPatchChanges(patchChanges);
  const candidates = buildRecommendationCandidates(characters, metaRows).filter(
    (character) =>
      !selectedCodes.has(character.character_code) &&
      (!nickname || playedCodeSet.has(character.character_code))
  );

  const scored = candidates.map((character) => {
      const { compContextCodes, comp } = resolveCompContextForCandidate(
        teammateCodes,
        character.character_code,
        allComps
      );
      const meta = resolveCandidateMeta(metaRows, character.character_code, comp) ??
        metaRows.find((item) => item.character_code === character.character_code);
      const recommendedCharacter = meta ?? character;
      const recentPatchChanges = patchChangesByCharacter.get(character.character_code) ?? [];
      const patchSummary = recentPatchChanges.slice(0, 2).map((change) => change.raw_change_text);
      const patchScore = getPatchScore(recentPatchChanges);
      const userScore = userAffinityScore(character.character_code, playerFavorites);
      const metaScore = scoreFromMeta(meta);
      const compScore = compPerformanceScore(comp);
      const score = recommendationScore({
        compScore,
        compConfidence: comp?.confidence_score,
        metaScore,
        userScore,
        patchScore
      });

      return {
        character: recommendedCharacter,
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
          averageRank: comp?.average_rank ?? meta?.average_rank ?? 0,
          metaGames: meta?.games ?? 0,
          metaWinRate: meta?.win_rate ?? 0,
          metaTop3Rate: meta?.top3_rate ?? 0,
          metaAverageRank: meta?.average_rank ?? 0
        },
        context: buildRecommendationContext({
          character: recommendedCharacter,
          characters,
          comp,
          compContextCodes,
          playerFavorites,
          hasSelectedTeammates: teammateCodes.length > 0,
          dataScope: playerDataScope,
          collectionNotice: playerResult.collectionNotice
        }),
        explanation: "",
        patchSummary
      } satisfies Recommendation;
    });

  const recommendations = scored.sort((a, b) => b.score - a.score).slice(0, limit);
  const explained = await explainRecommendation({
    nickname,
    teammateNames: teammateCodes.map((code) =>
      characterName(characters, code)
    ),
    recommendations
  });

  return recommendations.map((recommendation) => ({
    ...recommendation,
    explanation:
      explained.find((item) => item.characterCode === recommendation.character.character_code)
        ?.explanation ?? recommendation.explanation
  }));
}

async function ensurePlayerSummary(
  nickname: string | undefined,
  playerSummary: Awaited<ReturnType<typeof getPlayerSummary>>
) {
  if (!nickname) return { summary: null, collectionNotice: undefined };
  if (playerSummary?.favorite_characters?.length && isFreshProfile(playerSummary.collected_at)) {
    return {
      summary: playerSummary,
      collectionNotice: `${seasonLabel()} 이번 시즌 전체 ${playerSummary.total_games}판의 전투·생존·지원 기록으로 추천을 계산했습니다.`
    };
  }
  try {
    const collection = await collectPlayerSeasonProfile(
      nickname,
      "season",
      ER_RECOMMEND_PLAYER_MATCH_LIMIT
    );
    const refreshedSummary = await getPlayerSummary(nickname, "season");
    const collectionNotice = refreshedSummary?.favorite_characters?.length
      ? `${seasonLabel()} 이번 시즌 랭크 스쿼드 ${collection.inspectedGames}판을 전수 확인해 ${collection.profileCount}개 실험체의 전투·생존·지원 프로필을 갱신했습니다.`
      : `${seasonLabel()} 이번 시즌 랭크 스쿼드를 확인했지만 저장 가능한 경기 기록이 없습니다.`;

    return { summary: refreshedSummary, collectionNotice };
  } catch (error) {
    if (isNicknameNotFoundError(error)) {
      throw new PlayerNotFoundError(nickname);
    }

    return {
      summary: playerSummary,
      collectionNotice: playerSummary?.favorite_characters?.length
        ? `시즌 전체 상세 기록을 갱신하지 못해 저장된 ${playerSummary.total_games}판으로 계산했습니다. ${error instanceof Error ? error.message : String(error)}`
        : `닉네임 데이터를 즉시 수집하려 했지만 실패했습니다. ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function isFreshProfile(collectedAt?: string) {
  if (!collectedAt) return false;
  const collectedTime = new Date(collectedAt).getTime();
  return Number.isFinite(collectedTime) && Date.now() - collectedTime < 6 * 60 * 60 * 1000;
}

function seasonLabel() {
  return ER_SEASON_ID ? `시즌 ${ER_SEASON_ID} 기준으로` : "현재 설정된 시즌 기준으로";
}

function buildRecommendationContext(input: {
  character: RecommendedCharacter;
  characters: Character[];
  comp: TeamCompStat | null;
  compContextCodes: number[];
  playerFavorites: PlayerCharacterSummary[];
  hasSelectedTeammates: boolean;
  dataScope: PlayerDataScope;
  collectionNotice?: string;
}): RecommendationContext {
  const candidateName = input.character.display_name ?? input.character.name_ko;
  const baseCharacters = input.compContextCodes.map((code) => {
    const favorite = input.playerFavorites.find((item) => item.character_code === code);
    return {
      character_code: code,
      name_ko: characterName(input.characters, code),
      games: favorite?.games,
      win_rate: favorite?.win_rate,
      top3_rate: favorite?.top3_rate,
      average_rank: favorite?.average_rank,
      average_damage_to_player: favorite?.average_damage_to_player,
      average_damage_from_player: favorite?.average_damage_from_player,
      average_heal_amount: favorite?.average_heal_amount,
      average_team_recover: favorite?.average_team_recover,
      average_protect_absorb: favorite?.average_protect_absorb,
      average_view_contribution: favorite?.average_view_contribution,
      average_vision_actions: favorite?.average_vision_actions,
      average_survivable_time: favorite?.average_survivable_time,
      average_cc_time_to_player: favorite?.average_cc_time_to_player
    };
  });
  const playerPerformance = input.playerFavorites.find(
    (item) => item.character_code === input.character.character_code
  );

  const source = input.hasSelectedTeammates
    ? "selected_teammates"
    : input.comp && baseCharacters.length
      ? "global_comp"
      : "global_meta";
  const baseNames = baseCharacters.map((character) => character.name_ko).join(" / ");
  const title =
    source === "selected_teammates"
      ? `선택한 팀원 ${baseNames} 기준`
      : source === "global_comp"
        ? `전체 상위권 조합 통계 ${baseNames} 기준`
        : "현재 패치 전체 상위권 표본 기준";

  const details = [
    input.collectionNotice,
    source === "global_comp" && baseCharacters.length
      ? `${candidateName}이 포함된 전체 상위권 조합 통계를 비교해 ${baseNames}을 가장 좋은 파트너로 선정했습니다. 파트너 후보는 이 플레이어의 사용 기록으로 제한하지 않았습니다.`
      : source === "selected_teammates" && baseCharacters.length
        ? `${baseNames}이 이미 팀에 있다고 보고, 여기에 추가했을 때 좋은 후보를 찾았습니다.`
        : "선택된 팀원이 없고 확인 가능한 조합 표본도 없어 실험체 단독 메타 성능을 더 크게 반영했습니다.",
    input.comp
      ? `상위권 조합 통계에서 ${input.comp.comp_name || `${baseNames} / ${candidateName}`} 조합의 TOP3 ${(input.comp.top3_rate * 100).toFixed(
          1
        )}%, 승률 ${(input.comp.win_rate * 100).toFixed(1)}%, 표본 ${input.comp.games}판을 반영했습니다.`
      : "해당 기준 픽과 직접 연결되는 충분한 조합 표본이 없어 실험체 메타 성능과 플레이어의 실제 사용 성과를 중심으로 계산했습니다.",
    `표본 신뢰도는 ${ER_RECOMMEND_MIN_SAMPLE_GAMES}판 미만 낮음, ${ER_RECOMMEND_MIN_SAMPLE_GAMES}판 이상 보통, ${ER_RECOMMEND_HIGH_SAMPLE_GAMES}판 이상 높음으로 판정합니다.`,
    `최종 점수는 조합 성능, 현재 패치 실험체 성능, 플레이어의 실제 사용 성과, 최근 패치 영향을 함께 가중합해 계산했습니다.`
  ].filter(Boolean) as string[];

  return {
    source,
    title,
    dataScope: input.dataScope,
    baseCharacters,
    playerPerformance,
    compName: input.comp?.comp_name,
    compGames: input.comp?.games,
    compWinRate: input.comp?.win_rate,
    compTop3Rate: input.comp?.top3_rate,
    compAverageRank: input.comp?.average_rank,
    collectionNotice: input.collectionNotice,
    details
  };
}

export function resolveCompContextForCandidate(
  codes: number[],
  candidateCode: number,
  comps: TeamCompStat[]
) {
  if (!codes.length) {
    const comp = comps
      .filter(
        (item) =>
          item.comp_size >= 2 &&
          item.character_codes.includes(candidateCode)
      )
      .sort((a, b) => {
        const scoreDifference = teamCompRankingScore(b) - teamCompRankingScore(a);
        if (scoreDifference !== 0) return scoreDifference;
        return b.games - a.games;
      })[0] ?? null;

    return {
      compContextCodes: comp?.character_codes.filter((code) => code !== candidateCode) ?? [],
      comp
    };
  }

  const uniqueCodes = [...new Set(codes)].filter((code) => code !== candidateCode);
  const pairs = uniqueCodes.length > 2 ? combinations(uniqueCodes, 2) : [uniqueCodes];
  const evaluated = pairs.map((pair) => ({
      compContextCodes: pair,
      comp: pair.length ? findBestComp(comps, pair, candidateCode) : null
    }));

  return evaluated.sort((a, b) => {
    const scoreA = compPerformanceScore(a.comp);
    const scoreB = compPerformanceScore(b.comp);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return Number(b.comp?.games ?? 0) - Number(a.comp?.games ?? 0);
  })[0] ?? { compContextCodes: uniqueCodes.slice(0, 2), comp: null };
}

function findBestComp(comps: TeamCompStat[], contextCodes: number[], candidateCode: number) {
  const targetCodes = [...new Set([...contextCodes, candidateCode])];
  return comps.find(
    (comp) =>
      comp.comp_size === targetCodes.length &&
      targetCodes.every((code) => comp.character_codes.includes(code))
  ) ?? null;
}

function combinations(values: number[], size: number): number[][] {
  if (values.length < size) return [];
  if (size === 1) return values.map((value) => [value]);
  return values.flatMap((value, index) =>
    combinations(values.slice(index + 1), size - 1).map((tail) => [value, ...tail])
  );
}

function buildRecommendationCandidates(
  characters: Character[],
  metaRows: CharacterMeta[]
): RecommendedCharacter[] {
  if (!metaRows.length) return characters;

  const bestMetaByCharacter = new Map<number, CharacterMeta>();
  for (const meta of metaRows) {
    if (!bestMetaByCharacter.has(meta.character_code)) {
      bestMetaByCharacter.set(meta.character_code, meta);
    }
  }

  return characters.map((character) => bestMetaByCharacter.get(character.character_code) ?? character);
}

function getPatchScore(changes: PatchChange[]) {
  if (!changes.length) return 0.5;
  const recent = changes.slice(0, 2);
  const sum = recent.reduce((acc, change) => acc + Number(change.impact_score ?? 0), 0);
  return normalizePatchScore(sum);
}

function groupPatchChanges(changes: PatchChange[]) {
  const grouped = new Map<number, PatchChange[]>();
  for (const change of changes) {
    grouped.set(change.character_code, [...(grouped.get(change.character_code) ?? []), change]);
  }
  return grouped;
}

function resolveCandidateMeta(
  metaRows: CharacterMeta[],
  candidateCode: number,
  comp: TeamCompStat | null
) {
  const weaponKey = comp?.character_weapon_keys.find(
    (key) => parseCharacterWeaponKey(key).characterCode === candidateCode
  );
  if (!weaponKey) return null;
  const { weaponCode } = parseCharacterWeaponKey(weaponKey);
  return metaRows.find(
    (meta) => meta.character_code === candidateCode && meta.weapon_code === weaponCode
  ) ?? null;
}

function characterName(characters: Character[], code: number) {
  return characters.find((character) => character.character_code === code)?.name_ko ?? String(code);
}
