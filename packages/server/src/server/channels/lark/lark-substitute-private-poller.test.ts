import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LarkSubstituteMode } from "@getpaseo/protocol/messages";
import type { LarkChannelClientAdapter } from "./lark-client-adapter.js";
import type { LarkChannelStore } from "./lark-channel-store.js";
import { LarkSubstitutePrivatePoller } from "./lark-substitute-private-poller.js";
import type { LarkUserOAuthService } from "./lark-user-oauth-service.js";

function mode(overrides: Partial<LarkSubstituteMode> = {}): LarkSubstituteMode {
  return {
    id: "mode-1",
    name: "工作替身",
    enabled: true,
    botId: "bot-1",
    privateScan: {
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 60,
      excludeRecentMinutes: 20,
    },
    disclosure: { enabled: true, prompt: "【机器人代答】" },
    customPrompt: "仅回答工作相关问题",
    delaySeconds: 60,
    activeTimeRanges: [],
    allowlist: [
      {
        id: "allow-peer",
        type: "user",
        openId: "ou_peer",
        name: "咨询用户",
        email: null,
      },
    ],
    denylist: [],
    target: {
      kind: "workspace",
      provider: "aiden_codex",
      model: "gpt-5.5",
      cwd: "/repo",
      workspaceId: null,
    },
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

function privateMessage(id: string, senderOpenId: string, createTime: number) {
  return {
    message_id: id,
    chat_id: "oc_private",
    create_time: String(createTime),
    sender: {
      id: senderOpenId,
      id_type: "open_id",
      sender_type: "user",
      sender_name: senderOpenId === "ou_owner" ? "授权用户" : "咨询用户",
    },
    body: { content: JSON.stringify({ text: `消息 ${id}` }) },
  };
}

describe("LarkSubstitutePrivatePoller", () => {
  let paseoHome: string;
  const now = Date.parse("2026-09-06T12:00:00.000Z");

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-lark-private-poller-"));
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  test("creates and reuses a three-party relay group for unanswered private messages", async () => {
    const adapter = {
      searchPrivateMessagesAsUser: vi
        .fn()
        .mockResolvedValueOnce([privateMessage("om_1", "ou_peer", now - 30 * 60_000)])
        .mockResolvedValueOnce([privateMessage("om_2", "ou_peer", now - 25 * 60_000)]),
      createSubstituteRelayChat: vi.fn(async () => "oc_relay"),
      sendTextWithResult: vi
        .fn()
        .mockResolvedValueOnce({ threadId: null, messageId: "om_forward_1" })
        .mockResolvedValueOnce({ threadId: null, messageId: "om_forward_2" }),
    } satisfies Pick<
      LarkChannelClientAdapter,
      "searchPrivateMessagesAsUser" | "createSubstituteRelayChat" | "sendTextWithResult"
    >;
    const onRelayMessage = vi.fn(async () => undefined);
    const onPrivateMessageObserved = vi.fn(async () => undefined);
    const options = {
      paseoHome,
      channelStore: {
        getBot: vi.fn(() => ({
          id: "bot-1",
          name: "Paseo",
          config: {
            enabled: true,
            appId: "cli_test",
            appSecret: "secret",
          },
        })),
      } as unknown as Pick<LarkChannelStore, "getBot">,
      adapter,
      userOAuthService: {
        getStatus: vi.fn(() => ({
          appId: "cli_test",
          authorized: true,
          needsAuthorization: false,
          expiresAt: "2026-09-06T12:00:00.000Z",
          refreshTokenExpiresAt: "2026-10-06T12:00:00.000Z",
          openId: "ou_owner",
          email: "owner@example.com",
          displayName: "授权用户",
          scope: "offline_access",
        })),
        getValidUserAccessToken: vi.fn(async () => "user-token"),
      } as unknown as Pick<LarkUserOAuthService, "getStatus" | "getValidUserAccessToken">,
      logger: pino({ level: "silent" }),
      onRelayMessage,
      onPrivateMessageObserved,
      now: () => new Date(now),
    };
    const poller = new LarkSubstitutePrivatePoller(options);

    await poller.runMode(mode());
    poller.stop();
    const restartedPoller = new LarkSubstitutePrivatePoller(options);
    await restartedPoller.runMode(mode());

    expect(adapter.createSubstituteRelayChat).toHaveBeenCalledTimes(1);
    expect(adapter.searchPrivateMessagesAsUser).toHaveBeenCalledWith(
      expect.anything(),
      {
        startTime: Math.floor((now - 60 * 60_000) / 1_000),
        endTime: Math.floor(now / 1_000),
      },
      "user-token",
    );
    expect(adapter.createSubstituteRelayChat).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        authorizedUserOpenId: "ou_owner",
        peerOpenId: "ou_peer",
        botAppId: "cli_test",
      }),
      "user-token",
    );
    expect(onRelayMessage).toHaveBeenCalledTimes(2);
    expect(onPrivateMessageObserved).toHaveBeenCalledTimes(2);
    expect(onPrivateMessageObserved).toHaveBeenCalledWith(
      expect.objectContaining({ appId: "cli_test" }),
      expect.objectContaining({
        openId: "ou_peer",
        displayName: "咨询用户",
        text: "消息 om_1",
      }),
    );
    expect(onRelayMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        modeId: "mode-1",
        event: expect.objectContaining({
          chatId: "oc_relay",
          messageId: "om_forward_2",
          openId: "ou_peer",
        }),
      }),
    );
    restartedPoller.stop();
  });

  test("does not scan or create a relay group when the private-user allowlist is empty", async () => {
    const searchPrivateMessagesAsUser = vi.fn();
    const createSubstituteRelayChat = vi.fn();
    const onPrivateMessageObserved = vi.fn();
    const poller = new LarkSubstitutePrivatePoller({
      paseoHome,
      channelStore: {
        getBot: vi.fn(() => ({
          id: "bot-1",
          name: "Paseo",
          config: { enabled: true, appId: "cli_test", appSecret: "secret" },
        })),
      } as unknown as Pick<LarkChannelStore, "getBot">,
      adapter: {
        searchPrivateMessagesAsUser,
        createSubstituteRelayChat,
        sendTextWithResult: vi.fn(),
      },
      userOAuthService: {
        getStatus: vi.fn(),
        getValidUserAccessToken: vi.fn(),
      } as unknown as Pick<LarkUserOAuthService, "getStatus" | "getValidUserAccessToken">,
      logger: pino({ level: "silent" }),
      onRelayMessage: vi.fn(),
      onPrivateMessageObserved,
      now: () => new Date(now),
    });

    await poller.runMode(mode({ allowlist: [], audienceAllowlist: [] }));

    expect(searchPrivateMessagesAsUser).not.toHaveBeenCalled();
    expect(createSubstituteRelayChat).not.toHaveBeenCalled();
    expect(onPrivateMessageObserved).not.toHaveBeenCalled();
  });

  test("does not relay when the authorized user replied after the private message", async () => {
    const adapter = {
      searchPrivateMessagesAsUser: vi.fn(async () => [
        privateMessage("om_question", "ou_peer", now - 30 * 60_000),
        privateMessage("om_answer", "ou_owner", now - 5 * 60_000),
      ]),
      createSubstituteRelayChat: vi.fn(),
      sendTextWithResult: vi.fn(),
    } satisfies Pick<
      LarkChannelClientAdapter,
      "searchPrivateMessagesAsUser" | "createSubstituteRelayChat" | "sendTextWithResult"
    >;
    const onRelayMessage = vi.fn();
    const poller = new LarkSubstitutePrivatePoller({
      paseoHome,
      channelStore: {
        getBot: vi.fn(() => ({
          id: "bot-1",
          name: "Paseo",
          config: { enabled: true, appId: "cli_test", appSecret: "secret" },
        })),
      } as unknown as Pick<LarkChannelStore, "getBot">,
      adapter,
      userOAuthService: {
        getStatus: vi.fn(() => ({
          appId: "cli_test",
          authorized: true,
          needsAuthorization: false,
          expiresAt: null,
          refreshTokenExpiresAt: null,
          openId: "ou_owner",
          email: null,
          displayName: "授权用户",
          scope: null,
        })),
        getValidUserAccessToken: vi.fn(async () => "user-token"),
      } as unknown as Pick<LarkUserOAuthService, "getStatus" | "getValidUserAccessToken">,
      logger: pino({ level: "silent" }),
      onRelayMessage,
      now: () => new Date(now),
    });

    await poller.runMode(mode());

    expect(adapter.createSubstituteRelayChat).not.toHaveBeenCalled();
    expect(onRelayMessage).not.toHaveBeenCalled();
  });

  test("waits until a private message is older than the excluded recent window", async () => {
    const adapter = {
      searchPrivateMessagesAsUser: vi.fn(async () => [
        privateMessage("om_recent", "ou_peer", now - 10 * 60_000),
      ]),
      createSubstituteRelayChat: vi.fn(),
      sendTextWithResult: vi.fn(),
    } satisfies Pick<
      LarkChannelClientAdapter,
      "searchPrivateMessagesAsUser" | "createSubstituteRelayChat" | "sendTextWithResult"
    >;
    const onRelayMessage = vi.fn();
    const poller = new LarkSubstitutePrivatePoller({
      paseoHome,
      channelStore: {
        getBot: vi.fn(() => ({
          id: "bot-1",
          name: "Paseo",
          config: { enabled: true, appId: "cli_test", appSecret: "secret" },
        })),
      } as unknown as Pick<LarkChannelStore, "getBot">,
      adapter,
      userOAuthService: {
        getStatus: vi.fn(() => ({
          appId: "cli_test",
          authorized: true,
          needsAuthorization: false,
          expiresAt: null,
          refreshTokenExpiresAt: null,
          openId: "ou_owner",
          email: null,
          displayName: "授权用户",
          scope: null,
        })),
        getValidUserAccessToken: vi.fn(async () => "user-token"),
      } as unknown as Pick<LarkUserOAuthService, "getStatus" | "getValidUserAccessToken">,
      logger: pino({ level: "silent" }),
      onRelayMessage,
      now: () => new Date(now),
    });

    await poller.runMode(mode());

    expect(adapter.createSubstituteRelayChat).not.toHaveBeenCalled();
    expect(onRelayMessage).not.toHaveBeenCalled();
  });

  test("reports user OAuth message-read permission failures to the task layer", async () => {
    const permissionError = new Error(
      "Lark API error: 缺少用户身份权限 im:message:readonly (code: 99991679)",
    );
    const onScanFailure = vi.fn();
    const poller = new LarkSubstitutePrivatePoller({
      paseoHome,
      channelStore: {
        getBot: vi.fn(() => ({
          id: "bot-1",
          name: "Paseo",
          config: { enabled: true, appId: "cli_test", appSecret: "secret" },
        })),
      } as unknown as Pick<LarkChannelStore, "getBot">,
      adapter: {
        searchPrivateMessagesAsUser: vi.fn(async () => {
          throw permissionError;
        }),
        createSubstituteRelayChat: vi.fn(),
        sendTextWithResult: vi.fn(),
      },
      userOAuthService: {
        getStatus: vi.fn(() => ({
          appId: "cli_test",
          authorized: true,
          needsAuthorization: false,
          expiresAt: null,
          refreshTokenExpiresAt: null,
          openId: "ou_owner",
          email: null,
          displayName: "授权用户",
          scope: "offline_access im:message.p2p_msg:get_as_user im:message:readonly search:message",
        })),
        getValidUserAccessToken: vi.fn(async () => "user-token"),
      } as unknown as Pick<LarkUserOAuthService, "getStatus" | "getValidUserAccessToken">,
      logger: pino({ level: "silent" }),
      onRelayMessage: vi.fn(),
      onScanFailure,
      now: () => new Date(now),
    });

    await poller.runMode(mode());

    expect(onScanFailure).toHaveBeenCalledWith({
      mode: expect.objectContaining({ id: "mode-1", botId: "bot-1" }),
      error: expect.stringContaining("请在飞书开发者后台开通该用户身份权限"),
    });
  });

  test("reports relay-chat creation permission failures without mislabeling them as message-read failures", async () => {
    const onScanFailure = vi.fn();
    const poller = new LarkSubstitutePrivatePoller({
      paseoHome,
      channelStore: {
        getBot: vi.fn(() => ({
          id: "bot-1",
          name: "Paseo",
          config: { enabled: true, appId: "cli_test", appSecret: "secret" },
        })),
      } as unknown as Pick<LarkChannelStore, "getBot">,
      adapter: {
        searchPrivateMessagesAsUser: vi.fn(async () => [
          privateMessage("om_chat_permission", "ou_peer", now - 30 * 60_000),
        ]),
        createSubstituteRelayChat: vi.fn(async () => {
          throw new Error(
            "Lark API error: required one of these privileges under the user identity: [im:chat, im:chat:create, im:chat:create_by_user] (code: 99991679)",
          );
        }),
        sendTextWithResult: vi.fn(),
      },
      userOAuthService: {
        getStatus: vi.fn(() => ({
          appId: "cli_test",
          authorized: true,
          needsAuthorization: false,
          expiresAt: null,
          refreshTokenExpiresAt: null,
          openId: "ou_owner",
          email: null,
          displayName: "授权用户",
          scope:
            "offline_access im:chat:create_by_user im:message.p2p_msg:get_as_user im:message:readonly search:message",
        })),
        getValidUserAccessToken: vi.fn(async () => "user-token"),
      } as unknown as Pick<LarkUserOAuthService, "getStatus" | "getValidUserAccessToken">,
      logger: pino({ level: "silent" }),
      onRelayMessage: vi.fn(),
      onScanFailure,
      now: () => new Date(now),
    });

    await poller.runMode(mode());

    expect(onScanFailure).toHaveBeenCalledWith({
      mode: expect.objectContaining({ id: "mode-1", botId: "bot-1" }),
      event: expect.objectContaining({ messageId: "om_chat_permission" }),
      error: expect.stringContaining(
        "飞书用户 OAuth 缺少 im:chat:create_by_user 权限，无法创建替身私聊转发群",
      ),
    });
    expect(onScanFailure).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("缺少 im:message:readonly 权限") }),
    );
  });

  test("reports rate limiting as a retryable Feishu API failure instead of a permission error", async () => {
    const onScanFailure = vi.fn();
    const poller = new LarkSubstitutePrivatePoller({
      paseoHome,
      channelStore: {
        getBot: vi.fn(() => ({
          id: "bot-1",
          name: "Paseo",
          config: { enabled: true, appId: "cli_test", appSecret: "secret" },
        })),
      } as unknown as Pick<LarkChannelStore, "getBot">,
      adapter: {
        searchPrivateMessagesAsUser: vi.fn(async () => {
          throw new Error("Lark API error: request trigger frequency limit (code: 99991400)");
        }),
        createSubstituteRelayChat: vi.fn(),
        sendTextWithResult: vi.fn(),
      },
      userOAuthService: {
        getStatus: vi.fn(() => ({
          appId: "cli_test",
          authorized: true,
          needsAuthorization: false,
          expiresAt: null,
          refreshTokenExpiresAt: null,
          openId: "ou_owner",
          email: null,
          displayName: "授权用户",
          scope: "offline_access im:message.p2p_msg:get_as_user im:message:readonly search:message",
        })),
        getValidUserAccessToken: vi.fn(async () => "user-token"),
      } as unknown as Pick<LarkUserOAuthService, "getStatus" | "getValidUserAccessToken">,
      logger: pino({ level: "silent" }),
      onRelayMessage: vi.fn(),
      onScanFailure,
      now: () => new Date(now),
    });

    await poller.runMode(mode());

    expect(onScanFailure).toHaveBeenCalledWith({
      mode: expect.objectContaining({ id: "mode-1" }),
      error: expect.stringContaining("飞书接口请求过于频繁"),
    });
    expect(onScanFailure).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("重新授权飞书用户") }),
    );
  });

  test("reports expired or incomplete OAuth grants instead of silently skipping scans", async () => {
    const onScanFailure = vi.fn();
    const searchPrivateMessagesAsUser = vi.fn();
    const poller = new LarkSubstitutePrivatePoller({
      paseoHome,
      channelStore: {
        getBot: vi.fn(() => ({
          id: "bot-1",
          name: "Paseo",
          config: { enabled: true, appId: "cli_test", appSecret: "secret" },
        })),
      } as unknown as Pick<LarkChannelStore, "getBot">,
      adapter: {
        searchPrivateMessagesAsUser,
        createSubstituteRelayChat: vi.fn(),
        sendTextWithResult: vi.fn(),
      },
      userOAuthService: {
        getStatus: vi.fn(() => ({
          appId: "cli_test",
          authorized: false,
          needsAuthorization: true,
          expiresAt: null,
          refreshTokenExpiresAt: null,
          openId: "ou_owner",
          email: null,
          displayName: "授权用户",
          scope: "offline_access search:message",
        })),
        getValidUserAccessToken: vi.fn(),
      } as unknown as Pick<LarkUserOAuthService, "getStatus" | "getValidUserAccessToken">,
      logger: pino({ level: "silent" }),
      onRelayMessage: vi.fn(),
      onScanFailure,
      now: () => new Date(now),
    });

    await poller.runMode(mode());

    expect(searchPrivateMessagesAsUser).not.toHaveBeenCalled();
    expect(onScanFailure).toHaveBeenCalledWith({
      mode: expect.objectContaining({ id: "mode-1" }),
      error: expect.stringContaining("重新授权"),
      event: undefined,
    });
  });
});
