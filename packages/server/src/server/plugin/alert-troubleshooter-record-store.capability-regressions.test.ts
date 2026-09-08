import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AlertTroubleshooterConfigSchema,
  type AlertTroubleshooterConfig,
} from "@getpaseo/protocol/messages";

const mocks = vi.hoisted(() => {
  const search = vi.fn();
  const create = vi.fn();
  const getValidUserAccessToken = vi.fn(async () => "user-token");
  const client = {
    bitable: {
      v1: {
        appTableField: {
          list: vi.fn(async () => ({
            code: 0,
            data: { items: [{ field_name: "标题", is_primary: true }] },
          })),
          create: vi.fn(async () => ({ code: 0 })),
        },
        appTableRecord: { search, create },
      },
    },
  };
  return {
    client,
    search,
    create,
    getValidUserAccessToken,
    resolveDailyAlertTable: vi.fn(async ({ dateKey }: { dateKey: string }) => ({
      appToken: `app_${dateKey}`,
      tableId: `tbl_${dateKey}`,
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
}));

import { LarkAlertTroubleshooterRecordStore } from "./alert-troubleshooter-record-store.js";

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
    vi.clearAllMocks();
    mocks.search.mockReset();
    mocks.create.mockReset();
    mocks.getValidUserAccessToken.mockClear();
  });

  it("reuses an existing daily record for the same result_id", async () => {
    mocks.search.mockResolvedValueOnce({
      code: 0,
      data: {
        items: [
          {
            record_id: "rec_existing",
            fields: {
              unique_id: "result_id:123456",
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
      uniqueId: "result_id:123456",
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
      uniqueId: "result_id:987654",
      resultId: "987654",
      trigger: "manual",
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          fields: expect.objectContaining({
            "Project ID": "prj_1",
            "插件 ID": "bamboo-reconciliation-troubleshooter",
            unique_id: "result_id:987654",
            result_id: "987654",
            触发方式: "manual",
            处理状态: "未认领",
          }),
        },
      }),
    );
    expect(mocks.getValidUserAccessToken).toHaveBeenCalledWith("cli_test", ["wiki:wiki:readonly"]);
  });
});
