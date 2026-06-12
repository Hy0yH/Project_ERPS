import { NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/auth";
import { buildSnapshots } from "@/lib/ingestion";

export async function POST(request: NextRequest) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) return unauthorized;
  const periodDays = Number(request.nextUrl.searchParams.get("periodDays") ?? 14);
  const data = await buildSnapshots(periodDays);
  return NextResponse.json({ data });
}
