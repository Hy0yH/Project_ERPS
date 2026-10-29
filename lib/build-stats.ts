import { matchDetailSource } from "@/lib/match-details";
import { sampleStatus } from "@/lib/rank-scopes";

export const BUILD_STATS_VERSION = 1;
export const BUILD_DETAIL_VERSION = 2;
export const BUILD_GROUPS = ["items", "item_sets", "traits", "trait_sets", "routes", "tactical_skills", "skill_orders", "start_areas"] as const;
export type BuildGroup = typeof BUILD_GROUPS[number];
export type BuildStat = {
  key: string;
  codes: number[];
  slot?: string;
  name?: string;
  games: number;
  eligible_games: number;
  wins: number;
  top3: number;
  pick_rate: number;
  win_rate: number;
  top3_rate: number;
  average_rank: number;
  sample_status: ReturnType<typeof sampleStatus>;
};
export type BuildStats = {
  version: number;
  games: number;
  coverage: Record<BuildGroup, number>;
  variant_counts: Record<BuildGroup, number>;
  groups: Record<BuildGroup, BuildStat[]>;
};
export type BuildPatchChange = {
  patch_version: string;
  entity_type: "item" | "trait" | "tactical_skill";
  target_code: number | null;
  target_name: string;
  raw_change_text: string;
  before_value: string | null;
  after_value: string | null;
  change_type: "buff" | "nerf" | "adjustment" | "bugfix";
  reviewed: boolean;
  source_url?: string;
};
export type BuildMeta = {
  character_code: number;
  weapon_code: number;
  patch_key: string;
  rank_scope: string;
  period_start: string;
  period_end: string;
  stats: BuildStats;
  patch_changes: BuildPatchChange[];
  routes: Array<{ route_id: number; fetched_at: string; payload: Record<string, unknown>; title?: string; paths?: string[]; target_items?: string[] }>;
};

type Observation = { key: string; codes: number[]; slot?: string; name?: string };

// One observation is one participant in one match, not one team or item slot.
export function buildUsageStats(source: Record<string, unknown>[]): BuildStats {
  const maps = Object.fromEntries(BUILD_GROUPS.map((group) => [group, new Map<string, BuildStat & { rankSum: number }>()])) as Record<BuildGroup, Map<string, BuildStat & { rankSum: number }>>;
  const coverage = Object.fromEntries(BUILD_GROUPS.map((group) => [group, 0])) as Record<BuildGroup, number>;
  const denominators = new Map<string, number>();
  const seen = new Set<string>();
  let games = 0;
  for (const row of source) {
    const rank = Number(row.game_rank ?? row.gameRank);
    if (!Number.isSafeInteger(rank) || rank < 1) continue;
    const gameId = Number(row.game_id ?? row.gameId), userNum = Number(row.user_num ?? row.userNum);
    const identity = Number.isSafeInteger(gameId) && gameId > 0 && Number.isSafeInteger(userNum) && userNum > 0 ? `${gameId}:${userNum}` : null;
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);
    games++;
    const detail = matchDetailSource(row);
    const observations: Record<BuildGroup, Observation[]> = Object.fromEntries(BUILD_GROUPS.map((group) => [group, []])) as unknown as Record<BuildGroup, Observation[]>;
    const items = detail.equipment ?? [];
    observations.items = items.map((item) => ({ key: `${item.slot}:${item.code}`, codes: [item.code], slot: item.slot }));
    if (new Set(items.map((item) => item.slot)).size === 5) {
      const sorted = [...items].sort((a, b) => a.slot.localeCompare(b.slot));
      observations.item_sets = [{ key: sorted.map((item) => `${item.slot}:${item.code}`).join("|"), codes: sorted.map((item) => item.code) }];
    }
    const traits = detail.traitGroups;
    if (traits?.core) observations.traits.push({ key: `core:${traits.core}`, codes: [traits.core], slot: "핵심" });
    for (const [slot, codes] of [["주 특성 보조", traits?.firstSub], ["부 특성 보조", traits?.secondSub]] as const) {
      for (const code of codes ?? []) observations.traits.push({ key: `${slot}:${code}`, codes: [code], slot });
    }
    // Older saved detail records did not retain trait categories. Keep them separate.
    if (!traits) observations.traits = (detail.traits ?? []).map((code) => ({ key: `unknown:${code}`, codes: [code], slot: "분류 미수집" }));
    if (traits?.core && traits.firstSub?.length === 2 && traits.secondSub?.length === 2 && new Set([traits.core, ...traits.firstSub, ...traits.secondSub]).size === 5) {
      const first = [...traits.firstSub].sort((a, b) => a - b), second = [...traits.secondSub].sort((a, b) => a - b);
      observations.trait_sets = [{ key: `${traits.core}|${first.join(",")}|${second.join(",")}`, codes: [traits.core, ...first, ...second] }];
    }
    if (detail.routeId) observations.routes = [{ key: String(detail.routeId), codes: [detail.routeId] }];
    if (detail.tacticalSkillCode) observations.tactical_skills = [{ key: String(detail.tacticalSkillCode), codes: [detail.tacticalSkillCode] }];
    if (detail.skills?.length) observations.skill_orders = [{ key: detail.skills.map((skill) => `${skill.order}:${skill.code}`).join("|"), codes: detail.skills.map((skill) => skill.code) }];
    const area = Number(detail.startArea);
    if (Number.isSafeInteger(area) && area > 0) observations.start_areas = [{ key: String(area), codes: [area] }];
    else if (!Number.isFinite(area) && detail.startArea?.trim()) observations.start_areas = [{ key: detail.startArea, codes: [], name: detail.startArea }];
    for (const group of BUILD_GROUPS) {
      const values = [...new Map(observations[group].map((value) => [value.key, value])).values()];
      if (!values.length) continue;
      coverage[group]++;
      for (const slot of new Set(values.map((value) => value.slot ?? "all"))) {
        const key = `${group}:${slot}`;
        denominators.set(key, (denominators.get(key) ?? 0) + 1);
      }
      for (const value of values) {
        const stat = maps[group].get(value.key) ?? { ...value, games: 0, eligible_games: 0, wins: 0, top3: 0, pick_rate: 0, win_rate: 0, top3_rate: 0, average_rank: 0, sample_status: "insufficient", rankSum: 0 };
        stat.games++; stat.wins += Number(rank === 1); stat.top3 += Number(rank <= 3); stat.rankSum += rank;
        maps[group].set(value.key, stat);
      }
    }
  }
  const variant_counts = Object.fromEntries(BUILD_GROUPS.map((group) => [group, maps[group].size])) as Record<BuildGroup, number>;
  const groups = Object.fromEntries(BUILD_GROUPS.map((group) => [group, [...maps[group].values()].map(({ rankSum, ...stat }) => ({
    ...stat, eligible_games: denominators.get(`${group}:${stat.slot ?? "all"}`) ?? 0,
    pick_rate: stat.games / (denominators.get(`${group}:${stat.slot ?? "all"}`) || 1),
    win_rate: stat.wins / stat.games, top3_rate: stat.top3 / stat.games, average_rank: rankSum / stat.games, sample_status: sampleStatus(stat.games)
  })).sort((a, b) => b.games - a.games || a.key.localeCompare(b.key)).slice(0, group === "items" ? 50 : 20)])) as Record<BuildGroup, BuildStat[]>;
  return { version: BUILD_STATS_VERSION, games, coverage, variant_counts, groups };
}

export function labelBuildStats(stats: BuildStats, names: Record<string, string>): BuildStats {
  const prefixes: Record<BuildGroup, string> = { items: "Item/Name", item_sets: "Item/Name", traits: "Trait/Name", trait_sets: "Trait/Name", routes: "Route/Name", tactical_skills: "TacticalSkill/Name", skill_orders: "Skill/Group/Name", start_areas: "Area/Name" };
  return { ...stats, groups: Object.fromEntries(BUILD_GROUPS.map((group) => [group, stats.groups[group].map((stat) => ({ ...stat,
    name: (stat.codes.length ? stat.codes.map((code) => names[`${prefixes[group]}/${code}`] ?? String(code)).join(group === "skill_orders" ? " → " : " · ") : names[`${prefixes[group]}/${stat.key}`] ?? stat.name ?? stat.key).slice(0, 500)
  }))])) as BuildStats["groups"] };
}
