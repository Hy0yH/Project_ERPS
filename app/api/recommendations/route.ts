import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildRecommendations } from "@/lib/recommendations";

const schema = z.object({
  nickname: z.string().trim().optional(),
  preferredCharacterCodes: z.array(z.number()).optional(),
  teammateCharacterCodes: z.array(z.number()).max(2).optional(),
  limit: z.number().min(1).max(10).optional()
});

export async function POST(request: NextRequest) {
  const body = schema.parse(await request.json());
  const data = await buildRecommendations(body);
  return NextResponse.json({ data });
}
