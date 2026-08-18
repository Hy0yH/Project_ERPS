import { NextRequest, NextResponse } from "next/server";
import { fetchUserByNickname, getUserId, getUserNum } from "@/lib/eternal-return";
import { getPlayerSummary } from "@/lib/data";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ nickname: string }> }
) {
  const { nickname } = await context.params;
  const decoded = decodeURIComponent(nickname);
  const stored = await getPlayerSummary(decoded);
  if (stored) return NextResponse.json({ data: stored });

  if (!process.env.ETERNAL_RETURN_API_KEY) {
    return NextResponse.json(
      { error: "No stored player summary and ETERNAL_RETURN_API_KEY is not configured." },
      { status: 404 }
    );
  }

  const user = await fetchUserByNickname(decoded);
  const userNum = getUserNum(user);
  const userId = getUserId(user);
  return NextResponse.json({
    data: {
      user_num: userNum ?? 0,
      external_user_id: userId,
      nickname: decoded,
      total_games: 0,
      favorite_characters: []
    }
  });
}
