import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlayerStatisticsPanel } from "@/components/PlayerStatisticsPanel";
import { playerFeedbackFixture } from "./fixtures/player-feedback";

describe("inspectable actual player statistics", () => {
  it("distinguishes all-match averages from pick-specific comparisons and exposes the match list", () => {
    const analysis = playerFeedbackFixture();
    const html = renderToStaticMarkup(createElement(PlayerStatisticsPanel, { analysis }));
    expect(html).toContain("전체 20경기의 실제 지표");
    expect(html).toContain("주력 픽 표본과 다를 수 있습니다");
    expect(html).toContain("분석에 사용한 경기 20판 확인");
    expect(html).toContain("1000");
    expect(html).toContain("미수집");
    expect(html).toContain("유효 0/20판");
  });
});
