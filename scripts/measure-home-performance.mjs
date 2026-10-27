import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const load = require("./load-project-module.cjs")();
const nativeFetch = globalThis.fetch;
let measurement;
globalThis.fetch = async (input, init) => {
  const response = await nativeFetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(30_000) });
  if (measurement) {
    const table = new URL(typeof input === "string" ? input : input.url ?? input.toString()).pathname.split("/").at(-1);
    measurement.requests++;
    const body = await response.clone().text();
    measurement.bytes += Buffer.byteLength(body);
    if (table === "team_comp_stats" && body) {
      const rows = JSON.parse(body);
      if (Array.isArray(rows) && rows[0]?.comp_key !== undefined) measurement.compRows += rows.length;
    }
  }
  return response;
};

const data = load("lib/data.ts");
async function measure(name, read) {
  measurement = { name, requests: 0, bytes: 0, compRows: 0 };
  const started = performance.now();
  const result = await read();
  const evidence = { ...measurement, durationMs: Math.round(performance.now() - started) };
  measurement = null;
  return { result, evidence };
}

try {
  data.invalidateMetaReads();
  const full = await measure("full-composition-read-cold", () => data.getTeamComps([]));
  data.invalidateMetaReads();
  const top = await measure("homepage-top-five-cold", () => data.getTopTeamComps());
  const warm = await measure("homepage-top-five-warm", () => data.getTopTeamComps());
  // The full reader also returns storage metadata (IDs and timestamps), which
  // the compact homepage query intentionally omits. Compare displayed results.
  const displayed = (rows) => rows.map(({ comp_key, comp_name, tier, games, win_rate, top3_rate, average_rank, confidence_score }) =>
    ({ comp_key, comp_name, tier, games, win_rate, top3_rate, average_rank, confidence_score }));
  const identical = JSON.stringify(displayed(full.result.slice(0, 5))) === JSON.stringify(displayed(top.result));
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), totalCompositions: full.result.length,
    identicalTopFiveAndTiers: identical, measurements: [full.evidence, top.evidence, warm.evidence] }, null, 2));
  if (!identical) process.exitCode = 1;
} finally { globalThis.fetch = nativeFetch; }
