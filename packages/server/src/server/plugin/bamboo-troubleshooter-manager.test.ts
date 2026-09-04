import { describe, expect, it, vi } from "vitest";
import type { PluginAppState } from "@getpaseo/protocol/messages";
import { createTestLogger } from "../../test-utils/test-logger.js";
import {
  BambooTroubleshooterManager,
  buildRealtimeBambooScanWindow,
  buildScheduledBambooScanWindow,
  isBambooAlertMessage,
} from "./bamboo-troubleshooter-manager.js";

const CONFIG = {
  version: 1 as const,
  enabled: true,
  botId: "bot-1",
  chats: [{ chatId: "oc_alerts", name: "结算报警群", groupId: "123" }],
  target: { kind: "default" as const },
  troubleshootingSopDoc: "https://example.com/wiki/sop",
  attributionRecordRoot: "https://example.com/wiki/records",
  schedule: {
    enabled: true,
    intervalMinutes: 30,
    lookbackMinutes: 120,
    excludeRecentMinutes: 30,
  },
};

function state(): PluginAppState {
  return {
    pluginId: "bamboo-reconciliation-troubleshooter",
    appId: "bamboo-troubleshooter-console",
    projectId: "prj_1",
    defaultAgent: { provider: "codex", model: "gpt-5.6" },
    knowledge: "",
    data: { bambooTroubleshooter: CONFIG },
    document: null,
    conversation: [],
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
  };
}

describe("BambooTroubleshooterManager", () => {
  it("builds the requested two-hour window while excluding the newest half hour", () => {
    const now = new Date("2026-09-04T08:00:00.000Z");
    const window = buildScheduledBambooScanWindow(now, CONFIG);
    expect(window.start.toISOString()).toBe("2026-09-04T06:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-09-04T07:30:00.000Z");
  });

  it("recognizes interactive Bamboo alarm cards", () => {
    expect(isBambooAlertMessage("Bamboo 对账报警 result_id=123", "interactive")).toBe(true);
    expect(isBambooAlertMessage("离线数据质量告警", "interactive")).toBe(true);
    expect(isBambooAlertMessage("普通聊天消息", "text")).toBe(false);
  });

  it("scans a matched group and starts a Project-scoped troubleshooting agent once", async () => {
    let current = state();
    const runScanner = vi.fn(async () => undefined);
    const createAgent = vi.fn(async () => ({
      snapshot: { id: "agent-1" },
      liveSnapshot: { id: "agent-1" },
      background: true,
      initialPromptStarted: true,
      initialPromptError: null,
    }));
    const manager = new BambooTroubleshooterManager({
      paseoHome: "/tmp/paseo",
      pluginService: {
        listAppProjects: () => [current],
        configureApp: (_pluginId, _appId, _projectId, _defaultAgent, data) => {
          current = { ...current, data: { ...current.data, ...data } };
          return current;
        },
      },
      projectRegistry: {
        get: async () => ({
          projectId: "prj_1",
          rootPath: "/tmp/project",
          kind: "non_git",
          displayName: "结算项目",
          projectKey: null,
          customName: null,
          customIconRevision: null,
          parentProjectId: null,
          createdAt: "2026-09-04T00:00:00.000Z",
          updatedAt: "2026-09-04T00:00:00.000Z",
          archivedAt: null,
        }),
      },
      assistantStore: { get: () => null },
      teamStore: { get: () => null },
      createAgent: createAgent as never,
      createProjectWorkspace: async () => ({ workspaceId: "ws-1", cwd: "/tmp/project" }),
      logger: createTestLogger(),
      now: () => new Date("2026-09-04T08:00:00.000Z"),
      runScanner,
    });

    const event = {
      eventId: "evt-1",
      messageId: "om-1",
      chatId: "oc_alerts",
      chatType: "group",
      messageType: "interactive",
      threadId: null,
      rootMessageId: null,
      openId: null,
      unionId: null,
      displayName: "Bamboo",
      topicName: "报警",
      text: "Bamboo 对账报警 result_id=123",
      createTime: Date.parse("2026-09-04T07:59:00.000Z"),
    };
    await manager.observeIncomingMessage("bot-1", event);
    await vi.waitFor(() => expect(createAgent).toHaveBeenCalledTimes(1));
    await manager.observeIncomingMessage("bot-1", event);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runScanner).toHaveBeenCalledTimes(1);
    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(createAgent.mock.calls[0]?.[0]).toMatchObject({
      provider: "codex/gpt-5.6",
      cwd: "/tmp/project",
      workspaceId: "ws-1",
      background: true,
      notifyOnFinish: true,
    });
    const realtime = buildRealtimeBambooScanWindow(
      new Date("2026-09-04T08:00:00.000Z"),
      event.createTime,
    );
    expect(realtime.start.toISOString()).toBe("2026-09-04T07:49:00.000Z");
    expect(realtime.end.toISOString()).toBe("2026-09-04T08:00:00.000Z");
    await manager.stop();
  });
});
