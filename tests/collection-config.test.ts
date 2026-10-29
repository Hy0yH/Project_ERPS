import { afterEach, describe, expect, it, vi } from "vitest";
import { getCollectionIntegerEnv } from "@/lib/env";
afterEach(() => vi.unstubAllEnvs());
describe("collector numeric configuration", () => {
  it.each(["-1", "1.5", "1001", "NaN", "Infinity"])("rejects invalid bounded batch configuration: %s", (value) => {
    vi.stubEnv("ER_TEST_BATCH_LIMIT", value);
    expect(() => getCollectionIntegerEnv("ER_TEST_BATCH_LIMIT", 120, 1, 1000)).toThrow("ER_TEST_BATCH_LIMIT");
  });
  it("uses a default only for missing configuration and accepts valid zero retries", () => {
    vi.stubEnv("ER_TEST_BATCH_LIMIT", "");
    expect(getCollectionIntegerEnv("ER_TEST_BATCH_LIMIT", 120, 1, 1000)).toBe(120);
    vi.stubEnv("ER_TEST_BATCH_LIMIT", "0");
    expect(getCollectionIntegerEnv("ER_TEST_BATCH_LIMIT", 2, 0, 10)).toBe(0);
  });
});
