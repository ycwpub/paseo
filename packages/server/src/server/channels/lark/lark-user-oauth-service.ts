import { randomUUID } from "node:crypto";
import * as lark from "@larksuiteoapi/node-sdk";
import type { LarkUserOAuthStatus } from "@getpaseo/protocol/messages";
import type { LarkChannelStore, StoredLarkChannelConfig } from "./lark-channel-store.js";
import {
  PASEO_LARK_SUBSTITUTE_USER_SCOPES,
  PASEO_LARK_USER_SCOPES,
} from "./lark-bot-capability-requirements.js";
import { LarkUserOAuthStore, type StoredLarkUserOAuthCredential } from "./lark-user-oauth-store.js";

const ACCESS_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const AUTHORIZATION_STATE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 2 * 60 * 60;
const USER_OAUTH_SCOPE_LIST = PASEO_LARK_USER_SCOPES;
const USER_OAUTH_REQUIRED_SCOPE_LIST = PASEO_LARK_SUBSTITUTE_USER_SCOPES;
const USER_OAUTH_SCOPES = USER_OAUTH_SCOPE_LIST.join(" ");

interface PendingAuthorization {
  appId: string;
  redirectUri: string;
  expiresAt: number;
}

interface OAuthTokenResult {
  accessToken: string;
  expiresIn?: number;
  refreshToken?: string;
  refreshTokenExpiresIn?: number;
  scope?: string;
}

export interface LarkUserOAuthGateway {
  exchangeAuthorizationCode(input: {
    config: StoredLarkChannelConfig;
    code: string;
    redirectUri: string;
  }): Promise<OAuthTokenResult>;
  refreshAccessToken(input: {
    config: StoredLarkChannelConfig;
    refreshToken: string;
    scope?: string;
  }): Promise<OAuthTokenResult>;
  getUserInfo(input: { config: StoredLarkChannelConfig; accessToken: string }): Promise<{
    openId?: string | null;
    email?: string | null;
    displayName?: string | null;
  }>;
}

function createClient(config: StoredLarkChannelConfig): lark.Client {
  if (!config.appId || !config.appSecret) {
    throw new Error("飞书机器人缺少 App ID 或 App Secret");
  }
  return new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    appType: lark.AppType.SelfBuild,
    domain: config.domain === "lark" ? lark.Domain.Lark : lark.Domain.Feishu,
  });
}

const officialGateway: LarkUserOAuthGateway = {
  async exchangeAuthorizationCode({ config, code, redirectUri }) {
    return createClient(config).accessToken.retrieveByAuthorizationCode({
      code,
      redirectUri,
      scope: USER_OAUTH_SCOPES,
    });
  },
  async refreshAccessToken({ config, refreshToken, scope }) {
    return createClient(config).accessToken.refresh({
      refreshToken,
      ...(scope ? { scope } : {}),
    });
  },
  async getUserInfo({ config, accessToken }) {
    const response = await createClient(config).authen.v1.userInfo.get(
      {},
      lark.withUserAccessToken(accessToken),
    );
    if (response.code && response.code !== 0) {
      throw new Error(response.msg || `飞书用户信息接口返回错误码 ${response.code}`);
    }
    return {
      openId: response.data?.open_id ?? null,
      email: response.data?.enterprise_email ?? response.data?.email ?? null,
      displayName: response.data?.name ?? null,
    };
  },
};

function addSeconds(timestamp: number, seconds: number | undefined): string {
  return new Date(
    timestamp + Math.max(1, seconds ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS) * 1000,
  ).toISOString();
}

function hasRequiredScopes(
  scope: string | null | undefined,
  requiredScopes: readonly string[] = USER_OAUTH_REQUIRED_SCOPE_LIST,
): boolean {
  const grantedScopes = new Set(scope?.split(/\s+/u).filter(Boolean) ?? []);
  return requiredScopes.every((requiredScope) => grantedScopes.has(requiredScope));
}

function parseCodeAndState(codeOrCallbackUrl: string): {
  code: string;
  callbackState: string | null;
} {
  const trimmed = codeOrCallbackUrl.trim();
  try {
    const url = new URL(trimmed);
    return {
      code: url.searchParams.get("code")?.trim() ?? "",
      callbackState: url.searchParams.get("state")?.trim() ?? null,
    };
  } catch {
    return { code: trimmed, callbackState: null };
  }
}

export class LarkUserAuthorizationRequiredError extends Error {
  readonly code = "lark_user_authorization_required";

  constructor(appId: string, options?: ErrorOptions) {
    super(`飞书用户身份未授权或已失效，请先为 App ID ${appId} 完成 OAuth 授权`, options);
  }
}

export class LarkUserOAuthService {
  private readonly pending = new Map<string, PendingAuthorization>();
  private readonly refreshes = new Map<string, Promise<string>>();

  constructor(
    private readonly channelStore: Pick<LarkChannelStore, "getBots">,
    private readonly store: LarkUserOAuthStore,
    private readonly gateway: LarkUserOAuthGateway = officialGateway,
  ) {}

  getStatus(appId: string): LarkUserOAuthStatus {
    const normalizedAppId = appId.trim();
    const credential = this.store.get(normalizedAppId);
    const refreshExpired =
      credential?.refreshTokenExpiresAt != null &&
      Date.parse(credential.refreshTokenExpiresAt) <= Date.now();
    const missingRequiredScopes = credential ? !hasRequiredScopes(credential.scope) : true;
    return {
      appId: normalizedAppId,
      authorized: Boolean(credential && !refreshExpired && !missingRequiredScopes),
      needsAuthorization: !credential || refreshExpired || missingRequiredScopes,
      expiresAt: credential?.expiresAt ?? null,
      refreshTokenExpiresAt: credential?.refreshTokenExpiresAt ?? null,
      openId: credential?.openId ?? null,
      email: credential?.email ?? null,
      displayName: credential?.displayName ?? null,
      scope: credential?.scope ?? null,
    };
  }

  startAuthorization(
    appId: string,
    redirectUri: string,
  ): {
    authorizationUrl: string;
    state: string;
  } {
    const config = this.requireConfig(appId);
    const parsedRedirectUri = new URL(redirectUri.trim());
    if (!["http:", "https:"].includes(parsedRedirectUri.protocol)) {
      throw new Error("飞书 OAuth 回调地址必须使用 HTTP 或 HTTPS");
    }
    const normalizedRedirectUri = parsedRedirectUri.toString();
    const state = randomUUID();
    this.pending.set(state, {
      appId: appId.trim(),
      redirectUri: normalizedRedirectUri,
      expiresAt: Date.now() + AUTHORIZATION_STATE_TTL_MS,
    });
    const authorizationUrl = new URL(
      config.domain === "lark"
        ? "https://accounts.larksuite.com/open-apis/authen/v1/authorize"
        : "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
    );
    authorizationUrl.searchParams.set("client_id", appId.trim());
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("redirect_uri", normalizedRedirectUri);
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("scope", USER_OAUTH_SCOPES);
    return { authorizationUrl: authorizationUrl.toString(), state };
  }

  async completeAuthorization(
    appId: string,
    codeOrCallbackUrl: string,
    state: string,
  ): Promise<LarkUserOAuthStatus> {
    const normalizedAppId = appId.trim();
    const pending = this.pending.get(state);
    if (!pending || pending.appId !== normalizedAppId || pending.expiresAt <= Date.now()) {
      this.pending.delete(state);
      throw new Error("飞书 OAuth 授权状态无效或已过期，请重新发起授权");
    }
    const { code, callbackState } = parseCodeAndState(codeOrCallbackUrl);
    if (!code) throw new Error("授权回调中缺少 code");
    if (callbackState && callbackState !== state) {
      throw new Error("飞书 OAuth 回调 state 不匹配");
    }
    this.pending.delete(state);

    const config = this.requireConfig(normalizedAppId);
    const token = await this.gateway.exchangeAuthorizationCode({
      config,
      code,
      redirectUri: pending.redirectUri,
    });
    if (!token.accessToken || !token.refreshToken) {
      throw new Error("飞书 OAuth 未返回 access token 或 refresh token");
    }
    const now = Date.now();
    const user = await this.gateway.getUserInfo({
      config,
      accessToken: token.accessToken,
    });
    this.store.set({
      appId: normalizedAppId,
      userAccessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: addSeconds(now, token.expiresIn),
      refreshTokenExpiresAt: token.refreshTokenExpiresIn
        ? addSeconds(now, token.refreshTokenExpiresIn)
        : null,
      scope: token.scope ?? USER_OAUTH_SCOPES,
      openId: user.openId?.trim() || null,
      email: user.email?.trim() || null,
      displayName: user.displayName?.trim() || null,
      authorizedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
    return this.getStatus(normalizedAppId);
  }

  async completeAuthorizationCallback(
    codeOrCallbackUrl: string,
    state: string,
  ): Promise<LarkUserOAuthStatus> {
    const pending = this.pending.get(state);
    if (!pending || pending.expiresAt <= Date.now()) {
      this.pending.delete(state);
      throw new Error("飞书 OAuth 授权状态无效或已过期，请重新发起授权");
    }
    return this.completeAuthorization(pending.appId, codeOrCallbackUrl, state);
  }

  discardAuthorization(state: string): void {
    this.pending.delete(state);
  }

  disconnect(appId: string): LarkUserOAuthStatus {
    const normalizedAppId = appId.trim();
    this.store.delete(normalizedAppId);
    return this.getStatus(normalizedAppId);
  }

  async getValidUserAccessToken(
    appId: string,
    requiredScopes: readonly string[] = USER_OAUTH_REQUIRED_SCOPE_LIST,
  ): Promise<string> {
    const normalizedAppId = appId.trim();
    const credential = this.store.get(normalizedAppId);
    if (!credential) throw new LarkUserAuthorizationRequiredError(normalizedAppId);
    if (!hasRequiredScopes(credential.scope, requiredScopes)) {
      throw new LarkUserAuthorizationRequiredError(normalizedAppId);
    }
    if (Date.parse(credential.expiresAt) > Date.now() + ACCESS_TOKEN_REFRESH_WINDOW_MS) {
      return credential.userAccessToken;
    }
    const existing = this.refreshes.get(normalizedAppId);
    if (existing) return existing;
    const refresh = this.refreshCredential(credential, requiredScopes).finally(() => {
      this.refreshes.delete(normalizedAppId);
    });
    this.refreshes.set(normalizedAppId, refresh);
    return refresh;
  }

  private async refreshCredential(
    credential: StoredLarkUserOAuthCredential,
    requiredScopes: readonly string[],
  ): Promise<string> {
    if (
      credential.refreshTokenExpiresAt &&
      Date.parse(credential.refreshTokenExpiresAt) <= Date.now()
    ) {
      this.store.delete(credential.appId);
      throw new LarkUserAuthorizationRequiredError(credential.appId);
    }
    try {
      const now = Date.now();
      const token = await this.gateway.refreshAccessToken({
        config: this.requireConfig(credential.appId),
        refreshToken: credential.refreshToken,
        scope: credential.scope?.trim() || undefined,
      });
      if (!token.accessToken) {
        throw new Error("飞书刷新接口未返回新的 access token");
      }
      const refreshedScope = token.scope ?? credential.scope;
      if (!hasRequiredScopes(refreshedScope, requiredScopes)) {
        throw new Error("飞书刷新后的用户授权缺少当前操作所需权限");
      }
      this.store.set({
        ...credential,
        userAccessToken: token.accessToken,
        refreshToken: token.refreshToken ?? credential.refreshToken,
        expiresAt: addSeconds(now, token.expiresIn),
        refreshTokenExpiresAt: token.refreshTokenExpiresIn
          ? addSeconds(now, token.refreshTokenExpiresIn)
          : credential.refreshTokenExpiresAt,
        scope: refreshedScope,
        updatedAt: new Date(now).toISOString(),
      });
      return token.accessToken;
    } catch (error) {
      this.store.delete(credential.appId);
      throw new LarkUserAuthorizationRequiredError(credential.appId, { cause: error });
    }
  }

  private requireConfig(appId: string): StoredLarkChannelConfig {
    const normalizedAppId = appId.trim();
    const bot = this.channelStore
      .getBots()
      .find((entry) => entry.config.appId?.trim() === normalizedAppId);
    if (!bot) throw new Error(`未配置飞书机器人 App ID：${normalizedAppId}`);
    if (!bot.config.appSecret?.trim()) {
      throw new Error(`飞书机器人 App Secret 未配置：${normalizedAppId}`);
    }
    return bot.config;
  }
}
