export function percentileScore(value: number, values: number[], direction: "higher" | "lower") {
  if (!values.length) return 50;
  let below = 0;
  let equal = 0;
  for (const candidate of values) {
    if (candidate < value) below += 1;
    else if (Math.abs(candidate - value) <= 0.000001) equal += 1;
  }
  const percentile = ((below + equal * 0.5) / values.length) * 100;
  return Math.round((direction === "higher" ? percentile : 100 - percentile) * 10) / 10;
}

export function scoreReliability(playerGames: number, samplePlayers: number, samePick: boolean) {
  const bounded = (value: number) => Math.min(1, Math.max(0, value));
  return Math.sqrt(bounded(playerGames / 20) * bounded(samplePlayers / (samePick ? 30 : 50)));
}
