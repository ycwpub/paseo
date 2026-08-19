import { describe, expect, it } from "vitest";
import {
  parseDevelopmentMeegoAuthRequired,
  parseDevelopmentMeegoLoginChallenge,
  parseDevelopmentMeegoLoginStatus,
} from "./development-meego-auth-model";

describe("development Meego auth model", () => {
  it("recognizes an authentication-required workflow result", () => {
    expect(
      parseDevelopmentMeegoAuthRequired({
        data: {
          authRequired: true,
          authProvider: "official",
          authCode: "MEEGLE_AUTH_REQUIRED",
          authMessage: "Meegle CLI authentication is required.",
        },
      }),
    ).toEqual({
      authRequired: true,
      provider: "official",
      code: "MEEGLE_AUTH_REQUIRED",
      message: "Meegle CLI authentication is required.",
    });
  });

  it("parses a login challenge and status", () => {
    expect(
      parseDevelopmentMeegoLoginChallenge({
        data: {
          completeToken: "challenge-token",
          verificationUrl: "https://meego.example.com/device",
          userCode: "ABCD",
          expiresIn: 600,
          pollIntervalSeconds: 2,
        },
      }),
    ).toEqual({
      completeToken: "challenge-token",
      verificationUrl: "https://meego.example.com/device",
      userCode: "ABCD",
      expiresIn: 600,
      pollIntervalSeconds: 2,
    });
    expect(parseDevelopmentMeegoLoginStatus({ data: { loginStatus: "success" } })).toBe("success");
  });
});
