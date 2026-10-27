import { NextRequest, NextResponse } from "next/server";
import { assertAdminToken } from "@/lib/auth";
import { getOperationsStatus } from "@/lib/operations";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const unauthorized = assertAdminToken(request); if (unauthorized) return unauthorized;
  return NextResponse.json({ data: await getOperationsStatus() }, { headers: { "Cache-Control": "private, no-store" } });
}
