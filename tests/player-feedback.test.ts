import { describe, expect, it } from "vitest";
import { buildPlayerFeedback } from "@/lib/player-feedback";
import type { PlayerAnalysisMetric, PlayerAnalysisMetricId } from "@/lib/types";

function metric(id: PlayerAnalysisMetricId, score = 50): PlayerAnalysisMetric {
  return {
    id, label: id, value: 50, unit: "per_minute", direction: "higher",
    cohort_mean: 100, same_pick_mean: 100, role_mean: null, reference_mean: 100,
    reference_value: 100, reference_type: "same_pick", delta_percent: -50, delta_absolute: -50,
    relative_score: score, raw_percentile: score, score_reliability: 1, comparison_status: "available",
    comparison_note: null, player_games: 20, sample_games: 90, sample_players: 30, confidence: "high",
    player_scope: { kind: "main_pick", character_code: 1, weapon_code: 1, patch_key: "12.6.0",
      current_patch_games: 20, supplemental_games: 0, unknown_patch_games: 0 },
    recent_trend: null
  };
}

describe("actionable player feedback", () => {
  it("combines low damage and participation with normal growth into one contextual task", () => {
    const damage = metric("damage_per_minute", 20);
    const participation = metric("kill_participation", 25);
    const growth = metric("credits_per_minute", 55);
    growth.value = 100;
    const result = buildPlayerFeedback([damage, participation, growth], [damage, participation]);
    expect(result.improvements).toHaveLength(1);
    expect(result.improvements[0].id).toBe("improvement:combat_participation");
    expect(result.improvements[0].metric_ids).toEqual([damage.id, participation.id, growth.id]);
    expect(result.improvements[0].hypothesis).toContain("성장 지표는");
    expect(result.improvements[0].action).toContain("다음 경기");
    expect(result.improvements[0].review).toContain("같은 패치");
    expect(result.state.status).toBe("ready");
  });

  it("prioritizes a growth gap, avoids overlapping farming tasks, and limits the result to two tasks", () => {
    const metrics = [metric("damage_per_minute", 10), metric("credits_per_minute", 15),
      metric("weapon_level_per_minute", 18), metric("hunts_per_minute", 20),
      metric("monster_damage_per_minute", 22), metric("view_contribution_per_minute", 25),
      metric("cc_per_minute", 30)];
    const result = buildPlayerFeedback(metrics, metrics);
    expect(result.improvements.map((item) => item.id)).toEqual([
      "improvement:growth_before_combat", "improvement:view_contribution_per_minute"
    ]);
    expect(result.improvements[0].metric_ids).toEqual(["damage_per_minute", "credits_per_minute", "hunts_per_minute"]);
    expect(result.improvements.every((item) => item.hypothesis && item.action && item.review)).toBe(true);
  });

  it("does not combine a main-pick combat metric with all-pick growth or a different patch mix", () => {
    const damage = metric("damage_per_minute", 10);
    const growth = metric("credits_per_minute", 15);
    growth.player_scope = { ...growth.player_scope, kind: "all_picks", character_code: null, weapon_code: null };
    const farming = metric("hunts_per_minute", 20);
    farming.player_scope = { ...farming.player_scope, current_patch_games: 15, supplemental_games: 5 };
    const result = buildPlayerFeedback([damage, growth, farming], [damage, growth, farming]);
    expect(result.improvements[0].metric_ids).toEqual([damage.id]);
    expect(result.improvements.every((item) => item.metric_ids.length === 1)).toBe(true);
  });

  it("keeps a separate farming task and never coaches on ending weapon level divided by time", () => {
    const participation = metric("kill_participation", 10);
    const damage = metric("damage_per_minute", 20);
    const weapon = metric("weapon_level_per_minute", 25);
    const farming = metric("hunts_per_minute", 30);
    const credits = metric("credits_per_minute", 50);
    credits.value = 100;
    const result = buildPlayerFeedback([participation, damage, weapon, farming, credits], [participation, damage, weapon, farming]);
    expect(result.improvements.map((item) => item.id)).toEqual([
      "improvement:combat_participation", "improvement:hunts_per_minute"
    ]);
    expect(result.improvements[1].metric_ids).toEqual([farming.id]);
    expect(result.improvements.every((item) => !item.metric_ids.includes(weapon.id))).toBe(true);
  });

  it("distinguishes insufficient samples, a lack of action evidence, and no clear weakness", () => {
    const missing = { ...metric("damage_per_minute"), confidence: "low" as const, relative_score: null };
    expect(buildPlayerFeedback([missing], []).state.status).toBe("insufficient_evidence");
    const low = metric("damage_per_minute", 20);
    const normal = metric("credits_per_minute");
    expect(buildPlayerFeedback([low, normal], []).state.status).toBe("insufficient_action_evidence");
    expect(buildPlayerFeedback([metric("damage_per_minute"), normal], []).state.status).toBe("no_clear_weakness");
    expect(buildPlayerFeedback([metric("damage_per_minute"), normal, missing], []).state.status).toBe("insufficient_evidence");
  });

  it("excludes support and low-confidence values from strengths and coaching", () => {
    const support = metric("support_per_minute", 90);
    const low = { ...metric("damage_per_minute", 10), confidence: "low" as const };
    const result = buildPlayerFeedback([support, low], [support, low]);
    expect(result.strengths).toEqual([]);
    expect(result.improvements).toEqual([]);
  });

  it("requires the observed comparison and percentile to agree before declaring a strength or task", () => {
    const skewedWinRate = { ...metric("win_rate", 80), value: 0.06, reference_value: 0.15 };
    expect(buildPlayerFeedback([skewedWinRate], []).strengths).toEqual([]);
    const aboveMean = { ...metric("damage_per_minute", 20), value: 120 };
    expect(buildPlayerFeedback([aboveMean], [aboveMean]).improvements).toEqual([]);
    const lowerIsBetter = { ...metric("average_rank", 80), direction: "lower" as const, value: 3, reference_value: 4 };
    expect(buildPlayerFeedback([lowerIsBetter], []).strengths).toHaveLength(1);
  });
});
