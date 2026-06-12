import { NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/auth";
import { collectRankerMatches } from "@/lib/ingestion";

export async function POST(request: NextRequest) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) return unauthorized;
  const data = await collectRankerMatches();
  return NextResponse.json({ data });
}
