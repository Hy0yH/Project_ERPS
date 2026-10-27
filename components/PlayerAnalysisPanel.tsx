"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readAnalysisStream } from "@/lib/analysis-stream";
import type { AnalysisProgress } from "@/lib/analysis-jobs";
import { PlayerAnalysisTools } from "@/components/PlayerAnalysisTools";
import { PlayerStatisticsHighlights, PlayerStatisticsPanel } from "@/components/PlayerStatisticsPanel";
import { PlayerPickRatings } from "@/components/PlayerPickRatings";
import type {
  PlayerAnalysis,
  PlayerAnalysisMetric
} from "@/lib/types";

export function PlayerAnalysisPanel({ nickname }: { nickname: string }) {
  const [analysis, setAnalysis] = useState<PlayerAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pickKey, setPickKey] = useState("all");
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const requestRef = useRef<AbortController | null>(null), sequence = useRef(0);

  const load = useCallback(async (forceRefresh = false, selection = "all") => {
    requestRef.current?.abort();
    const controller = new AbortController(), requestId = ++sequence.current;
    requestRef.current = controller;
    setLoading(true);
    setError("");
    setProgress(null);
    const parts = selection.split(":").map(Number);
    try {
      const response = await fetch(`/api/player/${encodeURIComponent(nickname)}/analysis?stream=1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ forceRefresh, ...(selection === "all" ? {} : { pick: { characterCode: parts[0], weaponCode: parts[1] } }) })
      });
      const result = await readAnalysisStream(response, (value) => { if (requestId === sequence.current) setProgress(value); });
      if (requestId === sequence.current) setAnalysis(result);
    } catch (caught) {
      if (!controller.signal.aborted && requestId === sequence.current) setError(caught instanceof Error ? caught.message : "분석 데이터를 불러오지 못했습니다.");
    } finally {
      if (requestId === sequence.current) setLoading(false);
    }
  }, [nickname]);

  useEffect(() => {
    const selected = new URL(location.href).searchParams.get("pick") ?? "all";
    const safePick = /^\d+:\d+$/.test(selected) ? selected : "all";
    setAnalysis(null); setPickKey(safePick); void load(false, safePick);
    return () => { sequence.current += 1; requestRef.current?.abort(); };
  }, [load]);

  async function checkJob() {
    if (!progress) return;
    try {
      const response = await fetch(`/api/player/${encodeURIComponent(nickname)}/analysis?jobId=${encodeURIComponent(progress.jobId)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "작업 상태를 확인하지 못했습니다.");
      if (result.stage === "complete" && result.data) { setAnalysis(result.data); setError(""); }
      else setError(result.stage === "failed" ? "분석 작업이 실패했습니다. 다시 시도해 주세요." : analysisStageLabel(result.stage));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "작업 상태를 확인하지 못했습니다."); }
  }

  if (loading && !analysis) {
    return (
      <section className="analysis-loading panel" aria-live="polite">
        <span className="analysis-spinner" aria-hidden="true" />
        <div>
          <strong>{analysisStageLabel(progress?.stage)}</strong>
          <p>첫 조회에서는 최신 경기 참가자 데이터를 보강하므로 잠시 걸릴 수 있습니다.</p>
          {progress ? <small>작업 {progress.jobId.slice(0, 8)} · 실제 진행 단계에 따라 안내합니다.</small> : null}
        </div>
      </section>
    );
  }

  if (error && !analysis) {
    return (
      <section className="analysis-error empty" role="alert">
        <strong>분석을 완료하지 못했습니다.</strong>
        <p>{error}</p>
        <button type="button" onClick={() => void load(false, pickKey)}>다시 시도</button>
        {progress ? <button type="button" className="secondary" onClick={() => void checkJob()}>작업 상태 확인</button> : null}
        {pickKey !== "all" ? <button type="button" className="secondary" onClick={() => { setPickKey("all"); void load(false, "all"); }}>전체 기록으로 돌아가기</button> : null}
      </section>
    );
  }

  if (!analysis) return null;

  const benchmarkLabel = analysis.benchmark_coverage.mmr_bucket_start === null
    ? "MMR 표본 부족"
    : `기준 구간 ${analysis.benchmark_coverage.mmr_bucket_start.toLocaleString()}–${Number(analysis.benchmark_coverage.mmr_bucket_end).toLocaleString()} MMR`;
  const radarAxes = buildRadarAxes(analysis);
  const supportDimension = analysis.dimensions.find((dimension) => dimension.key === "team") ?? null;

  return (
    <div className="player-analysis stack">
      <div className="panel browse-controls"><label>분석할 실험체·무기<select value={pickKey} disabled={loading} onChange={(event) => {
        const value = event.target.value; setPickKey(value); setAnalysis(null);
        const url = new URL(location.href); if (value === "all") url.searchParams.delete("pick"); else url.searchParams.set("pick", value);
        history.replaceState(null, "", url); void load(false, value);
      }}><option value="all">현재 패치의 최근 전체 픽</option>{(analysis.available_picks ?? analysis.pick_profile.picks).map((pick) =>
        <option value={`${pick.character_code}:${pick.weapon_code}`} key={`${pick.character_code}:${pick.weapon_code}`}>{pick.character_name} · {pick.weapon_name} · {pick.games}판</option>)}</select></label>
        <p className="muted">최근 최대 {analysis.scope.available_games ?? analysis.scope.analyzed_games}판 안에서 범위를 선택합니다. 표본이 부족하면 비교 판단을 보류합니다.</p></div>
      <section className="analysis-summary panel">
        <div className="analysis-summary-copy">
          <div className="analysis-badges">
            <span className={`badge confidence-${analysis.scope.confidence}`}>
              신뢰도 {confidenceLabel(analysis.scope.confidence)}
            </span>
            <span className="badge">{benchmarkLabel}</span>
            {analysis.scope.patch_key ? <span className="badge">분석 패치 {analysis.scope.patch_key}</span> : null}
            <span className="badge">현재 패치만 분석</span>
            {analysis.scope.excluded_games > 0 ? (
              <span className="badge warn">다른 패치·패치 미확인 {analysis.scope.excluded_games}판 제외</span>
            ) : null}
            {analysis.combat_context ? (
              <span className="badge">전투 역할 · {analysis.combat_context.label}</span>
            ) : null}
            {analysis.cache_status === "stale" ? <span className="badge warn">이전 결과</span> : null}
          </div>
          <h2>플레이스타일 진단</h2>
          <p>{analysis.ai_summary}</p>
        </div>
        <button
          className="secondary analysis-refresh"
          type="button"
          disabled={loading}
          onClick={() => void load(true, pickKey)}
        >
          {loading ? "갱신 중…" : "최신 전적으로 새로고침"}
        </button>
      </section>

      {error ? <div className="analysis-inline-warning" role="status">{error}</div> : null}

      <section className="analysis-overview-grid" aria-label="플레이어 분석 개요">
        <OverviewMetric label="현재 MMR" value={analysis.player.mmr?.toLocaleString() ?? "-"} />
        <OverviewMetric label="전체 순위" value={analysis.player.rank ? `${analysis.player.rank.toLocaleString()}위` : "-"} />
        <OverviewMetric label="현재 패치 분석 경기" value={`${analysis.scope.analyzed_games}판`} />
        <OverviewMetric label="주력 픽 집중도" value={formatPercent(analysis.pick_profile.concentration)} />
      </section>

      <PlayerStatisticsHighlights statistics={analysis.statistics} />
      <PlayerPickRatings analysis={analysis} />
      <PlayerStatisticsPanel analysis={analysis} />
      <PlayerFeedbackPanels analysis={analysis} />
      <PlayerAnalysisTools key={`${analysis.generated_at}:${analysis.scope.selected_pick_key}`} analysis={analysis} />

      <PlaystyleMap axes={radarAxes} />

      <section className="analysis-section">
        <div className="analysis-section-head">
          <div>
            <span className="page-kicker">RELATIVE PERFORMANCE</span>
            <h2>비슷한 MMR대와 비교</h2>
          </div>
          <span className="muted">같은 실험체·무기 → 같은 역할군 → 유사 MMR 순으로 적용</span>
        </div>
        <div className="analysis-dimension-grid">
          {analysis.dimensions.filter((dimension) => dimension.key !== "team").map((dimension, index) => (
            <article className="analysis-dimension-card" key={dimension.key}>
              <header>
                <div>
                  <span className="muted">{confidenceLabel(dimension.confidence)} 신뢰도</span>
                  <h3>{dimension.label}</h3>
                  {dimension.key === "combat" && analysis.combat_context ? (
                    <span className="muted">{analysis.combat_context.label}</span>
                  ) : null}
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
                <span
                  style={{
                    width: `${dimension.score ?? 0}%`,
                    animationDelay: `${120 + index * 70}ms`
                  }}
                />
              </div>
              <div className="analysis-metric-list">
                {dimension.metrics.map((metric) => <MetricRow metric={metric} key={metric.id} />)}
              </div>
            </article>
          ))}
        </div>
        {supportDimension ? (
          <SupportActivityCard
            dimension={supportDimension}
            samePickGames={analysis.benchmark_coverage.same_pick_games}
            samePickPlayers={analysis.benchmark_coverage.same_pick_players}
          />
        ) : null}
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

export function PlayerFeedbackPanels({ analysis }: { analysis: PlayerAnalysis }) {
  return (
    <section className="analysis-insights-grid" aria-label="최근 전적 근거와 점검 제안">
      <InsightGroup
        kicker="NEXT FOCUS"
        title="최근 전적 기반 점검 제안"
        description="현재 패치의 최근 전적으로 점검할 행동을 제안합니다. 수행 여부는 추적하지 않습니다. 최근 10경기와 이전 10경기 비교는 기록의 변화이며, 제안의 효과를 평가하지 않습니다."
        empty={analysis.feedback.message}
        intro={analysis.improvement_priorities.length ? analysis.feedback.message : undefined}
        items={analysis.improvement_priorities}
        analysis={analysis}
        tone="focus"
      />
      <InsightGroup
        kicker="STRENGTHS"
        title="확인된 강점"
        empty="현재 비교 가능한 기록에서 비교 기준보다 유리하면서 충분한 신뢰도를 갖춘 강점 지표가 아직 없습니다."
        items={analysis.strengths}
        analysis={analysis}
        tone="positive"
      />
    </section>
  );
}

type RadarAxis = {
  key: string;
  label: string;
  score: number | null;
  benchmarkSource: "같은 픽" | "같은 역할군" | "유사 MMR" | "혼합 기준" | "표본 부족";
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
            {axes.map((axis, index) => (
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
                    <span
                      style={{
                        width: `${Math.max(0, Math.min(100, axis.score))}%`,
                        animationDelay: `${160 + index * 80}ms`
                      }}
                    />
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
  return analysis.dimensions.filter((dimension) => dimension.key !== "team").map((dimension) => {
    const sources = new Set(
      dimension.metrics
        .map((metric) => metric.reference_type)
        .filter((source): source is "same_pick" | "role" | "mmr" => source !== null)
    );
    const source = sources.size > 1
      ? "혼합 기준"
      : sources.has("same_pick")
        ? "같은 픽"
        : sources.has("role")
          ? "같은 역할군"
        : sources.has("mmr")
          ? "유사 MMR"
          : "표본 부족";
    return {
      key: dimension.key,
      label: dimension.label,
      score: dimension.score,
      benchmarkSource: source,
      unavailableDetail: dimension.score === null
        ? (dimension.key as string) === "team" && analysis.benchmark_coverage.same_pick_games > 0
          ? `같은 픽 ${analysis.benchmark_coverage.same_pick_games}경기·${analysis.benchmark_coverage.same_pick_players}명`
          : dimension.metrics.find((metric) => metric.comparison_note)?.comparison_note ?? "비교 표본 부족"
        : null,
      confidence: dimension.confidence,
      availableMetrics: dimension.available_metrics,
      totalMetrics: dimension.total_metrics
    };
  });
}

function SupportActivityCard({
  dimension,
  samePickGames,
  samePickPlayers
}: {
  dimension: PlayerAnalysis["dimensions"][number];
  samePickGames: number;
  samePickPlayers: number;
}) {
  const metric = dimension.metrics.find((item) => item.id === "support_per_minute");
  if (!metric) return null;
  const comparisonAvailable = metric.comparison_status === "available" && metric.reference_value !== null;

  return (
    <article className="analysis-support-card" aria-labelledby="support-activity-title">
      <div className="analysis-support-copy">
        <span className="page-kicker">SUPPORT ACTIVITY</span>
        <h3 id="support-activity-title">지원 활동</h3>
        <p>회복·보호는 실험체 역할의 영향을 크게 받으므로 플레이스타일 점수와 강점·개선점에는 반영하지 않습니다.</p>
      </div>
      <div className="analysis-support-value">
        <span>분당 회복·보호</span>
        <strong>{metric.player_games ? formatMetric(metric.value, metric.unit) : "미수집"}</strong>
      </div>
      <div className="analysis-support-reference">
        {comparisonAvailable ? (
          <>
            <strong>같은 픽 평균 {formatMetric(Number(metric.reference_value), metric.unit)}</strong>
            <span>{formatMetricDifference(metric)} · 비교 {metric.sample_games}경기·{metric.sample_players}명</span>
          </>
        ) : (
          <>
            <strong>참고 정보</strong>
            <span>{metric.comparison_note ?? "같은 픽 비교 표본이 부족합니다."}</span>
            {samePickGames > 0 ? <span>수집 표본 {samePickGames}경기·{samePickPlayers}명</span> : null}
          </>
        )}
      </div>
    </article>
  );
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
  const referenceLabel = metric.reference_type === "same_pick"
    ? "같은 픽 기준"
    : metric.reference_type === "role"
      ? "같은 역할군 기준"
      : "MMR 기준";
  const comparisonValue = metric.delta_percent ?? metric.delta_absolute;
  return (
    <div className="analysis-metric-row">
      <div>
        <strong>{metric.label}</strong>
        <span>
          {metric.player_games ? `비교에 사용한 내 수치 ${formatMetric(metric.value, metric.unit)}` : "수집된 값 없음"}
          {metric.comparison_status === "available" && metric.reference_value !== null
            ? ` · ${referenceLabel} ${formatMetric(metric.reference_value, metric.unit)} · 개인 ${metric.player_games}판 / 비교 ${metric.sample_players}명`
            : ` · ${metric.comparison_note ?? "비교 기준을 충족하지 못했습니다."}`}
        </span>
        <span>{metricScopeLabel(metric)}</span>
        {metric.recent_trend ? <span className="analysis-trend">{trendLabel(metric)}</span> : null}
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
  intro,
  description,
  items,
  analysis,
  tone
}: {
  kicker: string;
  title: string;
  empty: string;
  intro?: string;
  description?: string;
  items: PlayerAnalysis["strengths"];
  analysis: PlayerAnalysis;
  tone: "positive" | "focus";
}) {
  return (
    <section className={`analysis-insight-panel panel ${tone}`}>
      <span className="page-kicker">{kicker}</span>
      <h2>{title}</h2>
      {description ? <p className="analysis-feedback-intro">{description}</p> : null}
      {intro ? <p className="analysis-feedback-intro">{intro}</p> : null}
      {items.length ? (
        <div className="analysis-insight-list">
          {items.map((item) => (
            <article key={item.id}>
              <h3>{item.title}</h3>
              <dl className="analysis-feedback-steps">
                <div>
                  <dt>관측 근거</dt>
                  <dd>
                    <p>{item.detail}</p>
                    <details className="analysis-feedback-details">
                      <summary>비교 수치와 분석 범위 보기</summary>
                    <ul className="analysis-feedback-evidence">
                      {item.metric_ids.map((id) => {
                        const metric = analysis.dimensions.flatMap((dimension) => dimension.metrics).find((value) => value.id === id);
                        if (!metric) return null;
                        const pick = analysis.pick_profile.picks.find((value) =>
                          value.character_code === metric.player_scope.character_code && value.weapon_code === metric.player_scope.weapon_code);
                        return (
                          <li key={id}>
                            <strong>{metric.label}</strong>
                            <span>내 수치 {formatMetric(metric.value, metric.unit)} · 비교 기준 {formatMetric(Number(metric.reference_value), metric.unit)}</span>
                            <span>{pick ? `${pick.character_name} · ${pick.weapon_name} · ` : ""}{metricScopeLabel(metric)}</span>
                            <span>{referenceLabel(metric)} {metric.sample_games}경기·{metric.sample_players}명 · 신뢰도 {confidenceLabel(metric.confidence)}</span>
                            {metric.recent_trend ? <span className="analysis-trend">{trendLabel(metric)}</span> : null}
                          </li>
                        );
                      })}
                    </ul>
                    </details>
                  </dd>
                </div>
                {item.hypothesis ? <div><dt>점검 가설</dt><dd>{item.hypothesis}</dd></div> : null}
                {item.action ? <div className="analysis-feedback-action"><dt>확인해 볼 행동</dt><dd>{item.action}</dd></div> : null}
                {item.review ? <div><dt>기록 비교 안내</dt><dd>{item.review}</dd></div> : null}
                {item.coaching_note ? <div><dt>보충 설명</dt><dd>{item.coaching_note}</dd></div> : null}
              </dl>
            </article>
          ))}
        </div>
      ) : <p>{empty}</p>}
    </section>
  );
}

function metricScopeLabel(metric: PlayerAnalysisMetric) {
  const scope = metric.player_scope;
  const parts = [`${scope.kind === "main_pick" ? "주력 픽" : "전체 픽"} ${metric.player_games}판 기준`];
  if (scope.current_patch_games > 0) parts.push(`${scope.patch_key} ${scope.current_patch_games}판`);
  if (scope.supplemental_games > 0) parts.push(`이전 패치 ${scope.supplemental_games}판`);
  if (scope.unknown_patch_games > 0) parts.push(`패치 미확인 ${scope.unknown_patch_games}판`);
  return parts.join(" · ");
}

function referenceLabel(metric: PlayerAnalysisMetric) {
  const source = metric.reference_type === "same_pick" ? "같은 실험체·무기" : metric.reference_type === "role" ? "같은 역할군" : "유사 MMR";
  return `${source}${metric.player_scope.patch_key ? ` · ${metric.player_scope.patch_key}` : ""} 비교`;
}

function trendLabel(metric: PlayerAnalysisMetric) {
  const trend = metric.recent_trend!;
  return `최근 기록 비교 (동일 패치·픽): 이전 ${trend.previous_games}판 ${formatMetric(trend.previous_value, metric.unit)} → 최근 ${trend.recent_games}판 ${formatMetric(trend.recent_value, metric.unit)}`;
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

function analysisStageLabel(stage?: AnalysisProgress["stage"]) {
  return stage === "collect" ? "최근 경기 기록을 확인하고 있습니다." : stage === "benchmark" ? "같은 패치의 비교 표본을 확인하고 있습니다." :
    stage === "calculate" ? "실제 지표와 선택한 픽을 계산하고 있습니다." : stage === "explain" ? "분석 근거와 설명을 정리하고 있습니다." : "저장된 분석과 현재 범위를 확인하고 있습니다.";
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
