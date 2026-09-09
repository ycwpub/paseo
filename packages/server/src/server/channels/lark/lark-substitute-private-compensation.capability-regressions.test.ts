import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LarkSubstituteMode } from "@getpaseo/protocol/messages";
import type { LarkChannelStore } from "./lark-channel-store.js";
import { LarkSubstitutePrivatePoller } from "./lark-substitute-private-poller.js";
import type { LarkUserOAuthService } from "./lark-user-oauth-service.js";

const NOW = Date.parse("2026-09-09T12:39:00.000Z");

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
      excludeRecentMinutes: 10,
    },
    disclosure: { enabled: true, prompt: "【机器人代答】" },
    customPrompt: "仅回答工作相关问题",
    delaySeconds: 600,
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
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    ...overrides,
  };
}

function privateMessage(id: string, createTime: number) {
  return {
    message_id: id,
    chat_id: "oc_private",
    create_time: String(createTime),
    sender: {
      id: "ou_peer",
      id_type: "open_id",
      sender_type: "user",
      sender_name: "咨询用户",
    },
    body: { content: JSON.stringify({ text: `消息 ${id}` }) },
  };
}

function createPoller(input: {
  paseoHome: string;
  searchPrivateMessagesAsUser: ReturnType<typeof vi.fn>;
  prepareReply: ReturnType<typeof vi.fn>;
}) {
  return new LarkSubstitutePrivatePoller({
    paseoHome: input.paseoHome,
    channelStore: {
      getBot: vi.fn(() => ({
        id: "bot-1",
        name: "Paseo",
        config: { enabled: true, appId: "cli_test", appSecret: "secret" },
      })),
    } as unknown as Pick<LarkChannelStore, "getBot">,
    adapter: {
      searchPrivateMessagesAsUser: input.searchPrivateMessagesAsUser,
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
        scope: null,
      })),
      getValidUserAccessToken: vi.fn(async () => "user-token"),
    } as unknown as Pick<LarkUserOAuthService, "getStatus" | "getValidUserAccessToken">,
    logger: pino({ level: "silent" }),
    prepareReply: input.prepareReply,
    deliverReply: vi.fn(),
    now: () => new Date(Date.now()),
  });
}

describe("Lark substitute private compensation scan", () => {
  let paseoHome: string;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-lark-private-compensation-"));
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(paseoHome, { recursive: true, force: true });
  });

  test("runs one scan when a recent private message becomes eligible", async () => {
    const searchPrivateMessagesAsUser = vi.fn(async () => [
      privateMessage("om_recent", NOW - 6 * 60_000),
    ]);
    const prepareReply = vi.fn(async () => ({ kind: "skip" as const }));
    const poller = createPoller({ paseoHome, searchPrivateMessagesAsUser, prepareReply });

    await poller.runMode(mode());
    await poller.runMode(mode());

    expect(prepareReply).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(4 * 60_000);

    expect(searchPrivateMessagesAsUser).toHaveBeenCalledTimes(3);
    expect(prepareReply).toHaveBeenCalledTimes(1);
    expect(prepareReply).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ messageId: "om_recent" }),
      }),
    );
    expect(vi.getTimerCount()).toBe(0);
    poller.stop();
  });

  test("uses the latest message when another message arrives before the wait expires", async () => {
    const firstMessage = privateMessage("om_first", NOW - 6 * 60_000);
    const latestMessage = privateMessage("om_latest", NOW + 2 * 60_000);
    const searchPrivateMessagesAsUser = vi
      .fn()
      .mockResolvedValueOnce([firstMessage])
      .mockResolvedValueOnce([firstMessage, latestMessage])
      .mockResolvedValueOnce([firstMessage, latestMessage]);
    const prepareReply = vi.fn(async () => ({ kind: "skip" as const }));
    const poller = createPoller({ paseoHome, searchPrivateMessagesAsUser, prepareReply });

    await poller.runMode(mode());
    await vi.advanceTimersByTimeAsync(4 * 60_000);

    expect(prepareReply).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(8 * 60_000);

    expect(searchPrivateMessagesAsUser).toHaveBeenCalledTimes(3);
    expect(prepareReply).toHaveBeenCalledTimes(1);
    expect(prepareReply).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ messageId: "om_latest" }),
      }),
    );
    poller.stop();
  });

  test("moves the pending scan to the latest message eligibility time", async () => {
    const firstMessage = privateMessage("om_first", NOW - 6 * 60_000);
    const latestMessage = privateMessage("om_latest", NOW + 60_000);
    const searchPrivateMessagesAsUser = vi
      .fn()
      .mockResolvedValueOnce([firstMessage])
      .mockResolvedValueOnce([firstMessage, latestMessage])
      .mockResolvedValueOnce([firstMessage, latestMessage]);
    const prepareReply = vi.fn(async () => ({ kind: "skip" as const }));
    const poller = createPoller({ paseoHome, searchPrivateMessagesAsUser, prepareReply });

    await poller.runMode(mode());
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    await poller.runMode(mode());

    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(searchPrivateMessagesAsUser).toHaveBeenCalledTimes(2);
    expect(prepareReply).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(7 * 60_000);
    expect(searchPrivateMessagesAsUser).toHaveBeenCalledTimes(3);
    expect(prepareReply).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ messageId: "om_latest" }),
      }),
    );
    poller.stop();
  });

  test("cancels a pending scan when the mode is disabled", async () => {
    const searchPrivateMessagesAsUser = vi.fn(async () => [
      privateMessage("om_recent", NOW - 6 * 60_000),
    ]);
    const poller = createPoller({
      paseoHome,
      searchPrivateMessagesAsUser,
      prepareReply: vi.fn(async () => ({ kind: "skip" as const })),
    });

    await poller.runMode(mode());
    expect(vi.getTimerCount()).toBe(1);

    poller.sync([mode({ enabled: false })]);

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(searchPrivateMessagesAsUser).toHaveBeenCalledTimes(1);
  });
});
