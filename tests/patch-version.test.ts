import { describe, expect, it } from "vitest";
import { getStoredPatchInfo, getTargetPatchKey, matchesPatch, parsePatchKey, resolveActivePatch } from "@/lib/patch-version";
import type { PatchVersion } from "@/lib/types";

describe("active patch selection", () => {
  const after12_7Maintenance = Date.parse("2026-10-29T02:00:00.000Z");

  it("advances missing or stale deployment settings to the published 12.7 patch", () => {
    expect(getTargetPatchKey("", after12_7Maintenance)).toBe("12.7.0");
    expect(getTargetPatchKey("12.5.0", after12_7Maintenance)).toBe("12.7.0");
    expect(getTargetPatchKey("invalid", after12_7Maintenance)).toBe("12.7.0");
    expect(getTargetPatchKey("12.6", after12_7Maintenance)).toBe("12.7.0");
    expect(getTargetPatchKey("12.7", after12_7Maintenance)).toBe("12.7.0");
    expect(getTargetPatchKey("12.8", after12_7Maintenance)).toBe("12.8.0");
  });

  it("keeps 12.6 statistics until the official 12.7 maintenance starts", () => {
    const beforeMaintenance = after12_7Maintenance - 1;
    expect(getTargetPatchKey("", beforeMaintenance)).toBe("12.6.0");
    expect(getTargetPatchKey("12.5.0", beforeMaintenance)).toBe("12.6.0");
    expect(getTargetPatchKey("invalid", beforeMaintenance)).toBe("12.6.0");
    expect(getTargetPatchKey("", after12_7Maintenance)).toBe("12.7.0");
    // 명시적으로 지정한 새 패치를 우선하는 운영 설정은 유지합니다.
    expect(getTargetPatchKey("12.7", beforeMaintenance)).toBe("12.7.0");
  });

  it("starts 12.7 at October 29 maintenance and rejects previous-patch games", async () => {
    const query: any = {
      select: () => query, eq: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: null, error: null })
    };
    const info = await getStoredPatchInfo({ from: () => query }, 12, 7, 0);
    expect(info?.patch_start_at).toBe("2026-10-29T02:00:00.000Z");
    expect(resolveActivePatch(parsePatchKey(getTargetPatchKey("12.6.0", after12_7Maintenance)), info, patch("12.6.0"))?.patch_key)
      .toBe("12.7.0");
    expect(matchesPatch({ versionSeason: 12, versionMajor: 6, versionMinor: 0 }, info)).toBe(false);
    expect(matchesPatch({ versionSeason: 12, versionMajor: 7, versionMinor: 0 }, info)).toBe(true);
  });

  it("starts 12.6 at October 15 maintenance and selects it before any new match is stored", async () => {
    const query: any = {
      select: () => query, eq: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: null, error: null })
    };
    const info = await getStoredPatchInfo({ from: () => query }, 12, 6, 0);
    expect(info?.patch_start_at).toBe("2026-10-15T02:00:00.000Z");
    expect(resolveActivePatch(parsePatchKey("12.6.0"), info, patch("12.5.0"))?.patch_key)
      .toBe("12.6.0");
    expect(matchesPatch({ versionSeason: 12, versionMajor: 5, versionMinor: 0 }, info)).toBe(false);
    expect(matchesPatch({ versionSeason: 12, versionMajor: 6, versionMinor: 0 }, info)).toBe(true);
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
