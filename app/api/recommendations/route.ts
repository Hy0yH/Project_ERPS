import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  buildRecommendations,
  PlayerHistoryUnavailableError,
  PlayerNotFoundError
} from "@/lib/recommendations";

const schema = z.object({
  nickname: z.string().trim().optional(),
  teammateCharacterCodes: z.array(z.number()).max(2).optional(),
  playerDataScope: z.enum(["season", "current_patch"]).optional(),
  limit: z.number().min(1).max(10).optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const data = await buildRecommendations(body);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "추천 요청 형식이 올바르지 않습니다.", details: error.flatten() },
        { status: 400 }
      );
    }

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
          error: `‘${error.nickname}’ 플레이어의 이번 시즌 랭크 스쿼드 경기 기록이 없습니다.`,
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
