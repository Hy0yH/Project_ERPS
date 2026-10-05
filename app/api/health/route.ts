import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ER_SEASON_ID, ER_BATCH_LIMIT, ER_RANKER_MATCH_LIMIT, ER_COLLECTION_MAX_NEW_MATCHES,
  ER_DISCOVERY_RANKERS_PER_RUN, ER_DISCOVERY_TIME_BUDGET_MINUTES, ER_COLLECTION_TIME_BUDGET_MINUTES,
  ER_REQUEST_DELAY_MS, ER_REQUEST_TIMEOUT_MS, ER_MAX_RETRIES, ER_TARGET_PATCH, MIN_MYTHRIL_MMR
} from "@/lib/env";

export const dynamic = "force-dynamic";

const buildId = (() => {
  try { return readFileSync(path.join(process.cwd(), ".next/BUILD_ID"), "utf8").trim(); }
  catch { return "development"; }
})();

export function GET() {
  return Response.json({ status: "ok", buildId, collectionConfig: {
    ER_SEASON_ID, ER_BATCH_LIMIT, ER_RANKER_MATCH_LIMIT, ER_COLLECTION_MAX_NEW_MATCHES,
    ER_DISCOVERY_RANKERS_PER_RUN, ER_DISCOVERY_TIME_BUDGET_MINUTES, ER_COLLECTION_TIME_BUDGET_MINUTES,
    ER_REQUEST_DELAY_MS, ER_REQUEST_TIMEOUT_MS, ER_MAX_RETRIES, ER_TARGET_PATCH,
    ER_COLLECTION_STATE_PATH: process.env.ER_COLLECTION_STATE_PATH?.trim() || ".scheduler/collection-state.json",
    ER_MIN_MMR: MIN_MYTHRIL_MMR
  } }, { headers: { "Cache-Control": "no-store" } });
}
