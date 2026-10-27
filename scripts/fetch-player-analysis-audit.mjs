import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import createProjectLoader from "./load-project-module.cjs";

// Read-only: never invokes ingestion, cache writes or an LLM. Raw captures stay
// under the ignored .scheduler directory and must not be committed.
if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const nicknames = option("--players", "").split(",").map((value) => value.trim()).filter(Boolean);
if (!nicknames.length) throw new Error("Supply --players nickname1,nickname2");
const maxPages = Number(option("--max-pages", "20"));
if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 200) throw new Error("--max-pages must be 1..200");
const outputPath = option("--out", ".scheduler/player-analysis-raw.json");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const load = createProjectLoader();
const { getActivePatch } = load("lib/patch-version.ts");
const { resolvePlayerUserNum } = load("lib/ingestion.ts");
const { fetchUserByNickname, fetchUserGamesPage, fetchUserGamesPageByUserId, getUserId, getUserNum } = load("lib/eternal-return.ts");
const patch = await getActivePatch(db);
if (!patch) throw new Error("No independently stored patch context");
const latest = await db.from("matches").select("game_id,season_id,version_season,version_major,version_minor,started_at")
  .eq("matching_mode", 3).eq("matching_team_mode", 3).eq("version_season", patch.version_season)
  .eq("version_major", patch.version_major).eq("version_minor", patch.version_minor)
  .order("started_at", { ascending: false }).limit(1).single();
if (latest.error) throw latest.error;
const output = { generatedAt: new Date().toISOString(), patch, latest: latest.data, players: [] };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
for (const nickname of nicknames) {
  const user = await fetchUserByNickname(nickname);
  const uid = getUserId(user), userNum = getUserNum(user);
  if (!uid && !userNum) throw new Error(`Cannot resolve player: ${nickname}`);
  const pages = [], seen = new Set();
  let next;
  let boundaryReached = false;
  let fetchedPages = 0;
  for (; fetchedPages < maxPages; fetchedPages++) {
    const page = uid ? await fetchUserGamesPageByUserId(uid, next) : await fetchUserGamesPage(userNum, next);
    const games = page.userGames ?? [];
    pages.push(...games);
    const current = pages.filter((row) => row.matchingMode === 3 && row.matchingTeamMode === 3 && row.seasonId === latest.data.season_id &&
      row.versionMajor === patch.version_major && row.versionMinor === patch.version_minor);
    boundaryReached = games.some((row) => Date.parse(row.startDtm) < Date.parse(patch.patch_start_at));
    const cursor = Number(page.next);
    if (current.length >= 50 || boundaryReached || !cursor || !games.length || seen.has(cursor)) break;
    seen.add(cursor); next = cursor;
  }
  const capturedGameIds = [...new Set(pages.map((row) => Number(row.gameId)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  const storedQuery = () => db.from("match_players").select("*, matches!inner(season_id,matching_mode,matching_team_mode,version_season,version_major,version_minor,started_at)")
    .in("game_id", capturedGameIds)
    .eq("matches.season_id", latest.data.season_id).eq("matches.version_season", patch.version_season)
    .eq("matches.version_major", patch.version_major).eq("matches.version_minor", patch.version_minor);
  let query = storedQuery();
  query = uid ? query.eq("external_user_id", uid) : query.eq("user_num", userNum);
  let stored = await query.order("game_id", { ascending: false }).limit(50);
  let storedIdentity = uid ? "external_user_id" : "user_num";
  // The service uses nickname fallback when a renewed official UID has no
  // current-patch history. Audit the same persisted rows rather than a false empty set.
  if (uid && !stored.error && !stored.data?.length) {
    stored = await storedQuery().ilike("nickname", nickname).order("game_id", { ascending: false }).limit(50);
    storedIdentity = "nickname";
  }
  const cached = await db.from("player_analysis_cache").select("payload,generated_at,analysis_version")
    .ilike("nickname", nickname).order("generated_at", { ascending: false }).limit(1).maybeSingle();
  output.players.push({ nickname, userNum: resolvePlayerUserNum({ nickname }, { nickname, userId: uid, userNum }), pages, stored: stored.data ?? [], cached: cached.data ?? null,
    storedIdentity, storedError: stored.error?.message ?? null, cacheError: cached.error?.message ?? null, boundaryReached,
    pageLimitReached: fetchedPages >= maxPages });
  fs.writeFileSync(outputPath, JSON.stringify(output));
  console.log(JSON.stringify({ nickname, fetchedGames: pages.length, boundaryReached, pageLimitReached: fetchedPages >= maxPages }));
}
if (option("--cohorts")) {
  const { readAnalysisCohortRows } = load("lib/player-analysis-cohort.ts");
  const [characters, roles] = await Promise.all([db.from("characters").select("character_code,name_ko"),
    db.from("character_weapon_archetypes").select("*")]);
  if (characters.error || roles.error) throw characters.error ?? roles.error;
  const cohorts = { generatedAt: new Date().toISOString(), characters: characters.data, roles: roles.data, buckets: {} };
  const buckets = new Set(output.players.map((player) => Math.floor(Number(player.pages.find((row) => row.matchingMode === 3 &&
    row.seasonId === latest.data.season_id)?.mmrAfter ?? 0) / 500) * 500));
  for (const bucket of buckets) {
    const started = Date.now();
    try { cohorts.buckets[bucket] = { rows: await readAnalysisCohortRows(db, patch, Math.max(0, bucket - 500), bucket + 1000, 0, latest.data.season_id) }; }
    catch (error) { cohorts.buckets[bucket] = { rows: [], error: error.message }; }
    fs.mkdirSync(path.dirname(option("--cohorts")), { recursive: true });
    fs.writeFileSync(option("--cohorts"), JSON.stringify(cohorts));
    console.log(JSON.stringify({ bucket, games: cohorts.buckets[bucket].rows.length, error: cohorts.buckets[bucket].error, seconds: (Date.now() - started) / 1000 }));
  }
}
