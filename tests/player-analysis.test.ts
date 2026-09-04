import { describe, expect, it } from "vitest";
import {
  buildBenchmarkStats,
  buildPlayerAnalysis,
  confidenceFromAnalysisGames,
  mmrBucketStart,
  normalizeAnalysisRow,
  perMinute,
  percentileScore,
  samplingDistributionScore,
  scoreReliability
} from "@/lib/player-analysis";

describe("player playstyle analysis", () => {
  it("normalizes rates by play time and safely handles zero seconds", () => {
    expect(perMinute(600, 120)).toBe(300);
    expect(perMinute(600, 0)).toBe(0);
    expect(perMinute(Number.NaN, 120)).toBe(0);
  });

  it("uses the official view contribution score instead of camera and console action counts", () => {
    const normalized = normalizeAnalysisRow(game({
      play_time: 1200,
      equipment: { __analysis: { viewContribution: 40 } },
      add_surveillance_camera: 100,
      use_security_console: 100
    }));
    expect(normalized.metrics.view_contribution_per_minute).toBe(2);
  });

  it("excludes legacy rows only from the official view score benchmark", () => {
    const benchmark = buildBenchmarkStats([
      ...Array.from({ length: 3 }, (_, index) => game({
        game_id: index + 1,
        user_num: 1,
        equipment: {}
      })),
      ...Array.from({ length: 3 }, (_, index) => game({
        game_id: index + 4,
        user_num: 2,
        equipment: { __analysis: { viewContribution: 40 } }
      }))
    ]);
    expect(benchmark.metrics.damage_per_minute.sampleGames).toBe(6);
    expect(benchmark.metrics.view_contribution_per_minute.sampleGames).toBe(3);
    expect(benchmark.metrics.view_contribution_per_minute.mean).toBe(2);
  });

  it("uses the documented confidence thresholds and 500 MMR buckets", () => {
    expect(confidenceFromAnalysisGames(9)).toBe("low");
    expect(confidenceFromAnalysisGames(10)).toBe("medium");
    expect(confidenceFromAnalysisGames(20)).toBe("high");
    expect(mmrBucketStart(7821)).toBe(7500);
  });

  it("builds cohort statistics from player-level aggregates", () => {
    const rows = [
      game({ user_num: 1, damage_to_player: 1000 }),
      game({ user_num: 1, damage_to_player: 3000 }),
      game({ user_num: 1, damage_to_player: 2000 }),
      game({ user_num: 2, damage_to_player: 5000 }),
      game({ user_num: 2, damage_to_player: 5000 }),
      game({ user_num: 2, damage_to_player: 5000 })
    ];
    const benchmark = buildBenchmarkStats(rows);
    expect(benchmark.sampleGames).toBe(6);
    expect(benchmark.samplePlayers).toBe(2);
    expect(benchmark.metrics.damage_per_minute.mean).toBeCloseTo(175, 5);
  });

  it("excludes one-off combat peers from percentile benchmarks", () => {
    const benchmark = buildBenchmarkStats([
      game({ game_id: 1, user_num: 1, damage_to_player: 1000 }),
      game({ game_id: 2, user_num: 2, damage_to_player: 5000 }),
      game({ game_id: 3, user_num: 2, damage_to_player: 5000 }),
      game({ game_id: 4, user_num: 2, damage_to_player: 5000 })
    ]);
    expect(benchmark.samplePlayers).toBe(2);
    expect(benchmark.metrics.damage_per_minute.samplePlayers).toBe(1);
    expect(benchmark.metrics.damage_per_minute.sampleGames).toBe(3);
    expect(benchmark.metrics.top3_rate.samplePlayers).toBe(2);
  });

  it("uses robust percentiles and shrinks small samples toward the neutral score", () => {
    expect(percentileScore(20, [1, 2, 3, 20, 1000], "higher")).toBe(70);
    expect(percentileScore(2, [1, 2, 3, 20, 1000], "lower")).toBe(70);
    expect(scoreReliability(5, 15, true)).toBeCloseTo(Math.sqrt(0.125), 5);
    expect(scoreReliability(20, 50, false)).toBe(1);
  });

  it("compares result rates against the sampling distribution for the player's game count", () => {
    expect(samplingDistributionScore(0.5, { mean: 0.5, stddev: 0.5 }, 30, "higher")).toBe(50);
    expect(samplingDistributionScore(0.65, { mean: 0.5, stddev: 0.5 }, 30, "higher")).toBeGreaterThan(90);
    expect(samplingDistributionScore(3.5, { mean: 4.5, stddev: 2 }, 20, "lower")).toBeGreaterThan(95);
  });

  it("prefers same-pick evidence, reverses lower-is-better metrics, and suggests evidence-backed priorities", () => {
    const playerRows = Array.from({ length: 20 }, (_, index) => game({
      user_num: 999,
      game_id: 1000 + index,
      damage_to_player: 400,
      monster_kill: 2,
      game_rank: index % 2 ? 8 : 7,
      mmr_gain: -12
    }));
    const peers = Array.from({ length: 90 }, (_, index) => game({
      user_num: Math.floor(index / 3) + 1,
      game_id: index + 1,
      damage_to_player: index < 45 ? 5000 : 1500,
      monster_kill: index < 45 ? 18 : 8,
      game_rank: index < 45 ? 2 : 6,
      mmr_gain: index < 45 ? 20 : -8
    }));

    const analysis = buildPlayerAnalysis({
      nickname: "테스터",
      userNum: 999,
      playerRows,
      overallRows: peers,
      samePickRows: peers,
      characterNames: new Map([[1, "재키"]]),
      rank: { mmr: 7800, rank: 120 },
      seasonId: 41,
      patchKey: "12.1.0",
      supplementalGames: 0,
      expandedBenchmark: false,
      generatedAt: "2026-08-18T00:00:00.000Z"
    });

    const averageRank = analysis.dimensions
      .flatMap((dimension) => dimension.metrics)
      .find((metric) => metric.id === "average_rank");
    expect(analysis.scope.confidence).toBe("high");
    expect(analysis.pick_profile.picks[0]?.character_name).toBe("재키");
    expect(averageRank?.same_pick_mean).not.toBeNull();
    expect(Number(averageRank?.relative_score)).toBeLessThan(50);
    expect(analysis.improvement_priorities.some((item) =>
      item.metric_ids.includes("damage_per_minute")
    )).toBe(true);
    const supportMetric = analysis.dimensions
      .flatMap((dimension) => dimension.metrics)
      .find((metric) => metric.id === "support_per_minute");
    const supportDimension = analysis.dimensions.find((dimension) => dimension.key === "team");
    expect(supportMetric?.comparison_status).toBe("available");
    expect(supportMetric?.relative_score).not.toBeNull();
    expect(supportDimension?.score).toBeNull();
    expect(analysis.strengths.every((item) => !item.metric_ids.includes("support_per_minute"))).toBe(true);
    expect(analysis.improvement_priorities.every((item) =>
      !item.metric_ids.includes("support_per_minute")
    )).toBe(true);
    expect(analysis.dimensions.map((dimension) => dimension.key)).toEqual([
      "combat", "growth", "farming", "team", "vision", "stability"
    ]);
  });

  it("does not let many games from too few players qualify as a comparison cohort", () => {
    const playerRows = Array.from({ length: 20 }, (_, index) => game({ user_num: 999, game_id: 2000 + index }));
    const concentratedPeers = Array.from({ length: 100 }, (_, index) => game({
      user_num: Math.floor(index / 20) + 1,
      game_id: index + 1
    }));
    const analysis = buildPlayerAnalysis({
      nickname: "플레이어수부족",
      userNum: 999,
      playerRows,
      overallRows: concentratedPeers,
      samePickRows: [],
      seasonId: 41,
      patchKey: "12.1.0",
      supplementalGames: 0,
      expandedBenchmark: false
    });
    expect(analysis.dimensions.every((dimension) => dimension.score === null)).toBe(true);
    expect(analysis.benchmark_coverage.overall_players).toBe(5);
  });

  it("excludes role-sensitive support without a same-pick cohort but keeps outcome metrics with sparse peer histories", () => {
    const playerRows = Array.from({ length: 20 }, (_, index) => game({
      user_num: 999,
      game_id: 2000 + index,
      game_rank: index % 8 + 1
    }));
    const peers = Array.from({ length: 60 }, (_, index) => game({
      user_num: index + 1,
      game_id: index + 1,
      team_recover: 5000
    }));
    const analysis = buildPlayerAnalysis({
      nickname: "역할보정",
      userNum: 999,
      playerRows,
      overallRows: peers,
      samePickRows: [],
      seasonId: 41,
      patchKey: "12.1.0",
      supplementalGames: 0,
      expandedBenchmark: false
    });
    const metric = (id: string) => analysis.dimensions
      .flatMap((dimension) => dimension.metrics)
      .find((item) => item.id === id);
    expect(metric("support_per_minute")?.comparison_status).toBe("same_pick_required");
    expect(metric("support_per_minute")?.relative_score).toBeNull();
    expect(metric("top3_rate")?.comparison_status).toBe("available");
    expect(metric("win_rate")?.comparison_status).toBe("available");
    expect(metric("rank_stability")?.comparison_status).toBe("insufficient_peer_history");
    expect(metric("rank_stability")?.delta_percent).toBeNull();
    const stability = analysis.dimensions.find((dimension) => dimension.key === "stability");
    expect(stability?.available_metrics).toBe(4);
    expect(stability?.score).not.toBeNull();
  });

  it("does not expose benchmark comparisons below minimum sample sizes", () => {
    const rows = Array.from({ length: 8 }, (_, index) => game({ user_num: index + 1 }));
    const analysis = buildPlayerAnalysis({
      nickname: "표본부족",
      userNum: 99,
      playerRows: rows,
      overallRows: rows,
      samePickRows: rows,
      seasonId: 41,
      patchKey: "12.1.0",
      supplementalGames: 0,
      expandedBenchmark: false
    });
    expect(analysis.dimensions.every((dimension) => dimension.score === null)).toBe(true);
    expect(analysis.caveats.some((caveat) => caveat.includes("50경기·30명"))).toBe(true);
  });

  it("falls back from the same pick to the same combat role only for combat metrics", () => {
    const playerRows = Array.from({ length: 20 }, (_, index) => game({
      user_num: 999,
      game_id: 3000 + index,
      character_code: 4,
      best_weapon: 13
    }));
    const peers = Array.from({ length: 180 }, (_, index) => game({
      user_num: Math.floor(index / 3) + 1,
      game_id: 4000 + index,
      character_code: 30,
      best_weapon: 13
    }));
    const analysis = buildPlayerAnalysis({
      nickname: "역할군폴백",
      userNum: 999,
      playerRows,
      overallRows: peers,
      samePickRows: [],
      roleRows: peers,
      combatClassification: {
        rangeProfile: "melee",
        primaryFunction: "engage",
        secondaryFunction: null,
        scoreProfile: "melee_engage",
        reviewStatus: "auto",
        confidence: "high",
        reviewReason: null,
        classificationVersion: 1
      },
      seasonId: 41,
      patchKey: "12.1.0",
      supplementalGames: 0,
      expandedBenchmark: false
    });
    const metric = (id: string) => analysis.dimensions
      .flatMap((dimension) => dimension.metrics)
      .find((item) => item.id === id);
    expect(metric("damage_per_minute")?.reference_type).toBe("role");
    expect(metric("kill_participation")?.reference_type).toBe("role");
    expect(metric("weapon_level_per_minute")?.reference_type).toBe("mmr");
    expect(analysis.combat_context?.label).toBe("근접 진입형");
    expect(analysis.combat_context?.metric_weights.cc_per_minute).toBe(0.55);
    expect(analysis.benchmark_coverage.role_players).toBe(60);
  });

  it("keeps same-pick evidence ahead of the broader role cohort", () => {
    const playerRows = Array.from({ length: 20 }, (_, index) => game({
      user_num: 999,
      game_id: 5000 + index
    }));
    const peers = Array.from({ length: 180 }, (_, index) => game({
      user_num: Math.floor(index / 3) + 1,
      game_id: 6000 + index
    }));
    const analysis = buildPlayerAnalysis({
      nickname: "같은픽우선",
      userNum: 999,
      playerRows,
      overallRows: peers,
      samePickRows: peers,
      roleRows: peers,
      combatClassification: {
        rangeProfile: "melee",
        primaryFunction: "sustained_damage",
        secondaryFunction: null,
        scoreProfile: "melee_damage",
        reviewStatus: "auto",
        confidence: "high",
        reviewReason: null,
        classificationVersion: 1
      },
      seasonId: 41,
      patchKey: "12.1.0",
      supplementalGames: 0,
      expandedBenchmark: false
    });
    const combatMetrics = analysis.dimensions.find((dimension) => dimension.key === "combat")?.metrics ?? [];
    expect(combatMetrics.every((metric) => metric.reference_type === "same_pick")).toBe(true);
    expect(analysis.combat_context?.reference_type).toBe("same_pick");
  });

  it("withholds combat comparison when an ambiguous role lacks a same-pick cohort", () => {
    const playerRows = Array.from({ length: 20 }, (_, index) => game({
      user_num: 999,
      game_id: 7000 + index,
      character_code: 2,
      best_weapon: 9
    }));
    const peers = Array.from({ length: 60 }, (_, index) => game({
      user_num: index + 1,
      game_id: 8000 + index
    }));
    const analysis = buildPlayerAnalysis({
      nickname: "검토대상",
      userNum: 999,
      playerRows,
      overallRows: peers,
      samePickRows: [],
      roleRows: peers,
      combatClassification: {
        rangeProfile: "ranged",
        primaryFunction: "burst_damage",
        secondaryFunction: "sustained_damage",
        scoreProfile: "ranged_poke",
        reviewStatus: "review_required",
        confidence: "medium",
        reviewReason: "복합 역할",
        classificationVersion: 1
      },
      seasonId: 41,
      patchKey: "12.1.0",
      supplementalGames: 0,
      expandedBenchmark: false
    });
    const combat = analysis.dimensions.find((dimension) => dimension.key === "combat");
    const growth = analysis.dimensions.find((dimension) => dimension.key === "growth");
    expect(combat?.score).toBeNull();
    expect(combat?.metrics.every((metric) => metric.reference_type === null)).toBe(true);
    expect(growth?.metrics.every((metric) => metric.reference_type === "mmr")).toBe(true);
    expect(analysis.caveats.some((caveat) => caveat.includes("검토 대상"))).toBe(true);
  });
});

function game(overrides: Record<string, unknown> = {}) {
  return {
    game_id: 1,
    user_num: 1,
    nickname: "player",
    character_code: 1,
    best_weapon: 1,
    game_rank: 2,
    player_kill: 2,
    player_assistant: 4,
    team_kill: 8,
    monster_kill: 10,
    best_weapon_level: 12,
    play_time: 1200,
    damage_to_player: 2000,
    damage_to_monster: 4000,
    cc_time_to_player: 5,
    team_recover: 100,
    protect_absorb: 100,
    add_surveillance_camera: 2,
    add_telephoto_camera: 0,
    remove_surveillance_camera: 1,
    remove_telephoto_camera: 0,
    use_security_console: 1,
    equipment: { __analysis: { viewContribution: 20 } },
    total_gain_vf_credit: 500,
    mmr_gain: 10,
    mmr_after: 7800,
    analysis_data_version: 2,
    matches: { started_at: "2026-08-18T00:00:00.000Z" },
    ...overrides
  };
}
