import { describe, expect, it } from "vitest";
import { getStoredPatchInfo, getTargetPatchKey, matchesPatch, parsePatchKey, resolveActivePatch } from "@/lib/patch-version";
import type { PatchVersion } from "@/lib/types";

describe("active patch selection", () => {
  it("advances missing or stale deployment settings to the published 12.5 patch", () => {
    expect(getTargetPatchKey("")).toBe("12.5.0");
    expect(getTargetPatchKey("12.4.0")).toBe("12.5.0");
    expect(getTargetPatchKey("invalid")).toBe("12.5.0");
    expect(getTargetPatchKey("12.6")).toBe("12.6.0");
  });

  it("includes 12.5 games from October 1 even when the first stored match arrives later", async () => {
    const query: any = {
      select: () => query, eq: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: { started_at: "2026-10-04T09:00:00Z" }, error: null })
    };
    const info = await getStoredPatchInfo({ from: () => query }, 12, 5, 0);
    expect(info?.patch_start_at).toBe("2026-10-01T02:00:00.000Z");
    expect(info?.latest_match_at).toBe("2026-10-04T09:00:00Z");
    expect(matchesPatch({ versionSeason: 12, versionMajor: 4, versionMinor: 0 }, info)).toBe(false);
    expect(matchesPatch({ versionSeason: 12, versionMajor: 5, versionMinor: 0 }, info)).toBe(true);
  });

  it("starts 12.4 collection before its first stored match and rejects old games", async () => {
    const query: any = {
      select: () => query, eq: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: null, error: null })
    };
    const info = await getStoredPatchInfo({ from: () => query }, 12, 4, 0);
    expect(info?.patch_start_at).toBe("2026-09-17T02:00:00.000Z");
    expect(resolveActivePatch(parsePatchKey("12.4.0"), info, patch("12.3.0"))?.patch_key).toBe("12.4.0");
    expect(matchesPatch({ versionSeason: 12, versionMajor: 3, versionMinor: 0 }, info)).toBe(false);
    expect(matchesPatch({ versionSeason: 12, versionMajor: 4, versionMinor: 0 }, info)).toBe(true);
  });

  it("uses the latest stored patch when the configured patch is stale", () => {
    expect(resolveActivePatch(
      parsePatchKey("12.2.0"),
      patch("12.2.0"),
      patch("12.3.0")
    )?.patch_key).toBe("12.3.0");
  });

  it("keeps an intentionally configured patch when it is current or newer", () => {
    expect(resolveActivePatch(
      parsePatchKey("12.3.0"),
      patch("12.3.0"),
      patch("12.2.0")
    )?.patch_key).toBe("12.3.0");
  });

  it("uses automatic latest-patch selection when no target is configured", () => {
    expect(resolveActivePatch(null, null, patch("12.3.0"))?.patch_key).toBe("12.3.0");
  });
});

function patch(key: string): PatchVersion {
  const [versionSeason, versionMajor, versionMinor] = key.split(".").map(Number);
  return {
    patch_key: key,
    version_season: versionSeason,
    version_major: versionMajor,
    version_minor: versionMinor,
    patch_start_at: "2026-09-01T00:00:00.000Z",
    latest_match_at: "2026-09-07T00:00:00.000Z"
  };
}
