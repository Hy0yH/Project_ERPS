import { NextRequest, NextResponse } from "next/server";
import { assertAdminToken } from "@/lib/auth";
import { getOperationsStatus, invalidateOperationsStatus } from "@/lib/operations";
import { getSupabaseAdmin } from "@/lib/supabase";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const unauthorized = assertAdminToken(request); if (unauthorized) return unauthorized;
  return NextResponse.json({ data: await getOperationsStatus() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const unauthorized = assertAdminToken(request); if (unauthorized) return unauthorized;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "경기 ID를 확인해 주세요." }, { status: 400 }); }
  const ids = body && typeof body === "object" && "gameIds" in body ? body.gameIds : null;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 ||
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "1~100개의 중복 없는 경기 ID를 입력해 주세요." }, { status: 400 });
  }
  const { data, error } = await getSupabaseAdmin().rpc("retry_ingestion_matches", { p_game_ids: ids });
  if (error) return NextResponse.json({ error: "재시도 등록에 실패했습니다." }, { status: 503 });
  invalidateOperationsStatus();
  return NextResponse.json({ data: { requeuedMatches: Number(data) } }, { headers: { "Cache-Control": "private, no-store" } });
}
