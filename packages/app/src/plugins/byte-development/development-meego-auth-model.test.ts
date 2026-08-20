import { describe, expect, it } from "vitest";
import {
  parseDevelopmentMeegoActionRequired,
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

  it("recognizes authentication from a failed job with a trailing action-required event", () => {
    const error = new Error(
      "Meego CLI authentication is required.; Run `bytedcli meego login`, then retry.; " +
        '{"event":"action_required","data":{"title":"Action required",' +
        '"message":"Run `bytedcli meego login`, then retry.",' +
        '"code":"MEEGLE_AUTH_REQUIRED"}}',
    );

    expect(parseDevelopmentMeegoActionRequired(error)).toEqual({
      kind: "login",
      code: "MEEGLE_AUTH_REQUIRED",
      message: "需要登录 Meego 后继续操作。",
      urls: [],
    });
    expect(parseDevelopmentMeegoAuthRequired(error)?.authRequired).toBe(true);
  });

  it("returns permission application links instead of raw action-required JSON", () => {
    expect(
      parseDevelopmentMeegoActionRequired(
        new Error(
          'Permission denied; {"event":"action_required","data":{' +
            '"code":"MEEGO_PERMISSION_REQUIRED","message":"请先申请项目权限",' +
            '"permission_apply_urls":["https://meego.example.com/apply/123"]}}',
        ),
      ),
    ).toEqual({
      kind: "permission",
      code: "MEEGO_PERMISSION_REQUIRED",
      message: "请先申请项目权限",
      urls: ["https://meego.example.com/apply/123"],
    });
  });

  it("does not treat ordinary Meego failures as authorization actions", () => {
    expect(parseDevelopmentMeegoActionRequired(new Error("Meego 工作项不存在"))).toBeNull();
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
