import { describe, expect, test } from "vitest";
import { buildLarkSubstitutePrivateRelayMessage } from "./lark-substitute-private-relay-message.js";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";

function event(openId: string | null): NormalizedLarkMessageEvent {
  return {
    eventId: "event-1",
    messageId: "om_source",
    chatId: "oc_private",
    chatType: "p2p",
    threadId: null,
    rootMessageId: null,
    openId,
    unionId: null,
    displayName: "咨询用户",
    topicName: "咨询用户",
    text: "请帮忙确认问题",
    createTime: 1,
    mentions: [],
  };
}

describe("buildLarkSubstitutePrivateRelayMessage", () => {
  test("mentions the private-message sender in the relay group", () => {
    expect(buildLarkSubstitutePrivateRelayMessage(event("ou_peer"))).toBe(
      [
        '【替身私聊转发】<at user_id="ou_peer"></at>',
        "请帮忙确认问题",
        "",
        "来源消息：om_source",
      ].join("\n"),
    );
  });

  test("uses the sender name when no open ID is available", () => {
    expect(buildLarkSubstitutePrivateRelayMessage(event(null))).toContain(
      "【替身私聊转发】咨询用户",
    );
  });
});
