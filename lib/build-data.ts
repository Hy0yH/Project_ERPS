import { createAsyncCache } from "@/lib/async-cache";
import { fetchGameData, fetchGameDataHashes, fetchWeaponRoute } from "@/lib/eternal-return";
import { getKoreanGameNames } from "@/lib/game-catalog";
import { BUNDLED_BUILD_PATCHES } from "@/lib/bundled-build-patches";
import { BUILD_GROUPS, labelBuildStats, type BuildMeta, type BuildPatchChange, type BuildStats } from "@/lib/build-stats";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

const patchCache = createAsyncCache<BuildPatchChange[]>(60_000, 4);
export function invalidateBuildReads() { patchCache.clear(); }

export function catalogEntityType(metaType: string): BuildPatchChange["entity_type"] | null {
  if (/^Item(Weapon|Armor)$/.test(metaType)) return "item";
  if (/^Trait$/.test(metaType)) return "trait";
  if (/^TacticalSkill(Group)?$/.test(metaType)) return "tactical_skill";
  return null;
}

export async function syncBuildCatalog(patchKey: string) {
  const db = getSupabaseAdmin();
  const [hashes, names] = await Promise.all([fetchGameDataHashes(), getKoreanGameNames()]);
  const tables = Object.keys(hashes).filter((key) => catalogEntityType(key));
  if (!tables.includes("ItemWeapon") || !tables.includes("ItemArmor")) throw new Error("Official item catalog tables are unavailable");
  let saved = 0, unchanged = 0;
  for (const metaType of tables) {
    const hash = String(hashes[metaType]);
    const previous = await db.from("game_catalog_versions").select("source_hash").eq("patch_key", patchKey).eq("meta_type", metaType).maybeSingle();
    if (previous.error) throw previous.error;
    if (previous.data?.source_hash === hash) { unchanged++; continue; }
    const data = await fetchGameData(metaType, "v2");
    if (!Array.isArray(data) || !data.length) throw new Error(`Empty official catalog: ${metaType}`);
    const entity = catalogEntityType(metaType);
    const prefixes = entity === "item" ? ["Item/Name"] : entity === "trait" ? ["Trait/Name"] : ["TacticalSkill/Name", "TacticalSkill/Group/Name", "Skill/Group/Name"];
    const rows = data.flatMap((payload) => {
      const code = Number(payload.code ?? payload.group);
      if (!Number.isSafeInteger(code) || code <= 0) return [];
      const name = prefixes.map((prefix) => names[`${prefix}/${code}`]).find(Boolean) ?? String(payload.name ?? code);
      return [{ patch_key: patchKey, meta_type: metaType, code, name_ko: name, source_hash: hash, payload, collected_at: new Date().toISOString() }];
    });
    if (!rows.length) throw new Error(`No usable codes in official catalog: ${metaType}`);
    for (let from = 0; from < rows.length; from += 250) {
      const result = await db.from("game_data_catalog").upsert(rows.slice(from, from + 250), { onConflict: "patch_key,meta_type,code" });
      if (result.error) throw result.error;
      saved += Math.min(250, rows.length - from);
    }
    const published = await db.from("game_catalog_versions").upsert({ patch_key: patchKey, meta_type: metaType, source_hash: hash, row_count: rows.length, collected_at: new Date().toISOString() }, { onConflict: "patch_key,meta_type" });
    if (published.error) throw published.error;
  }
  return { saved, unchanged, tables, missing: ["Trait", "TacticalSkillGroup"].filter((name) => !tables.includes(name)) };
}

export async function collectRouteDefinitions(routeIds: number[], patchKey: string, limit = 20, deadline = Date.now() + 30_000) {
  const db = getSupabaseAdmin();
  const ids = [...new Set(routeIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
  let saved = 0, unavailable = 0, failed = 0, attempted = 0;
  // Batched cache reads, bounded API requests. Route failures do not erase match data.
  const fresh = new Set<number>();
  for (let from = 0; from < ids.length; from += 200) {
    const cached = await db.from("weapon_route_cache").select("route_id").eq("patch_key", patchKey)
      .in("route_id", ids.slice(from, from + 200)).gte("fetched_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (cached.error) throw cached.error;
    for (const row of cached.data ?? []) fresh.add(Number(row.route_id));
  }
  const pending = ids.filter((id) => !fresh.has(id));
  for (const routeId of pending.slice(0, Math.max(0, limit))) {
    if (Date.now() >= deadline) break;
    attempted++;
    try {
      const routes = await fetchWeaponRoute(routeId);
      const payload = routes.find((row) => Number((row.recommendedWeaponRoute as Record<string, unknown> | undefined)?.id) === routeId);
      if (!payload) {
        const absent = await db.from("weapon_route_cache").upsert({ patch_key: patchKey, route_id: routeId, payload: { unavailable: true }, fetched_at: new Date().toISOString() }, { onConflict: "patch_key,route_id" });
        if (absent.error) throw absent.error;
        unavailable++; continue;
      }
      const result = await db.from("weapon_route_cache").upsert({ patch_key: patchKey, route_id: routeId, payload, fetched_at: new Date().toISOString() }, { onConflict: "patch_key,route_id" });
      if (result.error) throw result.error;
      saved++;
    } catch { failed++; }
  }
  return { saved, unavailable, failed, deferred: pending.length - attempted };
}

export async function getBuildPatchChanges(patchKey: string): Promise<BuildPatchChange[]> {
  const version = patchKey.replace(/\.0$/, "");
  return patchCache.get(version, async () => {
    const bundled = BUNDLED_BUILD_PATCHES.filter((change) => change.patch_version === version);
    if (!isSupabaseConfigured()) return bundled;
    const { data, error } = await getSupabaseAdmin().from("build_patch_changes").select("*, patch_notes(source_url)")
      .eq("patch_version", version).eq("reviewed", true).order("id");
    // Pre-migration installations retain existing character statistics.
    if (error?.code === "42P01" || error?.code === "PGRST205") return bundled;
    if (error) throw error;
    const changes = (data ?? []).map((row) => ({ ...row, source_url: row.patch_notes?.source_url })) as BuildPatchChange[];
    const defaults = bundled.filter((change) => !changes.some((entry) => entry.entity_type === change.entity_type && entry.target_name === change.target_name));
    return [...defaults, ...changes];
  });
}

export async function enrichBuildMeta(meta: Omit<BuildMeta, "patch_changes" | "routes">): Promise<BuildMeta> {
  const names = await getKoreanGameNames();
  const catalogNames = { ...names };
  const db = getSupabaseAdmin();
  const codes = [...new Set(BUILD_GROUPS.flatMap((group) => meta.stats.groups[group].flatMap((stat) => stat.codes)))];
  for (let from = 0; from < codes.length; from += 100) {
    const { data, error } = await db.from("game_data_catalog").select("meta_type,code,name_ko").eq("patch_key", meta.patch_key).in("code", codes.slice(from, from + 100));
    if (error) throw error;
    for (const row of data ?? []) {
      const type = catalogEntityType(String(row.meta_type));
      const prefix = type === "item" ? "Item/Name" : type === "trait" ? "Trait/Name" : "TacticalSkill/Name";
      catalogNames[`${prefix}/${row.code}`] = row.name_ko;
    }
  }
  const stats = labelBuildStats(meta.stats, catalogNames);
  const patches = await getBuildPatchChanges(meta.patch_key);
  const routeIds = stats.groups.routes.map((route) => route.codes[0]);
  const routeResult = routeIds.length ? await db.from("weapon_route_cache").select("route_id,payload,fetched_at").eq("patch_key", meta.patch_key).in("route_id", routeIds) : { data: [], error: null };
  if (routeResult.error) throw routeResult.error;
  const routes = (routeResult.data ?? []).filter((row) => !row.payload?.unavailable).map((row) => {
    const route = row.payload?.recommendedWeaponRoute as Record<string, unknown> | undefined;
    const list = (value: unknown): number[] => {
      try { const parsed = typeof value === "string" ? JSON.parse(value) : value;
        return Array.isArray(parsed) ? parsed.filter((code) => Number.isSafeInteger(code) && code > 0).slice(0, 30) : []; } catch { return []; }
    };
    return { ...row, title: String(route?.title ?? `루트 ${row.route_id}`).slice(0, 120),
      paths: list(route?.paths).map((code) => names[`Area/Name/${code}`] ?? String(code)),
      target_items: list(route?.weaponCodes).map((code) => catalogNames[`Item/Name/${code}`] ?? String(code)) };
  });
  return { ...meta, stats, patch_changes: relevantBuildPatches(stats, patches, catalogNames), routes };
}

export function relevantBuildPatches(stats: BuildStats, changes: BuildPatchChange[], names: Record<string, string>) {
  return changes.filter((change) => {
    if (!change.reviewed) return false;
    const group = change.entity_type === "item" ? "items" : change.entity_type === "trait" ? "traits" : "tactical_skills";
    const prefix = change.entity_type === "item" ? "Item/Name" : change.entity_type === "trait" ? "Trait/Name" : "TacticalSkill/Name";
    return stats.groups[group].some((stat) => stat.codes.some((code) => change.target_code !== null ? change.target_code === code : names[`${prefix}/${code}`] === change.target_name));
  });
}
