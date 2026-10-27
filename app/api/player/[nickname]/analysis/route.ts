import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PLAYER_ANALYSIS_ENABLED } from "@/lib/env";
import { AnalysisBusyError, getAnalysisJob } from "@/lib/analysis-jobs";
import { PlayerAnalysisNoMatchesError, PlayerAnalysisNotFoundError, PlayerAnalysisUnavailableError,
  getOrBuildPlayerAnalysis } from "@/lib/player-analysis-service";

const requestSchema = z.object({ forceRefresh: z.boolean().optional(), pick: z.object({
  characterCode: z.number().int().positive(), weaponCode: z.number().int().positive()
}).optional() }).strict();
const headers = { "Cache-Control": "private, no-store" };
function analysisError(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof URIError)
    return { status: 400, error: "분석 요청 형식이 올바르지 않습니다.", code: "INVALID_REQUEST" };
  if (error instanceof PlayerAnalysisNotFoundError) return { status: 404, error: "플레이어를 찾을 수 없습니다.", code: error.code };
  if (error instanceof PlayerAnalysisNoMatchesError) return { status: 422, error: "현재 패치의 선택한 범위에 랭크 스쿼드 경기 기록이 없습니다.", code: error.code };
  if (error instanceof PlayerAnalysisUnavailableError || error instanceof AnalysisBusyError)
    return { status: 503, error: "분석 데이터를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.", code: "PLAYER_ANALYSIS_UNAVAILABLE" };
  console.error("Player analysis request failed", error);
  return { status: 500, error: "플레이어 분석 중 서버 오류가 발생했습니다.", code: "ANALYSIS_FAILED" };
}
export async function POST(request: NextRequest, context: { params: Promise<{ nickname: string }> }) {
  if (!PLAYER_ANALYSIS_ENABLED) return NextResponse.json({ error: "플레이어 분석 기능이 비활성화되어 있습니다.", code: "FEATURE_DISABLED" }, { status: 404, headers });
  try {
    const nickname = z.string().trim().min(1).max(64).parse((await context.params).nickname);
    const body = requestSchema.parse(await request.json());
    if (request.nextUrl.searchParams.get("stream") !== "1") {
      const data = await getOrBuildPlayerAnalysis(nickname, body.forceRefresh ?? false, body.pick);
      return NextResponse.json({ data }, { headers });
    }
    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({ start(controller) {
      const send = (event: unknown) => { if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
      heartbeat = setInterval(() => send({ type: "heartbeat" }), 15_000);
      void getOrBuildPlayerAnalysis(nickname, body.forceRefresh ?? false, body.pick,
        (progress) => send({ type: "progress", ...progress }))
        .then((data) => send({ type: "result", data }))
        .catch((error) => send({ type: "error", ...analysisError(error) }))
        .finally(() => { clearInterval(heartbeat); if (!closed) { closed = true; controller.close(); } });
    }, cancel() { closed = true; clearInterval(heartbeat); } });
    return new Response(stream, { headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" } });
  } catch (error) {
    const result = analysisError(error);
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status, headers });
  }
}
export async function GET(request: NextRequest, context: { params: Promise<{ nickname: string }> }) {
  if (!PLAYER_ANALYSIS_ENABLED) return NextResponse.json({ error: "플레이어 분석 기능이 비활성화되어 있습니다." }, { status: 404, headers });
  const id = request.nextUrl.searchParams.get("jobId");
  if (!id) return NextResponse.json({ error: "작업 ID를 확인해 주세요." }, { status: 400, headers });
  const job = getAnalysisJob(id, (await context.params).nickname.trim());
  return job ? NextResponse.json(job, { headers }) : NextResponse.json({ error: "작업 정보를 찾을 수 없습니다. 다시 조회해 주세요." }, { status: 404, headers });
}
