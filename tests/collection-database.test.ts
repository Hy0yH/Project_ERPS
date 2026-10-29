import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
import { getSupabaseAdmin } from "@/lib/supabase";
import { saveGame, findCompleteAnalysisGameIds } from "@/lib/ingestion";
import { resolvePlayerUserNum } from "@/lib/ingestion";
import { queueFailure } from "@/lib/ingestion-retry";
import { EternalReturnApiError } from "@/lib/eternal-return";

const db = new PGlite();
let legacyAfterMigration: any;
const token = "00000000-0000-4000-8000-000000000001";
const start = "2026-10-29T02:00:00Z", end = "2026-10-29T12:00:00Z";
const game = (id = 100, count = 24) => ({ gamePlayers: Array.from({ length: count }, (_, index) => ({
  gameId: id, uid: `uid-${index}`, nickname: `player-${index}`, matchingMode: 3, matchingTeamMode: 3,
  seasonId: 41, versionSeason: 12, versionMajor: 7, versionMinor: 0, startDtm: start,
  teamNumber: Math.floor(index / 3) + 1, characterNum: 1, gameRank: 1, bestWeapon: 15,
  playTime: 1000, viewContribution: 10
})) });

async function rpc(name: string, args: Record<string, unknown>) {
  if (!/^[a-z_]+$/.test(name)) throw new Error("Invalid function name");
  const entries = Object.entries(args);
  const values = entries.map(([key, value]) => key === "p_game_ids" ? `{${(value as number[]).join(",")}}`
    : value !== null && typeof value === "object" ? JSON.stringify(value) : value);
  try {
    const reply = await db.query<{ result: any }>(`select public.${name}(${entries.map(([key], i) => `${key} => $${i + 1}`).join(",")}) as result`, values);
    return { data: reply.rows[0].result, error: null };
  } catch (error) { return { data: null, error }; }
}

// The filter adapter runs the application's completion queries against real Postgres.
function from(table: string) {
  if (table !== "matches") throw new Error(`Unexpected table ${table}`);
  const where: string[] = [], values: unknown[] = [];
  const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
  const query: any = {
    select: () => query,
    in: (column: string, ids: number[]) => { where.push(`${column} in (${ids.map(bind).join(",")})`); return query; },
    gt: (column: string, value: unknown) => { where.push(`${column} > ${bind(value)}`); return query; },
    gte: (column: string, value: unknown) => { where.push(`${column} >= ${bind(value)}`); return query; },
    not: (column: string) => { where.push(`${column} is not null`); return query; },
    limit: async (limit: number) => ({ data: (await db.query(`select game_id from public.matches where ${where.join(" and ")} limit ${limit}`, values)).rows, error: null })
  };
  return query;
}

async function expectRollback(action: () => Promise<unknown>) {
  await db.exec("savepoint injected_failure");
  await expect(action()).rejects.toBeDefined();
  await db.exec("rollback to savepoint injected_failure; release savepoint injected_failure");
}
async function scalar(sql: string) { return (await db.query<any>(sql)).rows[0]; }
async function beginSnapshot() {
  const reply = await rpc("begin_ingestion_run", { p_job_name: "build-snapshots", p_lease_token: token });
  if (reply.error) throw reply.error;
  return Number(reply.data);
}
const characterRow = (games: number) => ({ character_code: 1, weapon_code: 15, period_days: 14,
  period_start: start, period_end: end, season_id: 41, tier_filter: "current_patch:12.7.0", rank_scope: "above:mythril",
  games, pick_rate: 1, win_rate: 1, top3_rate: 1, average_rank: 1, confidence_score: 1 });
const compRow = (games: number) => ({ comp_key: "1:15|2:15", character_codes: [1, 2], character_weapon_keys: ["1:15", "2:15"], comp_size: 2,
  period_days: 14, period_start: start, period_end: end, rank_scope: "above:mythril", games, wins: 1, top3: 1, win_rate: 1, top3_rate: 1, average_rank: 1, confidence_score: 1 });
const benchmarkRow = { patch_key: "12.7.0", season_id: 41, period_start: start, period_end: end, mmr_bucket: 7000,
  segment_key: "all", sample_games: 1, sample_players: 1, stats: {} };
async function stage(run: number, table: string, rows: unknown[]) {
  await db.query("insert into public.snapshot_staging_batches values($1,$2,0,$3)", [run, table, JSON.stringify(rows)]);
}
async function publish(run: number) {
  const reply = await rpc("publish_snapshot_build", { p_run_id: run, p_lease_token: token, p_period_days: 14,
    p_period_start: start, p_period_end: end, p_patch_key: "12.7.0",
    p_expected_counts: { character_stats_snapshot: 1, team_comp_stats: 1, player_metric_benchmarks: 1 } });
  if (reply.error) throw reply.error;
}

beforeAll(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  for (const file of (await readdir("supabase/migrations")).filter((file) => file.endsWith(".sql")).sort()) {
    if (file.endsWith("_collection_reliability.sql")) {
      await db.exec("insert into matches(game_id,started_at) values(9000,'2026-10-29T03:00:00Z'); insert into match_ingestion_queue(game_id,status,attempts) values(9000,'failed',4)");
    }
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  legacyAfterMigration = await scalar("select m.detail_collected_at,m.detail_player_count,q.status,q.attempts,(q.next_retry_at <= now()) as retryable from matches m join match_ingestion_queue q using(game_id) where m.game_id=9000");
  await db.exec("delete from matches where game_id=9000; delete from match_ingestion_queue where game_id=9000");
  await db.exec("insert into public.characters(character_code,name_ko) values(1,'fixture')");
}, 30_000);
beforeEach(async () => {
  await db.exec("begin");
  vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc, from } as any);
});
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

describe("transactional game storage", () => {
  it("preserves legacy matches without assuming completion and retains exhausted failures for retry", () => {
    expect(legacyAfterMigration).toEqual({ detail_collected_at: null, detail_player_count: 0, status: "failed", attempts: 4, retryable: true });
  });
  it.each([9, 24])("stores partial then full %i-player detail without duplicate participants", async (count) => {
    const detail = game(100, count), player = detail.gamePlayers[0];
    await saveGame({ gamePlayers: [player] }, { identity: { userId: player.uid, nickname: player.nickname } });
    await saveGame(detail, { completeDetail: true });
    const row = await scalar("select count(*)::int as players, count(distinct external_user_id)::int as identities from match_players");
    expect(row).toEqual({ players: count, identities: count });
    expect(await findCompleteAnalysisGameIds(getSupabaseAdmin(), [100])).toEqual(new Set([100]));
  });

  it("does not let personal partial rows downgrade or duplicate completed detail", async () => {
    const detail = game();
    await saveGame(detail, { completeDetail: true });
    await saveGame({ gamePlayers: [{ ...detail.gamePlayers[0], viewContribution: 1, playTime: 1 }] },
      { identity: { userId: "uid-0", nickname: "player-0" } });
    expect(await scalar("select count(*)::int as players,min(play_time)::int as play_time from match_players"))
      .toEqual({ players: 24, play_time: 1000 });
  });

  it("does not mark eight separate personal rows as a completed game", async () => {
    for (const player of game().gamePlayers.slice(0, 8)) {
      await saveGame({ gamePlayers: [player] }, { identity: { userId: player.uid, nickname: player.nickname } });
    }
    expect(await scalar("select count(*)::int as players from match_players")).toEqual({ players: 8 });
    expect(await findCompleteAnalysisGameIds(getSupabaseAdmin(), [100])).toEqual(new Set());
  });

  it("rolls back participant replacement and match metadata on a write error", async () => {
    await saveGame(game(), { completeDetail: true });
    const invalid = game(); invalid.gamePlayers[23].characterNum = 99999;
    await expectRollback(() => saveGame(invalid, { completeDetail: true }));
    expect(await scalar("select count(*)::int as players from match_players")).toEqual({ players: 24 });
    expect(await scalar("select detail_player_count from matches")).toEqual({ detail_player_count: 24 });
  });

  it("reconciles a legacy duplicate when full detail is refreshed", async () => {
    const detail = game(); await saveGame(detail, { completeDetail: true });
    await db.exec("insert into match_players select (jsonb_populate_record(null::match_players,to_jsonb(p)||'{\"user_num\":123456789}'::jsonb)).* from match_players p where external_user_id='uid-0'");
    await saveGame(detail, { completeDetail: true });
    expect(await scalar("select count(*)::int as players from match_players")).toEqual({ players: 24 });
  });

  it("uses the same UID key with or without personal identity and rejects corrupt input", async () => {
    const player = game().gamePlayers[0];
    expect(resolvePlayerUserNum(player)).toBe(resolvePlayerUserNum(player, { userId: player.uid, nickname: player.nickname }));
    const duplicate = game(); duplicate.gamePlayers[1] = duplicate.gamePlayers[0];
    await expect(saveGame(duplicate, { completeDetail: true })).rejects.toThrow("duplicate");
    const mismatch = game(); mismatch.gamePlayers[1].gameId = 101;
    await expect(saveGame(mismatch, { completeDetail: true })).rejects.toThrow("Invalid");
    const badDate = game(); badDate.gamePlayers[0].startDtm = "invalid-date";
    await expect(saveGame(badDate)).rejects.toThrow();
    await expect(saveGame(game(100, 1), { completeDetail: true })).rejects.toThrow("Incomplete");
    expect(await scalar("select count(*)::int as matches from matches")).toEqual({ matches: 0 });
  });
});

describe("snapshot publication", () => {
  async function prepare(badComp = false) {
    const run = await beginSnapshot();
    await stage(run, "character_stats_snapshot", [characterRow(20)]);
    await stage(run, "team_comp_stats", [{ ...compRow(20), comp_size: badComp ? 9 : 2 }]);
    await stage(run, "player_metric_benchmarks", [benchmarkRow]);
    return run;
  }
  async function existingSnapshot() {
    await db.query("insert into character_stats_snapshot select (jsonb_populate_record(null::character_stats_snapshot,$1::jsonb)).*",
      [JSON.stringify({ ...characterRow(10), id: 99, created_at: start })]);
    await db.query("insert into team_comp_stats select (jsonb_populate_record(null::team_comp_stats,$1::jsonb)).*",
      [JSON.stringify({ ...compRow(10), id: 99, created_at: start })]);
  }
  it("keeps all previous live results when a later table fails", async () => {
    await existingSnapshot(); const run = await prepare(true);
    await expectRollback(() => publish(run));
    expect(await scalar("select games from character_stats_snapshot")).toEqual({ games: 10 });
    expect(await scalar("select games from team_comp_stats")).toEqual({ games: 10 });
    expect(await scalar("select count(*)::int as rows from snapshot_staging_batches")).toEqual({ rows: 3 });
  });
  it("publishes all three datasets together and removes staging data", async () => {
    await existingSnapshot(); const run = await prepare();
    await publish(run);
    expect(await scalar("select games from character_stats_snapshot")).toEqual({ games: 20 });
    expect(await scalar("select games from team_comp_stats")).toEqual({ games: 20 });
    expect(await scalar("select count(*)::int as rows from player_metric_benchmarks")).toEqual({ rows: 1 });
    expect(await scalar("select count(*)::int as rows from snapshot_staging_batches")).toEqual({ rows: 0 });
  });
  it("rejects missing batches without replacing the previous result", async () => {
    await existingSnapshot(); const run = await prepare();
    await db.query("delete from snapshot_staging_batches where run_id=$1 and table_name='team_comp_stats'", [run]);
    await expectRollback(() => publish(run));
    expect(await scalar("select games from character_stats_snapshot")).toEqual({ games: 10 });
  });
  it("rejects a row from a different period", async () => {
    await existingSnapshot(); const run = await prepare();
    await db.query("update snapshot_staging_batches set rows=$1 where run_id=$2 and table_name='character_stats_snapshot'",
      [JSON.stringify([{ ...characterRow(20), period_days: 30 }]), run]);
    await expectRollback(() => publish(run));
    expect(await scalar("select games from character_stats_snapshot")).toEqual({ games: 10 });
  });
});

describe("leases, retries, and access", () => {
  it("blocks another live worker and recovers expired jobs with a new lease", async () => {
    const run = await beginSnapshot();
    const second = await rpc("begin_ingestion_run", { p_job_name: "build-snapshots", p_lease_token: token });
    expect(second.error).toMatchObject({ code: "55P03" });
    await db.exec("rollback; begin");
    const first = await beginSnapshot();
    await db.query("update ingestion_runs set heartbeat_at=now()-interval '11 minutes' where id=$1", [first]);
    const next = await beginSnapshot(); expect(next).not.toBe(first);
    expect((await db.query<any>("select status from ingestion_runs where id=$1", [first])).rows[0].status).toBe("interrupted");
    expect((await rpc("heartbeat_ingestion_run", { p_run_id: first, p_lease_token: token, p_stage: "publish", p_saved_matches: 0 })).data).toBe(false);
    expect(run).toBeGreaterThan(0);
  });
  it("keeps high-attempt transient errors retryable and isolates permanent errors", () => {
    const retry = queueFailure(new EternalReturnApiError("/fixture", 503, "private"), 7, 0);
    expect(retry.status).toBe("failed"); expect(Date.parse(retry.next_retry_at)).toBeGreaterThan(0);
    const permanent = queueFailure(new EternalReturnApiError("/fixture", 404, "private"), 1, 0);
    expect(permanent).toMatchObject({ status: "dead_letter", last_error: "ER_HTTP_404" });
    expect(JSON.stringify(permanent)).not.toContain("private");
  });
  it("manually requeues selected failures without resetting live or completed work", async () => {
    await db.exec("insert into match_ingestion_queue(game_id,status,attempts) values(1,'failed',5),(2,'dead_letter',1),(3,'processing',2),(4,'completed',1)");
    const result = await rpc("retry_ingestion_matches", { p_game_ids: [1, 2, 3, 4] });
    expect(result.data).toBe(2);
    expect((await db.query("select status,attempts from match_ingestion_queue order by game_id")).rows)
      .toEqual([{ status: "pending", attempts: 0 }, { status: "pending", attempts: 0 }, { status: "processing", attempts: 2 }, { status: "completed", attempts: 1 }]);
  });
  it("recovers queue claims owned by an expired collector without waiting four hours", async () => {
    const first = await rpc("begin_ingestion_run", { p_job_name: "collect-rankers", p_lease_token: token });
    await db.query("insert into match_ingestion_queue(game_id,status,attempts,claimed_run_id) values(100,'processing',3,$1)", [first.data]);
    await db.query("update ingestion_runs set heartbeat_at=now()-interval '11 minutes' where id=$1", [first.data]);
    await rpc("begin_ingestion_run", { p_job_name: "collect-rankers", p_lease_token: "00000000-0000-4000-8000-000000000002" });
    expect(await scalar("select status,attempts,claimed_run_id from match_ingestion_queue"))
      .toEqual({ status: "pending", attempts: 3, claimed_run_id: null });
  });
  it("does not grant public mutation functions or disable staging RLS", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const signature of ["begin_ingestion_run(text,uuid)", "save_ingested_game(jsonb,jsonb,boolean)", "retry_ingestion_matches(bigint[])"])
        expect((await db.query<any>("select has_function_privilege($1,$2,'EXECUTE') as allowed", [role, `public.${signature}`])).rows[0].allowed).toBe(false);
    }
    expect(await scalar("select relrowsecurity from pg_class where oid='public.snapshot_staging_batches'::regclass")).toEqual({ relrowsecurity: true });
  });
});
