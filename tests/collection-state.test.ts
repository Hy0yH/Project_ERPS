import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { loadCollectionState, saveCollectionState } from "@/lib/collection-state";

describe("local discovery checkpoints", () => {
  const file = path.join(tmpdir(), `erps-checkpoint-${randomUUID()}.json`);
  afterEach(async () => { await unlink(file).catch(() => {}); });

  it("persists the pending page and high-water boundary across collector restarts", async () => {
    const rankers = { player: {
      patchKey: "12.5.0", nextGameId: 100, boundaryGameId: 50, newestGameId: 200, backfillComplete: false
    } };
    expect(await loadCollectionState(file)).toEqual({});
    await saveCollectionState(file, rankers);
    expect(await loadCollectionState(file)).toEqual(rankers);
  });

  it("fails visibly rather than silently losing a corrupted checkpoint", async () => {
    await writeFile(file, JSON.stringify({ version: 2, rankers: {} }));
    await expect(loadCollectionState(file)).rejects.toThrow("Invalid collection checkpoint file");
  });
});
