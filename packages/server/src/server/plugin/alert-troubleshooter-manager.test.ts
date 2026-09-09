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

function createAgentLifecycleHarness(input?: {
  initialPromptError?: Error | null;
  archiveAgent?: (agentId: string) => Promise<void>;
}) {
  const createAgent = vi.fn(async () => ({
    snapshot: { id: `agent-${createAgent.mock.calls.length}` },
    liveSnapshot: { id: `agent-${createAgent.mock.calls.length}` },
    background: true,
    initialPromptStarted: true,
    initialPromptError: input?.initialPromptError ?? null,
  }));
  const archiveAgent = vi.fn(input?.archiveAgent ?? (async () => undefined));
  return { createAgent, archiveAgent };
}

function autoArchiveDefinitionOptions(input?: {
  executeRecord?: AlertTroubleshooterDefinition["executeRecord"];
  supportsAgentAutoArchive?: boolean;
}): Partial<Pick<AlertTroubleshooterDefinition, "supportsAgentAutoArchive" | "executeRecord">> {
  return {
    supportsAgentAutoArchive: input?.supportsAgentAutoArchive ?? false,
    ...(input?.executeRecord ? { executeRecord: input.executeRecord } : {}),
  };
}

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
  runtime?: Record<string, unknown>;
  records?: AlertTroubleshooterRecord[];
  recordStoreOverrides?: Partial<AlertTroubleshooterRecordStore>;
  waitForAgentCompletion?: (agentId: string) => Promise<{ lastMessage: string | null } | void>;
  parseCompletion?: AlertTroubleshooterDefinition["parseCompletion"];
  buildPromptAppendix?: AlertTroubleshooterDefinition["buildPromptAppendix"];
  validateRecord?: AlertTroubleshooterDefinition["validateRecord"];
  classifyFailure?: AlertTroubleshooterDefinition["classifyFailure"];
  executeRecord?: AlertTroubleshooterDefinition["executeRecord"];
  maxAutomaticRetries?: number;
  supportsAgentAutoArchive?: boolean;
  initialPromptError?: Error | null;
  archiveAgent?: (agentId: string) => Promise<void>;
  matchesAlert?: AlertTroubleshooterDefinition["matchesAlert"];
  scanMessages?: AlertTroubleshooterDefinition["scanMessages"];
}) {
  const options = input ?? {};
  const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-alert-manager-"));
  temporaryHomes.push(paseoHome);
  const activeConfig = options.config ?? config();
  let state: PluginAppState = {
    pluginId: "test-alert-plugin",
    appId: "test-alert-app",
    projectId: "prj_1",
    defaultAgent: { provider: "codex", model: "gpt-5.6" },
    knowledge: "",
    data: {
      alertConfig: activeConfig,
      ...(options.runtime ? { alertRuntime: options.runtime } : {}),
    },
    document: null,
    conversation: [],
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
  };
  const storedRecords = new Map(
    (options.records ?? []).map((record) => [record.recordId, record] as const),
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
    markRetryScheduled: vi.fn(async () => undefined),
    markPending: vi.fn(async () => undefined),
    markOutcome: vi.fn(async () => undefined),
  };
  Object.assign(recordStore, options.recordStoreOverrides);
  const scanMessages = vi.fn(options.scanMessages ?? (async () => []));
  const definition: AlertTroubleshooterDefinition = {
    pluginId: "test-alert-plugin",
    appId: "test-alert-app",
    configDataKey: "alertConfig",
    runtimeDataKey: "alertRuntime",
    logModule: "test-alert-manager",
    agentTitle: "测试报警排查",
    labelKey: "testAlert",
    ...(options.maxAutomaticRetries === undefined
      ? {}
      : { maxAutomaticRetries: options.maxAutomaticRetries }),
    parseConfig: (value) => {
      const parsed = AlertTroubleshooterConfigSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    },
    ...(options.validateRecord ? { validateRecord: options.validateRecord } : {}),
    ...(options.classifyFailure ? { classifyFailure: options.classifyFailure } : {}),
    matchesAlert: options.matchesAlert ?? (() => true),
    scanMessages,
    buildDefaultPrompt: ({ record }) => `处理 ${record.recordId}`,
    ...(options.buildPromptAppendix ? { buildPromptAppendix: options.buildPromptAppendix } : {}),
    ...(options.parseCompletion ? { parseCompletion: options.parseCompletion } : {}),
    ...autoArchiveDefinitionOptions(options),
  };
  const { createAgent, archiveAgent } = createAgentLifecycleHarness(options);
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
    waitForAgentCompletion: options.waitForAgentCompletion ?? (async () => undefined),
    archiveAgent,
    createProjectWorkspace: async () => ({ workspaceId: "ws-1", cwd: "/tmp/project" }),
    logger: createTestLogger(),
    now: () => new Date("2026-09-06T08:00:00.000Z"),
  });
  return {
    paseoHome,
    manager,
    recordStore,
    scanMessages,
    createAgent,
    archiveAgent,
    getState: () => state,
  };
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

function findTask(
  tasks: ReturnType<ProjectAlertTroubleshooterManager["listTasks"]>,
  uniqueId: string,
  options: {
    excludedId?: string;
    status?: ReturnType<ProjectAlertTroubleshooterManager["listTasks"]>[number]["status"];
  } = {},
) {
  return tasks.find(
    (task) =>
      task.uniqueId === uniqueId &&
      task.id !== options.excludedId &&
      (options.status === undefined || task.status === options.status),
  );
}

afterEach(() => {
  for (const home of temporaryHomes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

describe("ProjectAlertTroubleshooterManager", () => {
  it("silently ignores realtime messages that do not match the alert definition", async () => {
    const harness = createHarness({
      matchesAlert: () => false,
    });

    await expect(harness.manager.observeIncomingMessage("bot-1", message())).resolves.toBe(
      undefined,
    );

    expect(harness.recordStore.upsertMessage).not.toHaveBeenCalled();
    expect(harness.manager.listTasks("prj_1")).toEqual([]);
  });

  it("silently ignores scanned messages that do not match the alert definition", async () => {
    const harness = createHarness({
      config: config({
        schedule: {
          enabled: true,
          intervalMinutes: 30,
          lookbackMinutes: 120,
          excludeRecentMinutes: 0,
        },
      }),
      matchesAlert: () => false,
      scanMessages: async () => ({
        events: [message()],
        failures: [],
        auditFile: "/tmp/project/.tmp/bamboo-scan-audits/scan.json",
      }),
    });

    harness.manager.start();
    await vi.waitFor(() =>
      expect(harness.getState().data.alertRuntime).toMatchObject({
        status: "idle",
        lastScanFinishedAt: "2026-09-06T08:00:00.000Z",
        lastScanAuditFile: "/tmp/project/.tmp/bamboo-scan-audits/scan.json",
      }),
    );

    expect(harness.recordStore.upsertMessage).not.toHaveBeenCalled();
    expect(harness.manager.listTasks("prj_1")).toEqual([]);
    await harness.manager.stop();
  });

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

  it("records a table poll performed by scheduled scanning", async () => {
    const harness = createHarness({
      config: config({
        schedule: {
          enabled: true,
          intervalMinutes: 30,
          lookbackMinutes: 120,
          excludeRecentMinutes: 0,
        },
      }),
    });

    harness.manager.start();
    await vi.waitFor(() => expect(harness.recordStore.listUnclaimed).toHaveBeenCalledTimes(1));

    expect(harness.getState().data.alertRuntime).toMatchObject({
      lastQueuePollAt: "2026-09-06T08:00:00.000Z",
    });
    await harness.manager.stop();
  });

  it("honors the persisted table poll timestamp after restart", async () => {
    const harness = createHarness({
      config: config({ queuePollIntervalMinutes: 30 }),
      runtime: {
        status: "idle",
        lastQueuePollAt: "2026-09-06T07:45:00.000Z",
      },
    });

    harness.manager.start();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(harness.recordStore.listUnclaimed).not.toHaveBeenCalled();
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

  it("retries a local table-poll failure without treating its synthetic id as a Base record", async () => {
    const listUnclaimed = vi
      .fn<AlertTroubleshooterRecordStore["listUnclaimed"]>()
      .mockRejectedValueOnce(new Error("日报服务暂时不可用"))
      .mockResolvedValue([]);
    const harness = createHarness({
      recordStoreOverrides: { listUnclaimed },
    });

    harness.manager.start();
    await vi.waitFor(() =>
      expect(harness.manager.listTasks("prj_1")[0]).toMatchObject({
        status: "failed",
        error: "读取或创建日报多维表格失败：日报服务暂时不可用",
      }),
    );
    const failedTask = harness.manager.listTasks("prj_1")[0]!;

    await expect(harness.manager.enqueueRecord("prj_1", failedTask.uniqueId)).resolves.toBe(true);
    await vi.waitFor(() =>
      expect(
        findTask(harness.manager.listTasks("prj_1"), failedTask.uniqueId, {
          status: "succeeded",
        }),
      ).toBeDefined(),
    );

    expect(listUnclaimed).toHaveBeenCalledTimes(2);
    expect(harness.recordStore.getRecord).not.toHaveBeenCalled();
    expect(harness.recordStore.markRetryScheduled).not.toHaveBeenCalled();
    expect(harness.recordStore.markFailed).not.toHaveBeenCalled();
    await harness.manager.stop();
  });

  it("automatically retries a persisted legacy stage task without calling the Base record API", async () => {
    const listUnclaimed = vi.fn<AlertTroubleshooterRecordStore["listUnclaimed"]>(async () => []);
    const harness = createHarness({
      config: config({ queuePollIntervalMinutes: 30 }),
      recordStoreOverrides: { listUnclaimed },
      maxAutomaticRetries: 3,
    });
    const queueDirectory = path.join(
      harness.paseoHome,
      "projects",
      "prj_1",
      "plugin-data",
      "test-alert-plugin",
    );
    mkdirSync(queueDirectory, { recursive: true });
    writeFileSync(
      path.join(queueDirectory, "alert-queue.json"),
      `${JSON.stringify(
        {
          version: 2,
          items: [
            {
              id: "legacy-table-poll",
              recordId: "failed:legacy-table-poll",
              uniqueId: "table_poll:2026-09-06T07:00:00.000Z",
              resultId: null,
              tableDate: "20260906",
              messageId: null,
              trigger: "table",
              status: "failed",
              matchedCount: 1,
              attempts: 0,
              queuedAt: "2026-09-06T07:00:00.000Z",
              updatedAt: "2026-09-06T07:00:00.000Z",
              nextRetryAt: "2026-09-06T07:30:00.000Z",
              agentId: null,
              error: "读取或创建日报多维表格失败：旧错误",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    harness.manager.start();
    await vi.waitFor(() =>
      expect(harness.manager.listTasks("prj_1")[0]).toMatchObject({
        id: "legacy-table-poll",
        status: "succeeded",
        attempts: 1,
      }),
    );

    expect(listUnclaimed).toHaveBeenCalledTimes(1);
    expect(harness.recordStore.getRecord).not.toHaveBeenCalled();
    expect(harness.recordStore.markRetryScheduled).not.toHaveBeenCalled();
    expect(harness.recordStore.markFailed).not.toHaveBeenCalled();
    await harness.manager.stop();
  });

  it("preserves the original stage error when a local table-poll retry also fails", async () => {
    const listUnclaimed = vi.fn<AlertTroubleshooterRecordStore["listUnclaimed"]>(async () => {
      throw new Error("飞书日报读取仍然失败");
    });
    const harness = createHarness({
      recordStoreOverrides: { listUnclaimed },
    });

    harness.manager.start();
    await vi.waitFor(() => expect(harness.manager.listTasks("prj_1")).toHaveLength(1));
    const failedTask = harness.manager.listTasks("prj_1")[0]!;
    await harness.manager.enqueueRecord("prj_1", failedTask.uniqueId);

    await vi.waitFor(() =>
      expect(
        findTask(harness.manager.listTasks("prj_1"), failedTask.uniqueId, {
          excludedId: failedTask.id,
        }),
      ).toMatchObject({
        status: "failed",
        error: "读取或创建日报多维表格失败：飞书日报读取仍然失败",
      }),
    );
    expect(harness.recordStore.getRecord).not.toHaveBeenCalled();
    expect(harness.recordStore.markFailed).not.toHaveBeenCalled();
    await harness.manager.stop();
  });

  it("relocates a stale Base record by unique_id and persists the new record reference", async () => {
    const staleRecord: AlertTroubleshooterRecord = {
      recordId: "rec_stale",
      uniqueId: "19626626",
      resultId: "19626626",
      tableDate: "20260906",
      messageId: null,
      chatId: null,
      chatName: null,
      messageText: "Bamboo 对账报警",
      messageTime: "2026-09-06T07:30:00.000Z",
      trigger: "table",
    };
    const relocatedRecord = {
      ...staleRecord,
      recordId: "rec_current",
      tableDate: "20260907",
    };
    const harness = createHarness({
      records: [staleRecord],
      recordStoreOverrides: {
        getRecord: vi.fn(async () => {
          throw new Error("Lark API error: RecordIdNotFound (code: 1254043)");
        }),
        relocateRecord: vi.fn(async () => relocatedRecord),
        resolveExecutionContext: vi.fn(async () => ({
          wikiTarget: { spaceId: "space_current", parentNodeToken: "wiki_current" },
          closeContext: {
            baseToken: "base_current",
            tableId: "tbl_current",
            parentWikiToken: "wiki_current",
            targetSpaceId: "space_current",
          },
        })),
      },
    });

    harness.manager.start();
    await vi.waitFor(() =>
      expect(harness.recordStore.markRunning).toHaveBeenCalledWith(
        expect.objectContaining({
          recordId: "rec_current",
          tableDate: "20260907",
        }),
      ),
    );

    expect(harness.manager.listTasks("prj_1")[0]).toMatchObject({
      recordId: "rec_current",
      uniqueId: "19626626",
      tableDate: "20260907",
      status: "succeeded",
    });
    expect(harness.recordStore.resolveExecutionContext).toHaveBeenCalledWith(
      expect.objectContaining({ tableDate: "20260907" }),
    );
    await harness.manager.stop();
  });

  it("stops retrying when a stale Base record cannot be relocated", async () => {
    const staleRecord: AlertTroubleshooterRecord = {
      recordId: "rec_deleted",
      uniqueId: "19626626",
      resultId: "19626626",
      tableDate: "20260906",
      messageId: null,
      chatId: null,
      chatName: null,
      messageText: "Bamboo 对账报警",
      messageTime: "2026-09-06T07:30:00.000Z",
      trigger: "table",
    };
    const harness = createHarness({
      records: [staleRecord],
      maxAutomaticRetries: 3,
      recordStoreOverrides: {
        getRecord: vi.fn(async () => {
          throw new Error("Lark API error: RecordIdNotFound (code: 1254043)");
        }),
        relocateRecord: vi.fn(async () => null),
      },
    });

    harness.manager.start();
    await vi.waitFor(() =>
      expect(harness.manager.listTasks("prj_1")[0]).toMatchObject({
        status: "pending",
        nextRetryAt: null,
        error: "日报记录已迁移或删除，无法按 unique_id 19626626 重新定位；请刷新日报后重新创建任务",
      }),
    );

    expect(harness.recordStore.markRetryScheduled).not.toHaveBeenCalled();
    expect(harness.recordStore.markPending).not.toHaveBeenCalled();
    expect(harness.recordStore.markFailed).not.toHaveBeenCalled();
    await harness.manager.stop();
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

  it("appends managed execution requirements to a custom processing prompt", async () => {
    const record: AlertTroubleshooterRecord = {
      recordId: "rec_prompt_appendix",
      uniqueId: "result_id:19562663",
      resultId: "19562663",
      tableDate: "20260908",
      messageId: null,
      chatId: null,
      chatName: null,
      messageText: "手动排查",
      messageTime: "2026-09-08T10:00:00.000Z",
      trigger: "table",
    };
    const harness = createHarness({
      config: config({ promptTemplate: "自定义提示词：{{result_id}}" }),
      records: [record],
      recordStoreOverrides: {
        resolveWikiTarget: vi.fn(async () => ({
          spaceId: "space_daily",
          parentNodeToken: "wiki_daily",
        })),
      },
      buildPromptAppendix: ({ wikiTarget }) =>
        [
          `target_space_id：${wikiTarget?.spaceId ?? ""}`,
          `parent_wiki_token：${wikiTarget?.parentNodeToken ?? ""}`,
        ].join("\n"),
    });

    harness.manager.start();
    await vi.waitFor(() => expect(harness.createAgent).toHaveBeenCalledTimes(1));

    expect(harness.createAgent.mock.calls[0]?.[0].initialPrompt).toBe(
      [
        "自定义提示词：19562663",
        "",
        "target_space_id：space_daily",
        "parent_wiki_token：wiki_daily",
      ].join("\n"),
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

  it("does not mark a record succeeded when the completion contract rejects the agent output", async () => {
    const record: AlertTroubleshooterRecord = {
      recordId: "rec_invalid_completion",
      uniqueId: "123456",
      resultId: "123456",
      tableDate: "20260906",
      messageId: "om_invalid_completion",
      chatId: "oc_alerts",
      chatName: "报警群",
      messageText: "Bamboo 对账报警 result_id=123456",
      messageTime: "2026-09-06T07:30:00.000Z",
      trigger: "table",
    };
    const harness = createHarness({
      config: config({ queuePollIntervalMinutes: 30 }),
      records: [record],
      maxAutomaticRetries: 3,
      waitForAgentCompletion: async () => ({ lastMessage: "任务已完成" }),
      parseCompletion: () => {
        throw new Error("缺少结构化终态");
      },
    });

    harness.manager.start();
    await vi.waitFor(() =>
      expect(harness.manager.listTasks("prj_1")[0]).toMatchObject({
        status: "failed",
        error: "缺少结构化终态",
        attempts: 1,
        nextRetryAt: "2026-09-06T08:30:00.000Z",
      }),
    );

    expect(harness.recordStore.markSucceeded).not.toHaveBeenCalled();
    expect(harness.recordStore.markRetryScheduled).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: "rec_invalid_completion" }),
    );
    expect(harness.recordStore.markFailed).not.toHaveBeenCalled();
    await harness.manager.stop();
  });

  it("persists not_support without treating the orchestrator result as already written", async () => {
    const record: AlertTroubleshooterRecord = {
      recordId: "rec_not_support",
      uniqueId: "19630485",
      resultId: "19630485",
      tableDate: "20260906",
      messageId: "om_not_support",
      chatId: "oc_alerts",
      chatName: "报警群",
      messageText: "Bamboo 多源规则报警",
      messageTime: "2026-09-06T07:30:00.000Z",
      trigger: "table",
    };
    const harness = createHarness({
      records: [record],
      executeRecord: async () => ({
        agentId: "",
        completion: {
          status: "not_support",
          summary:
            "当前自动排障只支持离线 Hive Bamboo 规则，rule_type=multi_sources 暂不支持自动排查。",
        },
      }),
    });

    harness.manager.start();
    await vi.waitFor(() =>
      expect(harness.manager.listTasks("prj_1")[0]).toMatchObject({
        status: "not_support",
        nextRetryAt: null,
      }),
    );

    expect(harness.recordStore.markOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: "rec_not_support",
        status: "not_support",
        summary:
          "当前自动排障只支持离线 Hive Bamboo 规则，rule_type=multi_sources 暂不支持自动排查。",
      }),
    );
    expect(harness.recordStore.markFailed).not.toHaveBeenCalled();
    await harness.manager.stop();
  });

  it("keeps an authorization blocker pending without scheduling another automatic retry", async () => {
    const record: AlertTroubleshooterRecord = {
      recordId: "rec_permission",
      uniqueId: "123456",
      resultId: "123456",
      tableDate: "20260906",
      messageId: "om_permission",
      chatId: "oc_alerts",
      chatName: "报警群",
      messageText: "Bamboo 对账报警 result_id=123456",
      messageTime: "2026-09-06T07:30:00.000Z",
      trigger: "table",
    };
    const harness = createHarness({
      records: [record],
      maxAutomaticRetries: 3,
      waitForAgentCompletion: async () => {
        throw new Error("缺少 base:record:read 权限");
      },
      classifyFailure: ({ message: failureMessage }) => ({
        disposition: "pending",
        reason: failureMessage,
      }),
    });

    harness.manager.start();
    await vi.waitFor(() =>
      expect(harness.manager.listTasks("prj_1")[0]).toMatchObject({
        status: "pending",
        error: "缺少 base:record:read 权限",
        attempts: 1,
        nextRetryAt: null,
      }),
    );

    expect(harness.recordStore.markPending).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: "rec_permission",
        error: "缺少 base:record:read 权限",
      }),
    );
    expect(harness.recordStore.markRetryScheduled).not.toHaveBeenCalled();
    expect(harness.recordStore.markFailed).not.toHaveBeenCalled();
    await harness.manager.stop();
  });

  it("rejects an invalid record before creating an agent", async () => {
    const record: AlertTroubleshooterRecord = {
      recordId: "rec_missing_result",
      uniqueId: "record_id:rec_missing_result",
      resultId: null,
      tableDate: "20260906",
      messageId: null,
      chatId: null,
      chatName: null,
      messageText: "缺少 result_id 的旧记录",
      messageTime: "2026-09-06T07:30:00.000Z",
      trigger: "table",
    };
    const harness = createHarness({
      records: [record],
      validateRecord: (candidate) => {
        if (!candidate.resultId) throw new Error("缺少 result_id，已跳过 Agent 执行");
      },
    });

    harness.manager.start();
    await vi.waitFor(() =>
      expect(harness.manager.listTasks("prj_1")[0]).toMatchObject({
        status: "failed",
        error: "缺少 result_id，已跳过 Agent 执行",
      }),
    );

    expect(harness.createAgent).not.toHaveBeenCalled();
    expect(harness.recordStore.markRunning).not.toHaveBeenCalled();
    expect(harness.recordStore.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: "rec_missing_result" }),
    );
    await harness.manager.stop();
  });

  it("auto-archives the task agent after a successful terminal result", async () => {
    const record: AlertTroubleshooterRecord = {
      recordId: "rec_auto_archive",
      uniqueId: "result_id:3001",
      resultId: "3001",
      tableDate: "20260909",
      messageId: null,
      chatId: "oc_alerts",
      chatName: "报警群",
      messageText: "需要自动归档的报警",
      messageTime: "2026-09-09T08:00:00.000Z",
      trigger: "table",
    };
    const harness = createHarness({
      config: config({ autoArchiveAgents: true }),
      records: [record],
      supportsAgentAutoArchive: true,
    });

    harness.manager.start();
    await vi.waitFor(() => expect(harness.archiveAgent).toHaveBeenCalledWith("agent-1"));

    expect(harness.manager.listTasks("prj_1")[0]).toMatchObject({
      status: "succeeded",
      agentId: "agent-1",
    });
    expect(harness.recordStore.markSucceeded.mock.invocationCallOrder[0]).toBeLessThan(
      harness.archiveAgent.mock.invocationCallOrder[0]!,
    );
    await harness.manager.stop();
  });

  it("keeps task agents active when automatic archiving is disabled", async () => {
    const record: AlertTroubleshooterRecord = {
      recordId: "rec_keep_agent",
      uniqueId: "result_id:3002",
      resultId: "3002",
      tableDate: "20260909",
      messageId: null,
      chatId: "oc_alerts",
      chatName: "报警群",
      messageText: "保留 Agent 的报警",
      messageTime: "2026-09-09T08:00:00.000Z",
      trigger: "table",
    };
    const harness = createHarness({
      config: config({ autoArchiveAgents: false }),
      records: [record],
      supportsAgentAutoArchive: true,
    });

    harness.manager.start();
    await vi.waitFor(() =>
      expect(harness.manager.listTasks("prj_1")[0]).toMatchObject({ status: "succeeded" }),
    );

    expect(harness.archiveAgent).not.toHaveBeenCalled();
    await harness.manager.stop();
  });

  it("auto-archives every agent created by a multi-stage task attempt", async () => {
    const record: AlertTroubleshooterRecord = {
      recordId: "rec_multi_stage",
      uniqueId: "result_id:3003",
      resultId: "3003",
      tableDate: "20260909",
      messageId: null,
      chatId: "oc_alerts",
      chatName: "报警群",
      messageText: "多阶段排查报警",
      messageTime: "2026-09-09T08:00:00.000Z",
      trigger: "table",
    };
    const harness = createHarness({
      config: config({ autoArchiveAgents: true }),
      records: [record],
      supportsAgentAutoArchive: true,
      executeRecord: async (execution) => {
        const investigation = await execution.launchAgent({
          stage: "investigation",
          title: "排查",
          prompt: "排查",
        });
        await execution.launchAgent({
          stage: "sop_summary",
          title: "SOP 汇总",
          prompt: "汇总",
        });
        const review = await execution.launchAgent({
          stage: "review",
          title: "审核",
          prompt: "审核",
        });
        return {
          agentId: investigation.agentId,
          completion: { status: "succeeded", summary: review.lastMessage ?? "审核通过" },
        };
      },
    });

    harness.manager.start();
    await vi.waitFor(() => expect(harness.archiveAgent).toHaveBeenCalledTimes(3));

    expect(harness.archiveAgent.mock.calls.map(([agentId]) => agentId)).toEqual([
      "agent-1",
      "agent-2",
      "agent-3",
    ]);
    await harness.manager.stop();
  });

  it("auto-archives an agent whose initial prompt fails", async () => {
    const record: AlertTroubleshooterRecord = {
      recordId: "rec_prompt_failure",
      uniqueId: "result_id:3004",
      resultId: "3004",
      tableDate: "20260909",
      messageId: null,
      chatId: "oc_alerts",
      chatName: "报警群",
      messageText: "首轮提示失败",
      messageTime: "2026-09-09T08:00:00.000Z",
      trigger: "table",
    };
    const harness = createHarness({
      config: config({ autoArchiveAgents: true }),
      records: [record],
      supportsAgentAutoArchive: true,
      initialPromptError: new Error("模型启动失败"),
    });

    harness.manager.start();
    await vi.waitFor(() => expect(harness.archiveAgent).toHaveBeenCalledWith("agent-1"));

    expect(harness.manager.listTasks("prj_1")[0]).toMatchObject({
      status: "failed",
      error: "模型启动失败",
    });
    await harness.manager.stop();
  });

  it("does not change the task result when automatic archiving fails", async () => {
    const record: AlertTroubleshooterRecord = {
      recordId: "rec_archive_failure",
      uniqueId: "result_id:3005",
      resultId: "3005",
      tableDate: "20260909",
      messageId: null,
      chatId: "oc_alerts",
      chatName: "报警群",
      messageText: "归档接口失败",
      messageTime: "2026-09-09T08:00:00.000Z",
      trigger: "table",
    };
    const harness = createHarness({
      config: config({ autoArchiveAgents: true }),
      records: [record],
      supportsAgentAutoArchive: true,
      archiveAgent: async () => {
        throw new Error("归档服务不可用");
      },
    });

    harness.manager.start();
    await vi.waitFor(() => expect(harness.archiveAgent).toHaveBeenCalledTimes(1));
    await harness.manager.stop();

    expect(harness.manager.listTasks("prj_1")[0]).toMatchObject({
      status: "succeeded",
      error: null,
    });
    expect(harness.createAgent).toHaveBeenCalledTimes(1);
  });
});
