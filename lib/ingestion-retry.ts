import { EternalReturnApiError } from "@/lib/eternal-return";

export function queueFailure(error: unknown, attempts: number, now = Date.now()) {
  const permanent = error instanceof EternalReturnApiError &&
    [400, 401, 404, 410, 422].includes(error.status);
  const code = error instanceof EternalReturnApiError ? `ER_HTTP_${error.status}` : "MATCH_DETAIL_FAILED";
  // Transient failures remain eligible after cooldown, including attempts >= 4.
  const delay = Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.min(12, Math.max(0, attempts - 1)));
  return {
    status: permanent ? "dead_letter" : "failed",
    next_retry_at: new Date(now + delay).toISOString(),
    last_error: code,
    updated_at: new Date(now).toISOString()
  };
}
