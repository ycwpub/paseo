import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LarkChannelStore } from "./lark-channel-store.js";
import { DEFAULT_LARK_USER_OAUTH_REDIRECT_URI } from "@getpaseo/protocol/messages";
import {
  LarkUserAuthorizationRequiredError,
  LarkUserOAuthService,
  type LarkUserOAuthGateway,
} from "./lark-user-oauth-service.js";
import { PASEO_LARK_USER_SCOPES } from "./lark-bot-capability-requirements.js";
import { LarkUserOAuthStore } from "./lark-user-oauth-store.js";

const roots: string[] = [];
const completeScopeGrant = PASEO_LARK_USER_SCOPES.join(" ");

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createHarness(gatewayOverrides: Partial<LarkUserOAuthGateway> = {}) {
  const paseoHome = mkdtempSync(path.join(os.tmpdir(), "paseo-lark-oauth-service-"));
  roots.push(paseoHome);
  const store = new LarkUserOAuthStore({ paseoHome });
  const gateway: LarkUserOAuthGateway = {
    exchangeAuthorizationCode: vi.fn(async () => ({
      accessToken: "u-token",
      refreshToken: "r-token",
      expiresIn: 7200,
      refreshTokenExpiresIn: 2_592_000,
      scope: completeScopeGrant,
    })),
    refreshAccessToken: vi.fn(async () => ({
      accessToken: "u-token-refreshed",
      refreshToken: "r-token-refreshed",
      expiresIn: 7200,
      refreshTokenExpiresIn: 2_592_000,
    })),
    getUserInfo: vi.fn(async () => ({
      openId: "ou_test",
      email: "test@example.com",
      displayName: "张三",
    })),
    ...gatewayOverrides,
  };
  const channelStore = {
    getBots: () => [
      {
        config: {
          enabled: true,
          appId: "cli_test",
          appSecret: "secret",
          domain: "feishu",
        },
      },
    ],
  } as unknown as Pick<LarkChannelStore, "getBots">;
  return {
    gateway,
    service: new LarkUserOAuthService(channelStore, store, gateway),
    store,
  };
}

describe("LarkUserOAuthService", () => {
  it("rejects custom-scheme redirects before creating pending authorization", () => {
    const { service } = createHarness();

    expect(() => service.startAuthorization("cli_test", "paseo://oauth/lark")).toThrow(
      "必须使用 HTTP 或 HTTPS",
    );
  });

  it("exchanges an authorization code and stores refreshable user credentials", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T02:00:00.000Z"));
    const { gateway, service, store } = createHarness();
    const authorization = service.startAuthorization(
      "cli_test",
      DEFAULT_LARK_USER_OAUTH_REDIRECT_URI,
    );
    const url = new URL(authorization.authorizationUrl);
    expect(url.searchParams.get("client_id")).toBe("cli_test");
    expect(url.searchParams.get("response_type")).toBe("code");
    const requestedScopes = url.searchParams.get("scope")?.split(" ") ?? [];
    expect(requestedScopes).toEqual(
      expect.arrayContaining([
        "offline_access",
        "im:chat:create_by_user",
        "im:chat:read",
        "im:chat.members:write_only",
        "im:message.p2p_msg:get_as_user",
        "im:message:readonly",
        "search:message",
        "contact:user:search",
        "wiki:wiki:readonly",
      ]),
    );
    expect(requestedScopes).not.toContain("search:user");
    expect(requestedScopes).not.toContain("im:chat");

    await expect(
      service.completeAuthorization(
        "cli_test",
        `${DEFAULT_LARK_USER_OAUTH_REDIRECT_URI}?code=oauth-code&state=${authorization.state}`,
        authorization.state,
      ),
    ).resolves.toMatchObject({
      authorized: true,
      openId: "ou_test",
      email: "test@example.com",
    });
    expect(gateway.exchangeAuthorizationCode).toHaveBeenCalledWith({
      config: expect.objectContaining({ appId: "cli_test" }),
      code: "oauth-code",
      redirectUri: DEFAULT_LARK_USER_OAUTH_REDIRECT_URI,
    });
    expect(store.get("cli_test")).toMatchObject({
      userAccessToken: "u-token",
      refreshToken: "r-token",
      displayName: "张三",
    });
  });

  it("refreshes an expiring token once for concurrent callers and rotates the refresh token", async () => {
    let releaseRefresh: (() => void) | null = null;
    const waitForRelease = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const refreshAccessToken = vi.fn(async () => {
      await waitForRelease;
      return {
        accessToken: "u-token-new",
        refreshToken: "r-token-new",
        expiresIn: 7200,
        refreshTokenExpiresIn: 2_592_000,
      };
    });
    const { service, store } = createHarness({ refreshAccessToken });
    store.set({
      appId: "cli_test",
      userAccessToken: "u-token-old",
      refreshToken: "r-token-old",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      scope: completeScopeGrant,
      openId: "ou_test",
      email: null,
      displayName: null,
      authorizedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const first = service.getValidUserAccessToken("cli_test");
    const second = service.getValidUserAccessToken("cli_test");
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    releaseRefresh?.();

    await expect(Promise.all([first, second])).resolves.toEqual(["u-token-new", "u-token-new"]);
    expect(store.get("cli_test")).toMatchObject({
      userAccessToken: "u-token-new",
      refreshToken: "r-token-new",
    });
  });

  it("keeps the current refresh token when the refresh response does not rotate it", async () => {
    const { service, store } = createHarness({
      refreshAccessToken: vi.fn(async () => ({
        accessToken: "u-token-new",
        expiresIn: 7200,
      })),
    });
    store.set({
      appId: "cli_test",
      userAccessToken: "u-token-old",
      refreshToken: "r-token-old",
      expiresAt: new Date(Date.now() - 1).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      scope: completeScopeGrant,
      openId: null,
      email: null,
      displayName: null,
      authorizedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await expect(service.getValidUserAccessToken("cli_test")).resolves.toBe("u-token-new");
    expect(store.get("cli_test")?.refreshToken).toBe("r-token-old");
  });

  it("requires reauthorization when a legacy grant lacks private-message search scopes", async () => {
    const { service, store } = createHarness();
    store.set({
      appId: "cli_test",
      userAccessToken: "u-token-old",
      refreshToken: "r-token-old",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      scope:
        "offline_access im:chat:read im:chat.members:write_only im:message.group_msg:get_as_user",
      openId: "ou_test",
      email: "test@example.com",
      displayName: "张三",
      authorizedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(service.getStatus("cli_test")).toMatchObject({
      authorized: false,
      needsAuthorization: true,
    });
    await expect(service.getValidUserAccessToken("cli_test")).rejects.toBeInstanceOf(
      LarkUserAuthorizationRequiredError,
    );
  });

  it("keeps substitute mode authorized when optional directory and Wiki scopes are absent", async () => {
    const { service, store } = createHarness();
    store.set({
      appId: "cli_test",
      userAccessToken: "u-token-current",
      refreshToken: "r-token-current",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      scope:
        "offline_access im:chat:create_by_user im:chat.members:write_only im:chat:read im:message.group_msg:get_as_user im:message.p2p_msg:get_as_user im:message:readonly search:message",
      openId: "ou_test",
      email: "test@example.com",
      displayName: "张三",
      authorizedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(service.getStatus("cli_test")).toMatchObject({
      authorized: true,
      needsAuthorization: false,
      openId: "ou_test",
    });
    await expect(service.getValidUserAccessToken("cli_test")).resolves.toBe("u-token-current");
  });

  it("requires reauthorization when a grant lacks user message read permission", async () => {
    const { service, store } = createHarness();
    store.set({
      appId: "cli_test",
      userAccessToken: "u-token-old",
      refreshToken: "r-token-old",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      scope:
        "offline_access im:chat:read im:chat.members:write_only im:message.group_msg:get_as_user im:message.p2p_msg:get_as_user search:message",
      openId: "ou_test",
      email: "test@example.com",
      displayName: "张三",
      authorizedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(service.getStatus("cli_test")).toMatchObject({
      authorized: false,
      needsAuthorization: true,
    });
    await expect(service.getValidUserAccessToken("cli_test")).rejects.toBeInstanceOf(
      LarkUserAuthorizationRequiredError,
    );
  });

  it("requires reauthorization when a legacy grant lacks relay-chat creation permission", async () => {
    const { service, store } = createHarness();
    store.set({
      appId: "cli_test",
      userAccessToken: "u-token-old",
      refreshToken: "r-token-old",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      scope:
        "offline_access im:chat:read im:chat.members:write_only im:message.group_msg:get_as_user im:message.p2p_msg:get_as_user im:message:readonly search:message",
      openId: "ou_test",
      email: "test@example.com",
      displayName: "张三",
      authorizedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(service.getStatus("cli_test")).toMatchObject({
      authorized: false,
      needsAuthorization: true,
    });
    await expect(service.getValidUserAccessToken("cli_test")).rejects.toBeInstanceOf(
      LarkUserAuthorizationRequiredError,
    );
  });

  it("refreshes a legacy chat lookup grant without requesting unrelated substitute scopes", async () => {
    const refreshAccessToken = vi.fn(async () => ({
      accessToken: "u-token-refreshed",
      expiresIn: 7200,
    }));
    const { service, store } = createHarness({ refreshAccessToken });
    const chatLookupScopes = ["offline_access", "im:chat:read"] as const;
    store.set({
      appId: "cli_test",
      userAccessToken: "u-token-old",
      refreshToken: "r-token-old",
      expiresAt: new Date(Date.now() - 1).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      scope:
        "offline_access im:chat:read im:chat.members:write_only im:message.group_msg:get_as_user",
      openId: "ou_test",
      email: null,
      displayName: "张三",
      authorizedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await expect(service.getValidUserAccessToken("cli_test", chatLookupScopes)).resolves.toBe(
      "u-token-refreshed",
    );
    expect(refreshAccessToken).toHaveBeenCalledWith({
      config: expect.objectContaining({ appId: "cli_test" }),
      refreshToken: "r-token-old",
      scope:
        "offline_access im:chat:read im:chat.members:write_only im:message.group_msg:get_as_user",
    });
    expect(service.getStatus("cli_test")).toMatchObject({
      authorized: false,
      needsAuthorization: true,
    });
  });

  it("verifies an apparently valid grant with the Lark user API", async () => {
    const getUserInfo = vi.fn(async () => ({
      openId: "ou_verified",
      email: "verified@example.com",
      displayName: "已授权用户",
    }));
    const { gateway, service, store } = createHarness({ getUserInfo });
    store.set({
      appId: "cli_test",
      userAccessToken: "u-token-current",
      refreshToken: "r-token-current",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      scope: completeScopeGrant,
      openId: "ou_test",
      email: "test@example.com",
      displayName: "张三",
      authorizedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await expect(service.verifyAuthorization("cli_test")).resolves.toMatchObject({
      authorized: true,
      openId: "ou_verified",
      email: "verified@example.com",
    });
    expect(gateway.getUserInfo).toHaveBeenCalledWith({
      config: expect.objectContaining({ appId: "cli_test" }),
      accessToken: "u-token-current",
    });
  });

  it("clears a rejected grant so a real verification failure requests new authorization", async () => {
    const { service, store } = createHarness({
      getUserInfo: vi.fn(async () => {
        throw new Error("user token rejected");
      }),
    });
    store.set({
      appId: "cli_test",
      userAccessToken: "u-token-current",
      refreshToken: "r-token-current",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      scope: completeScopeGrant,
      openId: "ou_test",
      email: "test@example.com",
      displayName: "张三",
      authorizedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await expect(service.verifyAuthorization("cli_test")).rejects.toBeInstanceOf(
      LarkUserAuthorizationRequiredError,
    );
    expect(store.get("cli_test")).toBeNull();
    expect(service.getStatus("cli_test")).toMatchObject({
      authorized: false,
      needsAuthorization: true,
    });
  });

  it("removes invalid credentials and requires a new authorization when refresh fails", async () => {
    const { service, store } = createHarness({
      refreshAccessToken: vi.fn(async () => {
        throw new Error("refresh denied");
      }),
    });
    store.set({
      appId: "cli_test",
      userAccessToken: "u-token-old",
      refreshToken: "r-token-old",
      expiresAt: new Date(Date.now() - 1).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      scope: completeScopeGrant,
      openId: null,
      email: null,
      displayName: null,
      authorizedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await expect(service.getValidUserAccessToken("cli_test")).rejects.toBeInstanceOf(
      LarkUserAuthorizationRequiredError,
    );
    expect(store.get("cli_test")).toBeNull();
  });

  it("rejects a callback with a mismatched state", async () => {
    const { service } = createHarness();
    const authorization = service.startAuthorization(
      "cli_test",
      DEFAULT_LARK_USER_OAUTH_REDIRECT_URI,
    );
    await expect(
      service.completeAuthorization(
        "cli_test",
        `${DEFAULT_LARK_USER_OAUTH_REDIRECT_URI}?code=oauth-code&state=wrong`,
        authorization.state,
      ),
    ).rejects.toThrow("state 不匹配");
  });

  it("completes authorization directly from the HTTP callback state", async () => {
    const { service } = createHarness();
    const authorization = service.startAuthorization(
      "cli_test",
      DEFAULT_LARK_USER_OAUTH_REDIRECT_URI,
    );

    await expect(
      service.completeAuthorizationCallback("oauth-code", authorization.state),
    ).resolves.toMatchObject({
      authorized: true,
      email: "test@example.com",
    });
  });

  it("restores an in-progress authorization after the daemon restarts", async () => {
    const paseoHome = mkdtempSync(path.join(os.tmpdir(), "paseo-lark-oauth-restart-"));
    roots.push(paseoHome);
    const channelStore = {
      getBots: () => [
        {
          config: {
            enabled: true,
            appId: "cli_test",
            appSecret: "secret",
            domain: "feishu",
          },
        },
      ],
    } as unknown as Pick<LarkChannelStore, "getBots">;
    const gateway: LarkUserOAuthGateway = {
      exchangeAuthorizationCode: vi.fn(async () => ({
        accessToken: "u-token",
        refreshToken: "r-token",
        scope: completeScopeGrant,
      })),
      refreshAccessToken: vi.fn(),
      getUserInfo: vi.fn(async () => ({
        openId: "ou_test",
        email: "test@example.com",
        displayName: "张三",
      })),
    };
    const initialService = new LarkUserOAuthService(
      channelStore,
      new LarkUserOAuthStore({ paseoHome }),
      gateway,
    );
    const authorization = initialService.startAuthorization(
      "cli_test",
      DEFAULT_LARK_USER_OAUTH_REDIRECT_URI,
    );
    const restartedService = new LarkUserOAuthService(
      channelStore,
      new LarkUserOAuthStore({ paseoHome }),
      gateway,
    );

    await expect(
      restartedService.completeAuthorizationCallback("oauth-code", authorization.state),
    ).resolves.toMatchObject({
      authorized: true,
      email: "test@example.com",
    });
  });
});
