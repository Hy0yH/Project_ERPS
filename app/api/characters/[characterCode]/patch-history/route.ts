import { NextRequest, NextResponse } from "next/server";
import { getPatchHistory } from "@/lib/data";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ characterCode: string }> }
) {
  const { characterCode } = await context.params;
  const data = await getPatchHistory(Number(characterCode));
  return NextResponse.json({ data });
}
