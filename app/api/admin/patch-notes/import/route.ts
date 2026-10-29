import { NextRequest, NextResponse } from "next/server";
import { assertAdminToken } from "@/lib/auth";
import { fetchPatchNoteText, parsePatchNote } from "@/lib/patch-notes";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { catalogEntityType } from "@/lib/build-data";
import { invalidateMetaReads } from "@/lib/data";

export async function POST(request: NextRequest) {
  const unauthorized = assertAdminToken(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
  }

  const { url } = (await request.json()) as { url?: string };
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  const rawText = await fetchPatchNoteText(url);
  const parsed = parsePatchNote(rawText, url);
  const supabase = getSupabaseAdmin();

  const { error: noteError } = await supabase.from("patch_notes").upsert(
    {
      patch_version: parsed.patchVersion,
      published_at: parsed.publishedAt,
      source_url: url,
      raw_text: parsed.rawText
    },
    { onConflict: "patch_version" }
  );
  if (noteError) throw noteError;

  const changes = parsed.changes.map((change) => ({ ...change, reviewed: false }));
  if (changes.length) {
    const { error: changesError } = await supabase.from("character_patch_changes").insert(changes);
    if (changesError) throw changesError;
  }

  const catalog: Array<{ meta_type: string; code: number; name_ko: string }> = [];
  for (let from = 0; parsed.buildChanges.length; from += 1000) {
    const { data, error } = await supabase.from("game_data_catalog").select("meta_type,code,name_ko")
      .eq("patch_key", /^\d+\.\d+$/.test(parsed.patchVersion) ? `${parsed.patchVersion}.0` : parsed.patchVersion).range(from, from + 999);
    if (error) throw error;
    catalog.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const buildChanges = parsed.buildChanges.map((change) => {
    const codes = [...new Set(catalog.filter((entry) => catalogEntityType(entry.meta_type) === change.entity_type && entry.name_ko === change.target_name).map((entry) => entry.code))];
    return { ...change, target_code: codes.length === 1 ? codes[0] : null };
  });
  // Do not reset a human review when the same URL is imported again.
  if (buildChanges.length) {
    const result = await supabase.from("build_patch_changes").upsert(buildChanges, {
      onConflict: "patch_version,entity_type,target_name,change_hash", ignoreDuplicates: true
    });
    if (result.error) throw result.error;
  }
  const review = await supabase.from("build_patch_changes").select("*").eq("patch_version", parsed.patchVersion).order("id");
  if (review.error) throw review.error;
  invalidateMetaReads();

  return NextResponse.json({
    data: {
      patchVersion: parsed.patchVersion,
      importedChanges: changes.length,
      importedBuildChanges: buildChanges.length,
      buildChanges: review.data ?? []
    }
  });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = assertAdminToken(request);
  if (unauthorized) return unauthorized;
  const body = await request.json().catch(() => null) as { id?: unknown; reviewed?: unknown; targetCode?: unknown } | null;
  if (!body || !Number.isSafeInteger(body.id) || Number(body.id) <= 0 || typeof body.reviewed !== "boolean" ||
      (body.targetCode !== undefined && (!Number.isSafeInteger(body.targetCode) || Number(body.targetCode) <= 0))) {
    return NextResponse.json({ error: "유효한 변경 ID, 코드와 검수 상태가 필요합니다." }, { status: 400 });
  }
  const db = getSupabaseAdmin();
  const current = await db.from("build_patch_changes").select("*").eq("id", Number(body.id)).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) return NextResponse.json({ error: "변경을 찾을 수 없습니다." }, { status: 404 });
  const targetCode = Number(body.targetCode ?? current.data.target_code);
  if (body.reviewed) {
    const version = String(current.data.patch_version);
    const catalog = await db.from("game_data_catalog").select("meta_type,name_ko").eq("patch_key", /^\d+\.\d+$/.test(version) ? `${version}.0` : version).eq("code", targetCode);
    if (catalog.error) throw catalog.error;
    if (!catalog.data?.some((row) => catalogEntityType(row.meta_type) === current.data.entity_type)) {
      return NextResponse.json({ error: "해당 패치의 공식 카탈로그에서 대상 코드를 확인해야 합니다." }, { status: 400 });
    }
  }
  const result = await db.from("build_patch_changes").update({ reviewed: body.reviewed, ...(targetCode > 0 ? { target_code: targetCode } : {}) })
    .eq("id", Number(body.id)).select("*").single();
  if (result.error) throw result.error;
  invalidateMetaReads();
  return NextResponse.json({ data: result.data });
}
