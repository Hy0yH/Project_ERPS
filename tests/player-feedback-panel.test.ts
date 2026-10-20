import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlayerFeedbackPanels } from "@/components/PlayerAnalysisPanel";
import { playerFeedbackFixture } from "./fixtures/player-feedback";

describe("player feedback presentation", () => {
  it("shows evidence, scope, hypothesis, action and a comparable recent trend", () => {
    const analysis = playerFeedbackFixture();
    const html = renderToStaticMarkup(createElement(PlayerFeedbackPanels, { analysis }));
    for (const label of ["최근 전적 기반 점검 제안", "수행 여부는 추적하지 않습니다", "제안의 효과를 평가하지 않습니다",
      "관측 근거", "점검 가설", "확인해 볼 행동", "기록 비교 안내", "재키 · 단검",
      "주력 픽 20판 기준", "12.6.0 20판", "90경기·30명", "이전 10판", "최근 10판"]) {
      expect(html).toContain(label);
    }
    expect(analysis.improvement_priorities.length).toBeGreaterThan(0);
    expect(html).not.toContain("랭크 상승을 위한 우선 점검");
    expect(html).not.toContain("다음 5경기");
    expect(html).not.toContain("이전 패치 10판");
  });

  it("renders the analysis reason when no task is available instead of advising unchanged play", () => {
    const analysis = playerFeedbackFixture();
    analysis.improvement_priorities = [];
    analysis.feedback = { ...analysis.feedback, status: "insufficient_evidence", message: "현재 패치의 개인 경기 또는 비교 표본이 부족해 점검 제안을 보류합니다." };
    const html = renderToStaticMarkup(createElement(PlayerFeedbackPanels, { analysis }));
    expect(html).toContain(analysis.feedback.message);
    expect(html).not.toContain("현재 플레이의 일관성을 먼저 유지해도 좋습니다");
    expect(html).not.toContain("확인해 볼 행동</dt>");
  });
});
