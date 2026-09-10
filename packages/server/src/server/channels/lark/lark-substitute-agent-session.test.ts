import { describe, expect, test } from "vitest";
import type { LarkSubstituteMode, LarkSubstituteTask } from "@getpaseo/protocol/messages";
import { findReusableLarkSubstituteAgentId } from "./lark-substitute-agent-session.js";

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
    messageContext: {
      privatePreviousMessageCount: 10,
      groupPreviousMessageCount: 10,
      groupFollowingMessageCount: 10,
    },
    autoArchiveAgent: false,
    activeTimeRanges: [],
    allowlist: [],
    denylist: [],
    target: {
      kind: "workspace",
      provider: "aiden_codex",
      model: "gpt-5.5",
      cwd: "/repo",
      workspaceId: null,
    },
    createdAt: "2026-09-10T01:00:00.000Z",
    updatedAt: "2026-09-10T01:00:00.000Z",
  };
}

function task(overrides: Partial<LarkSubstituteTask> = {}): LarkSubstituteTask {
  return {
    id: "task-1",
    modeId: "mode-1",
    modeName: "工作替身",
    botId: "bot-1",
    source: "group_listener",
    chatId: "oc_chat",
    chatName: "项目群",
    messageId: "om_1",
    senderOpenId: "ou_user",
    senderName: "用户",
    content: "问题",
    status: "completed",
    scheduledAt: null,
    startedAt: "2026-09-10T01:01:00.000Z",
    completedAt: "2026-09-10T01:02:00.000Z",
    agentId: "agent-1",
    error: null,
    failureStage: null,
    createdAt: "2026-09-10T01:01:00.000Z",
    updatedAt: "2026-09-10T01:02:00.000Z",
    ...overrides,
  };
}

describe("findReusableLarkSubstituteAgentId", () => {
  test("reuses the latest completed agent for the same substitute mode and source chat", () => {
    expect(
      findReusableLarkSubstituteAgentId({
        mode: mode(),
        chatId: "oc_chat",
        tasks: [
          task(),
          task({
            id: "task-2",
            agentId: "agent-2",
            updatedAt: "2026-09-10T01:03:00.000Z",
          }),
        ],
        isBusy: () => false,
      }),
    ).toBe("agent-2");
  });

  test("does not reuse busy, failed, other-chat, or pre-update agents", () => {
    expect(
      findReusableLarkSubstituteAgentId({
        mode: mode(),
        chatId: "oc_chat",
        tasks: [
          task({ agentId: "agent-busy" }),
          task({
            id: "failed",
            agentId: "agent-failed",
            status: "failed",
            updatedAt: "2026-09-10T01:04:00.000Z",
          }),
          task({
            id: "other-chat",
            agentId: "agent-other",
            chatId: "oc_other",
            updatedAt: "2026-09-10T01:05:00.000Z",
          }),
          task({
            id: "old",
            agentId: "agent-old",
            createdAt: "2026-09-09T01:00:00.000Z",
            updatedAt: "2026-09-10T01:06:00.000Z",
          }),
        ],
        isBusy: (agentId) => agentId === "agent-busy",
      }),
    ).toBeNull();
  });
});
