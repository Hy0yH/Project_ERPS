export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getOptionalNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getOptionalStringEnv(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const DEFAULT_PERIOD_DAYS = 14;
export const PERIOD_OPTIONS = [7, 14, 30] as const;
export const MIN_MYTHRIL_MMR = getOptionalNumberEnv("ER_MIN_MMR", 7800);
export const ER_SEASON_ID = getOptionalNumberEnv("ER_SEASON_ID", 0);
export const ER_TARGET_PATCH = getOptionalStringEnv("ER_TARGET_PATCH");
export const ER_BATCH_LIMIT = getOptionalNumberEnv("ER_BATCH_LIMIT", 120);
export const ER_RANKER_MATCH_LIMIT = getOptionalNumberEnv("ER_RANKER_MATCH_LIMIT", 100);
export const ER_COLLECTION_MAX_NEW_MATCHES = getOptionalNumberEnv(
  "ER_COLLECTION_MAX_NEW_MATCHES",
  1000
);
export const ER_DISCOVERY_RANKERS_PER_RUN = getOptionalNumberEnv(
  "ER_DISCOVERY_RANKERS_PER_RUN",
  120
);
export const ER_DISCOVERY_TIME_BUDGET_MINUTES = getOptionalNumberEnv(
  "ER_DISCOVERY_TIME_BUDGET_MINUTES",
  45
);
export const ER_REQUEST_DELAY_MS = getOptionalNumberEnv("ER_REQUEST_DELAY_MS", 1000);
export const ER_MAX_RETRIES = getOptionalNumberEnv("ER_MAX_RETRIES", 2);
export const ER_PLAYER_MATCH_LIMIT = getOptionalNumberEnv("ER_PLAYER_MATCH_LIMIT", 5000);
export const ER_RECOMMEND_PLAYER_MATCH_LIMIT = getOptionalNumberEnv(
  "ER_RECOMMEND_PLAYER_MATCH_LIMIT",
  ER_PLAYER_MATCH_LIMIT
);
export const ER_RECOMMEND_MIN_SAMPLE_GAMES = getOptionalNumberEnv(
  "ER_RECOMMEND_MIN_SAMPLE_GAMES",
  10
);
export const ER_RECOMMEND_HIGH_SAMPLE_GAMES = getOptionalNumberEnv(
  "ER_RECOMMEND_HIGH_SAMPLE_GAMES",
  30
);
export const ER_ANALYSIS_PLAYER_MATCH_LIMIT = getOptionalNumberEnv(
  "ER_ANALYSIS_PLAYER_MATCH_LIMIT",
  30
);
export const ER_ANALYSIS_PEER_GAME_LIMIT = getOptionalNumberEnv(
  "ER_ANALYSIS_PEER_GAME_LIMIT",
  5
);
export const PLAYER_ANALYSIS_CACHE_HOURS = getOptionalNumberEnv(
  "PLAYER_ANALYSIS_CACHE_HOURS",
  6
);
export const PLAYER_ANALYSIS_ENABLED =
  getOptionalStringEnv("PLAYER_ANALYSIS_ENABLED", "true").toLowerCase() !== "false";
