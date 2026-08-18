export const RANK_TIERS = [
  { key: "iron", label: "아이언", minMmr: 0, maxMmr: 600 },
  { key: "bronze", label: "브론즈", minMmr: 600, maxMmr: 1400 },
  { key: "silver", label: "실버", minMmr: 1400, maxMmr: 2400 },
  { key: "gold", label: "골드", minMmr: 2400, maxMmr: 3600 },
  { key: "platinum", label: "플래티넘", minMmr: 3600, maxMmr: 5000 },
  { key: "diamond", label: "다이아몬드", minMmr: 5000, maxMmr: 6400 },
  { key: "meteorite", label: "메테오라이트", minMmr: 6400, maxMmr: 7400 },
  { key: "mythril", label: "미스릴", minMmr: 7400, maxMmr: null }
] as const;

export type RankTierKey = (typeof RANK_TIERS)[number]["key"];
export type RankScope = "all" | `exact:${RankTierKey}` | `above:${RankTierKey}`;

export const DEFAULT_RANK_SCOPE: RankScope = "above:mythril";

export const RANK_SCOPE_OPTIONS: { value: RankScope; label: string }[] = [
  { value: "all", label: "수집 전체" },
  ...RANK_TIERS.flatMap((tier) => [
    { value: `exact:${tier.key}` as RankScope, label: tier.label },
    { value: `above:${tier.key}` as RankScope, label: `${tier.label} 이상` }
  ])
];

export function parseRankScope(value?: string | null): RankScope {
  if (!value) return DEFAULT_RANK_SCOPE;
  if (value === "all") return value;
  const [mode, tierKey] = value.split(":");
  if (
    (mode === "exact" || mode === "above") &&
    RANK_TIERS.some((tier) => tier.key === tierKey)
  ) {
    return value as RankScope;
  }
  return DEFAULT_RANK_SCOPE;
}

export function rankScopeLabel(scope: RankScope) {
  return RANK_SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? scope;
}

export function matchesRankScope(mmr: number, scope: RankScope) {
  if (!Number.isFinite(mmr) || mmr < 0) return false;
  if (scope === "all") return true;
  const [mode, tierKey] = scope.split(":") as ["exact" | "above", RankTierKey];
  const tier = RANK_TIERS.find((item) => item.key === tierKey);
  if (!tier) return false;
  if (mode === "above") return mmr >= tier.minMmr;
  return mmr >= tier.minMmr && (tier.maxMmr === null || mmr < tier.maxMmr);
}

export function sampleStatus(games: number) {
  if (games < 30) return "insufficient" as const;
  if (games < 100) return "provisional" as const;
  if (games < 300) return "standard" as const;
  return "high" as const;
}
