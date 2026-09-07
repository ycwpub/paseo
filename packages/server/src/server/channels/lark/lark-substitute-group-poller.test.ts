import pino from "pino";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { LarkSubstituteMode } from "@getpaseo/protocol/messages";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";
import { LarkSubstituteGroupPoller } from "./lark-substitute-group-poller.js";

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
      excludeRecentMinutes: 10,
    },
    disclosure: { enabled: true, prompt: "【机器人代答】" },
    customPrompt: "",
    delaySeconds: 600,
    activeTimeRanges: [],
    audienceAllowlist: [
      { id: "group-1", type: "group", chatId: "oc_1", groupId: null, name: "研发群" },
    ],
    audienceDenylist: [],
    questionAllowlist: [],
    questionDenylist: [],
    allowlist: [],
    denylist: [],
    target: {
      kind: "workspace",
      provider: "aiden_codex",
      model: "gpt-5.5",
      cwd: "/repo",
      workspaceId: null,
    },
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  };
}

function event(messageId: string, mentionedOpenId = "ou_authorized"): NormalizedLarkMessageEvent {
  return {
    eventId: messageId,
    messageId,
    chatId: "oc_1",
    chatType: "group",
    threadId: null,
    rootMessageId: null,
    openId: "ou_sender",
    unionId: null,
    displayName: "提问人",
    topicName: "研发群",
    text: "@授权用户 请确认",
    createTime: Date.parse("2026-09-07T09:30:00.000Z"),
    mentions: [
      {
        key: "@_user_1",
        name: "授权用户",
        openId: mentionedOpenId,
        userId: null,
        appId: null,
        idType: "open_id",
      },
    ],
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("LarkSubstituteGroupPoller", () => {
  test("scans explicit allowlist groups and tags matching messages as group scans", async () => {
    const onMessage = vi.fn(async () => undefined);
    const listChatMessages = vi.fn(async () => [event("om_match"), event("om_other", "ou_other")]);
    const poller = new LarkSubstituteGroupPoller({
      logger: pino({ level: "silent" }),
      listChatMessages,
      getAuthorizedUserOpenId: () => "ou_authorized",
      hasTask: (_modeId, messageId) => messageId === "om_existing",
      onMessage,
      now: () => new Date("2026-09-07T10:00:00.000Z"),
    });

    await poller.runMode(mode());

    expect(listChatMessages).toHaveBeenCalledWith("bot-1", "oc_1", {
      start: new Date("2026-09-07T09:00:00.000Z"),
      end: new Date("2026-09-07T09:50:00.000Z"),
    });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(
      "bot-1",
      expect.objectContaining({
        eventId: "group-scan:om_match",
        messageId: "om_match",
        chatType: "group",
      }),
    );
  });

  test("does not rescan messages that already have tasks", async () => {
    const onMessage = vi.fn(async () => undefined);
    const poller = new LarkSubstituteGroupPoller({
      logger: pino({ level: "silent" }),
      listChatMessages: vi.fn(async () => [event("om_existing")]),
      getAuthorizedUserOpenId: () => "ou_authorized",
      hasTask: () => true,
      onMessage,
    });

    await poller.runMode(mode());

    expect(onMessage).not.toHaveBeenCalled();
  });

  test("records one group failure and continues scanning the remaining groups", async () => {
    const onMessage = vi.fn(async () => undefined);
    const onScanFailure = vi.fn(async () => undefined);
    const twoGroups = mode();
    twoGroups.audienceAllowlist.push({
      id: "group-2",
      type: "group",
      chatId: "oc_2",
      groupId: null,
      name: "运维群",
    });
    const listChatMessages = vi.fn(async (_botId: string, chatId: string) => {
      if (chatId === "oc_1") throw new Error("群消息读取权限不足");
      return [{ ...event("om_second"), chatId: "oc_2" }];
    });
    const poller = new LarkSubstituteGroupPoller({
      logger: pino({ level: "silent" }),
      listChatMessages,
      getAuthorizedUserOpenId: () => "ou_authorized",
      hasTask: () => false,
      onMessage,
      onScanFailure,
    });

    await poller.runMode(twoGroups);

    expect(onScanFailure).toHaveBeenCalledWith({
      mode: twoGroups,
      chatId: "oc_1",
      error: "群消息读取权限不足",
    });
    expect(onMessage).toHaveBeenCalledWith(
      "bot-1",
      expect.objectContaining({ chatId: "oc_2", messageId: "om_second" }),
    );
  });

  test("records message-processing failures without aborting later messages", async () => {
    const onMessage = vi
      .fn<(botId: string, event: NormalizedLarkMessageEvent) => Promise<void>>()
      .mockRejectedValueOnce(new Error("处理第一条消息失败"))
      .mockResolvedValue(undefined);
    const onScanFailure = vi.fn(async () => undefined);
    const failedEvent = event("om_failed");
    const poller = new LarkSubstituteGroupPoller({
      logger: pino({ level: "silent" }),
      listChatMessages: vi.fn(async () => [failedEvent, event("om_next")]),
      getAuthorizedUserOpenId: () => "ou_authorized",
      hasTask: () => false,
      onMessage,
      onScanFailure,
    });

    await poller.runMode(mode());

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onScanFailure).toHaveBeenCalledWith({
      mode: expect.objectContaining({ id: "mode-1" }),
      chatId: "oc_1",
      event: failedEvent,
      error: "处理第一条消息失败",
    });
  });
});
