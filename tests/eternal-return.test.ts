import { describe, expect, it } from "vitest";
import {
  EternalReturnApiError,
  getUserId,
  getUserNum,
  isNicknameNotFoundError,
  parseL10nText,
  readErJson
} from "@/lib/eternal-return";

describe("eternal return response helpers", () => {
  it("extracts numeric user numbers from legacy responses", () => {
    expect(getUserNum({ userNum: 12345 })).toBe(12345);
    expect(getUserNum({ user_num: "67890" })).toBe(67890);
  });

  it("returns null when only the new opaque user id is present", () => {
    expect(getUserNum({ uid: "opaque-user-id" })).toBeNull();
  });

  it("extracts the new opaque user id", () => {
    expect(getUserId({ uid: "current-api-uid" })).toBe("current-api-uid");
    expect(getUserId({ userId: "opaque-user-id" })).toBe("opaque-user-id");
    expect(getUserId({ user_id: "other-id" })).toBe("other-id");
  });

  it("parses Korean l10n text rows", () => {
    const rows = parseL10nText(
      "Character/Name/1\u2503\uc7ac\ud0a4\nCharacter/Name/6\u2503\ub098\ub518\n"
    );

    expect(rows["Character/Name/1"]).toBe("\uc7ac\ud0a4");
    expect(rows["Character/Name/6"]).toBe("\ub098\ub518");
  });

  it("decodes JSON documents wrapped in a JSON string", async () => {
    const payload = { code: 200, userGames: [{ gameId: 123 }] };
    const response = { text: async () => JSON.stringify(JSON.stringify(payload)) };
    await expect(readErJson(response)).resolves.toEqual(payload);
  });

  it("distinguishes a missing nickname from other API failures", () => {
    expect(
      isNicknameNotFoundError(
        new EternalReturnApiError("/v1/user/nickname?query=missing", 404, "Not Found")
      )
    ).toBe(true);
    expect(
      isNicknameNotFoundError(
        new EternalReturnApiError("/v1/user/games/123", 404, "Not Found")
      )
    ).toBe(false);
    expect(
      isNicknameNotFoundError(
        new EternalReturnApiError("/v1/user/nickname?query=missing", 500, "Server Error")
      )
    ).toBe(false);
  });
});
