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

export function getCollectionIntegerEnv(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export const DEFAULT_PERIOD_DAYS = 14;
export const PERIOD_OPTIONS = [7, 14, 30] as const;
export const MIN_MYTHRIL_MMR = getOptionalNumberEnv("ER_MIN_MMR", 7800);
export const ER_SEASON_ID = getOptionalNumberEnv("ER_SEASON_ID", 0);
export const ER_TARGET_PATCH = getOptionalStringEnv("ER_TARGET_PATCH");
export const ER_BATCH_LIMIT = getCollectionIntegerEnv("ER_BATCH_LIMIT", 120, 1, 1000);
export const ER_RANKER_MATCH_LIMIT = getCollectionIntegerEnv("ER_RANKER_MATCH_LIMIT", 100, 1, 5000);
export const ER_COLLECTION_MAX_NEW_MATCHES = getCollectionIntegerEnv(
  "ER_COLLECTION_MAX_NEW_MATCHES",
  1000, 1, 10000
);
export const ER_DISCOVERY_RANKERS_PER_RUN = getCollectionIntegerEnv(
  "ER_DISCOVERY_RANKERS_PER_RUN",
  120, 1, 1000
);
export const ER_DISCOVERY_TIME_BUDGET_MINUTES = getCollectionIntegerEnv(
  "ER_DISCOVERY_TIME_BUDGET_MINUTES",
  45, 1, 180
);
export const ER_COLLECTION_TIME_BUDGET_MINUTES = getCollectionIntegerEnv("ER_COLLECTION_TIME_BUDGET_MINUTES", 60, 1, 180);
export const ER_REQUEST_TIMEOUT_MS = getCollectionIntegerEnv("ER_REQUEST_TIMEOUT_MS", 30000, 1, 120000);
export const ER_REQUEST_DELAY_MS = getCollectionIntegerEnv("ER_REQUEST_DELAY_MS", 1000, 0, 60000);
export const ER_MAX_RETRIES = getCollectionIntegerEnv("ER_MAX_RETRIES", 2, 0, 10);
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
  50
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
