import { NextRequest, NextResponse } from "next/server";
import { getTeamComps } from "@/lib/data";

export async function GET(request: NextRequest) {
  const characters = request.nextUrl.searchParams
    .get("characters")
    ?.split(",")
    .map(Number)
    .filter(Boolean) ?? [];
  const periodDays = Number(request.nextUrl.searchParams.get("periodDays") ?? 14);
  const data = await getTeamComps(characters, periodDays);
  return NextResponse.json({ data });
}
