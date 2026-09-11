import { NextRequest, NextResponse } from "next/server";
import { assertAdminToken } from "@/lib/auth";
import { getCharacterMeta } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  // Internal statistics require authentication even in an unconfigured environment.
  if (!process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "관리자 토큰이 설정되지 않았습니다." }, { status: 503, headers });
  }
  const unauthorized = assertAdminToken(request);
  if (unauthorized) {
    return NextResponse.json({ error: "관리자 토큰을 확인해주세요." }, { status: 401, headers });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "데이터베이스가 설정되지 않았습니다." }, { status: 503, headers });
  }
  try {
    const meta = await getCharacterMeta();
    return NextResponse.json({ data: { characterWeaponCount: meta.length } }, { headers });
  } catch {
    return NextResponse.json({ error: "통계를 불러오지 못했습니다." }, { status: 500, headers });
  }
}
