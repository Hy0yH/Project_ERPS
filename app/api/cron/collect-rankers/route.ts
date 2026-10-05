import { NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/auth";
import { collectRankerMatches, CollectionBusyError } from "@/lib/ingestion";

export async function POST(request: NextRequest) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) return unauthorized;
  try {
    const data = await collectRankerMatches();
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof CollectionBusyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
