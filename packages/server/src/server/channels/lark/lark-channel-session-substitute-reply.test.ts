import pino from "pino";
import { describe, expect, test, vi } from "vitest";
import type { LarkChannelService } from "./lark-channel-service.js";
import { LarkChannelSession } from "./lark-channel-session.js";

describe("LarkChannelSession substitute reply RPC", () => {
  test("routes an Agent-scoped optimized answer and returns its original topic", async () => {
    const replyToSubstituteConversation = vi.fn(async () => ({
      agentId: "agent-1",
      taskId: "task-1",
      modeId: "mode-1",
      projectId: "prj-1",
      botId: "bot-1",
      chatId: "oc-relay",
      threadId: "omt-topic",
      messageId: "om-reply",
    }));
    const service = { replyToSubstituteConversation } as unknown as LarkChannelService;
    const emit = vi.fn();
    const session = new LarkChannelSession({
      host: { emit },
      service,
      logger: pino({ level: "silent" }),
    });

    await session.handleRequest({
      type: "channel.lark.substitute.reply.request",
      requestId: "reply",
      agentId: "agent-1",
      text: "优化后的答案",
    });

    expect(replyToSubstituteConversation).toHaveBeenCalledWith("agent-1", "优化后的答案");
    expect(emit).toHaveBeenCalledWith({
      type: "channel.lark.substitute.reply.response",
      payload: {
        requestId: "reply",
        reply: {
          agentId: "agent-1",
          taskId: "task-1",
          modeId: "mode-1",
          projectId: "prj-1",
          botId: "bot-1",
          chatId: "oc-relay",
          threadId: "omt-topic",
          messageId: "om-reply",
        },
        error: null,
      },
    });
  });

  test("returns an actionable error instead of falling through the mode handler", async () => {
    const service = {
      replyToSubstituteConversation: vi.fn(async () => {
        throw new Error("当前 Agent 不属于替身任务");
      }),
      listSubstituteModes: vi.fn(() => []),
    } as unknown as LarkChannelService;
    const emit = vi.fn();
    const session = new LarkChannelSession({
      host: { emit },
      service,
      logger: pino({ level: "silent" }),
    });

    await session.handleRequest({
      type: "channel.lark.substitute.reply.request",
      requestId: "reply-error",
      agentId: "agent-1",
      text: "优化后的答案",
    });

    expect(emit).toHaveBeenCalledWith({
      type: "channel.lark.substitute.reply.response",
      payload: {
        requestId: "reply-error",
        reply: null,
        error: "当前 Agent 不属于替身任务",
      },
    });
    expect(service.listSubstituteModes).not.toHaveBeenCalled();
  });
});
