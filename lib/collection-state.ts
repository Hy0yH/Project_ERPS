import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DiscoveryCheckpoint } from "@/lib/ranker-discovery";

export function collectionStatePath() {
  const configured = process.env.ER_COLLECTION_STATE_PATH?.trim();
  return configured === "disabled" || process.env.VERCEL
    ? null
    : path.resolve(/* turbopackIgnore: true */ configured || ".scheduler/collection-state.json");
}

export async function loadCollectionState(file: string | null): Promise<Record<string, DiscoveryCheckpoint>> {
  if (!file) return {};
  try {
    const state = JSON.parse(await readFile(file, "utf8"));
    if (state.version !== 1 || !state.rankers || typeof state.rankers !== "object" || Array.isArray(state.rankers)) {
      throw new Error("Invalid collection checkpoint file");
    }
    return state.rankers;
  } catch (error: any) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function saveCollectionState(file: string | null, rankers: Record<string, DiscoveryCheckpoint>) {
  if (!file) return;
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: 1, rankers }), "utf8");
  await rename(temporary, file);
}
