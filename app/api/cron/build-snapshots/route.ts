import { NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/auth";
import { buildSnapshots } from "@/lib/ingestion";
import { SnapshotBusyError } from "@/lib/snapshot-build";

export async function POST(request: NextRequest) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) return unauthorized;
  const periodDays = Number(request.nextUrl.searchParams.get("periodDays") ?? 14);
  if (![7, 14, 30].includes(periodDays)) return NextResponse.json({ error: "집계 기간을 확인해 주세요." }, { status: 400 });
  try { const data = await buildSnapshots(periodDays); return NextResponse.json({ data }); }
  catch (error) { if (error instanceof SnapshotBusyError) return NextResponse.json({ error: error.message }, { status: 409 }); throw error; }
}
