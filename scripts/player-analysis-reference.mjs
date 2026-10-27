// Independent arithmetic on official camelCase fields. No production imports.
const present = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const average = (rows, read) => mean(rows.map(read).filter(present).map(Number));
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key]), 0);
const actualRp = (row) => row.mmrBefore > 0 && row.mmrAfter > 0
  ? row.mmrAfter - row.mmrBefore : row.mmrGainGambit ?? row.mmrGain;
const pair = (row, first, second) => present(row[first]) && present(row[second]) ? Number(row[first]) + Number(row[second]) : null;
const fieldMap = {
  kills: "playerKill", assists: "playerAssistant", deaths: "playerDeaths", damage_dealt: "damageToPlayer",
  damage_taken: "damageFromPlayer", cc_seconds: "ccTimeToPlayer", character_level: "characterLevel", weapon_level: "bestWeaponLevel",
  credits_gained: "totalGainVFCredit", credits_spent: "totalUseVFCredit", legendary_crafts: "craftLegend", mythic_crafts: "craftMythic",
  tactical_level: "tacticalSkillLevel", hunts: "monsterKill", monster_damage: "damageToMonster", team_kills: "teamKill",
  self_healing: "healAmount", ally_healing: "teamRecover", shield_absorb: "protectAbsorb", ally_revives: "creditRevivedOthersCount",
  view_score: "viewContribution", consoles: "useSecurityConsole", mmr_base: "mmrGain", hyperloops: "useHyperLoop",
  early_deaths: "deathsPhaseOne", battle_zone_deaths: "battleZoneDeaths", average_rank: "gameRank"
};

export function referenceStatistics(rows) {
  return {
    ...Object.fromEntries(Object.entries(fieldMap).map(([id, key]) => [id, average(rows, (row) => row[key])])),
    cameras_placed: average(rows, (row) => pair(row, "addSurveillanceCamera", "addTelephotoCamera")),
    cameras_removed: average(rows, (row) => pair(row, "removeSurveillanceCamera", "removeTelephotoCamera")),
    ...Object.fromEntries([["active_minutes", "playTime"], ["spectator_minutes", "watchTime"], ["match_minutes", "totalTime"]]
      .map(([id, key]) => [id, average(rows, (row) => present(row[key]) ? row[key] / 60 : null)])),
    mmr_actual: average(rows, actualRp),
    win_rate: average(rows, (row) => row.gameRank > 0 ? Number(row.gameRank === 1) : null),
    top3_rate: average(rows, (row) => row.gameRank > 0 ? Number(row.gameRank <= 3) : null)
  };
}

export function referenceMetric(rows, id) {
  const perMinuteFields = { damage_per_minute: "damageToPlayer", cc_per_minute: "ccTimeToPlayer", hunts_per_minute: "monsterKill",
    monster_damage_per_minute: "damageToMonster", weapon_level_per_minute: "bestWeaponLevel", credits_per_minute: "totalGainVFCredit",
    view_contribution_per_minute: "viewContribution" };
  if (id in perMinuteFields) {
    const key = perMinuteFields[id];
    const valid = rows.filter((row) => row.playTime > 0 && present(row[key]));
    return valid.length ? sum(valid, key) * 60 / sum(valid, "playTime") : null;
  }
  if (id === "support_per_minute") {
    const valid = rows.filter((row) => row.playTime > 0 && present(row.teamRecover) && present(row.protectAbsorb));
    return valid.length ? (sum(valid, "teamRecover") + sum(valid, "protectAbsorb")) * 60 / sum(valid, "playTime") : null;
  }
  if (id === "kill_participation") return average(rows, (row) => row.teamKill > 0 && present(row.playerKill) && present(row.playerAssistant)
    ? Math.max(0, Math.min(1, (row.playerKill + row.playerAssistant) / row.teamKill)) : null);
  if (id === "mmr_gain") return average(rows, actualRp);
  const ranks = rows.filter((row) => row.gameRank > 0).map((row) => row.gameRank);
  if (id === "average_rank") return mean(ranks);
  if (id === "win_rate") return mean(ranks.map((rank) => Number(rank === 1)));
  if (id === "top3_rate") return mean(ranks.map((rank) => Number(rank <= 3)));
  if (id === "rank_stability") return ranks.length ? Math.sqrt(mean(ranks.map((rank) => (rank - mean(ranks)) ** 2))) : null;
  throw new Error(`Unknown metric ${id}`);
}

export function referenceBenchmark(rows, id) {
  const columns = { playerKill: "player_kill", playerAssistant: "player_assistant", teamKill: "team_kill", playTime: "play_time",
    damageToPlayer: "damage_to_player", damageToMonster: "damage_to_monster", ccTimeToPlayer: "cc_time_to_player", monsterKill: "monster_kill",
    bestWeaponLevel: "best_weapon_level", totalGainVFCredit: "total_gain_vf_credit", teamRecover: "team_recover", protectAbsorb: "protect_absorb",
    mmrBefore: "mmr_before", mmrAfter: "mmr_after", mmrGain: "mmr_gain", viewContribution: "view_contribution", gameRank: "game_rank" };
  const minimum = ["damage_per_minute", "kill_participation", "cc_per_minute"].includes(id) ? 3 : id === "rank_stability" ? 5 : 1;
  const groups = new Map();
  for (const row of rows) {
    const source = Object.fromEntries(Object.entries(columns).map(([key, column]) => [key, row[column]]));
    if (!(source.gameRank > 0) || referenceMetric([source], id) === null) continue;
    const key = row.user_num || Symbol();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(source);
  }
  const eligible = [...groups.values()].filter((group) => group.length >= minimum);
  const values = eligible.map((group) => referenceMetric(group, id)).sort((a, b) => a - b);
  const center = (values.length - 1) / 2;
  const median = values.length ? (values[Math.floor(center)] + values[Math.ceil(center)]) / 2 : null;
  const meanReference = ["top3_rate", "win_rate", "average_rank", "mmr_gain", "support_per_minute"].includes(id);
  return { value: meanReference ? mean(values) : median, players: eligible.length,
    games: eligible.reduce((count, group) => count + group.length, 0) };
}

export function referencePickEvaluation(rows, peers) {
  const groups = new Map();
  for (const row of peers.filter((row) => row.game_rank > 0)) {
    const key = row.user_num || Symbol();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.game_rank);
  }
  const sampleGames = [...groups.values()].reduce((total, ranks) => total + ranks.length, 0);
  if (!rows.length) return { grade: null, score: null, status: "provisional" };
  const reference = [...groups.values()].map((ranks) => ({
    rank: mean(ranks), top3: mean(ranks.map((rank) => Number(rank <= 3))), win: mean(ranks.map((rank) => Number(rank === 1)))
  }));
  const playerRanks = rows.map((row) => row.gameRank);
  const values = { rank: mean(playerRanks), top3: mean(playerRanks.map((rank) => Number(rank <= 3))),
    win: mean(playerRanks.map((rank) => Number(rank === 1))) };
  const hasPeers = groups.size > 0;
  const reliability = Math.sqrt(Math.min(rows.length / 20, 1) * (hasPeers ? Math.min(groups.size / 50, 1) : 1));
  let score = 0;
  for (const [key, weight, lower] of [["rank", 0.5, true], ["top3", 0.35, false], ["win", 0.15, false]]) {
    let below = 0, equal = 0;
    for (const item of reference) {
      if (item[key] < values[key]) below++;
      else if (Math.abs(item[key] - values[key]) <= 0.000001) equal++;
    }
    let percentile;
    if (hasPeers) {
      percentile = (below + equal / 2) * 100 / reference.length;
      if (lower) percentile = 100 - percentile;
      percentile = Math.round(percentile * 10) / 10;
    } else percentile = lower ? Math.min(100, Math.max(0, (8 - values.rank) / 7 * 100)) : values[key] * 100;
    const adjusted = Math.round((50 + (percentile - 50) * reliability) * 10) / 10;
    score += adjusted * weight;
  }
  score = Math.round(score * 10) / 10;
  const bands = [["S",90],["A+",80],["A",70],["B+",60],["B",50],["C+",40],["C",30],["D+",20],["D",10],["F+",5],["F",0]];
  return { score, grade: bands.find(([, minimum]) => score >= minimum)[0],
    status: rows.length >= 20 && sampleGames >= 50 && groups.size >= 30 && reliability >= 0.85 ? "rated" : "provisional" };
}
