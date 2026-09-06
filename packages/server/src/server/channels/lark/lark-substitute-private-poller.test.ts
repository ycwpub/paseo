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

function mode(): LarkSubstituteMode {
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
    allowlist: [],
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
});
