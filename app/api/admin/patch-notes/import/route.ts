import { NextRequest, NextResponse } from "next/server";
import { assertAdminToken } from "@/lib/auth";
import { fetchPatchNoteText, parsePatchNote } from "@/lib/patch-notes";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

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

  return NextResponse.json({
    data: {
      patchVersion: parsed.patchVersion,
      importedChanges: changes.length
    }
  });
}
