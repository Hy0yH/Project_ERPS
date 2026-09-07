import { describe, expect, it } from "vitest";
import { parsePatchKey, resolveActivePatch } from "@/lib/patch-version";
import type { PatchVersion } from "@/lib/types";

describe("active patch selection", () => {
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
