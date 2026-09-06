import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PluginAppState } from "@getpaseo/protocol/messages";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { ArgosTroubleshooterManager, isArgosAlertMessage } from "./argos-troubleshooter-manager.js";
import type { AlertTroubleshooterRecordStore } from "./alert-troubleshooter-record-store.js";

const CONFIG = {
  version: 3 as const,
  enabled: true,
  listenEnabled: true,
  troubleshootingEnabled: true,
  botId: "bot-1",
  chats: [{ chatId: "oc_alerts", name: "Argos 告警群", groupId: "123" }],
  target: { kind: "default" as const },
  troubleshootingSopDoc: "https://example.com/wiki/sop",
  attributionRecordRoot: "https://example.com/wiki/records",
  recordTableUrl: "https://example.com/base/alerts?table=tbl_alerts",
  promptTemplate: "",
  queuePollIntervalMinutes: 5,
  schedule: {
    enabled: true,
    intervalMinutes: 30,
    lookbackMinutes: 120,
    excludeRecentMinutes: 30,
  },
};

function state(): PluginAppState {
  return {
    pluginId: "argos-alert-troubleshooter",
    appId: "argos-troubleshooter-console",
    projectId: "prj_1",
    defaultAgent: { provider: "aiden-codex", model: "gpt-5.5" },
    knowledge: "",
    data: { argosTroubleshooter: CONFIG },
    document: null,
    conversation: [],
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
  };
}

function project() {
  return {
    projectId: "prj_1",
    rootPath: "/tmp/project",
    kind: "non_git" as const,
    displayName: "支付项目",
    projectKey: null,
    customName: null,
    customIconRevision: null,
    parentProjectId: null,
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    archivedAt: null,
  };
}

describe("ArgosTroubleshooterManager", () => {
  it("recognizes Argos alerts without consuming Bamboo alerts", () => {
    expect(isArgosAlertMessage("Argos 服务告警 event_id=123", "interactive")).toBe(true);
    expect(isArgosAlertMessage("阿尔戈斯报警 rule_id=456", "text")).toBe(true);
    expect(isArgosAlertMessage("Bamboo 对账报警 result_id=789", "interactive")).toBe(false);
  });

  it("scans the requested historical window and only starts an agent for Argos alerts", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-argos-test-"));
    let current = state();
    const listChatMessages = vi.fn(async () => [
      {
        eventId: "history:om_argos",
        messageId: "om_argos",
        chatId: "oc_alerts",
        chatType: "group",
        messageType: "interactive",
        threadId: null,
        rootMessageId: null,
        openId: null,
        unionId: null,
        senderType: "app",
        displayName: "Argos",
        topicName: "服务告警",
        text: "Argos 服务告警 event_id=123",
        createTime: Date.parse("2026-09-04T07:00:00.000Z"),
      },
      {
        eventId: "history:om_bamboo",
        messageId: "om_bamboo",
        chatId: "oc_alerts",
        chatType: "group",
        messageType: "interactive",
        threadId: null,
        rootMessageId: null,
        openId: null,
        unionId: null,
        senderType: "app",
        displayName: "Bamboo",
        topicName: "对账报警",
        text: "Bamboo 对账报警 result_id=456",
        createTime: Date.parse("2026-09-04T07:10:00.000Z"),
      },
    ]);
    const createAgent = vi.fn(async () => ({
      snapshot: { id: "agent-1" },
      liveSnapshot: { id: "agent-1" },
      background: true,
      initialPromptStarted: true,
      initialPromptError: null,
    }));
    const records = new Map<
      string,
      Awaited<ReturnType<AlertTroubleshooterRecordStore["getRecord"]>>
    >();
    const recordStore: AlertTroubleshooterRecordStore = {
      upsertMessage: vi.fn(async ({ event, trigger }) => {
        const record = {
          recordId: `rec_${event.messageId}`,
          messageId: event.messageId,
          chatId: event.chatId,
          chatName: "Argos 告警群",
          messageText: event.text,
          messageTime: new Date(event.createTime ?? 0).toISOString(),
          trigger,
        };
        records.set(record.recordId, record);
        return record;
      }),
      listUnclaimed: vi.fn(async () => []),
      getRecord: vi.fn(async ({ recordId }) => records.get(recordId) ?? null),
      markRunning: vi.fn(async () => undefined),
      markSucceeded: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
    };
    const manager = new ArgosTroubleshooterManager({
      paseoHome,
      pluginService: {
        listAppProjects: () => [current],
        configureApp: (_pluginId, _appId, _projectId, _defaultAgent, data) => {
          current = { ...current, data: { ...current.data, ...data } };
          return current;
        },
      },
      projectRegistry: { get: async () => project() },
      assistantStore: { get: () => null },
      teamStore: { get: () => null },
      recordStore,
      createAgent: createAgent as never,
      createProjectWorkspace: async () => ({ workspaceId: "ws-1", cwd: "/tmp/project" }),
      listChatMessages,
      logger: createTestLogger(),
      now: () => new Date("2026-09-04T08:00:00.000Z"),
    });

    try {
      manager.start();
      await vi.waitFor(() => expect(createAgent).toHaveBeenCalledTimes(1));

      expect(listChatMessages).toHaveBeenCalledWith("bot-1", "oc_alerts", {
        start: new Date("2026-09-04T06:00:00.000Z"),
        end: new Date("2026-09-04T07:30:00.000Z"),
      });
      expect(createAgent.mock.calls[0]?.[0]).toMatchObject({
        provider: "aiden-codex/gpt-5.5",
        workspaceId: "ws-1",
        background: true,
      });
      const prompt = createAgent.mock.calls[0]?.[0].initialPrompt ?? "";
      expect(prompt).toContain("Argos 服务告警 event_id=123");
      expect(prompt).not.toContain("Bamboo 对账报警");
      expect(prompt).toContain("https://example.com/wiki/sop");
      expect(prompt).toContain("https://example.com/wiki/records");
    } finally {
      await manager.stop();
      rmSync(paseoHome, { recursive: true, force: true });
    }
  });
});
