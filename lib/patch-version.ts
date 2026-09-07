import { ER_TARGET_PATCH } from "@/lib/env";
import type { PatchVersion } from "@/lib/types";

export async function getActivePatch(supabase: any): Promise<PatchVersion | null> {
  const configuredPatch = parsePatchKey(ER_TARGET_PATCH);
  const latestPatch = await getLatestStoredPatch(supabase);
  if (!configuredPatch) return latestPatch;

  const configuredPatchInfo = await getStoredPatchInfo(
      supabase,
      configuredPatch.version_season,
      configuredPatch.version_major,
      configuredPatch.version_minor
  );

  return resolveActivePatch(configuredPatch, configuredPatchInfo, latestPatch);
}

export function resolveActivePatch(
  configuredPatch: ReturnType<typeof parsePatchKey>,
  configuredPatchInfo: PatchVersion | null,
  latestPatch: PatchVersion | null
) {
  if (!configuredPatch) return latestPatch;
  if (latestPatch && comparePatchParts(latestPatch, configuredPatch) > 0) return latestPatch;
  return configuredPatchInfo ?? latestPatch;
}

export async function getLatestStoredPatch(supabase: any): Promise<PatchVersion | null> {
  const { data: latestMatch, error } = await supabase
    .from("matches")
    .select("version_season, version_major, version_minor, started_at")
    .gt("version_season", 0)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!latestMatch) return null;

  const versionSeason = Number(latestMatch.version_season ?? 0);
  const versionMajor = Number(latestMatch.version_major ?? 0);
  const versionMinor = Number(latestMatch.version_minor ?? 0);
  if (!versionSeason) return null;

  return getStoredPatchInfo(supabase, versionSeason, versionMajor, versionMinor);
}

export async function getStoredPatchInfo(
  supabase: any,
  versionSeason: number,
  versionMajor: number,
  versionMinor: number
): Promise<PatchVersion | null> {
  const { data: firstPatchMatch, error: firstPatchError } = await supabase
    .from("matches")
    .select("started_at")
    .eq("version_season", versionSeason)
    .eq("version_major", versionMajor)
    .eq("version_minor", versionMinor)
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstPatchError) throw firstPatchError;

  const { data: latestPatchMatch, error: latestPatchError } = await supabase
    .from("matches")
    .select("started_at")
    .eq("version_season", versionSeason)
    .eq("version_major", versionMajor)
    .eq("version_minor", versionMinor)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestPatchError) throw latestPatchError;

  return {
    patch_key: formatPatchKey(versionSeason, versionMajor, versionMinor),
    version_season: versionSeason,
    version_major: versionMajor,
    version_minor: versionMinor,
    patch_start_at: String(firstPatchMatch?.started_at ?? ""),
    latest_match_at: String(latestPatchMatch?.started_at ?? "")
  };
}

export function formatPatchKey(versionSeason: number, versionMajor: number, versionMinor: number) {
  return `${versionSeason}.${versionMajor}.${versionMinor}`;
}

export function parsePatchKey(value: string) {
  const match = value.trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  return {
    version_season: Number(match[1]),
    version_major: Number(match[2]),
    version_minor: Number(match[3] ?? 0)
  };
}

function comparePatchParts(
  left: Pick<PatchVersion, "version_season" | "version_major" | "version_minor">,
  right: Pick<PatchVersion, "version_season" | "version_major" | "version_minor">
) {
  return left.version_season - right.version_season ||
    left.version_major - right.version_major ||
    left.version_minor - right.version_minor;
}

export function matchesPatch(row: Record<string, unknown>, patch: PatchVersion | null) {
  if (!patch) return true;
  const versionSeason = row.versionSeason ?? row.version_season;
  const versionMajor = row.versionMajor ?? row.version_major;
  const versionMinor = row.versionMinor ?? row.version_minor;

  if (versionSeason !== undefined && Number(versionSeason) !== patch.version_season) return false;
  if (versionMajor !== undefined && Number(versionMajor) !== patch.version_major) return false;
  if (versionMinor !== undefined && Number(versionMinor) !== patch.version_minor) return false;
  return versionSeason !== undefined || versionMajor !== undefined || versionMinor !== undefined;
}
