import { describe, expect, test, vi } from "vitest";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";
import {
  appendLarkSubstituteMessageContext,
  collectLarkSubstituteMessageContext,
  selectLarkSubstituteSupplementalEvents,
} from "./lark-substitute-message-context.js";

function event(
  messageId: string,
  text: string,
  createTime: number,
  chatType: "p2p" | "group" = "group",
): NormalizedLarkMessageEvent {
  return {
    eventId: `event-${messageId}`,
    messageId,
    chatId: "oc_chat",
    chatType,
    threadId: null,
    rootMessageId: null,
    openId: "ou_sender",
    unionId: null,
    displayName: "用户",
    topicName: "问题",
    text,
    createTime,
    mentions: [],
  };
}

describe("Lark substitute message context", () => {
  test("private chat keeps earlier messages as context and answers only the latest message", () => {
    const latest = event("om_3", "最终问题", 3_000, "p2p");
    expect(
      selectLarkSubstituteSupplementalEvents({
        latestEvent: latest,
        events: [
          event("om_1", "背景一", 1_000, "p2p"),
          event("om_2", "背景二", 2_000, "p2p"),
          latest,
          event("om_4", "之后的消息", 4_000, "p2p"),
        ],
      }).map((entry) => entry.messageId),
    ).toEqual(["om_1", "om_2"]);
  });

  test("group chat keeps messages before and after the latest target mention", () => {
    const latest = event("om_2", "@张三 最终问题", 2_000);
    expect(
      selectLarkSubstituteSupplementalEvents({
        latestEvent: latest,
        events: [event("om_1", "上文", 1_000), latest, event("om_3", "下文", 3_000)],
      }).map((entry) => entry.messageId),
    ).toEqual(["om_1", "om_3"]);
  });

  test("loads chat history and merges it with buffered trigger messages", async () => {
    const latest = event("om_3", "最终问题", Date.parse("2026-09-05T02:00:00.000Z"), "p2p");
    const listChatMessages = vi.fn(async () => [
      event("om_1", "历史背景", Date.parse("2026-09-05T01:59:00.000Z"), "p2p"),
    ]);
    const result = await collectLarkSubstituteMessageContext({
      latestEvent: latest,
      bufferedEvents: [
        event("om_2", "延迟期间旧问题", Date.parse("2026-09-05T01:59:30.000Z"), "p2p"),
        latest,
      ],
      now: new Date("2026-09-05T02:01:00.000Z"),
      listChatMessages,
    });

    expect(result.map((entry) => entry.messageId)).toEqual(["om_1", "om_2"]);
    expect(listChatMessages).toHaveBeenCalledWith({
      start: new Date("2026-09-05T01:30:00.000Z"),
      end: new Date("2026-09-05T02:01:00.000Z"),
    });
  });

  test("marks surrounding messages as supplemental rather than the current question", () => {
    const prompt = appendLarkSubstituteMessageContext({
      prompt: "CURRENT",
      latestEvent: event("om_2", "最终问题", 2_000),
      supplementalEvents: [event("om_1", "<上文>", 1_000), event("om_3", "下文", 3_000)],
    });

    expect(prompt).toContain("latest message that mentions the substituted user");
    expect(prompt).toContain("&lt;上文&gt;");
    expect(prompt).not.toContain('<message id="om_2"');
  });
});
