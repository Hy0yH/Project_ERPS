import { NextRequest, NextResponse } from "next/server";
import { getCharacterMeta } from "@/lib/data";

export async function GET(request: NextRequest) {
  const periodDays = Number(request.nextUrl.searchParams.get("periodDays") ?? 14);
  const data = await getCharacterMeta(periodDays);
  return NextResponse.json({ data });
}
