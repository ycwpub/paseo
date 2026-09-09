import * as lark from "@larksuiteoapi/node-sdk";
import type { StoredLarkChannelConfig } from "../channels/lark/lark-channel-store.js";
import {
  describeLarkApiError,
  isLarkRateLimitError,
  larkApiResultError,
} from "../channels/lark/lark-api-request.js";
import { LarkUserAuthorizationRequiredError } from "../channels/lark/lark-user-oauth-service.js";
import {
  PASEO_LARK_ALERT_TROUBLESHOOTER_TENANT_SCOPES,
  PASEO_LARK_ALERT_TROUBLESHOOTER_USER_SCOPES,
} from "../channels/lark/lark-bot-capability-requirements.js";
import { larkClientTokenCache } from "../channels/lark/lark-client-token-cache.js";

export const ALERT_TROUBLESHOOTER_LARK_USER_SCOPES = PASEO_LARK_ALERT_TROUBLESHOOTER_USER_SCOPES;

const DEFAULT_RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS = 3;
const TRANSIENT_NETWORK_ERROR = /\b(?:EAI_AGAIN|ECONNRESET|ENETUNREACH|ENOTFOUND|ETIMEDOUT)\b/iu;

interface LarkResult {
  code?: number;
  msg?: string;
}
type LarkRequestIdentity = "bot" | "user";

interface LarkRequestContext {
  identity: LarkRequestIdentity;
  requiredScopes: readonly string[];
}

const REQUIRED_SCOPES_PATTERN = /(?:required|权限)[^[]*\[([^\]]+)\]/iu;

export interface LarkAlertTroubleshooterApi {
  client: lark.Client;
  request<T extends LarkResult>(
    operation: () => Promise<T>,
    context: LarkRequestContext,
  ): Promise<T>;
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
    cache: larkClientTokenCache,
  });
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function requiredScopesFromError(message: string, fallback: readonly string[]): readonly string[] {
  const match = REQUIRED_SCOPES_PATTERN.exec(message);
  const parsed = match?.[1]
    ?.split(",")
    .map((scope) => scope.trim())
    .filter((scope) => /^[a-z][a-z0-9_.:-]*$/iu.test(scope));
  return parsed && parsed.length > 0 ? parsed : fallback;
}

function permissionError(
  code: number | null,
  message: string,
  context: LarkRequestContext,
): Error | null {
  const requiredScopes = requiredScopesFromError(message, context.requiredScopes);
  const requiredScopeText = requiredScopes.join("、");
  if (code === 99991672) {
    if (context.identity === "bot") {
      return new Error(
        `飞书机器人应用身份权限不足，请更新机器人权限（缺少 ${requiredScopeText}；错误码 99991672）。请开通后重新执行任务。`,
      );
    }
    return new Error(
      `飞书用户身份权限不足，请重新完成 OAuth 授权（缺少 ${requiredScopeText}；错误码 99991672）。请授权后重新执行任务。`,
    );
  }
  if (code === 99991679) {
    if (context.identity === "bot") {
      return new Error(
        `飞书机器人应用身份权限不足，请更新机器人权限（缺少 ${requiredScopeText}；code: 99991679）`,
      );
    }
    return new Error(`飞书用户身份权限不足，请重新完成 OAuth 授权（缺少 ${requiredScopeText}）`);
  }
  if (code === 131006) {
    if (context.identity === "bot") {
      return new Error(
        `当前飞书机器人无法写入归因记录根目录或日报多维表格，请将机器人加入对应知识空间并开通 ${context.requiredScopes.join("、")}（code: 131006）`,
      );
    }
    return new Error(
      "当前授权用户无法读取归因记录根目录，请确认该目录对授权用户可见且 OAuth 已包含 wiki:wiki:readonly（code: 131006）",
    );
  }
  if (/permission denied|forbidden/iu.test(message)) {
    return context.identity === "bot"
      ? new Error(`飞书机器人访问归因记录被拒绝：${message}`)
      : new Error(`飞书授权用户访问归因记录被拒绝：${message}`);
  }
  return null;
}

function finalError(error: unknown, attempts: number, context: LarkRequestContext): Error {
  if (error instanceof LarkUserAuthorizationRequiredError) {
    return new Error(
      `飞书用户身份未授权或已失效，请重新完成 OAuth 授权（缺少 ${ALERT_TROUBLESHOOTER_LARK_USER_SCOPES.join("、")}）`,
    );
  }
  const described = describeLarkApiError(error);
  const permission = permissionError(described.code, described.message, context);
  if (permission) return permission;
  const networkCode = TRANSIENT_NETWORK_ERROR.exec(described.message)?.[0];
  if (networkCode) {
    return new Error(`飞书网络连接失败，已自动重试 ${attempts} 次（${networkCode}），请稍后重试`);
  }
  return described;
}

async function requestWithRetry<T extends LarkResult>(
  operation: () => Promise<T>,
  options: {
    context?: LarkRequestContext;
    maxAttempts?: number;
    wait?: (delayMs: number) => Promise<void>;
  } = {},
): Promise<T> {
  const context = options.context ?? {
    identity: "bot",
    requiredScopes: PASEO_LARK_ALERT_TROUBLESHOOTER_TENANT_SCOPES,
  };
  const maxAttempts = Math.max(1, options.maxAttempts ?? MAX_ATTEMPTS);
  const wait = options.wait ?? sleep;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await operation();
      const resultError = larkApiResultError(result);
      if (resultError) throw resultError;
      return result;
    } catch (error) {
      const described = describeLarkApiError(error);
      const retryable =
        isLarkRateLimitError(described) || TRANSIENT_NETWORK_ERROR.test(described.message);
      if (!retryable || attempt >= maxAttempts) throw finalError(described, attempt, context);
      const delayMs =
        described.retryAfterMs ?? DEFAULT_RETRY_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1));
      await wait(delayMs);
    }
  }
  throw new Error("飞书归因记录请求进入了不可达状态");
}

export async function createLarkAlertTroubleshooterApi(input: {
  config: StoredLarkChannelConfig;
}): Promise<LarkAlertTroubleshooterApi> {
  const appId = input.config.appId?.trim();
  if (!appId) throw new Error("飞书机器人缺少 App ID");
  return {
    client: createClient(input.config),
    request: (operation, context) => requestWithRetry(operation, { context }),
  };
}

export const testableLarkAlertTroubleshooterApi = {
  requiredScopesFromError,
  requestWithRetry,
};
