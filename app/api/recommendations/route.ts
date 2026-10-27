import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  buildRecommendations,
  PlayerHistoryUnavailableError,
  PlayerNotFoundError,
  InvalidTeammateError
} from "@/lib/recommendations";

const schema = z.object({
  nickname: z.string().trim().max(64).optional(),
  teammateCharacterCodes: z.array(z.number().int().positive()).max(2).refine((values) => new Set(values).size === values.length).optional(),
  teammates: z.array(z.object({ nickname: z.string().trim().max(64).optional(),
    characterCode: z.number().int().positive().optional(), weaponCode: z.number().int().positive().optional()
  }).strict().refine((value) => Boolean(value.nickname || value.characterCode))).max(2).optional(),
  playerDataScope: z.enum(["season", "current_patch"]).optional(),
  limit: z.number().int().min(1).max(10).optional()
}).strict();

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const data = await buildRecommendations(body);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "추천 요청 형식이 올바르지 않습니다.", details: error.flatten() },
        { status: 400 }
      );
    }

    if (error instanceof SyntaxError || error instanceof InvalidTeammateError) return NextResponse.json(
      { error: error instanceof InvalidTeammateError ? error.message : "추천 요청 JSON 형식이 올바르지 않습니다." }, { status: 400 });

    if (error instanceof PlayerNotFoundError) {
      return NextResponse.json(
        {
          error: `‘${error.nickname}’ 플레이어를 찾을 수 없습니다. 닉네임을 다시 확인해 주세요.`,
          code: error.code
        },
        { status: 404 }
      );
    }

    if (error instanceof PlayerHistoryUnavailableError) {
      return NextResponse.json(
        {
          error: `‘${error.nickname}’ 플레이어의 선택한 범위에 랭크 스쿼드 경기 기록이 없습니다.`,
          code: error.code
        },
        { status: 422 }
      );
    }

    console.error("Recommendation request failed", error);
    return NextResponse.json(
      { error: "추천 계산 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
