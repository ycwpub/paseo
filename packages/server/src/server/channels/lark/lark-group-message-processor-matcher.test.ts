import { describe, expect, test } from "vitest";
import type { LarkGroupMessageProcessor } from "@getpaseo/protocol/messages";

import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";
import { matchLarkGroupMessageProcessor } from "./lark-group-message-processor-matcher.js";

function processor(filters: LarkGroupMessageProcessor["filters"]): LarkGroupMessageProcessor {
  return {
    id: "processor-1",
    name: "研发群自动答疑",
    enabled: true,
    botId: "bot-1",
    realtime: { enabled: true, delaySeconds: 60 },
    scan: {
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 60,
      excludeRecentMinutes: 10,
    },
    context: { previousMessageCount: 10, followingMessageCount: 10 },
    filters,
    aiFilterPrompt: "",
    replyPrompt: "回答问题",
    autoArchiveAgent: true,
    target: {
      kind: "workspace",
      cwd: "/tmp/project",
      workspaceId: null,
      projectId: null,
    },
    createdAt: "2026-10-13T00:00:00.000Z",
    updatedAt: "2026-10-13T00:00:00.000Z",
  };
}

function event(overrides: Partial<NormalizedLarkMessageEvent> = {}): NormalizedLarkMessageEvent {
  return {
    eventId: "event-1",
    messageId: "message-1",
    rootMessageId: null,
    parentMessageId: null,
    threadId: null,
    chatId: "oc_research",
    chatType: "group",
    openId: "ou_alice",
    unionId: null,
    senderType: "user",
    senderAppId: null,
    displayName: "Alice",
    text: "线上支付失败，应该怎么排查？",
    mentions: [],
    createTime: Date.parse("2026-10-13T00:00:00.000Z"),
    topicName: "支付问题",
    ...overrides,
  };
}

describe("matchLarkGroupMessageProcessor", () => {
  test("requires every configured field while allowing alternatives within one field", () => {
    const value = processor([
      {
        id: "group-1",
        effect: "include",
        field: "group_name",
        operator: "regex",
        value: "研发|技术",
      },
      {
        id: "group-2",
        effect: "include",
        field: "group_name",
        operator: "equals",
        value: "支付群",
      },
      {
        id: "sender-1",
        effect: "include",
        field: "sender_open_id",
        operator: "equals",
        value: "ou_alice",
      },
      {
        id: "content-1",
        effect: "include",
        field: "message_content",
        operator: "contains",
        value: "失败",
      },
    ]);

    expect(
      matchLarkGroupMessageProcessor({
        processor: value,
        event: event(),
        chatName: "支付研发群",
      }),
    ).toBe(true);
    expect(
      matchLarkGroupMessageProcessor({
        processor: value,
        event: event({ openId: "ou_bob" }),
        chatName: "支付研发群",
      }),
    ).toBe(false);
  });

  test("lets an exclude rule override includes", () => {
    const value = processor([
      {
        id: "include-1",
        effect: "include",
        field: "message_content",
        operator: "contains",
        value: "失败",
      },
      {
        id: "exclude-1",
        effect: "exclude",
        field: "sender_name",
        operator: "regex",
        value: "^测试",
      },
    ]);

    expect(
      matchLarkGroupMessageProcessor({
        processor: value,
        event: event({ displayName: "测试机器人" }),
        chatName: "支付研发群",
      }),
    ).toBe(false);
  });

  test("ignores private and bot-authored messages", () => {
    const value = processor([]);

    expect(
      matchLarkGroupMessageProcessor({
        processor: value,
        event: event({ chatType: "p2p" }),
        chatName: null,
      }),
    ).toBe(false);
    expect(
      matchLarkGroupMessageProcessor({
        processor: value,
        event: event({ senderType: "app" }),
        chatName: "支付研发群",
      }),
    ).toBe(false);
  });
});
