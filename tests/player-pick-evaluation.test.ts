import { describe, expect, it } from "vitest";
import { buildPlayerAnalysis } from "@/lib/player-analysis";
import { PICK_GRADE_BANDS, pickGradeForScore } from "@/lib/player-pick-evaluation";

const patch = { version_season: 12, version_major: 6, version_minor: 0 };
function row(overrides: Record<string, unknown> = {}) {
  return { game_id: 1, user_num: 999, character_code: 1, best_weapon: 1, game_rank: 1,
    play_time: 1200, damage_to_player: 2000, player_deaths: 0, mmr_gain: 10,
    matches: { ...patch, started_at: "2026-10-26T00:00:00Z" }, ...overrides };
}
function peers(rank = 4, players = 60) {
  return Array.from({ length: players * 3 }, (_, index) => row({ game_id: 2000 + index,
    user_num: 100 + Math.floor(index / 3), game_rank: rank }));
}
function analyze(rows: Record<string, unknown>[], comparison: Record<string, unknown>[] = peers()) {
  return buildPlayerAnalysis({ nickname: "실험체등급", userNum: 999, playerRows: rows, overallRows: comparison,
    samePickRows: [], seasonId: 41, patchKey: "12.6.0", supplementalGames: 0, expandedBenchmark: false });
}
const games = (count: number, overrides = {}) => Array.from({ length: count }, (_, index) => row({ game_id: index + 1, ...overrides }));

describe("personal character and weapon grades", () => {
  it("uses exactly the selected eleven grades and checks every threshold", () => {
    expect(PICK_GRADE_BANDS.map((band) => band.grade)).toEqual(["S", "A+", "A", "B+", "B", "C+", "C", "D+", "D", "F+", "F"]);
    for (const [index, band] of PICK_GRADE_BANDS.entries()) {
      expect(pickGradeForScore(band.minimum)).toBe(band.grade);
      if (index < PICK_GRADE_BANDS.length - 1) expect(pickGradeForScore(band.minimum - 0.1)).toBe(PICK_GRADE_BANDS[index + 1].grade);
    }
    expect(pickGradeForScore(89.96)).toBe("S");
    expect(pickGradeForScore(100)).toBe("S");
    expect(pickGradeForScore(Number.NaN)).toBeNull();
  });

  it("grades even one-game records with sample correction and stabilizes at twenty", () => {
    const first = analyze(games(1)).pick_profile.picks[0].evaluation;
    expect(first).toMatchObject({ grade: "B+", score: 61.2, status: "provisional", confidence: "low" });
    expect(first.reason).toBe("등급 확정까지 19판 더 필요");
    const small = analyze(games(9)).pick_profile.picks[0].evaluation;
    expect(small).toMatchObject({ grade: "A+", score: 83.5, status: "provisional", confidence: "low" });
    expect(small.reason).toBe("등급 확정까지 11판 더 필요");
    const provisional = analyze(games(10)).pick_profile.picks[0].evaluation;
    expect(provisional).toMatchObject({ status: "provisional", confidence: "medium", grade: "A+", score: 85.4 });
    expect(provisional.reason).toBe("등급 확정까지 10판 더 필요");
    const stable = analyze(games(20)).pick_profile.picks[0].evaluation;
    expect(stable).toMatchObject({ status: "rated", confidence: "high", grade: "S", score: 100 });
  });

  it("evaluates weapons separately without transferring a successful weapon's results", () => {
    const rows = [...games(20), ...games(20, { game_rank: 8, best_weapon: 2, game_id: 1000 })];
    const picks = analyze(rows, peers(1)).pick_profile.picks;
    expect(picks).toHaveLength(2);
    expect(picks[0].evaluation).toMatchObject({ grade: "B", score: 50 });
    expect(picks[1].evaluation).toMatchObject({ grade: "F", score: 0 });
    expect(picks.every((pick) => pick.games === 20)).toBe(true);
  });

  it("shows a conservatively corrected grade when distinct peer evidence is limited", () => {
    const evaluation = analyze(games(20), peers(4, 5)).pick_profile.picks[0].evaluation;
    expect(evaluation).toMatchObject({ status: "provisional", grade: "B+", score: 65.8, confidence: "low", basis: "mmr_results" });
    expect(evaluation.reason).toBe("등급 확정을 위한 비교 데이터 수집 중");
    expect(evaluation.metrics.every((metric) => metric.adjusted_score !== null)).toBe(true);
  });

  it("keeps grades provisional when the peer evidence is still limited", () => {
    const evaluation = analyze(games(20), peers(4, 30)).pick_profile.picks[0].evaluation;
    expect(evaluation.status).toBe("provisional");
    expect(evaluation.confidence).toBe("medium");
    expect(evaluation.score).toBeLessThan(100);
    expect(evaluation.reason).toBe("등급 확정을 위한 비교 데이터 수집 중");
    expect(evaluation.reason).not.toContain("0판");
  });

  it.each([[13, 7], [19, 1]])("shows the remaining personal games for a %i-game record", (count, remaining) => {
    const evaluation = analyze(games(count)).pick_profile.picks[0].evaluation;
    expect(evaluation.reason).toBe(`등급 확정까지 ${remaining}판 더 필요`);
    expect(evaluation.reason).not.toContain("임시");
  });

  it("keeps a separate peer-data notice when more personal games cannot resolve the comparison", () => {
    const evaluation = analyze(games(13), peers(4, 30)).pick_profile.picks[0].evaluation;
    expect(evaluation.reason).toBe("등급 확정까지 7판 더 필요 · 비교 데이터 수집 중");
  });

  it("excludes old-patch games from the personal grade and peer reference", () => {
    const old = games(40, { character_code: 2, matches: { ...patch, version_major: 5 } });
    const analysis = analyze([...games(10), ...old], peers().map((peer) => ({ ...peer, matches: { ...patch, version_major: 5 } })));
    expect(analysis.pick_profile.picks).toHaveLength(1);
    expect(analysis.pick_profile.picks[0].games).toBe(10);
    expect(analysis.pick_profile.picks[0].evaluation).toMatchObject({ status: "provisional", basis: "match_results", grade: "A+" });
    expect(analysis.pick_profile.picks[0].evaluation.score).toBe(analyze(games(10), []).pick_profile.picks[0].evaluation.score);
  });

  it("uses labeled personal-result grades when peer records are completely absent", () => {
    const win = analyze(games(1), []).pick_profile.picks[0].evaluation;
    const loss = analyze(games(20, { game_rank: 8 }), []).pick_profile.picks[0].evaluation;
    expect(win).toMatchObject({ grade: "B+", score: 61.2, basis: "match_results", confidence: "low" });
    expect(win.metrics.every((metric) => metric.reference_mean === null && metric.percentile === null)).toBe(true);
    expect(loss).toMatchObject({ grade: "F", score: 0, basis: "match_results", status: "provisional", confidence: "low" });
    expect(loss.reason).toBe("등급 확정을 위한 비교 데이터 수집 중");
  });

  it("uses consistent result criteria across roles while keeping damage, deaths and RP inspectable", () => {
    const lowDamage = analyze(games(20, { damage_to_player: 0, player_deaths: 0, mmr_gain: 0 })).pick_profile.picks[0].evaluation;
    const highDamage = analyze(games(20, { damage_to_player: 999999 })).pick_profile.picks[0].evaluation;
    expect(lowDamage.score).toBe(highDamage.score);
    expect(lowDamage.details).toEqual({ damage_per_minute: 0, deaths_per_game: 0, mmr_gain_per_game: 0 });
    const missing = analyze(games(20, { damage_to_player: undefined, player_deaths: undefined, mmr_gain: undefined })).pick_profile.picks[0].evaluation;
    expect(missing.details).toEqual({ damage_per_minute: null, deaths_per_game: null, mmr_gain_per_game: null });
  });
});
