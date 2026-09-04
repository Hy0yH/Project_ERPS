import { ER_BATCH_LIMIT, ER_MAX_RETRIES, ER_REQUEST_DELAY_MS, MIN_MYTHRIL_MMR } from "@/lib/env";

const ER_API_BASE = "https://open-api.bser.io";
const RANKED_SQUAD_TEAM_MODE = 3;

type ErEnvelope<T> = {
  code?: number;
  message?: string;
  next?: number;
  user?: T;
  userRank?: T;
  userStats?: T;
  userGames?: T;
  game?: T;
  topRanks?: T;
  data?: T;
  l10n?: T;
};

export class EternalReturnApiError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    public readonly apiMessage: string
  ) {
    super(`Eternal Return API error at ${path}: ${apiMessage || status}`);
    this.name = "EternalReturnApiError";
  }
}

export function isNicknameNotFoundError(error: unknown) {
  return error instanceof EternalReturnApiError &&
    error.status === 404 &&
    error.path.startsWith("/v1/user/nickname");
}

async function erFetch<T>(path: string): Promise<T> {
  const key = process.env.ETERNAL_RETURN_API_KEY;
  if (!key) throw new Error("ETERNAL_RETURN_API_KEY is required");

  let lastStatus = "";
  for (let attempt = 0; attempt <= ER_MAX_RETRIES; attempt += 1) {
    if (attempt > 0) {
      await delay(getBackoffMs(attempt));
    }

    const response = await scheduledFetch(`${ER_API_BASE}${path}`, key);

    if (response.status === 429 && attempt < ER_MAX_RETRIES) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : getBackoffMs(attempt + 1));
      lastStatus = `${response.status} ${response.statusText}`;
      continue;
    }

    if (!response.ok) {
      throw new EternalReturnApiError(path, response.status, response.statusText);
    }

    const json = (await readErJson(response)) as ErEnvelope<T> | T;
    if (typeof json === "object" && json && "code" in json && json.code !== 200) {
      throw new EternalReturnApiError(path, Number(json.code ?? 500), json.message ?? String(json.code));
    }
    return unwrapEnvelope(json);
  }

  throw new Error(`Eternal Return API failed at ${path}: ${lastStatus || "unknown error"}`);
}

async function erFetchEnvelope<T>(path: string): Promise<ErEnvelope<T>> {
  const key = process.env.ETERNAL_RETURN_API_KEY;
  if (!key) throw new Error("ETERNAL_RETURN_API_KEY is required");

  let lastStatus = "";
  for (let attempt = 0; attempt <= ER_MAX_RETRIES; attempt += 1) {
    if (attempt > 0) await delay(getBackoffMs(attempt));

    const response = await scheduledFetch(`${ER_API_BASE}${path}`, key);
    if (response.status === 429 && attempt < ER_MAX_RETRIES) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : getBackoffMs(attempt + 1));
      lastStatus = `${response.status} ${response.statusText}`;
      continue;
    }
    if (!response.ok) {
      throw new EternalReturnApiError(path, response.status, response.statusText);
    }

    const json = (await readErJson(response)) as ErEnvelope<T>;
    if (typeof json === "object" && json && "code" in json && json.code !== 200) {
      throw new EternalReturnApiError(path, Number(json.code ?? 500), json.message ?? String(json.code));
    }
    return json;
  }

  throw new Error(`Eternal Return API failed at ${path}: ${lastStatus || "unknown error"}`);
}

function unwrapEnvelope<T>(json: ErEnvelope<T> | T): T {
  if (!json || typeof json !== "object") return json as T;
  const envelope = json as ErEnvelope<T>;
  return (envelope.user ??
    envelope.userRank ??
    envelope.userStats ??
    envelope.userGames ??
    envelope.game ??
    envelope.topRanks ??
    envelope.data ??
    envelope.l10n ??
    json) as T;
}

export async function fetchUserByNickname(nickname: string) {
  return erFetch<Record<string, unknown>>(`/v1/user/nickname?query=${encodeURIComponent(nickname)}`);
}

export async function fetchUserGames(userNum: number | string, next?: number) {
  const suffix = next ? `?next=${next}` : "";
  return erFetch<Record<string, unknown>>(`/v1/user/games/${userNum}${suffix}`);
}

export async function fetchUserGamesPage(userNum: number | string, next?: number) {
  const suffix = next ? `?next=${next}` : "";
  return erFetchEnvelope<Record<string, unknown>[]>(`/v1/user/games/${userNum}${suffix}`);
}

export async function fetchUserGamesByUserId(userId: string, next?: number) {
  const suffix = next ? `?next=${next}` : "";
  return erFetch<Record<string, unknown>>(`/v1/user/games/uid/${encodeURIComponent(userId)}${suffix}`);
}

export async function fetchUserGamesPageByUserId(userId: string, next?: number) {
  const suffix = next ? `?next=${next}` : "";
  return erFetchEnvelope<Record<string, unknown>[]>(
    `/v1/user/games/uid/${encodeURIComponent(userId)}${suffix}`
  );
}

export async function fetchUserStats(userNum: number | string, seasonId: number | string) {
  return erFetch<Record<string, unknown>[]>(`/v2/user/stats/${userNum}/${seasonId}/3`);
}

export async function fetchUserStatsByUserId(userId: string, seasonId: number | string) {
  return erFetch<Record<string, unknown>[]>(
    `/v2/user/stats/uid/${encodeURIComponent(userId)}/${seasonId}/3`
  );
}

export async function fetchUserRankByUserId(userId: string, seasonId: number | string) {
  return erFetch<Record<string, unknown>>(
    `/v1/rank/uid/${encodeURIComponent(userId)}/${seasonId}/${RANKED_SQUAD_TEAM_MODE}`
  );
}

export async function fetchGame(gameId: number) {
  return erFetch<Record<string, unknown>>(`/v1/games/${gameId}`);
}

export async function fetchTopRankers(seasonId: string | number, limit = ER_BATCH_LIMIT) {
  const rows = await erFetch<Record<string, unknown>[]>(
    `/v1/rank/top/${seasonId}/${RANKED_SQUAD_TEAM_MODE}`
  );
  return rows
    .filter((row) => Number(row.mmr ?? row.mmrAfter ?? 0) >= MIN_MYTHRIL_MMR)
    .slice(0, limit);
}

export async function fetchGameData(metaType: string, version: "v1" | "v2" = "v1") {
  return erFetch<Record<string, unknown>[]>(`/${version}/data/${metaType}`);
}

export async function fetchKoreanL10n() {
  const payload = await erFetch<Record<string, unknown>>("/v1/l10n/Korean");
  const l10Path = typeof payload.l10Path === "string" ? payload.l10Path : null;
  if (!l10Path) return payload as Record<string, string>;

  const response = await fetch(l10Path, { next: { revalidate: 0 } });
  if (!response.ok) {
    throw new Error(`Eternal Return l10n file failed: ${response.status} ${response.statusText}`);
  }

  return parseL10nText(await response.text());
}

export function parseL10nText(text: string) {
  const rows: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const separator = ["\u2503", "\t", "="].find((candidate) => trimmed.includes(candidate));
    if (!separator) continue;

    const index = trimmed.indexOf(separator);
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + separator.length).trim();
    if (key) rows[key] = value;
  }

  return rows;
}

export function getUserNum(payload: Record<string, unknown>) {
  const value = payload.userNum ?? payload.user_num ?? payload.num;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function getUserId(payload: Record<string, unknown>) {
  const value = payload.uid ?? payload.userId ?? payload.user_id ?? payload.id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getRows(payload: Record<string, unknown>, key: string) {
  const direct = payload[key];
  if (Array.isArray(direct)) return direct as Record<string, unknown>[];
  if (Array.isArray(payload)) return payload as unknown as Record<string, unknown>[];
  return [];
}

export function normalizeGameRows(payload: Record<string, unknown>) {
  return getRows(payload, "userGames").length
    ? getRows(payload, "userGames")
    : getRows(payload, "games");
}

export async function readErJson(response: Pick<Response, "text">) {
  const text = await response.text();
  let parsed: unknown = JSON.parse(text);
  // The user-games endpoint can return a JSON document encoded as a JSON string.
  if (typeof parsed === "string") parsed = JSON.parse(parsed);
  return parsed;
}

let requestQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function scheduledFetch(url: string, key: string) {
  const run = requestQueue.then(async () => {
    const waitMs = Math.max(0, lastRequestAt + ER_REQUEST_DELAY_MS - Date.now());
    if (waitMs) await delay(waitMs);
    lastRequestAt = Date.now();
    return fetch(url, {
      headers: {
        "x-api-key": key,
        accept: "application/json"
      },
      next: { revalidate: 0 }
    });
  });
  requestQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackoffMs(attempt: number) {
  const baseDelay = ER_REQUEST_DELAY_MS * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.2 * baseDelay;
  return baseDelay + jitter;
}
