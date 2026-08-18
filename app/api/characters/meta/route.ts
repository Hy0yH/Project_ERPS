import { NextRequest, NextResponse } from "next/server";
import { getCharacterMeta } from "@/lib/data";
import { parseRankScope } from "@/lib/rank-scopes";

export async function GET(request: NextRequest) {
  const periodDays = Number(request.nextUrl.searchParams.get("periodDays") ?? 14);
  const rankScope = parseRankScope(request.nextUrl.searchParams.get("rankScope"));
  const data = await getCharacterMeta(periodDays, rankScope);
  return NextResponse.json({ data });
}
