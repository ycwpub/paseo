import { describe, expect, it } from "vitest";
import {
  LarkSubstituteReplyRequestSchema,
  LarkSubstituteReplyResponseSchema,
} from "./substitute-reply-rpc-schemas.js";

describe("Lark substitute reply RPC schemas", () => {
  it("accepts an Agent-scoped optimized reply", () => {
    expect(
      LarkSubstituteReplyRequestSchema.parse({
        type: "channel.lark.substitute.reply.request",
        requestId: "req_reply",
        agentId: "agent_1",
        text: "这是优化后的最终答复",
      }),
    ).toMatchObject({
      agentId: "agent_1",
      text: "这是优化后的最终答复",
    });
  });

  it("returns the original substitute conversation target", () => {
    expect(
      LarkSubstituteReplyResponseSchema.parse({
        type: "channel.lark.substitute.reply.response",
        payload: {
          requestId: "req_reply",
          reply: {
            agentId: "agent_1",
            taskId: "task_1",
            modeId: "mode_1",
            projectId: "prj_1",
            botId: "bot_1",
            chatId: "oc_relay",
            threadId: "omt_topic",
            messageId: "om_reply",
          },
          error: null,
        },
      }).payload.reply,
    ).toMatchObject({
      taskId: "task_1",
      chatId: "oc_relay",
      threadId: "omt_topic",
    });
  });
});
