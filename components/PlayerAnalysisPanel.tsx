"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  PlayerAnalysis,
  PlayerAnalysisMetric
} from "@/lib/types";

export function PlayerAnalysisPanel({ nickname }: { nickname: string }) {
  const [analysis, setAnalysis] = useState<PlayerAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/player/${encodeURIComponent(nickname)}/analysis`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ forceRefresh })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "분석 데이터를 불러오지 못했습니다.");
      setAnalysis(payload.data as PlayerAnalysis);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "분석 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [nickname]);

  useEffect(() => {
    void load(false);
  }, [load]);

  if (loading && !analysis) {
    return (
      <section className="analysis-loading panel" aria-live="polite">
        <span className="analysis-spinner" aria-hidden="true" />
        <div>
          <strong>최근 경기와 비교 표본을 분석하고 있습니다.</strong>
          <p>첫 조회에서는 최신 경기 참가자 데이터를 보강하므로 잠시 걸릴 수 있습니다.</p>
        </div>
      </section>
    );
  }

  if (error && !analysis) {
    return (
      <section className="analysis-error empty" role="alert">
        <strong>분석을 완료하지 못했습니다.</strong>
        <p>{error}</p>
        <button type="button" onClick={() => void load(false)}>다시 시도</button>
      </section>
    );
  }

  if (!analysis) return null;

  const benchmarkLabel = analysis.benchmark_coverage.mmr_bucket_start === null
    ? "MMR 표본 부족"
    : `${analysis.benchmark_coverage.mmr_bucket_start.toLocaleString()}–${Number(analysis.benchmark_coverage.mmr_bucket_end).toLocaleString()} MMR`;
  const radarAxes = buildRadarAxes(analysis);

  return (
    <div className="player-analysis stack">
      <section className="analysis-summary panel">
        <div className="analysis-summary-copy">
          <div className="analysis-badges">
            <span className={`badge confidence-${analysis.scope.confidence}`}>
              신뢰도 {confidenceLabel(analysis.scope.confidence)}
            </span>
            <span className="badge">{benchmarkLabel}</span>
            {analysis.cache_status === "stale" ? <span className="badge warn">이전 결과</span> : null}
          </div>
          <h2>플레이스타일 진단</h2>
          <p>{analysis.ai_summary}</p>
        </div>
        <button
          className="secondary analysis-refresh"
          type="button"
          disabled={loading}
          onClick={() => void load(true)}
        >
          {loading ? "갱신 중…" : "최신 전적으로 새로고침"}
        </button>
      </section>

      {error ? <div className="analysis-inline-warning" role="status">{error}</div> : null}

      <section className="analysis-overview-grid" aria-label="플레이어 분석 개요">
        <OverviewMetric label="현재 MMR" value={analysis.player.mmr?.toLocaleString() ?? "-"} />
        <OverviewMetric label="전체 순위" value={analysis.player.rank ? `${analysis.player.rank.toLocaleString()}위` : "-"} />
        <OverviewMetric label="분석 경기" value={`${analysis.scope.analyzed_games}판`} />
        <OverviewMetric label="주력 픽 집중도" value={formatPercent(analysis.pick_profile.concentration)} />
      </section>

      <PlaystyleMap axes={radarAxes} />

      <section className="analysis-section">
        <div className="analysis-section-head">
          <div>
            <span className="page-kicker">PICK PROFILE</span>
            <h2>주력 실험체와 무기</h2>
          </div>
          <span className="muted">총 {analysis.pick_profile.unique_picks}개 픽</span>
        </div>
        <div className="analysis-pick-grid">
          {analysis.pick_profile.picks.slice(0, 6).map((pick, index) => (
            <article className="analysis-pick-card" key={`${pick.character_code}:${pick.weapon_code}`}>
              <span className="analysis-pick-rank">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{pick.character_name} · {pick.weapon_name}</strong>
                <span>{pick.games}판 · 픽률 {formatPercent(pick.pick_rate)}</span>
              </div>
              <dl>
                <div><dt>TOP3</dt><dd>{formatPercent(pick.top3_rate)}</dd></div>
                <div><dt>승률</dt><dd>{formatPercent(pick.win_rate)}</dd></div>
                <div><dt>평균 순위</dt><dd>{pick.average_rank.toFixed(2)}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="analysis-section">
        <div className="analysis-section-head">
          <div>
            <span className="page-kicker">RELATIVE PERFORMANCE</span>
            <h2>비슷한 MMR대와 비교</h2>
          </div>
          <span className="muted">같은 실험체·무기 표본을 우선 적용</span>
        </div>
        <div className="analysis-dimension-grid">
          {analysis.dimensions.map((dimension) => (
            <article className="analysis-dimension-card" key={dimension.key}>
              <header>
                <div>
                  <span className="muted">{confidenceLabel(dimension.confidence)} 신뢰도</span>
                  <h3>{dimension.label}</h3>
                </div>
                <strong>{dimension.score === null ? "-" : Math.round(dimension.score)}</strong>
              </header>
              <div
                className="analysis-score-track"
                role="progressbar"
                aria-label={`${dimension.label} 상대 점수`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={dimension.score === null ? undefined : Math.round(dimension.score)}
              >
                <span style={{ width: `${dimension.score ?? 0}%` }} />
              </div>
              <div className="analysis-metric-list">
                {dimension.metrics.map((metric) => <MetricRow metric={metric} key={metric.id} />)}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="analysis-insights-grid">
        <InsightGroup
          kicker="STRENGTHS"
          title="확인된 강점"
          empty="현재 표본에서 평균을 뚜렷하게 웃도는 지표가 아직 없습니다."
          items={analysis.strengths}
          tone="positive"
        />
        <InsightGroup
          kicker="NEXT FOCUS"
          title="랭크 상승을 위한 우선 점검"
          empty="35점 미만이면서 높은 성과와 연결된 신뢰 가능한 지표가 없어, 현재 플레이의 일관성을 먼저 유지해도 좋습니다."
          items={analysis.improvement_priorities}
          tone="focus"
        />
      </section>

      <section className="analysis-caveats panel">
        <div className="analysis-section-head compact">
          <div>
            <span className="page-kicker">DATA NOTES</span>
            <h2>분석 범위와 한계</h2>
          </div>
          <span className="muted">{formatDate(analysis.generated_at)} 갱신</span>
        </div>
        <ul>
          {analysis.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
        </ul>
        <p className="analysis-source-note">
          데이터 출처: Eternal Return Open API · 이 분석은 경기 기록 해석이며 랭크 상승을 보장하지 않습니다.
        </p>
      </section>
    </div>
  );
}

function OverviewMetric({ label, value }: { label: string; value: string }) {
  return <div className="analysis-overview-card"><span>{label}</span><strong>{value}</strong></div>;
}

type RadarAxis = {
  key: string;
  label: string;
  score: number | null;
  benchmarkSource: "같은 픽" | "유사 MMR" | "혼합 기준" | "표본 부족";
  unavailableDetail: string | null;
  confidence: PlayerAnalysis["scope"]["confidence"];
  availableMetrics: number;
  totalMetrics: number;
};

function PlaystyleMap({ axes }: { axes: RadarAxis[] }) {
  const hasScores = axes.some((axis) => axis.score !== null);
  const scoredAxes = axes.filter((axis) => axis.score !== null).length;

  return (
    <section className="analysis-playstyle panel" aria-labelledby="playstyle-map-title">
      <div className="analysis-playstyle-head">
        <div>
          <span className="page-kicker">PLAYSTYLE MAP</span>
          <h2 id="playstyle-map-title">플레이스타일 한눈에 보기</h2>
        </div>
        <div className="analysis-playstyle-coverage">
          <strong>{scoredAxes}/{axes.length} 영역 산정</strong>
          <span>비교 분포 중앙값 50</span>
        </div>
      </div>

      <div className="analysis-playstyle-grid">
        <div className="analysis-radar-wrap">
          <RadarChart axes={axes} />
          <div className="analysis-radar-legend" aria-hidden="true">
            <span><i className="player" />내 플레이</span>
            <span><i className="benchmark" />비교 중앙</span>
          </div>
          {!hasScores ? (
            <p className="analysis-radar-empty">비교 표본이 쌓이면 플레이스타일 도형이 표시됩니다.</p>
          ) : null}
        </div>

        <div className="analysis-playstyle-score-wrap">
          <div className="analysis-playstyle-score-list" aria-label="영역별 플레이어 상대 점수">
            {axes.map((axis) => (
              <div
                className={`analysis-playstyle-score-row${axis.score === null ? " is-unavailable" : ""}`}
                key={axis.key}
              >
                <div className="analysis-playstyle-score-name">
                  <strong>{axis.label}</strong>
                  <small>{axis.score === null ? "비교 기준 미충족" : axis.benchmarkSource}</small>
                </div>
                <div className="analysis-playstyle-score-value">
                  <strong>{axis.score === null ? "N/A" : Math.round(axis.score)}</strong>
                  <small>{axis.availableMetrics}/{axis.totalMetrics} 지표</small>
                </div>
                {axis.score === null ? (
                  <p className="analysis-playstyle-unavailable">{axis.unavailableDetail ?? "비교 표본 부족"}</p>
                ) : (
                  <div
                    className="analysis-playstyle-meter"
                    role="progressbar"
                    aria-label={`${axis.label} 상대 점수 ${Math.round(axis.score)}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(axis.score)}
                  >
                    <span style={{ width: `${Math.max(0, Math.min(100, axis.score))}%` }} />
                  </div>
                )}
                <ScoreStatus axis={axis} />
              </div>
            ))}
          </div>
          <p className="analysis-playstyle-note">
            막대 중앙선은 비교 분포의 중앙값 50입니다. 표본이 적은 점수는 50 쪽으로 보수적으로 보정하며, 미산정 영역은 점수와 도형에서 제외합니다.
          </p>
        </div>
      </div>
    </section>
  );
}

function RadarChart({ axes }: { axes: RadarAxis[] }) {
  const centerX = 180;
  const centerY = 146;
  const radius = 100;
  const benchmarkPoints = radarPoints(axes.map(() => 50), centerX, centerY, radius);
  const playerSegments = scoredRadarSegments(axes, centerX, centerY, radius);
  const allScored = axes.every((axis) => axis.score !== null);
  const ariaSummary = axes
    .map((axis) => `${axis.label} ${axis.score === null ? "표본 부족" : `${Math.round(axis.score)}점`}`)
    .join(", ");

  return (
    <svg
      className="analysis-radar"
      viewBox="0 0 360 300"
      role="img"
      aria-label={`플레이스타일 육각형 차트. ${ariaSummary}. 비교 분포 중앙은 50점입니다.`}
    >
      {[25, 50, 75, 100].map((level) => (
        <polygon
          className={level === 50 ? "analysis-radar-grid benchmark-level" : "analysis-radar-grid"}
          key={level}
          points={radarPoints(axes.map(() => level), centerX, centerY, radius)}
        />
      ))}
      {axes.map((axis, index) => {
        const point = radarPoint(100, index, axes.length, centerX, centerY, radius);
        return (
          <line
            className={`analysis-radar-axis${axis.score === null ? " unavailable" : ""}`}
            key={axis.key}
            x1={centerX}
            y1={centerY}
            x2={point.x}
            y2={point.y}
          />
        );
      })}
      <polygon className="analysis-radar-benchmark" points={benchmarkPoints} />
      {allScored ? (
        <polygon
          className="analysis-radar-player"
          points={radarPoints(axes.map((axis) => Number(axis.score)), centerX, centerY, radius)}
        />
      ) : playerSegments.map((segment, index) => (
        <polyline className="analysis-radar-player-segment" key={index} points={segment} />
      ))}
      {axes.map((axis, index) => {
        if (axis.score === null) return null;
        const point = radarPoint(axis.score, index, axes.length, centerX, centerY, radius);
        return <circle className="analysis-radar-dot" key={axis.key} cx={point.x} cy={point.y} r="3.5" />;
      })}
      {axes.map((axis, index) => {
        const point = radarPoint(126, index, axes.length, centerX, centerY, radius);
        return (
          <text
            className={`analysis-radar-label${axis.score === null ? " unavailable" : ""}`}
            key={axis.key}
            x={point.x}
            y={point.y}
            textAnchor={labelAnchor(point.x, centerX)}
            dominantBaseline="middle"
          >
            {axis.score === null ? `${axis.label} N/A` : axis.label}
          </text>
        );
      })}
    </svg>
  );
}

function ScoreStatus({ axis }: { axis: RadarAxis }) {
  const { score } = axis;
  if (score === null) return <span className="analysis-score-status unavailable">평가 제외</span>;
  if (axis.confidence === "low") return <span className="analysis-score-status unavailable">낮은 신뢰도</span>;
  if (score >= 65) return <span className="analysis-score-status strong">뚜렷한 강점</span>;
  if (score >= 55) return <span className="analysis-score-status above">평균 이상</span>;
  if (score >= 45) return <span className="analysis-score-status similar">평균 수준</span>;
  if (score >= 35) return <span className="analysis-score-status check">점검 권장</span>;
  return <span className="analysis-score-status focus">우선 개선</span>;
}

function buildRadarAxes(analysis: PlayerAnalysis): RadarAxis[] {
  return analysis.dimensions.map((dimension) => {
    const sources = new Set(
      dimension.metrics
        .map((metric) => metric.reference_type)
        .filter((source): source is "same_pick" | "mmr" => source !== null)
    );
    const source = sources.size > 1
      ? "혼합 기준"
      : sources.has("same_pick")
        ? "같은 픽"
        : sources.has("mmr")
          ? "유사 MMR"
          : "표본 부족";
    return {
      key: dimension.key,
      label: dimension.label,
      score: dimension.score,
      benchmarkSource: source,
      unavailableDetail: dimension.score === null
        ? dimension.key === "team" && analysis.benchmark_coverage.same_pick_games > 0
          ? `같은 픽 ${analysis.benchmark_coverage.same_pick_games}경기·${analysis.benchmark_coverage.same_pick_players}명`
          : dimension.metrics.find((metric) => metric.comparison_note)?.comparison_note ?? "비교 표본 부족"
        : null,
      confidence: dimension.confidence,
      availableMetrics: dimension.available_metrics,
      totalMetrics: dimension.total_metrics
    };
  });
}

function scoredRadarSegments(
  axes: RadarAxis[],
  centerX: number,
  centerY: number,
  radius: number
) {
  if (!axes.length || axes.every((axis) => axis.score === null)) return [];
  if (axes.every((axis) => axis.score !== null)) {
    return [radarPoints(axes.map((axis) => Number(axis.score)), centerX, centerY, radius)];
  }

  const firstGap = axes.findIndex((axis) => axis.score === null);
  const ordered = Array.from({ length: axes.length }, (_, offset) =>
    axes[(firstGap + 1 + offset) % axes.length]
  );
  const segments: string[] = [];
  let points: string[] = [];

  ordered.forEach((axis, orderedIndex) => {
    const originalIndex = axes.indexOf(axis);
    if (axis.score === null) {
      if (points.length > 1) segments.push(points.join(" "));
      points = [];
      return;
    }
    const point = radarPoint(axis.score, originalIndex, axes.length, centerX, centerY, radius);
    points.push(`${point.x.toFixed(2)},${point.y.toFixed(2)}`);
    if (orderedIndex === ordered.length - 1 && points.length > 1) segments.push(points.join(" "));
  });

  return segments;
}

function radarPoints(values: number[], centerX: number, centerY: number, radius: number) {
  return values
    .map((value, index) => {
      const point = radarPoint(value, index, values.length, centerX, centerY, radius);
      return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    })
    .join(" ");
}

function radarPoint(value: number, index: number, count: number, centerX: number, centerY: number, radius: number) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
  const distance = radius * Math.max(0, Math.min(100, value)) / 100;
  return {
    x: centerX + Math.cos(angle) * distance,
    y: centerY + Math.sin(angle) * distance
  };
}

function labelAnchor(x: number, centerX: number): "start" | "middle" | "end" {
  if (Math.abs(x - centerX) < 4) return "middle";
  return x > centerX ? "start" : "end";
}

function MetricRow({ metric }: { metric: PlayerAnalysisMetric }) {
  const referenceLabel = metric.reference_type === "same_pick" ? "같은 픽 기준" : "MMR 기준";
  const comparisonValue = metric.delta_percent ?? metric.delta_absolute;
  return (
    <div className="analysis-metric-row">
      <div>
        <strong>{metric.label}</strong>
        {metric.comparison_status === "available" && metric.reference_value !== null ? (
          <span>
            내 수치 {formatMetric(metric.value, metric.unit)} · {referenceLabel} {formatMetric(metric.reference_value, metric.unit)}
            {` · 개인 ${metric.player_games}판 / 비교 ${metric.sample_players}명`}
          </span>
        ) : <span>{metric.comparison_note ?? "비교 기준을 충족하지 못했습니다."}</span>}
      </div>
      <span className={comparisonValue === null ? "muted" : comparisonValue >= 0 ? "metric-up" : "metric-down"}>
        {formatMetricDifference(metric)}
      </span>
    </div>
  );
}

function formatMetricDifference(metric: PlayerAnalysisMetric) {
  if (metric.comparison_status !== "available") return "제외";
  if (metric.delta_percent !== null) {
    return `${metric.delta_percent >= 0 ? "+" : ""}${metric.delta_percent.toFixed(1)}%`;
  }
  if (metric.delta_absolute !== null) {
    return `${metric.delta_absolute >= 0 ? "+" : ""}${metric.delta_absolute.toFixed(2)} 차이`;
  }
  return "-";
}

function InsightGroup({
  kicker,
  title,
  empty,
  items,
  tone
}: {
  kicker: string;
  title: string;
  empty: string;
  items: PlayerAnalysis["strengths"];
  tone: "positive" | "focus";
}) {
  return (
    <section className={`analysis-insight-panel panel ${tone}`}>
      <span className="page-kicker">{kicker}</span>
      <h2>{title}</h2>
      {items.length ? (
        <div className="analysis-insight-list">
          {items.map((item) => (
            <article key={`${item.title}:${item.metric_ids.join(":")}`}>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <span>{item.metric_ids.join(" · ")}</span>
            </article>
          ))}
        </div>
      ) : <p>{empty}</p>}
    </section>
  );
}

function formatMetric(value: number, unit: PlayerAnalysisMetric["unit"]) {
  if (unit === "percent") return formatPercent(value);
  if (unit === "rank") return value.toFixed(2);
  if (unit === "mmr") return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
  if (unit === "per_minute") return `${value.toFixed(2)}/분`;
  return value.toFixed(1);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function confidenceLabel(confidence: PlayerAnalysis["scope"]["confidence"]) {
  return confidence === "high" ? "높음" : confidence === "medium" ? "보통" : "낮음";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
