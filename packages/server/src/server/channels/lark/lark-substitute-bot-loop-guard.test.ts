import { describe, expect, test } from "vitest";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";
import {
  isLarkMessageFromCurrentBot,
  LarkSubstituteBotLoopGuard,
  MAX_LARK_SUBSTITUTE_BOT_REPLIES,
} from "./lark-substitute-bot-loop-guard.js";

function event(overrides: Partial<NormalizedLarkMessageEvent> = {}): NormalizedLarkMessageEvent {
  return {
    eventId: "evt-1",
    messageId: "om-1",
    chatId: "oc-1",
    chatType: "group",
    threadId: "omt-1",
    rootMessageId: "om-root",
    openId: "ou-other-bot",
    unionId: null,
    senderAppId: "cli_other",
    senderType: "bot",
    displayName: "其他机器人",
    topicName: "机器人协作",
    text: "@替身用户 请回答",
    createTime: 1,
    mentions: [],
    ...overrides,
  };
}

describe("LarkSubstituteBotLoopGuard", () => {
  test("recognizes messages sent by the current bot using open_id or app_id", () => {
    const currentBot = { openId: "ou_current", appId: "cli_current" };
    expect(
      isLarkMessageFromCurrentBot(
        event({ openId: "ou_current", senderAppId: null }),
        currentBot,
        null,
      ),
    ).toBe(true);
    expect(
      isLarkMessageFromCurrentBot(
        event({ openId: "ou_other", senderAppId: "cli_current" }),
        currentBot,
        null,
      ),
    ).toBe(true);
    expect(isLarkMessageFromCurrentBot(event(), currentBot, null)).toBe(false);
  });

  test("allows at most five bot reply attempts in one message chain", () => {
    const guard = new LarkSubstituteBotLoopGuard();
    for (let count = 1; count <= MAX_LARK_SUBSTITUTE_BOT_REPLIES; count += 1) {
      expect(guard.claimBotReply(event({ messageId: `om-${count}` }), count)).toEqual({
        allowed: true,
        count,
        maxReplies: MAX_LARK_SUBSTITUTE_BOT_REPLIES,
      });
    }
    expect(
      guard.claimBotReply(event({ messageId: "om-6" }), MAX_LARK_SUBSTITUTE_BOT_REPLIES + 1),
    ).toEqual({
      allowed: false,
      count: MAX_LARK_SUBSTITUTE_BOT_REPLIES,
      maxReplies: MAX_LARK_SUBSTITUTE_BOT_REPLIES,
    });
  });

  test("starts a new reply chain after a human message", () => {
    const guard = new LarkSubstituteBotLoopGuard();
    for (let count = 0; count < MAX_LARK_SUBSTITUTE_BOT_REPLIES; count += 1) {
      guard.claimBotReply(event(), count);
    }
    guard.resetForHumanMessage(event({ senderType: "user", senderAppId: null, openId: "ou_user" }));
    expect(guard.claimBotReply(event(), 10)).toMatchObject({ allowed: true, count: 1 });
  });
});
