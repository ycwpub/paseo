import { describe, expect, it, vi } from "vitest";
import type { LarkSubstituteMode, LarkSubstituteTask } from "@getpaseo/protocol/messages";
import type { StoredLarkChannelBot } from "./lark-channel-store.js";
import {
  LarkSubstituteAgentReplyError,
  sendLarkSubstituteAgentReply,
  type LarkSubstituteAgentReplyDependencies,
} from "./lark-substitute-agent-reply.js";

function mode(cwd = "/projects/support"): LarkSubstituteMode {
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
    disclosure: { enabled: true, prompt: "【代答】" },
    customPrompt: "仅回答工作问题",
    delaySeconds: 600,
    autoArchiveAgent: false,
    activeTimeRanges: [],
    allowlist: [],
    denylist: [],
    target: {
      kind: "workspace",
      provider: "codex",
      cwd,
      workspaceId: "workspace-1",
      projectId: "prj-support",
    },
    createdAt: "2026-09-09T08:00:00.000Z",
    updatedAt: "2026-09-09T08:00:00.000Z",
  };
}

function task(): LarkSubstituteTask {
  return {
    id: "task-1",
    modeId: "mode-1",
    modeName: "工作替身",
    botId: "bot-1",
    source: "private_scan",
    chatId: "oc-private",
    chatName: "私聊用户",
    messageId: "om-private",
    senderOpenId: "ou-peer",
    senderName: "张三",
    content: "请确认方案",
    status: "completed",
    scheduledAt: null,
    startedAt: "2026-09-09T08:01:00.000Z",
    completedAt: "2026-09-09T08:02:00.000Z",
    agentId: "agent-1",
    error: null,
    failureStage: null,
    createdAt: "2026-09-09T08:00:00.000Z",
    updatedAt: "2026-09-09T08:02:00.000Z",
  };
}

function bot(): StoredLarkChannelBot {
  return {
    id: "bot-1",
    name: "Paseo 机器人",
    config: {
      enabled: true,
      appId: "cli-1",
      appSecret: "secret",
      encryptKey: null,
      verificationToken: null,
      domain: "feishu",
      target: mode().target,
      substitute: { enabled: false, openId: null, name: null },
    },
    authorizedUsers: [],
    pendingPairings: [],
    conversations: [
      {
        chatId: "oc-relay",
        threadId: "omt-topic",
        rootMessageId: "om-forwarded",
        userId: "lark-user:ou-peer",
        agentId: "agent-1",
        title: "请确认方案",
        createdAt: "2026-09-09T08:01:00.000Z",
        lastInboundAt: "2026-09-09T08:01:00.000Z",
        lastOutboundAt: "2026-09-09T08:02:00.000Z",
      },
    ],
    processedEvents: [],
  };
}

function dependencies(
  overrides: Partial<LarkSubstituteAgentReplyDependencies> = {},
): LarkSubstituteAgentReplyDependencies {
  return {
    paseoHome: "/paseo-home",
    listTasks: () => [task()],
    getMode: () => mode(),
    getBots: () => [bot()],
    getAgent: async () => ({ cwd: "/projects/support" }),
    send: vi.fn(async () => ({ threadId: "omt-topic", messageId: "om-optimized" })),
    markOutbound: vi.fn(),
    ...overrides,
  };
}

describe("sendLarkSubstituteAgentReply", () => {
  it("uses the bound bot to reply in the original topic and mentions the private sender", async () => {
    const deps = dependencies();

    const result = await sendLarkSubstituteAgentReply(deps, {
      agentId: "agent-1",
      text: "这是优化后的答复",
    });

    expect(deps.send).toHaveBeenCalledWith({
      botId: "bot-1",
      config: bot().config,
      replyMessageId: "om-forwarded",
      text: "【代答】这是优化后的答复",
      mentionOpenId: "ou-peer",
    });
    expect(result).toEqual({
      agentId: "agent-1",
      taskId: "task-1",
      modeId: "mode-1",
      projectId: "prj-support",
      botId: "bot-1",
      chatId: "oc-relay",
      threadId: "omt-topic",
      messageId: "om-optimized",
    });
  });

  it("removes internal Lark routing directives before sending", async () => {
    const deps = dependencies();

    await sendLarkSubstituteAgentReply(deps, {
      agentId: "agent-1",
      text: "<!-- paseo:lark-route=user -->\n这是重新生成的答复",
    });

    expect(deps.send).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "【代答】这是重新生成的答复",
      }),
    );
  });

  it("rejects an Agent that is no longer in the substitute Project", async () => {
    const promise = sendLarkSubstituteAgentReply(
      dependencies({ getAgent: async () => ({ cwd: "/projects/other" }) }),
      {
        agentId: "agent-1",
        text: "新的答复",
      },
    );

    await expect(promise).rejects.toMatchObject<LarkSubstituteAgentReplyError>({
      code: "PROJECT_MISMATCH",
    });
  });

  it("rejects an Agent without a substitute task", async () => {
    const promise = sendLarkSubstituteAgentReply(dependencies({ listTasks: () => [] }), {
      agentId: "agent-1",
      text: "新的答复",
    });

    await expect(promise).rejects.toMatchObject<LarkSubstituteAgentReplyError>({
      code: "TASK_NOT_FOUND",
    });
  });
});
