import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PLAYER_ANALYSIS_ENABLED } from "@/lib/env";
import {
  PlayerAnalysisNoMatchesError,
  PlayerAnalysisNotFoundError,
  PlayerAnalysisUnavailableError,
  getOrBuildPlayerAnalysis
} from "@/lib/player-analysis-service";

const requestSchema = z.object({
  forceRefresh: z.boolean().optional()
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ nickname: string }> }
) {
  if (!PLAYER_ANALYSIS_ENABLED) {
    return NextResponse.json(
      { error: "플레이어 분석 기능이 아직 활성화되지 않았습니다.", code: "FEATURE_DISABLED" },
      { status: 404 }
    );
  }

  try {
    const { nickname } = await context.params;
    const decoded = decodeURIComponent(nickname).trim();
    if (!decoded) throw new PlayerAnalysisNotFoundError(decoded);
    const body = requestSchema.parse(await request.json());
    const data = await getOrBuildPlayerAnalysis(decoded, body.forceRefresh ?? false);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "분석 요청 형식이 올바르지 않습니다.", details: error.flatten() },
        { status: 400 }
      );
    }
    if (error instanceof PlayerAnalysisNotFoundError) {
      return NextResponse.json(
        { error: `‘${error.nickname}’ 플레이어를 찾을 수 없습니다.`, code: error.code },
        { status: 404 }
      );
    }
    if (error instanceof PlayerAnalysisNoMatchesError) {
      return NextResponse.json(
        { error: "현재 패치의 랭크 스쿼드 경기 기록이 없습니다.", code: error.code },
        { status: 422 }
      );
    }
    if (error instanceof PlayerAnalysisUnavailableError) {
      console.error(`Player analysis unavailable: ${error.message}`);
      return NextResponse.json(
        { error: "플레이어 분석 데이터를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.", code: error.code },
        { status: 503 }
      );
    }
    console.error("Player analysis request failed", error);
    return NextResponse.json(
      { error: "플레이어 분석 중 서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
