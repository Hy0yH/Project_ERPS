import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BuildMetaPanel } from "@/components/BuildMetaPanel";
import { buildUsageStats, labelBuildStats } from "@/lib/build-stats";

describe("build statistics presentation", () => {
  it("shows observed denominators, rates and selection limits with separate route/causal caveats", () => {
    const stats = labelBuildStats(buildUsageStats([
      { gameRank: 1, equipment: { 0: 101 }, traitFirstCore: 7001, routeIdOfStart: 123 },
      { gameRank: 4, equipment: { 0: 102 } },
      { gameRank: 8 }
    ]), { "Item/Name/101": "시험 무기", "Trait/Name/7001": "시험 특성" });
    const html = renderToStaticMarkup(createElement(BuildMetaPanel, { meta: {
      character_code: 1, weapon_code: 15, patch_key: "12.7.0", rank_scope: "all", period_start: "2026-10-29T02:00:00Z", period_end: "2026-10-29T03:00:00Z",
      stats, patch_changes: [], routes: [{ route_id: 123, fetched_at: "2026-10-29T04:00:00Z", payload: {}, title: "공유 루트", paths: ["숲", "병원"], target_items: ["시험 무기"] }]
    } }));
    expect(html).toContain("시험 무기"); expect(html).toContain("시험 특성"); expect(html).toContain("50.0%");
    expect(html).toContain("확인 2 / 3판"); expect(html).toContain("생존 시간과 성장 정도");
    expect(html).toContain("실제 이동 기록이나 경기 당시의 구성을 보장하지 않습니다");
    expect(html).toContain("숲 → 병원"); expect(html).toContain('role="region"');
  });
  it("keeps unavailable detail statistics distinct from zero usage", () => {
    const html = renderToStaticMarkup(createElement(BuildMetaPanel, { meta: null }));
    expect(html).toContain("상세 통계가 아직 없습니다"); expect(html).not.toContain("0.0%");
  });
});
