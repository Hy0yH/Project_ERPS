import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/recommendations", () => ({ buildRecommendations: vi.fn(async () => []), PlayerNotFoundError: class extends Error {},
  PlayerHistoryUnavailableError: class extends Error {}, InvalidTeammateError: class extends Error {} }));
vi.mock("@/lib/player-analysis-service", () => ({ getOrBuildPlayerAnalysis: vi.fn(), PlayerAnalysisNoMatchesError: class extends Error {},
  PlayerAnalysisNotFoundError: class extends Error {}, PlayerAnalysisUnavailableError: class extends Error {} }));
import { POST as recommend } from "@/app/api/recommendations/route";
import { POST as analyze } from "@/app/api/player/[nickname]/analysis/route";
import { buildRecommendations } from "@/lib/recommendations";
import { getOrBuildPlayerAnalysis } from "@/lib/player-analysis-service";
beforeEach(() => vi.clearAllMocks());
const request = (body: string) => new NextRequest("http://localhost/api/qa", { method: "POST", body, headers: { "content-type": "application/json" } });
describe("feature API boundaries", () => {
  it.each(['{', '{"teammateCharacterCodes":[-1.5, -1.5]}', '{"limit":1.5}', '{"teammates":[{}]}', '{"teammates":[{"weaponCode":11}]}'])
    ("rejects invalid recommendation requests without expensive service work: %s", async (body) => {
      expect((await recommend(request(body))).status).toBe(400); expect(buildRecommendations).not.toHaveBeenCalled();
    });
  it.each(['{', '{"pick":{"characterCode":-1,"weaponCode":15}}', '{"pick":{"characterCode":1.5,"weaponCode":15}}'])
    ("rejects invalid analysis selections before work: %s", async (body) => {
      expect((await analyze(request(body), { params: Promise.resolve({ nickname: "검증" }) })).status).toBe(400);
      expect(getOrBuildPlayerAnalysis).not.toHaveBeenCalled();
    });
});
