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

export const DEFAULT_PERIOD_DAYS = 14;
export const PERIOD_OPTIONS = [7, 14, 30] as const;
export const MIN_MYTHRIL_MMR = getOptionalNumberEnv("ER_MIN_MMR", 7800);
export const ER_BATCH_LIMIT = getOptionalNumberEnv("ER_BATCH_LIMIT", 120);
