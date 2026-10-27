import type { PatchVersion } from "@/lib/types";

export type PlayerSourceRow = Record<string, unknown>;

export const ANALYSIS_SOURCE_FIELDS = [
  "playerKill", "playerAssistant", "playerDeaths", "damageToPlayer", "damageFromPlayer", "damageToMonster",
  "ccTimeToPlayer", "characterLevel", "bestWeaponLevel", "monsterKill", "totalGainVFCredit", "totalUseVFCredit",
  "mmrBefore", "mmrAfter", "mmrGain", "mmrGainGambit", "playTime", "watchTime", "totalTime",
  "healAmount", "teamRecover", "protectAbsorb", "viewContribution", "teamKill", "craftLegend", "craftMythic",
  "addSurveillanceCamera", "addTelephotoCamera", "removeSurveillanceCamera", "removeTelephotoCamera",
  "useSecurityConsole", "useHyperLoop", "deathsPhaseOne", "deathsPhaseTwo", "deathsPhaseThree",
  "battleZoneDeaths", "creditRevivedOthersCount", "tacticalSkillLevel", "timeSpentInBriefingRoom"
] as const;

export function readAnalysisNumber(row: PlayerSourceRow, ...keys: string[]): number | null {
  const equipment = row.equipment as PlayerSourceRow | undefined;
  const metadata = equipment?.__analysis as PlayerSourceRow | undefined;
  const raw = metadata?.raw as PlayerSourceRow | undefined;
  if (raw && keys.some((key) => (ANALYSIS_SOURCE_FIELDS as readonly string[]).includes(key)) &&
      !keys.some((key) => raw[key] !== undefined && raw[key] !== null)) return null;
  for (const source of [raw, row, metadata]) {
    for (const key of keys) {
      const value = source?.[key];
      if (value === undefined || value === null || value === "" || typeof value === "boolean") continue;
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
  }
  return null;
}

export function sourceMetrics(player: PlayerSourceRow) {
  const raw = Object.fromEntries(ANALYSIS_SOURCE_FIELDS.flatMap((key) => {
    const value = readAnalysisNumber(player, key);
    return value === null ? [] : [[key, value]];
  }));
  const spent = spentCredits(player);
  if (spent !== null) raw.totalUseVFCredit = spent;
  return raw;
}

export function spentCredits(player: PlayerSourceRow): number | null {
  const scalar = readAnalysisNumber(player, "totalUseVFCredit", "sumUsedVFCredits");
  if (scalar !== null) return scalar;
  const values = player.usedVFCredit ?? player.usedVFCredits;
  return Array.isArray(values) && values.every((value) => Number.isFinite(Number(value)))
    ? values.reduce<number>((sum, value) => sum + Number(value), 0) : null;
}

export function normalizeOfficialAnalysisRow(row: PlayerSourceRow, patch: PatchVersion, seasonId: number): PlayerSourceRow {
  // Current official user-game responses omit versionSeason. Infer only this one
  // field from an independently established season, exact major/minor and time boundary.
  if (row.versionSeason != null || row.version_season != null) return row;
  const startedAt = Date.parse(String(row.startDtm ?? row.started_at ?? ""));
  const patchStart = Date.parse(patch.patch_start_at);
  if (Number(row.seasonId ?? row.season_id) !== seasonId ||
      Number(row.matchingMode ?? row.matching_mode) !== 3 ||
      Number(row.matchingTeamMode ?? row.matching_team_mode) !== 3 ||
      readAnalysisNumber(row, "versionMajor", "version_major") !== patch.version_major ||
      readAnalysisNumber(row, "versionMinor", "version_minor") !== patch.version_minor ||
      !Number.isFinite(startedAt) || !Number.isFinite(patchStart) || startedAt < patchStart) return row;
  return { ...row, versionSeason: patch.version_season, analysis_patch_source: "verified_season_and_patch" };
}

export function actualMmrGain(row: PlayerSourceRow): number | null {
  const before = readAnalysisNumber(row, "mmrBefore", "mmr_before");
  const after = readAnalysisNumber(row, "mmrAfter", "mmr_after");
  // Some official records use zero for an unavailable final RP (including ranked
  // matches with a positive starting RP). Never interpret that sentinel as a full loss.
  if (before !== null && after !== null && before > 0 && after > 0) return after - before;
  return readAnalysisNumber(row, "mmrGainGambit", "mmrGain", "mmr_gain");
}
