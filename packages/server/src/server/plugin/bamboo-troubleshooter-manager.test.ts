import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PluginAppState } from "@getpaseo/protocol/messages";
import { createTestLogger } from "../../test-utils/test-logger.js";
import {
  BambooTroubleshooterManager,
  buildRealtimeBambooScanWindow,
  buildScheduledBambooScanWindow,
  isBambooAlertMessage,
} from "./bamboo-troubleshooter-manager.js";
import type { AlertTroubleshooterRecordStore } from "./alert-troubleshooter-record-store.js";

const CONFIG = {
  version: 3 as const,
  enabled: true,
  listenEnabled: true,
  troubleshootingEnabled: true,
  botId: "bot-1",
  chats: [{ chatId: "oc_alerts", name: "结算报警群", groupId: "123" }],
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

  it("ingests both realtime and scanned messages before starting Project-scoped agents", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-bamboo-test-"));
    let current = state();
    const listChatMessages = vi.fn(async () => [
      {
        eventId: "history:om-2",
        messageId: "om-2",
        chatId: "oc_alerts",
        chatType: "group" as const,
        messageType: "interactive",
        threadId: null,
        rootMessageId: null,
        openId: null,
        unionId: null,
        senderType: "app",
        displayName: "Bamboo",
        topicName: "报警",
        text: "Bamboo 对账报警 result_id=456",
        createTime: Date.parse("2026-09-04T07:30:00.000Z"),
      },
      {
        eventId: "history:om-unrelated",
        messageId: "om-unrelated",
        chatId: "oc_alerts",
        chatType: "group" as const,
        messageType: "interactive",
        threadId: null,
        rootMessageId: null,
        openId: null,
        unionId: null,
        senderType: "app",
        displayName: "其他系统",
        topicName: "报警",
        text: "其他系统报警，请及时处理",
        createTime: Date.parse("2026-09-04T07:29:00.000Z"),
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
        const resultId = event.text.match(/result_id=(\d+)/u)?.[1] ?? null;
        const record = {
          recordId: `rec_${event.messageId}`,
          uniqueId: resultId ?? `message_id:${event.messageId}`,
          resultId,
          tableDate: "20260904",
          messageId: event.messageId,
          chatId: event.chatId,
          chatName: "结算报警群",
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
    const manager = new BambooTroubleshooterManager({
      paseoHome,
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
      recordStore,
      agentOrchestrator: async (input) => {
        const agent = await input.launchAgent({
          stage: "investigation",
          title: "Bamboo 对账自动排查",
          prompt: input.prompt,
          notifyOnFinish: true,
        });
        return {
          agentId: agent.agentId,
          completion: {
            status: "succeeded",
            summary: "排查完成",
            documentUrl: "https://example.com/wiki/result",
          },
        };
      },
      createAgent: createAgent as never,
      waitForAgentCompletion: async () => ({
        lastMessage:
          '{"status":"succeeded","summary":"排查完成","feishu_doc_url":"https://example.com/wiki/result"}',
      }),
      createProjectWorkspace: async () => ({ workspaceId: "ws-1", cwd: "/tmp/project" }),
      logger: createTestLogger(),
      now: () => new Date("2026-09-04T08:00:00.000Z"),
      listChatMessages,
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
    try {
      await manager.observeIncomingMessage("bot-1", {
        ...event,
        eventId: "evt-unrelated",
        messageId: "om-unrelated-realtime",
        displayName: "其他系统",
        text: "其他系统报警，请及时处理",
      });
      await manager.observeIncomingMessage("bot-1", event);
      await vi.waitFor(() => expect(createAgent).toHaveBeenCalledTimes(1));
      await manager.observeIncomingMessage("bot-1", event);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(recordStore.upsertMessage).toHaveBeenCalledTimes(1);
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

      manager.start();
      await vi.waitFor(() => expect(createAgent).toHaveBeenCalledTimes(2));
      expect(listChatMessages).toHaveBeenCalledWith("bot-1", "oc_alerts", {
        start: new Date("2026-09-04T06:00:00.000Z"),
        end: new Date("2026-09-04T07:30:00.000Z"),
      });
      expect(recordStore.upsertMessage).toHaveBeenCalledTimes(2);
    } finally {
      await manager.stop();
      rmSync(paseoHome, { recursive: true, force: true });
    }
  });

  it("narrows each group scan after the latest persisted message and isolates group failures", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-bamboo-scan-test-"));
    let current = {
      ...state(),
      data: {
        bambooTroubleshooter: {
          ...CONFIG,
          chats: [
            { chatId: "oc_failed", name: "失败群" },
            { chatId: "oc_ok", name: "正常群" },
          ],
        },
      },
    };
    const listChatMessages = vi.fn(async (_botId: string, chatId: string) => {
      if (chatId === "oc_failed") throw new Error("临时网络错误");
      return [];
    });
    const recordStore = {
      upsertMessage: vi.fn(),
      listUnclaimed: vi.fn(async () => []),
      getRecord: vi.fn(),
      getRecordByUniqueId: vi.fn(),
      markRunning: vi.fn(),
      markSucceeded: vi.fn(),
      markPaused: vi.fn(),
      markFailed: vi.fn(),
      getLatestMessageTimeByChat: vi.fn(async ({ chatId }: { chatId: string }) =>
        chatId === "oc_ok" ? Date.parse("2026-09-04T07:00:00.000Z") : null,
      ),
    } satisfies AlertTroubleshooterRecordStore;
    const manager = new BambooTroubleshooterManager({
      paseoHome,
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
      recordStore,
      createAgent: vi.fn() as never,
      createProjectWorkspace: async () => ({ workspaceId: "ws-1", cwd: "/tmp/project" }),
      logger: createTestLogger(),
      now: () => new Date("2026-09-04T08:00:00.000Z"),
      listChatMessages,
    });

    try {
      manager.start();
      await vi.waitFor(() => expect(listChatMessages).toHaveBeenCalledTimes(2));
      expect(listChatMessages).toHaveBeenCalledWith("bot-1", "oc_ok", {
        start: new Date("2026-09-04T07:00:00.001Z"),
        end: new Date("2026-09-04T07:30:00.000Z"),
      });
      expect(manager.listTasks("prj_1")).toEqual([
        expect.objectContaining({
          trigger: "schedule",
          status: "failed",
          error: "扫描飞书群 失败群 失败：临时网络错误",
        }),
      ]);
    } finally {
      await manager.stop();
      rmSync(paseoHome, { recursive: true, force: true });
    }
  });
});
