import { actualMmrGain, readAnalysisNumber, type PlayerSourceRow } from "@/lib/player-analysis-source";
import type { PlayerAnalysisStatistics, PlayerAnalysisDimensionKey } from "@/lib/types";

type Definition = { id: string; label: string; group: PlayerAnalysisDimensionKey; keys: string[];
  unit?: "minutes" | "seconds" | "mmr" | "percent" | "rank"; read?: (row: PlayerSourceRow) => number | null };
const sumFields = (row: PlayerSourceRow, groups: string[][]) => {
  const values = groups.map((keys) => readAnalysisNumber(row, ...keys));
  return values.every((value) => value !== null) ? values.reduce<number>((sum, value) => sum + Number(value), 0) : null;
};

const DEFINITIONS: Definition[] = [
  { id: "kills", label: "킬", group: "combat", keys: ["playerKill", "player_kill"] },
  { id: "assists", label: "어시스트", group: "combat", keys: ["playerAssistant", "player_assistant"] },
  { id: "deaths", label: "사망", group: "combat", keys: ["playerDeaths", "player_deaths"] },
  { id: "damage_dealt", label: "가한 플레이어 피해", group: "combat", keys: ["damageToPlayer", "damage_to_player"] },
  { id: "damage_taken", label: "받은 플레이어 피해", group: "combat", keys: ["damageFromPlayer", "damage_from_player"] },
  { id: "cc_seconds", label: "군중제어 시간", group: "combat", keys: ["ccTimeToPlayer", "cc_time_to_player"], unit: "seconds" },
  { id: "character_level", label: "종료 캐릭터 레벨", group: "growth", keys: ["characterLevel", "character_level"] },
  { id: "weapon_level", label: "종료 무기 숙련도", group: "growth", keys: ["bestWeaponLevel", "best_weapon_level"] },
  { id: "credits_gained", label: "획득 크레딧", group: "growth", keys: ["totalGainVFCredit", "total_gain_vf_credit"] },
  { id: "credits_spent", label: "사용 크레딧", group: "growth", keys: ["totalUseVFCredit", "total_spent_vf_credit"] },
  { id: "legendary_crafts", label: "전설 제작", group: "growth", keys: ["craftLegend"] },
  { id: "mythic_crafts", label: "초월 제작", group: "growth", keys: ["craftMythic"] },
  { id: "tactical_level", label: "종료 전술 스킬 레벨", group: "growth", keys: ["tacticalSkillLevel"] },
  { id: "hunts", label: "야생동물 처치", group: "farming", keys: ["monsterKill", "monster_kill"] },
  { id: "monster_damage", label: "야생동물 피해", group: "farming", keys: ["damageToMonster", "damage_to_monster"] },
  { id: "team_kills", label: "팀 킬", group: "team", keys: ["teamKill", "team_kill"] },
  { id: "self_healing", label: "자가 회복", group: "team", keys: ["healAmount", "heal_amount"] },
  { id: "ally_healing", label: "팀 회복", group: "team", keys: ["teamRecover", "team_recover"] },
  { id: "shield_absorb", label: "보호 흡수", group: "team", keys: ["protectAbsorb", "protect_absorb"] },
  { id: "ally_revives", label: "크레딧으로 아군 부활", group: "team", keys: ["creditRevivedOthersCount"] },
  { id: "view_score", label: "시야 기여 점수", group: "vision", keys: ["viewContribution", "view_contribution"] },
  { id: "cameras_placed", label: "카메라 설치", group: "vision", keys: [],
    read: (row) => sumFields(row, [["addSurveillanceCamera", "add_surveillance_camera"], ["addTelephotoCamera", "add_telephoto_camera"]]) },
  { id: "cameras_removed", label: "카메라 제거", group: "vision", keys: [],
    read: (row) => sumFields(row, [["removeSurveillanceCamera", "remove_surveillance_camera"], ["removeTelephotoCamera", "remove_telephoto_camera"]]) },
  { id: "consoles", label: "보안 콘솔 사용", group: "vision", keys: ["useSecurityConsole", "use_security_console"] },
  { id: "active_minutes", label: "활동 시간", group: "stability", keys: ["playTime", "play_time"], unit: "minutes" },
  { id: "spectator_minutes", label: "관전 시간", group: "stability", keys: ["watchTime"], unit: "minutes" },
  { id: "match_minutes", label: "활동+관전 시간", group: "stability", keys: ["totalTime"], unit: "minutes" },
  { id: "mmr_actual", label: "실제 RP 증감", group: "stability", keys: [], unit: "mmr", read: actualMmrGain },
  { id: "mmr_base", label: "기본 RP 증감", group: "stability", keys: ["mmrGain", "mmr_gain"], unit: "mmr" },
  { id: "hyperloops", label: "하이퍼루프 사용", group: "stability", keys: ["useHyperLoop", "use_hyper_loop"] },
  { id: "early_deaths", label: "초반 단계 사망", group: "stability", keys: ["deathsPhaseOne"] },
  { id: "battle_zone_deaths", label: "전장 사망", group: "stability", keys: ["battleZoneDeaths"] },
  { id: "win_rate", label: "승률", group: "stability", keys: [], unit: "percent", read: (row) => rankResult(row, 1) },
  { id: "top3_rate", label: "TOP3 비율", group: "stability", keys: [], unit: "percent", read: (row) => rankResult(row, 3) },
  { id: "average_rank", label: "평균 순위", group: "stability", keys: ["gameRank", "game_rank"], unit: "rank" }
];

function rankResult(row: PlayerSourceRow, maximum: number) {
  const rank = readAnalysisNumber(row, "gameRank", "game_rank");
  return rank !== null && rank > 0 ? Number(rank <= maximum) : null;
}

export function buildPlayerStatistics(rows: PlayerSourceRow[]): PlayerAnalysisStatistics {
  return { games: rows.length, metrics: DEFINITIONS.map((definition) => {
    const values = rows.flatMap((row) => {
      const value = definition.read ? definition.read(row) : readAnalysisNumber(row, ...definition.keys);
      return value === null ? [] : [definition.unit === "minutes" ? value / 60 : value];
    });
    const total = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    return { id: definition.id, label: definition.label, group: definition.group, unit: definition.unit ?? "count",
      value: total === null ? null : total / values.length, total, sample_games: values.length };
  }) };
}
