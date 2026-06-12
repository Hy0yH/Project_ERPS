import { MIN_MYTHRIL_MMR, getOptionalNumberEnv } from "@/lib/env";
import {
  fetchGame,
  fetchGameData,
  fetchKoreanL10n,
  fetchTopRankers,
  fetchUserGames,
  getRows,
  normalizeGameRows
} from "@/lib/eternal-return";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildCompKey, confidenceScore, isTop3, ratio } from "@/lib/stats";

const RANKED_SQUAD_MODE = 3;

export async function syncCharacters() {
  const supabase = getSupabaseAdmin();
  const [characters, l10n] = await Promise.all([fetchGameData("Character"), fetchKoreanL10n()]);
  const rows = characters.map((item) => {
    const code = Number(item.code ?? item.characterCode ?? item.character_code);
    return {
      character_code: code,
      name_ko: l10n[`Character/Name/${code}`] ?? String(item.name ?? item.nameKo ?? code),
      name_en: String(item.name ?? item.nameEn ?? ""),
      role: String(item.role ?? ""),
      weapon_types: Array.isArray(item.weaponTypes) ? item.weaponTypes : [],
      is_active: true
    };
  });
  const { error } = await supabase.from("characters").upsert(rows, {
    onConflict: "character_code"
  });
  if (error) throw error;
  return rows.length;
}

export async function collectRankerMatches() {
  const supabase = getSupabaseAdmin();
  const seasonId = process.env.ER_SEASON_ID;
  if (!seasonId) throw new Error("ER_SEASON_ID is required");

  const run = await supabase
    .from("ingestion_runs")
    .insert({ job_name: "collect-rankers", status: "running" })
    .select("id")
    .single();
  if (run.error) throw run.error;

  let savedMatches = 0;
  try {
    await syncCharacters();
    const rankers = await fetchTopRankers(seasonId);
    for (const ranker of rankers) {
      const userNum = Number(ranker.userNum ?? ranker.user_num);
      if (!userNum) continue;
      const gamesPayload = await fetchUserGames(userNum);
      const games = normalizeGameRows(gamesPayload).slice(0, 20);
      for (const gameRow of games) {
        if (!isRankedSquad(gameRow)) continue;
        const gameId = Number(gameRow.gameId ?? gameRow.game_id);
        if (!gameId) continue;
        const exists = await supabase
          .from("matches")
          .select("game_id")
          .eq("game_id", gameId)
          .maybeSingle();
        if (exists.data) continue;
        const detail = await fetchGame(gameId);
        await saveGame(detail);
        savedMatches += 1;
      }
    }
    await supabase
      .from("ingestion_runs")
      .update({ status: "success", finished_at: new Date().toISOString(), saved_matches: savedMatches })
      .eq("id", run.data.id);
    return { savedMatches };
  } catch (error) {
    await supabase
      .from("ingestion_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error)
      })
      .eq("id", run.data.id);
    throw error;
  }
}

export async function saveGame(payload: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  const players = getRows(payload, "gamePlayers").length
    ? getRows(payload, "gamePlayers")
    : getRows(payload, "players");
  if (!players.length) return;
  const first = players[0];
  const gameId = Number(first.gameId ?? payload.gameId ?? payload.game_id);

  const match = {
    game_id: gameId,
    season_id: Number(first.seasonId ?? payload.seasonId ?? 0),
    matching_mode: Number(first.matchingMode ?? 0),
    matching_team_mode: Number(first.matchingTeamMode ?? RANKED_SQUAD_MODE),
    version_season: Number(first.versionSeason ?? 0),
    version_major: Number(first.versionMajor ?? 0),
    version_minor: Number(first.versionMinor ?? 0),
    server_name: String(first.serverName ?? ""),
    started_at: parseStartedAt(first.startDtm ?? payload.startDtm).toISOString()
  };

  const { error: matchError } = await supabase.from("matches").upsert(match, {
    onConflict: "game_id"
  });
  if (matchError) throw matchError;

  const playerRows = players.map((player) => ({
    game_id: gameId,
    user_num: Number(player.userNum ?? player.user_num),
    nickname: String(player.nickname ?? ""),
    team_number: Number(player.teamNumber ?? 0),
    character_code: Number(player.characterNum ?? player.characterCode ?? player.character_code),
    game_rank: Number(player.gameRank ?? player.game_rank),
    player_kill: Number(player.playerKill ?? 0),
    player_assistant: Number(player.playerAssistant ?? 0),
    mmr_before: Number(player.mmrBefore ?? 0),
    mmr_gain: Number(player.mmrGain ?? 0),
    mmr_after: Number(player.mmrAfter ?? 0),
    best_weapon: Number(player.bestWeapon ?? 0),
    equipment: player.equipment ?? {}
  }));

  const { error: playersError } = await supabase.from("match_players").upsert(playerRows, {
    onConflict: "game_id,user_num"
  });
  if (playersError) throw playersError;
}

export async function buildSnapshots(periodDays = 14) {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("match_players")
    .select("*, matches!inner(started_at)")
    .gte("matches.started_at", since)
    .gte("mmr_after", MIN_MYTHRIL_MMR);
  if (error) throw error;

  const players = data ?? [];
  if (!players.length) return { characters: 0, comps: 0 };

  const total = players.length || 1;
  const byCharacter = new Map<number, any[]>();
  for (const player of players) {
    const code = Number(player.character_code);
    byCharacter.set(code, [...(byCharacter.get(code) ?? []), player]);
  }

  const characterRows = [...byCharacter.entries()].map(([code, rows]) => {
    const wins = rows.filter((row) => Number(row.game_rank) === 1).length;
    const top3 = rows.filter((row) => isTop3(Number(row.game_rank))).length;
    const avgRank = rows.reduce((sum, row) => sum + Number(row.game_rank), 0) / rows.length;
    return {
      character_code: code,
      period_days: periodDays,
      period_start: since,
      period_end: new Date().toISOString(),
      season_id: getOptionalNumberEnv("ER_SEASON_ID", 0),
      tier_filter: "mythril_plus",
      games: rows.length,
      pick_rate: ratio(rows.length, total),
      win_rate: ratio(wins, rows.length),
      top3_rate: ratio(top3, rows.length),
      average_rank: avgRank,
      confidence_score: confidenceScore(rows.length)
    };
  });

  if (characterRows.length) {
    const { error: characterError } = await supabase
      .from("character_stats_snapshot")
      .upsert(characterRows, { onConflict: "character_code,period_days,period_start" });
    if (characterError) throw characterError;
  }

  const compRows = buildCompRows(players, periodDays, since);
  if (compRows.length) {
    const { error: compError } = await supabase.from("team_comp_stats").upsert(compRows, {
      onConflict: "comp_key,period_days,period_start"
    });
    if (compError) throw compError;
  }
  return { characters: characterRows.length, comps: compRows.length };
}

function buildCompRows(players: any[], periodDays: number, periodStart: string) {
  const byGameTeam = new Map<string, any[]>();
  for (const player of players) {
    const key = `${player.game_id}:${player.team_number}`;
    byGameTeam.set(key, [...(byGameTeam.get(key) ?? []), player]);
  }

  const compMap = new Map<string, any[]>();
  for (const team of byGameTeam.values()) {
    const codes = team.map((player) => Number(player.character_code)).filter(Boolean);
    for (const size of [2, 3]) {
      for (const combo of combinations(codes, size)) {
        const key = buildCompKey(combo);
        compMap.set(key, [...(compMap.get(key) ?? []), team[0]]);
      }
    }
  }

  return [...compMap.entries()].map(([compKey, rows]) => {
    const codes = compKey.split("-").map(Number);
    const wins = rows.filter((row) => Number(row.game_rank) === 1).length;
    const top3 = rows.filter((row) => isTop3(Number(row.game_rank))).length;
    const avgRank = rows.reduce((sum, row) => sum + Number(row.game_rank), 0) / rows.length;
    return {
      comp_key: compKey,
      character_codes: codes,
      comp_size: codes.length,
      period_days: periodDays,
      period_start: periodStart,
      period_end: new Date().toISOString(),
      games: rows.length,
      wins,
      top3,
      win_rate: ratio(wins, rows.length),
      top3_rate: ratio(top3, rows.length),
      average_rank: avgRank,
      confidence_score: confidenceScore(rows.length, codes.length)
    };
  });
}

function combinations(values: number[], size: number): number[][] {
  if (values.length < size) return [];
  if (size === 1) return values.map((value) => [value]);
  return values.flatMap((value, index) =>
    combinations(values.slice(index + 1), size - 1).map((tail) => [value, ...tail])
  );
}

function isRankedSquad(row: Record<string, unknown>) {
  return Number(row.matchingTeamMode ?? row.matching_team_mode ?? RANKED_SQUAD_MODE) === RANKED_SQUAD_MODE;
}

function parseStartedAt(value: unknown) {
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric);
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}
