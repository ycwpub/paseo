import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AlertTroubleshooterConfigSchema,
  type AlertTroubleshooterConfig,
} from "@getpaseo/protocol/messages";

const mocks = vi.hoisted(() => {
  const bambooFields = [
    "unique_id",
    "result_id",
    "alarm_record_detail_id",
    "task_id",
    "task_name",
    "task_time",
    "bamboo_url",
    "created_at",
    "task_sql",
    "task_result_num",
    "task_result_object",
    "extra",
    "status",
    "ai_session_id",
    "ai_summary",
    "ai_result",
    "ai_finished_at",
    "last_error",
  ];
  const bambooFieldItems = () =>
    bambooFields.map((fieldName, index) => ({
      field_name: fieldName,
      is_primary: index === 0,
    }));
  const search = vi.fn();
  const create = vi.fn();
  const get = vi.fn();
  const update = vi.fn(async () => ({ code: 0 }));
  const listFields = vi.fn(async () => ({
    code: 0,
    data: {
      items: bambooFieldItems(),
    },
  }));
  const getValidUserAccessToken = vi.fn(async () => "user-token");
  const client = {
    bitable: {
      v1: {
        appTableField: {
          list: listFields,
          create: vi.fn(async () => ({ code: 0 })),
        },
        appTableRecord: { search, create, get, update },
      },
    },
  };
  return {
    bambooFields,
    bambooFieldItems,
    client,
    search,
    create,
    get,
    update,
    listFields,
    getValidUserAccessToken,
    resolveDailyAlertTable: vi.fn(async ({ dateKey }: { dateKey: string }) => ({
      appToken: `app_${dateKey}`,
      tableId: `tbl_${dateKey}`,
      spaceId: "space_1",
      nodeToken: `node_${dateKey}`,
      dateKey,
      title: `${dateKey}-bamboo对账归因记录`,
    })),
    resolveExistingDailyAlertTable: vi.fn(async ({ dateKey }: { dateKey: string }) => ({
      appToken: `app_${dateKey}`,
      tableId: `tbl_${dateKey}`,
      spaceId: "space_1",
      nodeToken: `node_${dateKey}`,
      dateKey,
      title: `${dateKey}-bamboo对账归因记录`,
    })),
  };
});

vi.mock("@larksuiteoapi/node-sdk", () => {
  function Client() {
    return mocks.client;
  }
  return {
    AppType: { SelfBuild: "self-build" },
    Domain: { Lark: "lark", Feishu: "feishu" },
    Client,
    withUserAccessToken: (token: string) => ({ userAccessToken: token }),
  };
});

vi.mock("./alert-troubleshooter-daily-table.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./alert-troubleshooter-daily-table.js")>()),
  resolveDailyAlertTable: mocks.resolveDailyAlertTable,
  resolveExistingDailyAlertTable: mocks.resolveExistingDailyAlertTable,
}));

import { LarkAlertTroubleshooterRecordStore } from "./alert-troubleshooter-record-store.js";
import { BAMBOO_ATTRIBUTION_FIELD_NAMES } from "./bamboo-attribution-table.js";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function config(): AlertTroubleshooterConfig {
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
  });
}

function createStore(): LarkAlertTroubleshooterRecordStore {
  return new LarkAlertTroubleshooterRecordStore(
    {
      getBot: () =>
        ({
          config: {
            appId: "cli_test",
            appSecret: "secret",
            domain: "feishu",
          },
        }) as never,
    },
    {
      getValidUserAccessToken: mocks.getValidUserAccessToken,
    },
  );
}

describe("LarkAlertTroubleshooterRecordStore result_id debugging", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00+08:00"));
    vi.clearAllMocks();
    mocks.search.mockReset();
    mocks.create.mockReset();
    mocks.get.mockReset();
    mocks.update.mockClear();
    mocks.listFields.mockReset();
    mocks.listFields.mockImplementation(async () => ({
      code: 0,
      data: {
        items: mocks.bambooFieldItems(),
      },
    }));
    mocks.getValidUserAccessToken.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the matching daily Base Wiki node as the document parent", async () => {
    await expect(
      createStore().resolveWikiTarget({
        config: config(),
        pluginId: "bamboo-reconciliation-troubleshooter",
        tableDate: "20260908",
      }),
    ).resolves.toEqual({
      spaceId: "space_1",
      parentNodeToken: "node_20260908",
    });
  });

  it("invalidates a cached table location and resolves it again when Lark deletes the table", async () => {
    const store = createStore();
    const input = {
      config: config(),
      pluginId: "bamboo-reconciliation-troubleshooter",
      tableDate: "20260908",
    };

    await expect(store.resolveExecutionContext(input)).resolves.toMatchObject({
      closeContext: { tableId: "tbl_20260908" },
    });
    mocks.listFields
      .mockRejectedValueOnce(new Error("Lark API error: WrongTableId (code: 1254004)"))
      .mockImplementationOnce(async () => ({
        code: 0,
        data: {
          items: mocks.bambooFieldItems(),
        },
      }));

    await expect(store.resolveExecutionContext(input)).resolves.toMatchObject({
      closeContext: { tableId: "tbl_20260908" },
    });

    expect(mocks.resolveDailyAlertTable).toHaveBeenCalledTimes(2);
  });

  it("clears cached daily-table locations before relocating a stale record by unique_id", async () => {
    const store = createStore();
    await store.resolveExecutionContext({
      config: config(),
      pluginId: "bamboo-reconciliation-troubleshooter",
      tableDate: "20260908",
    });
    mocks.search.mockResolvedValueOnce({
      code: 0,
      data: {
        items: [
          {
            record_id: "rec_relocated",
            fields: {
              unique_id: "19626626",
              result_id: "19626626",
              status: "init",
            },
          },
        ],
      },
    });

    await expect(
      store.relocateRecord({
        config: config(),
        pluginId: "bamboo-reconciliation-troubleshooter",
        uniqueId: "19626626",
      }),
    ).resolves.toMatchObject({
      recordId: "rec_relocated",
      uniqueId: "19626626",
    });

    expect(mocks.resolveExistingDailyAlertTable).toHaveBeenCalledTimes(1);
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({
        path: {
          app_token: "app_20260908",
          table_id: "tbl_20260908",
        },
      }),
    );
  });

  it("reuses an existing daily record for the same result_id", async () => {
    mocks.search.mockResolvedValueOnce({
      code: 0,
      data: {
        items: [
          {
            record_id: "rec_existing",
            fields: {
              unique_id: "123456",
              result_id: "123456",
              消息内容: "已有 Bamboo 报警",
              触发方式: "message",
            },
          },
        ],
      },
    });

    const record = await createStore().upsertManualResult({
      config: config(),
      projectId: "prj_1",
      pluginId: "bamboo-reconciliation-troubleshooter",
      resultId: "123456",
    });

    expect(record).toMatchObject({
      recordId: "rec_existing",
      uniqueId: "123456",
      resultId: "123456",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates today's daily record before enqueueing a new result_id", async () => {
    mocks.search.mockResolvedValue({ code: 0, data: { items: [] } });
    mocks.create.mockImplementation(async ({ data }: { data: { fields: object } }) => ({
      code: 0,
      data: {
        record: {
          record_id: "rec_created",
          fields: data.fields,
        },
      },
    }));

    const record = await createStore().upsertManualResult({
      config: config(),
      projectId: "prj_1",
      pluginId: "bamboo-reconciliation-troubleshooter",
      resultId: "987654",
    });

    expect(record).toMatchObject({
      recordId: "rec_created",
      uniqueId: "987654",
      resultId: "987654",
      trigger: "manual",
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          client_token: expect.stringMatching(UUID_V4_PATTERN),
        },
        data: {
          fields: expect.objectContaining({
            unique_id: "987654",
            result_id: "987654",
            status: "init",
            task_result_num: 0,
          }),
        },
      }),
    );
    const createdFields = mocks.create.mock.calls[0]?.[0]?.data?.fields ?? {};
    expect(
      Object.keys(createdFields).every((field) =>
        (BAMBOO_ATTRIBUTION_FIELD_NAMES as readonly string[]).includes(field),
      ),
    ).toBe(true);
    expect(createdFields).not.toHaveProperty("Project ID");
    expect(createdFields).not.toHaveProperty("消息内容");
    expect(mocks.getValidUserAccessToken).not.toHaveBeenCalled();
  });

  it("uses a valid UUID v4 idempotency token when writing a scanned Lark message", async () => {
    mocks.search.mockResolvedValue({ code: 0, data: { items: [] } });
    mocks.create.mockImplementation(async ({ data }: { data: { fields: object } }) => ({
      code: 0,
      data: {
        record: {
          record_id: "rec_message",
          fields: data.fields,
        },
      },
    }));

    await createStore().upsertMessage({
      config: config(),
      projectId: "prj_4491f78e4a562498",
      pluginId: "bamboo-reconciliation-troubleshooter",
      trigger: "schedule",
      event: {
        eventId: "evt_1",
        messageId: "om_x100b66c9d98f48a8c2c5152968ce2c7:om_x100b66dc4fc1c8a0b36e38fcccb3ce9",
        chatId: "oc_alerts",
        chatType: "group",
        messageType: "interactive",
        threadId: null,
        rootMessageId: null,
        openId: null,
        unionId: null,
        displayName: "Bamboo",
        topicName: "报警",
        text: "Bamboo 对账报警 result_id=123456",
        createTime: Date.parse("2026-09-08T11:18:16.000Z"),
      },
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          client_token: expect.stringMatching(UUID_V4_PATTERN),
        },
      }),
    );
  });

  it("backfills a missing task_time when a duplicate Bamboo alert is scanned again", async () => {
    mocks.search.mockResolvedValueOnce({
      code: 0,
      data: {
        items: [
          {
            record_id: "rec_19630485",
            fields: {
              unique_id: "19630485",
              result_id: "19630485",
              task_name: "触发单未按时生成父分账单",
              status: "init",
            },
          },
        ],
      },
    });

    const record = await createStore().upsertMessage({
      config: config(),
      projectId: "prj_4491f78e4a562498",
      pluginId: "bamboo-reconciliation-troubleshooter",
      trigger: "schedule",
      event: {
        eventId: "evt_19630485",
        messageId: "om_19630485",
        chatId: "oc_alerts",
        chatType: "group",
        messageType: "interactive",
        threadId: null,
        rootMessageId: null,
        openId: null,
        unionId: null,
        displayName: "Bamboo",
        topicName: "报警",
        text: [
          "【数据监控-bamboo-WARNING】触发单未按时生成父分账单",
          "result_id=19630485",
          "**告警时间:** ** 2026-09-09T14:41:59.230",
        ].join("\n"),
        createTime: Date.parse("2026-09-09T07:25:27.965Z"),
      },
    });

    expect(mocks.update).toHaveBeenCalledWith({
      path: {
        app_token: "app_20260909",
        table_id: "tbl_20260909",
        record_id: "rec_19630485",
      },
      data: {
        fields: {
          task_time: Date.parse("2026-09-09T14:41:59.230"),
        },
      },
    });
    expect(record.taskTime).toBe(new Date("2026-09-09T14:41:59.230").toISOString());
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("polls init and failed Bamboo records with result_id without creating tables", async () => {
    mocks.search.mockImplementation(async ({ path }: { path: { app_token: string } }) => ({
      code: 0,
      data: {
        items: [
          {
            record_id: `rec_valid_${path.app_token}`,
            fields: {
              unique_id: path.app_token,
              result_id: path.app_token,
              status: "init",
              "Project ID": "prj_1",
              "插件 ID": "bamboo-reconciliation-troubleshooter",
              触发方式: "table",
            },
          },
          {
            record_id: `rec_missing_result_${path.app_token}`,
            fields: {
              unique_id: `record_id:rec_missing_result_${path.app_token}`,
              status: "init",
              "Project ID": "prj_1",
              "插件 ID": "bamboo-reconciliation-troubleshooter",
              触发方式: "table",
            },
          },
          {
            record_id: `rec_failed_${path.app_token}`,
            fields: {
              unique_id: `failed_${path.app_token}`,
              result_id: `failed_${path.app_token}`,
              status: "failed",
              "Project ID": "prj_1",
              "插件 ID": "bamboo-reconciliation-troubleshooter",
              触发方式: "table",
            },
          },
        ],
      },
    }));

    const records = await createStore().listUnclaimed({
      config: config(),
      projectId: "prj_1",
      pluginId: "bamboo-reconciliation-troubleshooter",
      limit: 20,
    });

    expect(records.map((record) => record.tableDate)).toEqual([
      "20260908",
      "20260908",
      "20260907",
      "20260907",
    ]);
    expect(records.map((record) => record.recordId)).toEqual([
      "rec_valid_app_20260908",
      "rec_failed_app_20260908",
      "rec_valid_app_20260907",
      "rec_failed_app_20260907",
    ]);
    expect(mocks.resolveDailyAlertTable).not.toHaveBeenCalled();
    expect(mocks.resolveExistingDailyAlertTable).toHaveBeenCalledTimes(2);
  });

  it("returns a retrying Bamboo record to init and keeps the last error", async () => {
    await createStore().markRetryScheduled({
      config: config(),
      pluginId: "bamboo-reconciliation-troubleshooter",
      recordId: "rec_retry",
      tableDate: "20260908",
      error: "临时网络失败",
    });

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        path: {
          app_token: "app_20260908",
          table_id: "tbl_20260908",
          record_id: "rec_retry",
        },
        data: {
          fields: expect.objectContaining({
            status: "init",
            ai_session_id: "",
            last_error: "临时网络失败",
          }),
        },
      }),
    );
  });

  it("backfills prepared Bamboo IDs and preserves existing extra metadata", async () => {
    await createStore().updateBambooPreparedMetadata({
      config: config(),
      pluginId: "bamboo-reconciliation-troubleshooter",
      recordId: "recvuGHvu5oYNh",
      tableDate: "20260908",
      alarmRecordDetailId: "77762173",
      taskId: "4086",
      ruleId: "4086",
      extra: {
        project_id: "prj_1",
        trigger: "schedule",
      },
    });

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        path: {
          app_token: "app_20260908",
          table_id: "tbl_20260908",
          record_id: "recvuGHvu5oYNh",
        },
        data: {
          fields: {
            alarm_record_detail_id: "77762173",
            task_id: "4086",
            extra: JSON.stringify({
              project_id: "prj_1",
              trigger: "schedule",
              rule_id: "4086",
              rules_id: "4086",
            }),
          },
        },
      }),
    );
  });

  it("keeps a Bamboo authorization blocker pending instead of terminally failed", async () => {
    await createStore().markPending({
      config: config(),
      pluginId: "bamboo-reconciliation-troubleshooter",
      recordId: "rec_pending",
      tableDate: "20260908",
      error: "缺少 base:record:read 权限",
    });

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          fields: expect.objectContaining({
            status: "pending",
            last_error: "缺少 base:record:read 权限",
          }),
        },
      }),
    );
  });

  it("resolves legacy record_id task references for permission retry", async () => {
    mocks.get.mockResolvedValueOnce({
      code: 0,
      data: {
        record: {
          record_id: "rec_legacy",
          fields: {
            result_id: "123456",
            消息内容: "Bamboo 报警",
            触发方式: "table",
          },
        },
      },
    });

    const record = await createStore().getRecordByUniqueId({
      config: config(),
      pluginId: "bamboo-reconciliation-troubleshooter",
      uniqueId: "record_id:20260908:rec_legacy",
    });

    expect(record).toMatchObject({
      recordId: "rec_legacy",
      uniqueId: "record_id:rec_legacy",
      resultId: "123456",
    });
    expect(mocks.get).toHaveBeenCalledWith({
      path: {
        app_token: "app_20260908",
        table_id: "tbl_20260908",
        record_id: "rec_legacy",
      },
      params: { text_field_as_array: false },
    });
  });
});
