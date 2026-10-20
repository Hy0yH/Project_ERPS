import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlayerAnalysis } from "@/lib/player-analysis";
import type { PlayerAnalysisInsight } from "@/lib/types";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create }; } }));
import { explainPlayerAnalysis } from "@/lib/openai";

function fixture() {
  const result = buildPlayerAnalysis({ nickname: "검증", userNum: 999, playerRows: [], overallRows: [],
    samePickRows: [], seasonId: 41, patchKey: "12.6.0", supplementalGames: 0, expandedBenchmark: false });
  const candidate: PlayerAnalysisInsight = {
    id: "improvement:combat_participation", title: "팀 교전 참여 확인", detail: "피해량이 비교 기준보다 25.0% 낮게 관측됩니다.",
    metric_ids: ["damage_per_minute", "kill_participation"], hypothesis: "참여 기회 점검이 필요합니다.",
    action: "다음 경기에서 참여 가능 여부를 직접 메모해 보세요.", review: "같은 패치와 픽의 최근 기록을 비교합니다."
  };
  result.scope.confidence = "high";
  result.strengths = [{ ...candidate, id: "strength:credits_per_minute", title: "성장 강점", metric_ids: ["credits_per_minute"], hypothesis: null, action: null, review: null }];
  result.improvement_priorities = [candidate, { ...candidate, id: "improvement:view_contribution_per_minute", metric_ids: ["view_contribution_per_minute"] }];
  return result;
}

function respond(value: unknown) { create.mockResolvedValue({ output_text: JSON.stringify(value) }); }

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("OPENAI_API_KEY", "test-key"); });
afterEach(() => vi.unstubAllEnvs());

describe("AI coaching boundary", () => {
  it("preserves canonical facts, task order, and omitted candidates while adding an allowed note", async () => {
    const input = fixture();
    respond({ summary: "주력 픽의 기록을 바탕으로 확인할 행동을 살펴보세요.", strengths: [],
      improvements: [{ candidateId: input.improvement_priorities[0].id,
        metricIds: ["kill_participation", "damage_per_minute"], note: "팀과 함께 공격할 수 있는 상황부터 되짚어 보세요." }] });
    const result = await explainPlayerAnalysis(input);
    expect(result.improvement_priorities).toHaveLength(2);
    expect(result.improvement_priorities[0]).toEqual({ ...input.improvement_priorities[0], coaching_note: "팀과 함께 공격할 수 있는 상황부터 되짚어 보세요." });
    expect(result.improvement_priorities[1]).toEqual(input.improvement_priorities[1]);
    expect(result.strengths).toEqual(input.strengths);
    expect(result.feedback).toEqual(input.feedback);
  });

  it("rejects moving a valid strength into improvements and inventing a candidate", async () => {
    const input = fixture();
    respond({ summary: "잘못된 후보에 대한 요약", strengths: [], improvements: [
      { candidateId: input.strengths[0].id, metricIds: input.strengths[0].metric_ids, note: "이 지표를 점검해 보세요." },
      { candidateId: "improvement:new", metricIds: ["average_rank"], note: "순위를 점검해 보세요." }
    ] });
    expect(await explainPlayerAnalysis(input)).toEqual(input);
  });

  it.each([
    ["damage_per_minute"],
    ["damage_per_minute", "kill_participation", "support_per_minute"],
    ["damage_per_minute", "damage_per_minute"]
  ])("rejects incomplete, mixed, or duplicate evidence IDs: %j", async (...metricIds) => {
    const input = fixture();
    respond({ summary: "변경된 요약", strengths: [], improvements: [
      { candidateId: input.improvement_priorities[0].id, metricIds, note: "팀 교전을 되짚어 보세요." }
    ] });
    expect(await explainPlayerAnalysis(input)).toEqual(input);
  });

  it("rejects invented numbers and rank guarantees in supplemental prose", async () => {
    const input = fixture();
    respond({ summary: "승률이 90%입니다.", strengths: [], improvements: [
      { candidateId: input.improvement_priorities[0].id, metricIds: input.improvement_priorities[0].metric_ids, note: "랭크 상승을 보장합니다." }
    ] });
    expect(await explainPlayerAnalysis(input)).toEqual(input);
  });

  it("falls back on invalid JSON or an attempted overwrite of a canonical task", async () => {
    const input = fixture();
    create.mockResolvedValueOnce({ output_text: "invalid-json" });
    expect(await explainPlayerAnalysis(input)).toEqual(input);
    respond({ summary: "요약", strengths: [], improvements: [{ candidateId: input.improvement_priorities[0].id,
      metricIds: input.improvement_priorities[0].metric_ids, note: "기록을 확인하세요.", action: "교전을 무조건 늘리세요." }] });
    expect(await explainPlayerAnalysis(input)).toEqual(input);
  });

  it("uses the deterministic result without an API key, without candidates, or on timeout", async () => {
    const input = fixture();
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await explainPlayerAnalysis(input)).toBe(input);
    expect(create).not.toHaveBeenCalled();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    expect(await explainPlayerAnalysis({ ...input, strengths: [], improvement_priorities: [] })).toMatchObject({ strengths: [], improvement_priorities: [] });
    expect(create).not.toHaveBeenCalled();
    create.mockRejectedValueOnce(new Error("timeout"));
    expect(await explainPlayerAnalysis(input)).toBe(input);
  });
});
