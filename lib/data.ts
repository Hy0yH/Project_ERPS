import { DEFAULT_PERIOD_DAYS } from "@/lib/env";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  avgRankScore,
  buildCompKey,
  characterMetaScore,
  confidenceScore,
  tierFromScore
} from "@/lib/stats";
import type {
  Character,
  CharacterMeta,
  PatchChange,
  PlayerSummary,
  TeamCompStat
} from "@/lib/types";

export async function getCharacters(): Promise<Character[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .eq("is_active", true)
    .order("name_ko");
  if (error) throw error;
  return (data ?? []) as Character[];
}

export async function getCharacterMeta(periodDays = DEFAULT_PERIOD_DAYS): Promise<CharacterMeta[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("character_stats_snapshot")
    .select("*, characters(*)")
    .eq("period_days", periodDays)
    .order("period_end", { ascending: false });
  if (error) throw error;

  const latestByCharacter = new Map<number, any>();
  for (const row of data ?? []) {
    const code = Number(row.character_code);
    if (!latestByCharacter.has(code)) latestByCharacter.set(code, row);
  }

  return [...latestByCharacter.values()].map((row: any) => {
    const score = characterMetaScore({
      winRate: Number(row.win_rate ?? 0),
      top3Rate: Number(row.top3_rate ?? 0),
      averageRank: Number(row.average_rank ?? 0),
      confidence: Number(row.confidence_score ?? 0)
    });
    return {
      ...row.characters,
      games: Number(row.games ?? 0),
      pick_rate: Number(row.pick_rate ?? 0),
      win_rate: Number(row.win_rate ?? 0),
      top3_rate: Number(row.top3_rate ?? 0),
      average_rank: Number(row.average_rank ?? 0),
      confidence_score: Number(row.confidence_score ?? 0),
      tier: tierFromScore(score, Number(row.games ?? 0))
    } as CharacterMeta;
  }).sort((a, b) => b.confidence_score - a.confidence_score);
}

export async function getTeamComps(characterCodes: number[], periodDays = DEFAULT_PERIOD_DAYS) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin();
  const normalizedCodes = [...new Set(characterCodes)].sort((a, b) => a - b);
  let query = supabase
    .from("team_comp_stats")
    .select("*")
    .eq("period_days", periodDays)
    .order("period_end", { ascending: false })
    .limit(100);

  if (normalizedCodes.length > 0) {
    query = query.contains("character_codes", normalizedCodes);
  }

  const { data, error } = await query;
  if (error) throw error;
  const latestByComp = new Map<string, TeamCompStat>();
  for (const row of (data ?? []) as TeamCompStat[]) {
    if (!latestByComp.has(row.comp_key)) latestByComp.set(row.comp_key, row);
  }
  return [...latestByComp.values()].sort((a, b) => b.confidence_score - a.confidence_score);
}

export async function getPatchHistory(characterCode: number): Promise<PatchChange[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("character_patch_changes")
    .select("*")
    .eq("character_code", characterCode)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as PatchChange[];
}

export async function getRecentPatchSummary(characterCode: number) {
  const changes = await getPatchHistory(characterCode);
  return changes.slice(0, 2).map((change) => change.raw_change_text);
}

export async function getPlayerSummary(nickname: string): Promise<PlayerSummary | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("player_summary", {
    input_nickname: nickname
  });
  if (error) throw error;
  return data as PlayerSummary | null;
}

export async function getBestCompForCandidate(
  teammateCodes: number[],
  candidateCode: number,
  periodDays = DEFAULT_PERIOD_DAYS
) {
  if (!teammateCodes.length || !isSupabaseConfigured()) return null;
  const targetCodes = [...new Set([...teammateCodes, candidateCode])];
  const compKey = buildCompKey(targetCodes);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("team_comp_stats")
    .select("*")
    .eq("period_days", periodDays)
    .eq("comp_key", compKey)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as TeamCompStat | null;
}

export function displayPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function displayRank(value: number) {
  return value ? value.toFixed(2) : "-";
}

export function scoreFromMeta(meta?: CharacterMeta) {
  if (!meta) return 0;
  return characterMetaScore({
    winRate: meta.win_rate,
    top3Rate: meta.top3_rate,
    averageRank: meta.average_rank,
    confidence: meta.confidence_score
  });
}

export function emptyMetaScore() {
  return avgRankScore(0);
}
