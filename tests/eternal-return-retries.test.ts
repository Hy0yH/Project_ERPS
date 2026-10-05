import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Eternal Return request recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv("ETERNAL_RETURN_API_KEY", "test-key");
    vi.stubEnv("ER_REQUEST_DELAY_MS", "10");
    vi.stubEnv("ER_REQUEST_TIMEOUT_MS", "30000");
    vi.stubEnv("ER_MAX_RETRIES", "2");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([403, 429, 503])("recovers from HTTP %s with a bounded retry", async (status) => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("", { status }))
      .mockResolvedValueOnce(Response.json({ code: 200, game: { gameId: 1 } }));
    vi.stubGlobal("fetch", fetch);
    const { fetchGame } = await import("@/lib/eternal-return");
    const started = Date.now();
    const result = fetchGame(1);
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ gameId: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(10);
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("retries a network failure and an API-envelope rate limit", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(Response.json({ code: 403, message: "Rate limited" }))
      .mockResolvedValueOnce(Response.json({ code: 200, game: { gameId: 2 } }));
    vi.stubGlobal("fetch", fetch);
    const { fetchGame } = await import("@/lib/eternal-return");
    const result = fetchGame(2);
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ gameId: 2 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a missing game", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    const { fetchGame } = await import("@/lib/eternal-return");
    await expect(fetchGame(3)).rejects.toMatchObject({ status: 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After for concurrent requests as well as the failing request", async () => {
    const calls: number[] = [];
    const fetch = vi.fn().mockImplementation(async () => {
      calls.push(Date.now());
      return calls.length === 1
        ? new Response("", { status: 429, headers: { "Retry-After": "1" } })
        : Response.json({ code: 200, game: { gameId: 4 } });
    });
    vi.stubGlobal("fetch", fetch);
    const { fetchGame } = await import("@/lib/eternal-return");
    const results = Promise.all([fetchGame(4), fetchGame(5)]);
    await vi.runAllTimersAsync();
    await results;
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(1000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("parses seconds and HTTP dates without treating missing headers as zero delay", async () => {
    const { retryAfterMs } = await import("@/lib/eternal-return");
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs("invalid")).toBeNull();
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs("Thu, 01 Oct 2026 02:00:02 GMT", Date.parse("2026-10-01T02:00:00Z"))).toBe(2000);
  });
});
