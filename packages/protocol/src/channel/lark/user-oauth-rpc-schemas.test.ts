import { describe, expect, it } from "vitest";
import {
  DEFAULT_LARK_USER_OAUTH_REDIRECT_URI,
  LarkUserOAuthCompleteRequestSchema,
  LarkUserOAuthGetStatusResponseSchema,
  LarkUserOAuthStartRequestSchema,
} from "./user-oauth-rpc-schemas.js";

describe("Lark user OAuth RPC schemas", () => {
  it("uses a loopback HTTP callback that the daemon can receive", () => {
    expect(
      LarkUserOAuthStartRequestSchema.parse({
        type: "channel.lark.user_oauth.start.request",
        requestId: "request-1",
        appId: "cli_test",
        redirectUri: DEFAULT_LARK_USER_OAUTH_REDIRECT_URI,
      }),
    ).toMatchObject({
      appId: "cli_test",
      redirectUri: "http://127.0.0.1:6767/oauth/lark",
    });
  });

  it("rejects custom-scheme redirects that Feishu does not support", () => {
    expect(() =>
      LarkUserOAuthStartRequestSchema.parse({
        type: "channel.lark.user_oauth.start.request",
        requestId: "request-1",
        appId: "cli_test",
        redirectUri: "paseo://oauth/lark",
      }),
    ).toThrow("必须使用 HTTP 或 HTTPS");
  });

  it("requires the OAuth state when completing authorization", () => {
    expect(() =>
      LarkUserOAuthCompleteRequestSchema.parse({
        type: "channel.lark.user_oauth.complete.request",
        requestId: "request-1",
        appId: "cli_test",
        codeOrCallbackUrl: "oauth-code",
        state: "",
      }),
    ).toThrow();
  });

  it("never includes access or refresh tokens in the public status response", () => {
    const result = LarkUserOAuthGetStatusResponseSchema.parse({
      type: "channel.lark.user_oauth.get_status.response",
      payload: {
        requestId: "request-1",
        status: {
          appId: "cli_test",
          authorized: true,
          needsAuthorization: false,
          expiresAt: "2026-08-29T04:00:00.000Z",
          refreshTokenExpiresAt: "2026-09-28T04:00:00.000Z",
          openId: "ou_test",
          email: "test@example.com",
          displayName: "张三",
          scope: "offline_access im:chat:read",
        },
        error: null,
      },
    });

    expect(result.payload.status).not.toHaveProperty("userAccessToken");
    expect(result.payload.status).not.toHaveProperty("refreshToken");
  });
});
