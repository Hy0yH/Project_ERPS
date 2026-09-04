import { createClient } from "@supabase/supabase-js";
import {
  COMBAT_METRIC_WEIGHTS,
  classifyCharacterWeapon,
  isRoleBenchmarkEligible
} from "../lib/combat-archetypes.ts";
import { weaponCodeForType } from "../lib/weapons.ts";

const PAGE_SIZE = 1000;
const MIN_HOLDOUT_GAMES = 10;
const METRIC_IDS = ["damage_per_minute", "kill_participation", "cc_per_minute"];
const PROPOSED_WEIGHTS = {
  melee_damage: COMBAT_METRIC_WEIGHTS.melee_damage,
  melee_engage: { damage_per_minute: 0.15, kill_participation: 0.3, cc_per_minute: 0.55 },
  ranged_sustained: COMBAT_METRIC_WEIGHTS.ranged_sustained,
  ranged_poke: COMBAT_METRIC_WEIGHTS.ranged_poke,
  utility_control: { damage_per_minute: 0.15, kill_participation: 0.35, cc_per_minute: 0.5 },
  hybrid_skirmisher: { damage_per_minute: 0.55, kill_participation: 0.3, cc_per_minute: 0.15 }
};
const EQUAL_WEIGHTS = {
  damage_per_minute: 1 / 3,
  kill_participation: 1 / 3,
  cc_per_minute: 1 / 3
};

const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const patch = await latestPatch();
const classifications = await loadClassifications();
const rows = await loadPatchRows(patch);
const audit = auditRows(rows, classifications);

process.stdout.write(`${JSON.stringify({ patch, ...audit }, null, 2)}\n`);

async function latestPatch() {
  const { data, error } = await supabase
    .from("matches")
    .select("version_season, version_major, version_minor, started_at")
    .gt("version_season", 0)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No collected matches were found.");
  return {
    version_season: Number(data.version_season),
    version_major: Number(data.version_major),
    version_minor: Number(data.version_minor),
    key: `${data.version_season}.${data.version_major}.${data.version_minor}`
  };
}

async function loadPatchRows(patchInfo) {
  const output = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("match_players")
      .select([
        "game_id", "user_num", "character_code", "best_weapon", "game_rank",
        "player_kill", "player_assistant", "team_kill", "play_time",
        "damage_to_player", "cc_time_to_player", "analysis_data_version",
        "matches!inner(version_season, version_major, version_minor, started_at)"
      ].join(","))
      .eq("matches.version_season", patchInfo.version_season)
      .eq("matches.version_major", patchInfo.version_major)
      .eq("matches.version_minor", patchInfo.version_minor)
      .order("game_id", { ascending: true })
      .order("user_num", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    output.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return output;
}

async function loadClassifications() {
  const stored = await supabase
    .from("character_weapon_archetypes")
    .select([
      "character_code", "weapon_code", "range_profile", "primary_function",
      "secondary_function", "score_profile", "review_status", "confidence",
      "classification_version", "review_reason"
    ].join(","));
  if (!stored.error && stored.data?.length) {
    return new Map(stored.data.map((row) => [`${row.character_code}:${row.weapon_code}`, {
      rangeProfile: row.range_profile,
      primaryFunction: row.primary_function,
      secondaryFunction: row.secondary_function,
      scoreProfile: row.score_profile,
      reviewStatus: row.review_status,
      confidence: row.confidence,
      classificationVersion: Number(row.classification_version),
      reviewReason: row.review_reason
    }]));
  }

  const [characters, masteries] = await Promise.all([
    erData("Character"),
    erData("CharacterMastery")
  ]);
  const masteryByCharacter = new Map(masteries.map((row) => [
    Number(row.code),
    [row.weapon1, row.weapon2, row.weapon3, row.weapon4]
      .filter((value) => typeof value === "string" && value !== "None")
  ]));
  const output = new Map();
  for (const character of characters) {
    const characterCode = Number(character.code ?? 0);
    const weapons = masteryByCharacter.get(characterCode) ?? [];
    for (const weaponType of weapons.length ? weapons : [null]) {
      const weaponCode = weaponCodeForType(weaponType) ?? 0;
      output.set(`${characterCode}:${weaponCode}`, classifyCharacterWeapon({
        characterCode,
        weaponCode,
        weaponType,
        officialPrimary: typeof character.charArcheType1 === "string" ? character.charArcheType1 : null,
        officialSecondary: typeof character.charArcheType2 === "string" ? character.charArcheType2 : null,
        officialRangeType: typeof character.weaponRangeType === "string" ? character.weaponRangeType : null
      }));
    }
  }
  return output;
}

async function erData(type) {
  const response = await fetch(`https://open-api.bser.io/v2/data/${type}`, {
    headers: { "x-api-key": requiredEnv("ETERNAL_RETURN_API_KEY"), accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Official API ${type} failed: ${response.status}`);
  const json = await response.json();
  return Array.isArray(json) ? json : json.data ?? [];
}

function auditRows(rawRows, classificationMap) {
  const keys = new Set();
  let duplicateRows = 0;
  let invalidPlayTime = 0;
  let shortGames = 0;
  let invalidRank = 0;
  let negativeCombatValues = 0;
  let incompleteAnalysisRows = 0;
  let unclassifiedRows = 0;
  let ineligibleRows = 0;
  const eligible = [];

  for (const row of rawRows) {
    const key = `${row.game_id}:${row.user_num}`;
    if (keys.has(key)) duplicateRows += 1;
    keys.add(key);
    const playTime = Number(row.play_time ?? 0);
    const rank = Number(row.game_rank ?? 0);
    if (playTime <= 0) invalidPlayTime += 1;
    else if (playTime < 180) shortGames += 1;
    if (rank <= 0) invalidRank += 1;
    if (Number(row.damage_to_player ?? 0) < 0 || Number(row.cc_time_to_player ?? 0) < 0) {
      negativeCombatValues += 1;
    }
    if (Number(row.analysis_data_version ?? 0) < 1) incompleteAnalysisRows += 1;
    const classification = classificationMap.get(`${Number(row.character_code ?? 0)}:${Number(row.best_weapon ?? 0)}`);
    if (!classification) {
      unclassifiedRows += 1;
      continue;
    }
    if (!isRoleBenchmarkEligible(classification)) {
      ineligibleRows += 1;
      continue;
    }
    if (playTime <= 0 || rank <= 0) continue;
    eligible.push(normalizeRow(row, classification.scoreProfile));
  }

  const profiles = {};
  for (const profile of Object.keys(COMBAT_METRIC_WEIGHTS).filter((key) => key !== "unclassified")) {
    const profileRows = eligible.filter((row) => row.profile === profile);
    const players = groupPlayers(profileRows);
    const allAggregates = [...players.values()].map(aggregateGames);
    const stableAggregates = allAggregates.filter((player) => player.games >= 3);
    const scoreRows = scoreAggregates(stableAggregates, COMBAT_METRIC_WEIGHTS[profile]);
    const holdout = holdoutRows(players, {
      current: COMBAT_METRIC_WEIGHTS[profile],
      equal: EQUAL_WEIGHTS,
      proposed: PROPOSED_WEIGHTS[profile]
    });
    profiles[profile] = {
      games: profileRows.length,
      players: allAggregates.length,
      players_with_3_games: stableAggregates.length,
      peer_retention_at_3_games: ratio(stableAggregates.length, allAggregates.length),
      zero_or_full_rate: {
        damage_zero: ratio(profileRows.filter((row) => row.damage_per_minute === 0).length, profileRows.length),
        cc_zero: ratio(profileRows.filter((row) => row.cc_per_minute === 0).length, profileRows.length),
        kill_participation_zero: ratio(profileRows.filter((row) => row.kill_participation === 0).length, profileRows.length),
        kill_participation_full: ratio(profileRows.filter((row) => row.kill_participation === 1).length, profileRows.length)
      },
      player_metric_medians: Object.fromEntries(METRIC_IDS.map((id) => [id, quantile(
        stableAggregates.map((row) => row[id]).sort((a, b) => a - b), 0.5
      )])),
      current_score_distribution: summarize(scoreRows.map((row) => row.score)),
      current_score_vs_same_games_top3_spearman: spearman(
        scoreRows.map((row) => row.score),
        scoreRows.map((row) => row.top3_rate)
      ),
      chronological_holdout: holdout
    };
  }

  return {
    quality: {
      rows: rawRows.length,
      unique_game_players: keys.size,
      duplicate_rows: duplicateRows,
      invalid_play_time: invalidPlayTime,
      games_under_3_minutes: shortGames,
      invalid_rank: invalidRank,
      negative_combat_values: negativeCombatValues,
      incomplete_analysis_rows: incompleteAnalysisRows,
      unclassified_rows: unclassifiedRows,
      role_ineligible_rows: ineligibleRows,
      role_eligible_rows: eligible.length,
      role_coverage: ratio(eligible.length, rawRows.length)
    },
    profiles
  };
}

function normalizeRow(row, profile) {
  const seconds = Number(row.play_time);
  const teamKills = Number(row.team_kill ?? 0);
  return {
    user_num: Number(row.user_num),
    started_at: String(row.matches?.started_at ?? ""),
    profile,
    minutes: seconds / 60,
    damage_per_minute: Number(row.damage_to_player ?? 0) / (seconds / 60),
    cc_per_minute: Number(row.cc_time_to_player ?? 0) / (seconds / 60),
    kill_participation: teamKills > 0
      ? clamp((Number(row.player_kill ?? 0) + Number(row.player_assistant ?? 0)) / teamKills, 0, 1)
      : 0,
    top3: Number(row.game_rank) <= 3 ? 1 : 0
  };
}

function groupPlayers(rows) {
  const output = new Map();
  for (const row of rows) output.set(row.user_num, [...(output.get(row.user_num) ?? []), row]);
  return output;
}

function aggregateGames(rows) {
  const minutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  return {
    user_num: rows[0]?.user_num ?? 0,
    games: rows.length,
    damage_per_minute: weighted(rows, "damage_per_minute", "minutes", minutes),
    cc_per_minute: weighted(rows, "cc_per_minute", "minutes", minutes),
    kill_participation: mean(rows.map((row) => row.kill_participation)),
    top3_rate: mean(rows.map((row) => row.top3))
  };
}

function scoreAggregates(players, weights) {
  const distributions = Object.fromEntries(METRIC_IDS.map((id) => [
    id,
    players.map((row) => row[id]).sort((a, b) => a - b)
  ]));
  return players.map((player) => {
    const reliability = Math.sqrt(Math.min(player.games / 20, 1));
    const percentiles = Object.fromEntries(METRIC_IDS.map((id) => [
      id,
      percentile(player[id], distributions[id])
    ]));
    const relative = Object.fromEntries(METRIC_IDS.map((id) => [
      id,
      50 + (percentiles[id] - 50) * reliability
    ]));
    return {
      ...player,
      score: METRIC_IDS.reduce((sum, id) => sum + relative[id] * weights[id], 0),
      percentiles
    };
  });
}

function holdoutRows(players, weightSets) {
  const splitPlayers = [...players.values()]
    .filter((rows) => rows.length >= MIN_HOLDOUT_GAMES)
    .map((rows) => {
      const sorted = [...rows].sort((a, b) => a.started_at.localeCompare(b.started_at));
      const cut = Math.floor(sorted.length / 2);
      return { features: aggregateGames(sorted.slice(0, cut)), outcome: aggregateGames(sorted.slice(cut)) };
    });
  const featureAggregates = splitPlayers.map((row) => row.features);
  const outcomes = splitPlayers.map((row) => row.outcome.top3_rate);
  const byMetric = Object.fromEntries(METRIC_IDS.map((id) => [id, spearman(
    featureAggregates.map((row) => row[id]), outcomes
  )]));
  return {
    players: splitPlayers.length,
    future_top3_spearman: {
      ...byMetric,
      ...Object.fromEntries(Object.entries(weightSets).map(([label, weights]) => {
        const scored = scoreAggregates(featureAggregates, weights);
        return [`${label}_weighted_score`, spearman(scored.map((row) => row.score), outcomes)];
      }))
    }
  };
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p05: quantile(sorted, 0.05),
    p25: quantile(sorted, 0.25),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
    below_20_rate: ratio(values.filter((value) => value < 20).length, values.length),
    above_80_rate: ratio(values.filter((value) => value > 80).length, values.length)
  };
}

function percentile(value, sorted) {
  if (!sorted.length) return 50;
  let below = 0;
  let equal = 0;
  for (const current of sorted) {
    if (current < value) below += 1;
    else if (Math.abs(current - value) <= 1e-9) equal += 1;
  }
  return ((below + equal * 0.5) / sorted.length) * 100;
}

function spearman(xs, ys) {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  return round(pearson(ranks(xs), ranks(ys)), 4);
}

function ranks(values) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const output = Array(values.length);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && Math.abs(sorted[end].value - sorted[start].value) <= 1e-9) end += 1;
    const rank = (start + end - 1) / 2 + 1;
    for (let index = start; index < end; index += 1) output[sorted[index].index] = rank;
    start = end;
  }
  return output;
}

function pearson(xs, ys) {
  const xMean = mean(xs);
  const yMean = mean(ys);
  let numerator = 0;
  let xSquares = 0;
  let ySquares = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const x = xs[index] - xMean;
    const y = ys[index] - yMean;
    numerator += x * y;
    xSquares += x * x;
    ySquares += y * y;
  }
  const denominator = Math.sqrt(xSquares * ySquares);
  return denominator ? numerator / denominator : 0;
}

function weighted(rows, valueKey, weightKey, totalWeight) {
  return totalWeight
    ? rows.reduce((sum, row) => sum + row[valueKey] * row[weightKey], 0) / totalWeight
    : 0;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function quantile(sorted, percentileValue) {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const value = lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  return round(value, 4);
}

function ratio(numerator, denominator) {
  return denominator ? round(numerator / denominator, 4) : 0;
}

function round(value, digits) {
  if (value === null || !Number.isFinite(value)) return value;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
