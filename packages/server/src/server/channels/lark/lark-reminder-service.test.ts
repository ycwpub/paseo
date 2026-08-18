import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "../../../test-utils/test-logger.js";
import type { LarkChannelClientAdapter } from "./lark-client-adapter.js";
import { LarkChannelStore } from "./lark-channel-store.js";
import { LarkReminderService } from "./lark-reminder-service.js";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";

function createAdapter() {
  return {
    sendText: vi.fn(async () => undefined),
    sendTextAsUser: vi.fn(async () => undefined),
    listChatMessages: vi.fn(async () => []),
  } satisfies Pick<LarkChannelClientAdapter, "sendText" | "sendTextAsUser" | "listChatMessages">;
}

function replyEvent(openId: string, createTime: number): NormalizedLarkMessageEvent {
  return {
    eventId: "event-1",
    messageId: "message-reply",
    chatId: "oc_team",
    chatType: "group",
    threadId: null,
    rootMessageId: null,
    openId,
    unionId: null,
    senderType: "user",
    displayName: "Alice",
    topicName: "Reminder",
    text: "已确认",
    createTime,
  };
}

describe("LarkReminderService", () => {
  let tempRoot: string;
  let channelStore: LarkChannelStore;
  let botId: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T08:00:00.000Z"));
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-lark-reminder-"));
    channelStore = new LarkChannelStore({
      paseoHome: tempRoot,
      logger: createTestLogger(),
    });
    const bot = channelStore.configure({
      createNew: true,
      name: "Reminder bot",
      appId: "cli_test",
      appSecret: "secret",
    });
    botId = bot.id;
    channelStore.setEnabled(botId, true);
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("sends immediately and repeats until a target user replies", async () => {
    const adapter = createAdapter();
    const emitChanged = vi.fn();
    const service = new LarkReminderService({
      paseoHome: tempRoot,
      channelStore,
      adapter,
      logger: createTestLogger(),
      emitChanged,
    });
    service.start();
    const reminder = service.create({
      name: "等待确认",
      botId,
      chatId: "oc_team",
      targetOpenIds: ["ou_alice", "ou_bob"],
      message: "请回复确认",
      frequencySeconds: 60,
      sender: { type: "bot" },
      enabled: true,
    });

    await vi.runOnlyPendingTimersAsync();
    expect(adapter.sendText).toHaveBeenCalledWith(
      expect.any(Object),
      "oc_team",
      '<at user_id="ou_alice"></at> <at user_id="ou_bob"></at> 请回复确认',
    );
    expect(service.list()[0]).toMatchObject({ id: reminder.id, status: "active", sendCount: 1 });

    service.handleIncomingEvent(botId, replyEvent("ou_alice", Date.now() + 1_000));
    expect(service.list()[0]).toMatchObject({
      status: "completed",
      reply: { openId: "ou_alice", text: "已确认" },
      nextRunAt: null,
    });

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(adapter.sendText).toHaveBeenCalledTimes(1);
    expect(emitChanged).toHaveBeenCalled();
    service.stop();
  });

  it("ignores replies from users who are not being reminded", () => {
    const adapter = createAdapter();
    const service = new LarkReminderService({
      paseoHome: tempRoot,
      channelStore,
      adapter,
      logger: createTestLogger(),
      emitChanged: vi.fn(),
    });
    service.start();
    service.create({
      botId,
      chatId: "oc_team",
      targetOpenIds: ["ou_alice"],
      message: "请回复确认",
      frequencySeconds: 60,
      sender: { type: "bot" },
      enabled: true,
    });

    service.handleIncomingEvent(botId, replyEvent("ou_charlie", Date.now() + 1_000));
    expect(service.list()[0]?.status).toBe("active");
    service.stop();
  });

  it("uses an environment-provided user access token without persisting it", async () => {
    const adapter = createAdapter();
    const service = new LarkReminderService({
      paseoHome: tempRoot,
      channelStore,
      adapter,
      logger: createTestLogger(),
      emitChanged: vi.fn(),
      env: { LARK_TEST_USER_TOKEN: "uat-secret" },
    });
    service.start();
    service.create({
      botId,
      chatId: "oc_team",
      targetOpenIds: ["ou_alice"],
      message: "请回复确认",
      frequencySeconds: 60,
      sender: { type: "user", userAccessTokenEnv: "LARK_TEST_USER_TOKEN" },
      enabled: true,
    });

    await vi.runOnlyPendingTimersAsync();
    expect(adapter.sendTextAsUser).toHaveBeenCalledWith(
      expect.any(Object),
      "oc_team",
      '<at user_id="ou_alice"></at> 请回复确认',
      "uat-secret",
    );
    expect(JSON.stringify(service.list())).not.toContain("uat-secret");
    service.stop();
  });

  it("restores active tasks after a daemon restart without duplicating the schedule", async () => {
    const firstAdapter = createAdapter();
    const first = new LarkReminderService({
      paseoHome: tempRoot,
      channelStore,
      adapter: firstAdapter,
      logger: createTestLogger(),
      emitChanged: vi.fn(),
    });
    first.start();
    first.create({
      botId,
      chatId: "oc_team",
      targetOpenIds: ["ou_alice"],
      message: "请回复确认",
      frequencySeconds: 60,
      sender: { type: "bot" },
      enabled: true,
    });
    await vi.runOnlyPendingTimersAsync();
    first.stop();

    const secondAdapter = createAdapter();
    const second = new LarkReminderService({
      paseoHome: tempRoot,
      channelStore,
      adapter: secondAdapter,
      logger: createTestLogger(),
      emitChanged: vi.fn(),
    });
    second.start();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(secondAdapter.sendText).toHaveBeenCalledTimes(1);
    expect(second.list()[0]?.sendCount).toBe(2);
    second.stop();
  });

  it("does not send after the task is stopped during an in-flight reply check", async () => {
    let resolveMessages: ((messages: unknown[]) => void) | null = null;
    const adapter = createAdapter();
    adapter.listChatMessages.mockImplementation(
      () =>
        new Promise<unknown[]>((resolve) => {
          resolveMessages = resolve;
        }),
    );
    const service = new LarkReminderService({
      paseoHome: tempRoot,
      channelStore,
      adapter,
      logger: createTestLogger(),
      emitChanged: vi.fn(),
    });
    service.start();
    const reminder = service.create({
      botId,
      chatId: "oc_team",
      targetOpenIds: ["ou_alice"],
      message: "请回复确认",
      frequencySeconds: 60,
      sender: { type: "bot" },
      enabled: true,
    });

    const timerRun = vi.runOnlyPendingTimersAsync();
    await vi.waitFor(() => expect(adapter.listChatMessages).toHaveBeenCalledTimes(1));
    service.setEnabled(reminder.id, false);
    resolveMessages?.([]);
    await timerRun;

    expect(adapter.sendText).not.toHaveBeenCalled();
    expect(service.list()[0]?.status).toBe("paused");
    service.stop();
  });
});
