import { ER_BATCH_LIMIT, MIN_MYTHRIL_MMR } from "@/lib/env";

const ER_API_BASE = "https://open-api.bser.io";
const RANKED_SQUAD_TEAM_MODE = 3;

type ErEnvelope<T> = {
  code?: number;
  message?: string;
  user?: T;
  userGames?: T;
  game?: T;
  topRanks?: T;
  data?: T;
  l10n?: T;
};

async function erFetch<T>(path: string): Promise<T> {
  const key = process.env.ETERNAL_RETURN_API_KEY;
  if (!key) throw new Error("ETERNAL_RETURN_API_KEY is required");

  const response = await fetch(`${ER_API_BASE}${path}`, {
    headers: {
      "x-api-key": key,
      accept: "application/json"
    },
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    throw new Error(`Eternal Return API failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as ErEnvelope<T> | T;
  if (typeof json === "object" && json && "code" in json && json.code !== 200) {
    throw new Error(`Eternal Return API error: ${json.message ?? json.code}`);
  }
  return unwrapEnvelope(json);
}

function unwrapEnvelope<T>(json: ErEnvelope<T> | T): T {
  if (!json || typeof json !== "object") return json as T;
  const envelope = json as ErEnvelope<T>;
  return (envelope.user ??
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

export async function fetchUserGames(userNum: number, next?: number) {
  const suffix = next ? `?next=${next}` : "";
  return erFetch<Record<string, unknown>>(`/v1/user/games/${userNum}${suffix}`);
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

export async function fetchGameData(metaType: string) {
  return erFetch<Record<string, unknown>[]>(`/v1/data/${metaType}`);
}

export async function fetchKoreanL10n() {
  return erFetch<Record<string, string>>("/v1/l10n/Korean");
}

export function getUserNum(payload: Record<string, unknown>) {
  return Number(payload.userNum ?? payload.user_num ?? payload.num);
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
