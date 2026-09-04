import { NextRequest, NextResponse } from "next/server";
import { getPatchHistory } from "@/lib/data";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ characterCode: string }> }
) {
  const { characterCode } = await context.params;
  const requestedWeaponCode = Number(request.nextUrl.searchParams.get("weapon"));
  const data = await getPatchHistory(
    Number(characterCode),
    Number.isFinite(requestedWeaponCode) && requestedWeaponCode > 0
      ? requestedWeaponCode
      : undefined
  );
  return NextResponse.json({ data });
}
