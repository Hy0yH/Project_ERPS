import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerPickRatings } from "@/components/PlayerPickRatings";
import { buildPlayerAnalysis } from "@/lib/player-analysis";
import { playerFeedbackFixture } from "./fixtures/player-feedback";

describe("personal character rating cards", () => {
  it("shows the exact grade scale, score basis, and per-pick evidence", () => {
    const analysis = playerFeedbackFixture();
    const html = renderToStaticMarkup(createElement(PlayerPickRatings, { analysis }));
    expect(html).toContain("사용 실험체 성적 등급");
    expect(html).toContain("평균 순위 50%");
    expect(html).toContain("TOP3 비율 35%");
    expect(html).toContain("승률 15%");
    expect(html).toContain("F+");
    expect(html).not.toContain(">S+<");
    expect(html).toContain("평가 근거 확인");
    expect(html).toContain(analysis.pick_profile.picks[0].evaluation.grade);
  });

  it("features three graded picks and keeps every remaining pick in a closed disclosure", () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ game_id: index + 1, character_code: index + 1,
      best_weapon: 1, game_rank: 1, version_season: 12, version_major: 6, version_minor: 0 }));
    const analysis = buildPlayerAnalysis({ nickname: "전체실험체", userNum: 1, playerRows: rows,
      overallRows: [], samePickRows: [], seasonId: 41, patchKey: "12.6.0", supplementalGames: 0, expandedBenchmark: false });
    const html = renderToStaticMarkup(createElement(PlayerPickRatings, { analysis }));
    expect((html.match(/class="pick-rating-card"/g) ?? [])).toHaveLength(3);
    expect((html.match(/class="pick-rating-compact-row"/g) ?? [])).toHaveLength(5);
    expect(html).toContain('<details class="pick-rating-more">');
    expect(html).not.toContain('<details class="pick-rating-more" open');
    expect(html).toContain("다른 실험체 펼쳐보기");
    expect(html).toContain("실험체 8");
    expect(html).toContain("등급 확정까지 19판 더 필요");
    expect(html).not.toContain("평가 보류");
    expect(analysis.pick_profile.picks.every((pick) => pick.evaluation.grade !== null)).toBe(true);
  });

  it("features the three most-used picks even when the incoming list is unordered", () => {
    const rows = [2, 5, 1, 3].flatMap((count, index) => Array.from({ length: count }, (_, gameIndex) => ({
      game_id: index * 10 + gameIndex, character_code: index + 1, best_weapon: 1, game_rank: 3,
      version_season: 12, version_major: 6, version_minor: 0
    })));
    const analysis = buildPlayerAnalysis({ nickname: "모스트순서", userNum: 1, playerRows: rows, overallRows: [],
      samePickRows: [], seasonId: 41, patchKey: "12.6.0", supplementalGames: 0, expandedBenchmark: false });
    analysis.pick_profile.picks.reverse();
    const html = renderToStaticMarkup(createElement(PlayerPickRatings, { analysis }));
    const titles = [...html.matchAll(/<h3>(.*?)<\/h3>/g)].map((match) => match[1]);
    expect(titles).toEqual(["실험체 2 · 무기 1", "실험체 4 · 무기 1", "실험체 1 · 무기 1"]);
    expect(html).toContain("모스트 3");
  });

  it("omits the extra disclosure when there are no more than three picks", () => {
    const html = renderToStaticMarkup(createElement(PlayerPickRatings, { analysis: playerFeedbackFixture() }));
    expect(html).not.toContain("다른 실험체 펼쳐보기");
  });

  it("shows the current grade and remaining games without a provisional label", () => {
    const analysis = playerFeedbackFixture();
    const pick = analysis.pick_profile.picks[0];
    pick.games = 13;
    pick.evaluation = { ...pick.evaluation, grade: "B+", score: 61.9, status: "provisional",
      reason: "등급 확정까지 7판 더 필요" };
    const html = renderToStaticMarkup(createElement(PlayerPickRatings, { analysis }));
    expect(html).toContain("성적 등급 · 61.9점");
    expect(html).toContain("등급 확정까지 7판 더 필요");
    expect(html).not.toContain("임시");
  });
});
