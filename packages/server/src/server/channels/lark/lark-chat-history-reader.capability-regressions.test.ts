import { describe, expect, test, vi } from "vitest";
import type { LarkChannelClientAdapter } from "./lark-client-adapter.js";
import { readLarkChatHistoryWithIdentityFallback } from "./lark-chat-history-reader.js";
import type { StoredLarkChannelConfig } from "./lark-channel-store.js";
import type { LarkUserOAuthService } from "./lark-user-oauth-service.js";

const config = {
  appId: "cli_test",
  appSecret: "secret",
  domain: "feishu",
} as StoredLarkChannelConfig;

function outsideChatError(): Error {
  return new Error("Lark API error: Bot/User can NOT be out of the chat. (code: 230002)");
}

describe("Lark chat history identity fallback", () => {
  test("falls back to the Paseo-managed user OAuth identity when the bot is outside the group", async () => {
    const listChatMessages = vi.fn(async () => {
      throw outsideChatError();
    });
    const listChatMessagesAsUser = vi.fn(async () => [{ message_id: "om_1" }]);
    const getValidUserAccessToken = vi.fn(async () => "user-token");

    await expect(
      readLarkChatHistoryWithIdentityFallback({
        adapter: {
          listChatMessages,
          listChatMessagesAsUser,
        } as Pick<LarkChannelClientAdapter, "listChatMessages" | "listChatMessagesAsUser">,
        config,
        chatId: "oc_alerts",
        options: { startTime: 1_788_860_000, pageSize: 0 },
        userOAuthService: {
          getValidUserAccessToken,
        } as Pick<LarkUserOAuthService, "getValidUserAccessToken">,
      }),
    ).resolves.toEqual([{ message_id: "om_1" }]);

    expect(getValidUserAccessToken).toHaveBeenCalledWith("cli_test", [
      "im:message.group_msg:get_as_user",
    ]);
    expect(listChatMessagesAsUser).toHaveBeenCalledWith(
      config,
      "oc_alerts",
      { startTime: 1_788_860_000, pageSize: 0 },
      "user-token",
    );
  });

  test("does not change identity for unrelated Lark failures", async () => {
    const permissionError = new Error("Lark API error: forbidden (code: 99991679)");
    const listChatMessagesAsUser = vi.fn(async () => []);

    await expect(
      readLarkChatHistoryWithIdentityFallback({
        adapter: {
          listChatMessages: vi.fn(async () => {
            throw permissionError;
          }),
          listChatMessagesAsUser,
        } as Pick<LarkChannelClientAdapter, "listChatMessages" | "listChatMessagesAsUser">,
        config,
        chatId: "oc_alerts",
        userOAuthService: {
          getValidUserAccessToken: vi.fn(async () => "user-token"),
        } as Pick<LarkUserOAuthService, "getValidUserAccessToken">,
      }),
    ).rejects.toBe(permissionError);

    expect(listChatMessagesAsUser).not.toHaveBeenCalled();
  });

  test("returns an actionable task error when neither identity can read the group", async () => {
    await expect(
      readLarkChatHistoryWithIdentityFallback({
        adapter: {
          listChatMessages: vi.fn(async () => {
            throw outsideChatError();
          }),
          listChatMessagesAsUser: vi.fn(async () => {
            throw new Error("OAuth grant expired");
          }),
        } as Pick<LarkChannelClientAdapter, "listChatMessages" | "listChatMessagesAsUser">,
        config,
        chatId: "oc_alerts",
        userOAuthService: {
          getValidUserAccessToken: vi.fn(async () => {
            throw new Error("OAuth grant expired");
          }),
        } as Pick<LarkUserOAuthService, "getValidUserAccessToken">,
      }),
    ).rejects.toThrow(
      "机器人不在目标群内（code: 230002）。用户身份回退也失败：Lark API error: OAuth grant expired。请将机器人加入目标群，或为 App ID cli_test 完成包含 im:message.group_msg:get_as_user 的用户 OAuth 授权后重试。",
    );
  });
});
