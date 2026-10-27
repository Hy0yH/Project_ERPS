import type { BenchmarkStats } from "@/lib/player-analysis";
import { percentileScore, scoreReliability } from "@/lib/player-analysis-score";
import { readAnalysisNumber, type PlayerSourceRow } from "@/lib/player-analysis-source";
import { buildPlayerStatistics } from "@/lib/player-statistics";
import type { PlayerAnalysisPick, PlayerPickEvaluation, PlayerPickGrade } from "@/lib/types";

export const PICK_GRADE_MIN_GAMES = 1;
export const PICK_GRADE_STABLE_GAMES = 20;
export const PICK_GRADE_MIN_PEER_GAMES = 50;
export const PICK_GRADE_MIN_PEER_PLAYERS = 30;
export const PICK_GRADE_BANDS: ReadonlyArray<{ grade: PlayerPickGrade; minimum: number }> = [
  { grade: "S", minimum: 90 }, { grade: "A+", minimum: 80 }, { grade: "A", minimum: 70 },
  { grade: "B+", minimum: 60 }, { grade: "B", minimum: 50 }, { grade: "C+", minimum: 40 },
  { grade: "C", minimum: 30 }, { grade: "D+", minimum: 20 }, { grade: "D", minimum: 10 },
  { grade: "F+", minimum: 5 }, { grade: "F", minimum: 0 }
];
const METRICS = [
  { id: "average_rank", label: "평균 순위", weight: 0.5, direction: "lower" },
  { id: "top3_rate", label: "TOP3 비율", weight: 0.35, direction: "higher" },
  { id: "win_rate", label: "승률", weight: 0.15, direction: "higher" }
] as const;

export function pickGradeForScore(score: number): PlayerPickGrade | null {
  if (!Number.isFinite(score)) return null;
  // Grade the displayed score, so a rounded 90.0 is never shown as A+.
  const displayed = Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;
  return PICK_GRADE_BANDS.find((band) => displayed >= band.minimum)?.grade ?? null;
}

export function evaluatePlayerPicks(
  picks: Array<Omit<PlayerAnalysisPick, "evaluation">>, rows: PlayerSourceRow[], benchmark: BenchmarkStats
): PlayerAnalysisPick[] {
  const grouped = new Map<string, PlayerSourceRow[]>();
  for (const row of rows) {
    const key = `${readAnalysisNumber(row, "character_code", "characterNum", "characterCode")}:${readAnalysisNumber(row, "best_weapon", "bestWeapon")}`;
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  return picks.map((pick) => {
    const games = grouped.get(`${pick.character_code}:${pick.weapon_code}`) ?? [];
    const statistics = buildPlayerStatistics(games);
    const value = (id: string) => statistics.metrics.find((metric) => metric.id === id)?.value ?? null;
    const validDamage = games.flatMap((row) => {
      const damage = readAnalysisNumber(row, "damageToPlayer", "damage_to_player");
      const seconds = readAnalysisNumber(row, "playTime", "play_time");
      return damage !== null && seconds !== null && seconds > 0 ? [{ damage, seconds }] : [];
    });
    const details = { deaths_per_game: value("deaths"), mmr_gain_per_game: value("mmr_actual"),
      damage_per_minute: validDamage.length ? validDamage.reduce((sum, row) => sum + row.damage, 0) * 60 /
        validDamage.reduce((sum, row) => sum + row.seconds, 0) : null };
    const enoughBenchmark = METRICS.every(({ id }) => benchmark.metrics[id].sampleGames >= PICK_GRADE_MIN_PEER_GAMES &&
      benchmark.metrics[id].samplePlayers >= PICK_GRADE_MIN_PEER_PLAYERS);
    const enoughPlayer = pick.games >= PICK_GRADE_MIN_GAMES;
    const hasBenchmark = METRICS.every(({ id }) => benchmark.metrics[id].values.length > 0);
    const reliability = (players: number) => hasBenchmark ? scoreReliability(pick.games, players, false)
      : Math.sqrt(Math.min(pick.games / PICK_GRADE_STABLE_GAMES, 1));
    const metrics: PlayerPickEvaluation["metrics"] = METRICS.map((definition) => {
      const reference = benchmark.metrics[definition.id];
      const percentile = hasBenchmark ? percentileScore(pick[definition.id], reference.values, definition.direction) : null;
      // With no peer records, show a personal-result estimate using the same
      // outcome weights. Rank 1..8 maps to 100..0; rates map to 0..100.
      const resultScore = definition.id === "average_rank" ? Math.min(100, Math.max(0, (8 - pick.average_rank) / 7 * 100))
        : pick[definition.id] * 100;
      const adjusted = enoughPlayer ? 50 + ((percentile ?? resultScore) - 50) * reliability(reference.samplePlayers) : null;
      return { id: definition.id, label: definition.label, weight: definition.weight, value: pick[definition.id],
        reference_mean: hasBenchmark ? reference.mean : null, percentile,
        adjusted_score: adjusted === null ? null : Math.round(adjusted * 10) / 10,
        sample_games: reference.sampleGames, sample_players: reference.samplePlayers };
    });
    const score = enoughPlayer ? Math.round(metrics.reduce((total, metric) => total + Number(metric.adjusted_score) * metric.weight, 0) * 10) / 10 : null;
    const stableBenchmark = METRICS.every(({ id }) =>
      scoreReliability(PICK_GRADE_STABLE_GAMES, benchmark.metrics[id].samplePlayers, false) >= 0.85);
    const stable = enoughBenchmark && pick.games >= PICK_GRADE_STABLE_GAMES && stableBenchmark;
    const status: PlayerPickEvaluation["status"] = stable ? "rated" : "provisional";
    const remaining = Math.max(0, PICK_GRADE_STABLE_GAMES - pick.games);
    const needsPeerData = !enoughBenchmark || !stableBenchmark;
    const reason = status === "provisional" ? remaining > 0
          ? `등급 확정까지 ${remaining}판 더 필요${needsPeerData ? " · 비교 데이터 수집 중" : ""}`
          : "등급 확정을 위한 비교 데이터 수집 중"
          : "비슷한 MMR대 플레이어의 경기 결과와 비교한 최근 성적 등급입니다.";
    return { ...pick, evaluation: { grade: score === null ? null : pickGradeForScore(score), score, status,
      confidence: !enoughBenchmark || pick.games < 10 ? "low" : stable ? "high" : "medium", reason,
      basis: hasBenchmark ? "mmr_results" : "match_results", metrics, details } };
  });
}
