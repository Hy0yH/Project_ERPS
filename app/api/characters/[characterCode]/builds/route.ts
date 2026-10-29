import { NextRequest, NextResponse } from "next/server";
import { getCharacterBuildMeta } from "@/lib/data";
import { parseRankScope } from "@/lib/rank-scopes";

export async function GET(request: NextRequest, { params }: { params: Promise<{ characterCode: string }> }) {
  const { characterCode: raw } = await params;
  const characterCode = Number(raw), weaponCode = Number(request.nextUrl.searchParams.get("weapon"));
  if (!Number.isSafeInteger(characterCode) || characterCode <= 0 || !Number.isSafeInteger(weaponCode) || weaponCode <= 0) {
    return NextResponse.json({ error: "실험체와 무기 코드를 지정해 주세요." }, { status: 400 });
  }
  try {
    const data = await getCharacterBuildMeta(characterCode, weaponCode, parseRankScope(request.nextUrl.searchParams.get("rankScope")));
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "상세 메타 통계를 불러오지 못했습니다." }, { status: 503 });
  }
}
