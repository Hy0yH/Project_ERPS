import { NextRequest, NextResponse } from "next/server";

export function assertAdminToken(request: NextRequest) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return null;
  const headerToken = request.headers.get("x-admin-token");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (headerToken === expected || bearer === expected) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function assertCronSecret(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return null;
  const headerSecret = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (headerSecret === expected || bearer === expected) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
