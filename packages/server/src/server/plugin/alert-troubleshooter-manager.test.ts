import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AlertTroubleshooterConfigSchema,
  type AlertTroubleshooterConfig,
  type PluginAppState,
} from "@getpaseo/protocol/messages";
import { createTestLogger } from "../../test-utils/test-logger.js";
import {
  ProjectAlertTroubleshooterManager,
  type AlertTroubleshooterDefinition,
} from "./alert-troubleshooter-manager.js";
import type {
  AlertTroubleshooterRecord,
  AlertTroubleshooterRecordStore,
} from "./alert-troubleshooter-record-store.js";

const temporaryHomes: string[] = [];

function config(patch: Partial<AlertTroubleshooterConfig> = {}): AlertTroubleshooterConfig {
  return AlertTroubleshooterConfigSchema.parse({
    botId: "bot-1",
    chats: [{ chatId: "oc_alerts", name: "报警群" }],
    target: { kind: "default" },
    troubleshootingSopDoc: "https://example.com/wiki/sop",
    attributionRecordRoot: "https://example.com/wiki/records",
    recordTableUrl: "https://example.com/base/alerts?table=tbl_alerts",
    schedule: {
      enabled: false,
      intervalMinutes: 30,
      lookbackMinutes: 120,
      excludeRecentMinutes: 0,
    },
    ...patch,
  });
}

function createHarness(input?: {
  config?: AlertTroubleshooterConfig;
  records?: AlertTroubleshooterRecord[];
  recordStoreOverrides?: Partial<AlertTroubleshooterRecordStore>;
  waitForAgentCompletion?: (agentId: string) => Promise<void>;
}) {
  const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-alert-manager-"));
  temporaryHomes.push(paseoHome);
  const activeConfig = input?.config ?? config();
  let state: PluginAppState = {
    pluginId: "test-alert-plugin",
    appId: "test-alert-app",
    projectId: "prj_1",
    defaultAgent: { provider: "codex", model: "gpt-5.6" },
    knowledge: "",
    data: { alertConfig: activeConfig },
    document: null,
    conversation: [],
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
  };
  const storedRecords = new Map(
    (input?.records ?? []).map((record) => [record.recordId, record] as const),
  );
  const recordStore: AlertTroubleshooterRecordStore = {
    upsertMessage: vi.fn(async ({ event, trigger }) => {
      const record: AlertTroubleshooterRecord = {
        recordId: `rec_${event.messageId}`,
        uniqueId: `message_id:${event.messageId}`,
        resultId: null,
        tableDate: "20260906",
        messageId: event.messageId,
        chatId: event.chatId,
        chatName: "报警群",
        messageText: event.text,
        messageTime: event.createTime ? new Date(event.createTime).toISOString() : null,
        trigger,
      };
      storedRecords.set(record.recordId, record);
      return record;
    }),
    listUnclaimed: vi.fn(async () => [...storedRecords.values()]),
    getRecord: vi.fn(async ({ recordId }) => storedRecords.get(recordId) ?? null),
    getRecordByUniqueId: vi.fn(
      async ({ uniqueId }) =>
        [...storedRecords.values()].find((record) => record.uniqueId === uniqueId) ?? null,
    ),
    upsertManualResult: vi.fn(async ({ resultId }) => {
      const record: AlertTroubleshooterRecord = {
        recordId: `rec_result_${resultId}`,
        uniqueId: `result_id:${resultId}`,
        resultId,
        tableDate: "20260906",
        messageId: null,
        chatId: null,
        chatName: null,
        messageText: `手动指定 Bamboo result_id 进行调试：${resultId}`,
        messageTime: "2026-09-06T08:00:00.000Z",
        trigger: "manual",
      };
      storedRecords.set(record.recordId, record);
      return record;
    }),
    markRunning: vi.fn(async () => undefined),
    markSucceeded: vi.fn(async () => undefined),
    markPaused: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
  };
  Object.assign(recordStore, input?.recordStoreOverrides);
  const scanMessages = vi.fn(async () => []);
  const definition: AlertTroubleshooterDefinition = {
    pluginId: "test-alert-plugin",
    appId: "test-alert-app",
    configDataKey: "alertConfig",
    runtimeDataKey: "alertRuntime",
    logModule: "test-alert-manager",
    agentTitle: "测试报警排查",
    labelKey: "testAlert",
    parseConfig: (value) => {
      const parsed = AlertTroubleshooterConfigSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    },
    matchesAlert: () => true,
    scanMessages,
    buildDefaultPrompt: ({ record }) => `处理 ${record.recordId}`,
  };
  const createAgent = vi.fn(async () => ({
    snapshot: { id: `agent-${createAgent.mock.calls.length}` },
    liveSnapshot: { id: `agent-${createAgent.mock.calls.length}` },
    background: true,
    initialPromptStarted: true,
    initialPromptError: null,
  }));
  const manager = new ProjectAlertTroubleshooterManager({
    paseoHome,
    definition,
    pluginService: {
      listAppProjects: () => [state],
      configureApp: (_pluginId, _appId, _projectId, _defaultAgent, data) => {
        state = { ...state, data: { ...state.data, ...data } };
        return state;
      },
    },
    projectRegistry: {
      get: async () => ({
        projectId: "prj_1",
        rootPath: "/tmp/project",
        kind: "non_git",
        displayName: "报警项目",
        projectKey: null,
        customName: null,
        customIconRevision: null,
        parentProjectId: null,
        createdAt: "2026-09-06T00:00:00.000Z",
        updatedAt: "2026-09-06T00:00:00.000Z",
        archivedAt: null,
      }),
    },
    assistantStore: { get: () => null },
    teamStore: { get: () => null },
    recordStore,
    createAgent: createAgent as never,
    waitForAgentCompletion: input?.waitForAgentCompletion ?? (async () => undefined),
    createProjectWorkspace: async () => ({ workspaceId: "ws-1", cwd: "/tmp/project" }),
    logger: createTestLogger(),
    now: () => new Date("2026-09-06T08:00:00.000Z"),
  });
  return { paseoHome, manager, recordStore, scanMessages, createAgent };
}

function message() {
  return {
    eventId: "evt-1",
    messageId: "om-1",
    chatId: "oc_alerts",
    chatType: "group" as const,
    messageType: "interactive",
    threadId: null,
    rootMessageId: null,
    openId: null,
    unionId: null,
    displayName: "报警机器人",
    topicName: "报警",
    text: "测试报警",
    createTime: Date.parse("2026-09-06T07:59:00.000Z"),
  };
}

afterEach(() => {
  for (const home of temporaryHomes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

describe("ProjectAlertTroubleshooterManager", () => {
  it("keeps listening, scheduled scanning, and troubleshooting independently switchable", async () => {
    const harness = createHarness({
      config: config({
        listenEnabled: false,
        troubleshootingEnabled: false,
        schedule: {
          enabled: false,
          intervalMinutes: 30,
          lookbackMinutes: 120,
          excludeRecentMinutes: 0,
        },
      }),
    });

    await harness.manager.observeIncomingMessage("bot-1", message());
    harness.manager.start();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(harness.recordStore.upsertMessage).not.toHaveBeenCalled();
    expect(harness.scanMessages).not.toHaveBeenCalled();
    expect(harness.recordStore.listUnclaimed).not.toHaveBeenCalled();
    expect(harness.createAgent).not.toHaveBeenCalled();
    await harness.manager.stop();
  });

  it("polls unclaimed Base rows when the local queue is empty", async () => {
    const record: AlertTroubleshooterRecord = {
      recordId: "rec_table",
      uniqueId: "message_id:om_table",
      resultId: null,
      tableDate: "20260906",
      messageId: "om_table",
      chatId: "oc_alerts",
      chatName: "报警群",
      messageText: "来自多维表格的报警",
      messageTime: "2026-09-06T07:30:00.000Z",
      trigger: "table",
    };
    const harness = createHarness({ records: [record] });

    harness.manager.start();
    await vi.waitFor(() => expect(harness.createAgent).toHaveBeenCalledTimes(1));

    expect(harness.recordStore.listUnclaimed).toHaveBeenCalledTimes(1);
    expect(harness.recordStore.markRunning).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: "rec_table" }),
    );
    expect(harness.recordStore.markSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: "rec_table" }),
    );
    await harness.manager.stop();
  });

  it("records daily table permission failures in the task list with the actionable reason", async () => {
    const permissionError =
      "飞书机器人应用身份权限不足，请更新机器人权限（缺少 wiki:node:create；错误码 99991672）。请开通后重新执行任务。";
    const harness = createHarness({
      recordStoreOverrides: {
        listUnclaimed: vi.fn(async () => {
          throw new Error(permissionError);
        }),
      },
    });

    harness.manager.start();
    await vi.waitFor(() => expect(harness.manager.listTasks("prj_1")).toHaveLength(1));

    expect(harness.manager.listTasks("prj_1")[0]).toMatchObject({
      trigger: "table",
      status: "failed",
      error: `读取或创建日报多维表格失败：${permissionError}`,
    });
    await harness.manager.stop();
  });

  it("records realtime message ingestion permission failures in the task list", async () => {
    const permissionError =
      "飞书机器人应用身份权限不足，请更新机器人权限（缺少 base:record:create；错误码 99991672）。请开通后重新执行任务。";
    const harness = createHarness({
      recordStoreOverrides: {
        upsertMessage: vi.fn(async () => {
          throw new Error(permissionError);
        }),
      },
    });

    await expect(harness.manager.observeIncomingMessage("bot-1", message())).rejects.toThrow(
      `写入日报多维表格失败：${permissionError}`,
    );

    expect(harness.manager.listTasks("prj_1")[0]).toMatchObject({
      uniqueId: "message_id:om-1",
      messageId: "om-1",
      trigger: "message",
      status: "failed",
      error: `写入日报多维表格失败：${permissionError}`,
    });
  });

  it("renders Project variables in a custom processing prompt", async () => {
    const record: AlertTroubleshooterRecord = {
      recordId: "rec_prompt",
      uniqueId: "message_id:om_prompt",
      resultId: null,
      tableDate: "20260906",
      messageId: "om_prompt",
      chatId: "oc_alerts",
      chatName: "报警群",
      messageText: "余额不一致",
      messageTime: "2026-09-06T07:30:00.000Z",
      trigger: "table",
    };
    const harness = createHarness({
      config: config({
        promptTemplate:
          "owner={{owner_name}} project={{project_id}} record={{record_id}} message={{message_text}}",
      }),
      records: [record],
    });
    const configDirectory = path.join(harness.paseoHome, "projects", "prj_1");
    mkdirSync(configDirectory, { recursive: true });
    writeFileSync(
      path.join(configDirectory, "paseo.json"),
      `${JSON.stringify({ project: { variables: { ownerName: "settlement" } } }, null, 2)}\n`,
      "utf8",
    );

    harness.manager.start();
    await vi.waitFor(() => expect(harness.createAgent).toHaveBeenCalledTimes(1));

    expect(harness.createAgent.mock.calls[0]?.[0].initialPrompt).toBe(
      "owner=settlement project=prj_1 record=rec_prompt message=余额不一致",
    );
    await harness.manager.stop();
  });

  it("waits for each task to finish before processing the next queued row", async () => {
    const records: AlertTroubleshooterRecord[] = [
      {
        recordId: "rec_first",
        uniqueId: "message_id:om_first",
        resultId: null,
        tableDate: "20260906",
        messageId: "om_first",
        chatId: "oc_alerts",
        chatName: "报警群",
        messageText: "第一条报警",
        messageTime: "2026-09-06T07:20:00.000Z",
        trigger: "table",
      },
      {
        recordId: "rec_second",
        uniqueId: "message_id:om_second",
        resultId: null,
        tableDate: "20260906",
        messageId: "om_second",
        chatId: "oc_alerts",
        chatName: "报警群",
        messageText: "第二条报警",
        messageTime: "2026-09-06T07:30:00.000Z",
        trigger: "table",
      },
    ];
    let releaseFirst!: () => void;
    const firstCompletion = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const harness = createHarness({
      records,
      waitForAgentCompletion: (agentId) =>
        agentId === "agent-1" ? firstCompletion : Promise.resolve(),
    });

    harness.manager.start();
    await vi.waitFor(() => expect(harness.createAgent).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(harness.createAgent).toHaveBeenCalledTimes(1);

    releaseFirst();
    await vi.waitFor(() => expect(harness.createAgent).toHaveBeenCalledTimes(2));
    await harness.manager.stop();
  });

  it("runs a manually selected Base row even when automatic troubleshooting is disabled", async () => {
    const record: AlertTroubleshooterRecord = {
      recordId: "rec_manual",
      uniqueId: "message_id:om_manual",
      resultId: null,
      tableDate: "20260906",
      messageId: "om_manual",
      chatId: "oc_alerts",
      chatName: "报警群",
      messageText: "手动调试",
      messageTime: "2026-09-06T07:30:00.000Z",
      trigger: "manual",
    };
    const harness = createHarness({
      config: config({ troubleshootingEnabled: false }),
      records: [record],
    });

    await expect(harness.manager.enqueueRecord("prj_1", "message_id:om_manual")).resolves.toBe(
      true,
    );
    await vi.waitFor(() => expect(harness.createAgent).toHaveBeenCalledTimes(1));

    expect(harness.recordStore.markRunning).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: "rec_manual" }),
    );
    await harness.manager.stop();
  });

  it("creates a manual Base record from Bamboo result_id and starts troubleshooting", async () => {
    const harness = createHarness({
      config: config({ troubleshootingEnabled: false }),
    });

    await expect(harness.manager.enqueueResultId("prj_1", "result_id:123456")).resolves.toBe(true);
    await vi.waitFor(() => expect(harness.createAgent).toHaveBeenCalledTimes(1));

    expect(harness.recordStore.upsertManualResult).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "prj_1",
        resultId: "123456",
      }),
    );
    expect(harness.recordStore.markRunning).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: "rec_result_123456" }),
    );
    await harness.manager.stop();
  });
});
