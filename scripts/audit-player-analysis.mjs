import fs from "node:fs";
import path from "node:path";
import createProjectLoader from "./load-project-module.cjs";
import { referenceBenchmark, referenceMetric, referencePickEvaluation, referenceStatistics } from "./player-analysis-reference.mjs";

const args = process.argv.slice(2);
const argument = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const raw = JSON.parse(fs.readFileSync(argument("--input", ".scheduler/player-analysis-raw.json"), "utf8"));
if (raw.cases) {
  raw.latest = { ...raw.patch, season_id: raw.seasonId, started_at: raw.patch.latest_match_at };
  raw.players = raw.cases.map((sample) => ({ nickname: sample.nickname, pages: sample.rows }));
  raw.generatedAt = raw.capturedAt;
}
const outputPath = argument("--out", ".scheduler/player-analysis-audit.json");
const cohortPath = argument("--cohorts", ".scheduler/player-analysis-cohorts.json");
const cohorts = fs.existsSync(cohortPath) ? JSON.parse(fs.readFileSync(cohortPath, "utf8")) : { buckets: {}, roles: [], characters: [] };
const load = createProjectLoader();
const { buildPlayerAnalysis } = load("lib/player-analysis.ts");
const { normalizeOfficialAnalysisRow } = load("lib/player-analysis-source.ts");
const { isRoleBenchmarkEligible } = load("lib/combat-archetypes.ts");
const { resolvePlayerUserNum } = load("lib/ingestion.ts");
const { weaponName } = load("lib/weapons.ts");
const { version_season: season, version_major: major, version_minor: minor, season_id: seasonId } = raw.latest;
const patchKey = `${season}.${major}.${minor}`;
const patchStart = argument("--patch-start", raw.patch?.patch_start_at ?? raw.patchStart);
if (!patchStart || !Number.isFinite(Date.parse(patchStart))) throw new Error("Supply verified --patch-start ISO timestamp (or input.patch.patch_start_at)");
const patch = { patch_key: patchKey, version_season: season, version_major: major, version_minor: minor,
  patch_start_at: patchStart, latest_match_at: raw.latest.started_at };
const classify = (role) => role ? { rangeProfile: role.range_profile, primaryFunction: role.primary_function, secondaryFunction: role.secondary_function,
  scoreProfile: role.score_profile, confidence: role.confidence, reviewStatus: role.review_status, reviewReason: role.review_reason,
  classificationVersion: role.classification_version } : null;
const enough = (rows, games, players, perPlayer = 1) => {
  const groups = new Map();
  for (const row of rows) if (row.user_num > 0) groups.set(row.user_num, (groups.get(row.user_num) ?? 0) + 1);
  return rows.length >= games && [...groups.values()].filter((count) => count >= perPlayer).length >= players;
};
const fields = { play_time: "playTime", player_kill: "playerKill", player_assistant: "playerAssistant", player_deaths: "playerDeaths",
  damage_to_player: "damageToPlayer", damage_from_player: "damageFromPlayer", cc_time_to_player: "ccTimeToPlayer",
  total_gain_vf_credit: "totalGainVFCredit", total_spent_vf_credit: "totalUseVFCredit" };
const analyses = [];
let checks = 0;
const failures = [];
function check(label, actual, expected, tolerance = 1e-8) {
  checks++;
  if (actual === null || expected === null ? actual !== expected : !Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    failures.push({ label, actual, expected });
  }
}
const players = raw.players.filter((p) => p.pages?.length).map((player) => {
  const rows = [...new Map(player.pages.filter((row) => row.matchingMode === 3 && row.matchingTeamMode === 3 && row.seasonId === seasonId &&
    row.versionMajor === major && row.versionMinor === minor && Date.parse(row.startDtm) >= Date.parse(patchStart))
    .map((row) => [row.gameId, row])).values()].sort((a, b) => Date.parse(b.startDtm) - Date.parse(a.startDtm)).slice(0, 50);
  const counts = new Map();
  for (const row of rows) { const key = `${row.characterNum}:${row.bestWeapon}`; counts.set(key, (counts.get(key) ?? 0) + 1); }
  const mainPick = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const bucket = Math.floor(Number(rows[0]?.mmrAfter ?? 0) / 500) * 500;
  const selfUserNum = resolvePlayerUserNum({ nickname: player.nickname }, { nickname: player.nickname });
  const selfIds = new Set([selfUserNum, ...(player.stored ?? []).map((row) => row.user_num), ...(cohorts.buckets[bucket]?.rows ?? [])
    .filter((row) => row.nickname === player.nickname).map((row) => row.user_num)]);
  const pool = (cohorts.buckets[bucket]?.rows ?? []).filter((row) => row.nickname !== player.nickname && !selfIds.has(row.user_num));
  const initial = pool.filter((row) => row.mmr_after >= bucket && row.mmr_after < bucket + 500);
  const same = (items) => items.filter((row) => `${row.character_code}:${row.best_weapon}` === mainPick);
  const sameInitial = same(initial), sameExpanded = same(pool);
  const samePickRows = enough(sameInitial, 30, 15, 3) ? sameInitial : sameExpanded;
  const overallRows = enough(initial, 50, 30) ? initial : pool;
  const classification = classify((cohorts.roles ?? []).find((role) => `${role.character_code}:${role.weapon_code}` === mainPick));
  const roleKeys = new Set((cohorts.roles ?? []).filter((role) => classification && isRoleBenchmarkEligible(classification) &&
    isRoleBenchmarkEligible(classify(role)) && role.score_profile === classification.scoreProfile).map((role) => `${role.character_code}:${role.weapon_code}`));
  const roleInitial = initial.filter((row) => roleKeys.has(`${row.character_code}:${row.best_weapon}`));
  const roleExpanded = pool.filter((row) => roleKeys.has(`${row.character_code}:${row.best_weapon}`));
  const roleRows = enough(roleInitial, 50, 30, 3) ? roleInitial : roleExpanded;
  const common = { nickname: player.nickname, userNum: selfUserNum, seasonId, patchKey, supplementalGames: 0,
    characterNames: new Map((cohorts.characters ?? []).map((row) => [row.character_code, row.name_ko])) };
  const original = buildPlayerAnalysis({ ...common, playerRows: rows, overallRows: [], samePickRows: [], expandedBenchmark: false });
  const current = buildPlayerAnalysis({ ...common, playerRows: rows.map((row) => normalizeOfficialAnalysisRow(row, patch, seasonId)),
    overallRows, samePickRows, roleRows, combatClassification: classification,
    expandedBenchmark: !enough(sameInitial, 30, 15, 3) && enough(sameExpanded, 30, 15, 3),
    expandedRoleBenchmark: !enough(roleInitial, 50, 30, 3) && enough(roleExpanded, 50, 30, 3) });
  for (const pick of current.pick_profile.picks) pick.weapon_name = weaponName(pick.weapon_code);
  analyses.push(current);
  const expected = referenceStatistics(rows);
  check(`${player.nickname}:games`, current.scope.analyzed_games, rows.length);
  for (const metric of current.statistics.metrics) check(`${player.nickname}:statistics:${metric.id}`, metric.value, expected[metric.id]);
  for (const metric of current.dimensions.flatMap((dimension) => dimension.metrics)) {
    const subset = metric.player_scope.kind === "main_pick" ? rows.filter((row) => `${row.characterNum}:${row.bestWeapon}` === mainPick) : rows;
    const value = referenceMetric(subset, metric.id);
    if (value !== null) check(`${player.nickname}:metric:${metric.id}`, metric.value, value, 0.0051);
    if (metric.comparison_status === "available") {
      const comparison = metric.reference_type === "same_pick" ? samePickRows : metric.reference_type === "role" ? roleRows : overallRows;
      const benchmark = referenceBenchmark(comparison, metric.id);
      check(`${player.nickname}:benchmark:${metric.id}:value`, metric.reference_value, benchmark.value, 0.0051);
      check(`${player.nickname}:benchmark:${metric.id}:players`, metric.sample_players, benchmark.players);
      check(`${player.nickname}:benchmark:${metric.id}:games`, metric.sample_games, benchmark.games);
    }
  }
  for (const insight of current.strengths) for (const id of insight.metric_ids) {
    const metric = current.dimensions.flatMap((dimension) => dimension.metrics).find((item) => item.id === id);
    check(`${player.nickname}:strength:${id}:direction`, Number(metric.reference_value !== null &&
      (metric.value - metric.reference_value) * (metric.direction === "higher" ? 1 : -1) > 0), 1);
  }
  for (const pick of current.pick_profile.picks) {
    const personal = rows.filter((row) => row.characterNum === pick.character_code && row.bestWeapon === pick.weapon_code);
    const reference = referencePickEvaluation(personal, overallRows);
    check(`${player.nickname}:pick:${pick.character_code}:${pick.weapon_code}:score`, pick.evaluation.score, reference.score, 0.051);
    check(`${player.nickname}:pick:${pick.character_code}:${pick.weapon_code}:grade`, Number(pick.evaluation.grade === reference.grade), 1);
    check(`${player.nickname}:pick:${pick.character_code}:${pick.weapon_code}:status`, Number(pick.evaluation.status === reference.status), 1);
  }
  const overlaps = rows.flatMap((row) => {
    const stored = player.stored?.find((value) => value.game_id === row.gameId);
    return stored ? [{ row, stored }] : [];
  });
  const fieldMismatches = Object.fromEntries(Object.entries(fields).map(([column, key]) => [column,
    overlaps.filter(({ row, stored }) => row[key] != null && Math.abs(Number(row[key]) - Number(stored[column])) > 0.001).length]));
  return {
    nickname: player.nickname, currentPatchGames: rows.length, gameIds: rows.map((row) => row.gameId),
    missingVersionSeason: rows.filter((row) => row.versionSeason == null).length,
    acceptedWithoutContext: original.scope.analyzed_games, acceptedWithContext: current.scope.analyzed_games,
    cachedGames: player.cached?.payload?.scope?.analyzed_games ?? null, cachedPatch: player.cached?.payload?.scope?.patch_key ?? null,
    cachedVersion: player.cached?.analysis_version ?? null, cachedAt: player.cached?.generated_at ?? null,
    storedLookup: { identity: player.storedIdentity ?? null, error: player.storedError ?? null },
    overlaps: overlaps.length, fieldMismatches, expected, statistics: current.statistics,
    zeroRpEndpoints: rows.filter((row) => !(row.mmrBefore > 0 && row.mmrAfter > 0)).map((row) => row.gameId),
    cohortGames: pool.length, cohortError: cohorts.buckets[bucket]?.error ?? null,
    benchmarkCoverage: current.benchmark_coverage, caveats: current.caveats,
    pickEvaluations: current.pick_profile.picks.map((pick) => ({ character: pick.character_name, weapon: pick.weapon_name,
      games: pick.games, ...pick.evaluation })),
    dimensions: current.dimensions.map((dimension) => ({ key: dimension.key, score: dimension.score, confidence: dimension.confidence })),
    strengths: current.strengths, improvements: current.improvement_priorities,
    metricEvidence: current.dimensions.flatMap((dimension) => dimension.metrics).map((metric) => ({ id: metric.id, value: metric.value,
      reference: metric.reference_value, scope: metric.player_scope, player_games: metric.player_games, status: metric.comparison_status }))
  };
});
const report = { generatedAt: new Date().toISOString(), capturedAt: raw.generatedAt, source: "Read-only official API and saved match_players replay",
  patch, seasonId, validation: { checks, failures }, uniqueGames: new Set(players.flatMap((player) => player.gameIds)).size, players };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
if (argument("--save-analyses")) fs.writeFileSync(argument("--save-analyses"), JSON.stringify(analyses));
console.log(JSON.stringify({ checks, failures, uniqueGames: report.uniqueGames, players: players.map((player) => ({ nickname: player.nickname,
  games: player.currentPatchGames, cohortGames: player.cohortGames, cohortError: player.cohortError, dimensions: player.dimensions })) }));
if (failures.length) process.exitCode = 1;
