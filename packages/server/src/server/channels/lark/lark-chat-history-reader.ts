import type {
  LarkChannelClientAdapter,
  LarkChatMessageListOptions,
} from "./lark-client-adapter.js";
import type { StoredLarkChannelConfig } from "./lark-channel-store.js";
import { describeLarkApiError } from "./lark-api-request.js";
import type { LarkUserOAuthService } from "./lark-user-oauth-service.js";

const LARK_IDENTITY_OUTSIDE_CHAT_CODE = 230002;
const LARK_GROUP_MESSAGE_USER_SCOPE = "im:message.group_msg:get_as_user";

export interface LarkChatHistoryReaderInput {
  adapter: Pick<LarkChannelClientAdapter, "listChatMessages" | "listChatMessagesAsUser">;
  config: StoredLarkChannelConfig;
  chatId: string;
  options?: LarkChatMessageListOptions;
  userOAuthService: Pick<LarkUserOAuthService, "getValidUserAccessToken"> | null;
}

function isIdentityOutsideChatError(error: unknown): boolean {
  const described = describeLarkApiError(error);
  return (
    described.code === LARK_IDENTITY_OUTSIDE_CHAT_CODE ||
    described.message.includes("Bot/User can NOT be out of the chat")
  );
}

function buildIdentityRecoveryError(input: {
  appId: string | null;
  reason: "oauth_unavailable" | "user_reader_unavailable" | "user_read_failed";
  cause: unknown;
}): Error {
  const appIdentity = input.appId ? ` App ID ${input.appId}` : "当前机器人";
  const fallbackDetail =
    input.reason === "user_read_failed"
      ? `用户身份回退也失败：${describeLarkApiError(input.cause).message}。`
      : "";
  const recovery =
    input.reason === "user_reader_unavailable"
      ? "当前飞书连接不支持用户身份读取群消息，请升级 Host 后重试。"
      : `请将机器人加入目标群，或为${appIdentity} 完成包含 ${LARK_GROUP_MESSAGE_USER_SCOPE} 的用户 OAuth 授权后重试。`;
  return new Error(
    `飞书群消息扫描失败：机器人不在目标群内（code: ${LARK_IDENTITY_OUTSIDE_CHAT_CODE}）。${fallbackDetail}${recovery}`,
    { cause: input.cause },
  );
}

export async function readLarkChatHistoryWithIdentityFallback(
  input: LarkChatHistoryReaderInput,
): Promise<unknown[]> {
  if (!input.adapter.listChatMessages) {
    throw new Error("当前飞书连接不支持读取群历史消息");
  }
  try {
    return await input.adapter.listChatMessages(input.config, input.chatId, input.options);
  } catch (error) {
    if (!isIdentityOutsideChatError(error)) throw error;
    const appId = input.config.appId?.trim() || null;
    if (!appId || !input.userOAuthService) {
      throw buildIdentityRecoveryError({
        appId,
        reason: "oauth_unavailable",
        cause: error,
      });
    }
    if (!input.adapter.listChatMessagesAsUser) {
      throw buildIdentityRecoveryError({
        appId,
        reason: "user_reader_unavailable",
        cause: error,
      });
    }
    try {
      const userAccessToken = await input.userOAuthService.getValidUserAccessToken(appId, [
        LARK_GROUP_MESSAGE_USER_SCOPE,
      ]);
      return await input.adapter.listChatMessagesAsUser(
        input.config,
        input.chatId,
        input.options,
        userAccessToken,
      );
    } catch (fallbackError) {
      throw buildIdentityRecoveryError({
        appId,
        reason: "user_read_failed",
        cause: fallbackError,
      });
    }
  }
}
