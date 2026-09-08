import { describe, expect, it, vi } from "vitest";
import type { LarkAlertTroubleshooterApi } from "./lark-alert-troubleshooter-api.js";
import {
  BAMBOO_ATTRIBUTION_FIELD_NAMES,
  BAMBOO_ATTRIBUTION_TABLE_NAME,
  ensureBambooAttributionTable,
} from "./bamboo-attribution-table.js";

function createApi(input?: {
  tables?: Array<{ table_id: string; name: string }>;
  fields?: string[];
  records?: Record<
    string,
    Array<{
      record_id: string;
      fields: Record<string, unknown>;
      created_time?: number;
      last_modified_time?: number;
    }>
  >;
}) {
  const operations: string[] = [];
  const tables = [...(input?.tables ?? [{ table_id: "tbl_default", name: "数据表" }])];
  const fieldsByTable = new Map<string, string[]>();
  for (const table of tables) {
    fieldsByTable.set(table.table_id, input?.fields ?? []);
  }
  const recordsByTable = new Map(
    Object.entries(input?.records ?? {}).map(([tableId, records]) => [tableId, [...records]]),
  );
  let createdTableCount = 0;
  const request = vi.fn(async (payload: { method: string; url: string }) => {
    operations.push(`${payload.method} ${payload.url}`);
    return { code: 0 };
  });
  const client = {
    domain: "https://open.feishu.cn",
    request,
    bitable: {
      v1: {
        appTable: {
          list: vi.fn(async () => ({
            code: 0,
            data: { items: [...tables], has_more: false },
          })),
          create: vi.fn(
            async ({
              data,
            }: {
              data: {
                table: {
                  name: string;
                  fields: Array<{ field_name: string }>;
                };
              };
            }) => {
              operations.push("create canonical table");
              createdTableCount += 1;
              const tableId = `tbl_created_${createdTableCount}`;
              tables.push({
                table_id: tableId,
                name: data.table.name,
              });
              fieldsByTable.set(
                tableId,
                data.table.fields.map((field) => field.field_name),
              );
              recordsByTable.set(tableId, []);
              return { code: 0, data: { table_id: tableId } };
            },
          ),
          patch: vi.fn(
            async ({ path, data }: { path: { table_id: string }; data: { name: string } }) => {
              operations.push(`rename table ${path.table_id} to ${data.name}`);
              const table = tables.find((candidate) => candidate.table_id === path.table_id);
              if (table) table.name = data.name;
              return { code: 0, data: { name: data.name } };
            },
          ),
          delete: vi.fn(async ({ path }: { path: { table_id: string } }) => {
            operations.push(`delete table ${path.table_id}`);
            const index = tables.findIndex((table) => table.table_id === path.table_id);
            if (index >= 0) tables.splice(index, 1);
            fieldsByTable.delete(path.table_id);
            recordsByTable.delete(path.table_id);
            return { code: 0 };
          }),
        },
        appTableField: {
          list: vi.fn(async ({ path }: { path: { table_id: string } }) => {
            const fields = fieldsByTable.get(path.table_id) ?? [];
            return {
              code: 0,
              data: {
                items: fields.map((fieldName, index) => ({
                  field_name: fieldName,
                  is_primary: index === 0,
                })),
              },
            };
          }),
        },
        appTableRecord: {
          list: vi.fn(async ({ path }: { path: { table_id: string } }) => ({
            code: 0,
            data: {
              items: recordsByTable.get(path.table_id) ?? [],
              has_more: false,
            },
          })),
          batchCreate: vi.fn(
            async ({
              path,
              data,
            }: {
              path: { table_id: string };
              data: { records: Array<{ fields: Record<string, unknown> }> };
            }) => {
              operations.push(`copy ${data.records.length} records to ${path.table_id}`);
              const records = recordsByTable.get(path.table_id) ?? [];
              records.push(
                ...data.records.map((record, index) => ({
                  record_id: `rec_migrated_${records.length + index}`,
                  fields: record.fields,
                })),
              );
              recordsByTable.set(path.table_id, records);
              return { code: 0, data: { records } };
            },
          ),
        },
        appDashboard: {
          list: vi.fn(async () => ({
            code: 0,
            data: {
              dashboards: [{ block_id: "dash_default", name: "仪表盘" }],
              has_more: false,
              page_token: "",
            },
          })),
        },
        appWorkflow: {
          list: vi.fn(async () => ({
            code: 0,
            data: {
              workflows: [
                {
                  workflow_id: "wkf_default",
                  title: "自动化流程",
                  status: "enabled",
                },
              ],
            },
          })),
        },
      },
    },
  };
  const api = {
    client,
    userRequestOptions: {},
    request: async <T>(operation: () => Promise<T>) => operation(),
  } as unknown as LarkAlertTroubleshooterApi;
  return { api, client, operations, recordsByTable, tables };
}

describe("Bamboo attribution table", () => {
  it("creates the canonical table before deleting generated Base surfaces", async () => {
    const { api, client, operations, tables } = createApi();

    await expect(ensureBambooAttributionTable(api, "app_daily")).resolves.toBe("tbl_created_1");

    expect(tables).toEqual([{ table_id: "tbl_created_1", name: BAMBOO_ATTRIBUTION_TABLE_NAME }]);
    expect(operations).toEqual([
      "create canonical table",
      "DELETE https://open.feishu.cn/open-apis/base/v3/bases/app_daily/dashboards/dash_default",
      "PATCH https://open.feishu.cn/open-apis/base/v3/bases/app_daily/workflows/wkf_default/disable",
      "delete table tbl_default",
    ]);
    expect(client.bitable.v1.appTable.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          table: expect.objectContaining({
            name: BAMBOO_ATTRIBUTION_TABLE_NAME,
            fields: expect.arrayContaining([
              expect.objectContaining({
                field_name: "unique_id",
                type: 1,
              }),
              expect.objectContaining({
                field_name: "status",
                type: 3,
              }),
            ]),
          }),
        },
      }),
    );
  });

  it("reuses a valid canonical table and removes other tables", async () => {
    const { api, client, tables } = createApi({
      tables: [
        { table_id: "tbl_attribution", name: BAMBOO_ATTRIBUTION_TABLE_NAME },
        { table_id: "tbl_default", name: "数据表" },
      ],
      fields: [...BAMBOO_ATTRIBUTION_FIELD_NAMES],
    });

    await expect(ensureBambooAttributionTable(api, "app_daily")).resolves.toBe("tbl_attribution");

    expect(client.bitable.v1.appTable.create).not.toHaveBeenCalled();
    expect(tables).toEqual([{ table_id: "tbl_attribution", name: BAMBOO_ATTRIBUTION_TABLE_NAME }]);
  });

  it("keeps the canonical table usable when generated dashboard or workflow cleanup lacks scope", async () => {
    const { api, client, tables } = createApi({
      tables: [
        { table_id: "tbl_attribution", name: BAMBOO_ATTRIBUTION_TABLE_NAME },
        { table_id: "tbl_default", name: "数据表" },
      ],
      fields: [...BAMBOO_ATTRIBUTION_FIELD_NAMES],
    });
    client.bitable.v1.appDashboard.list.mockRejectedValueOnce(
      new Error("Lark API error: missing base:dashboard:read (code: 99991672)"),
    );
    client.bitable.v1.appWorkflow.list.mockRejectedValueOnce(
      new Error("Lark API error: missing base:workflow:read (code: 99991672)"),
    );

    await expect(ensureBambooAttributionTable(api, "app_daily")).resolves.toBe("tbl_attribution");

    expect(tables).toEqual([{ table_id: "tbl_attribution", name: BAMBOO_ATTRIBUTION_TABLE_NAME }]);
    expect(client.bitable.v1.appTable.delete).toHaveBeenCalledWith({
      path: { app_token: "app_daily", table_id: "tbl_default" },
    });
  });

  it("migrates a non-canonical attribution table and preserves unique records", async () => {
    const { api, client, recordsByTable, tables } = createApi({
      tables: [{ table_id: "tbl_legacy", name: BAMBOO_ATTRIBUTION_TABLE_NAME }],
      fields: ["标题", "unique_id", "result_id"],
      records: {
        tbl_legacy: [
          {
            record_id: "rec_old",
            last_modified_time: 1,
            fields: {
              unique_id: "19562663",
              result_id: "19562663",
              task_name: "旧记录",
              created_at: "2026-09-08T11:53:10.000+08:00",
              ai_finished_at: "2026-09-08T20:27:26.000+08:00",
              status: "succeeded",
            },
          },
          {
            record_id: "rec_latest",
            last_modified_time: 2,
            fields: {
              unique_id: "19562663",
              result_id: "19562663",
              task_name: "最新记录",
              created_at: "2026-09-08 11:53:10",
              status: "succeeded",
            },
          },
        ],
      },
    });

    await expect(ensureBambooAttributionTable(api, "app_daily")).resolves.toBe("tbl_created_1");

    expect(client.bitable.v1.appTableRecord.batchCreate).toHaveBeenCalledOnce();
    expect(client.bitable.v1.appTable.delete).toHaveBeenCalledWith({
      path: { app_token: "app_daily", table_id: "tbl_legacy" },
    });
    expect(client.bitable.v1.appTable.patch).toHaveBeenCalledWith({
      path: { app_token: "app_daily", table_id: "tbl_created_1" },
      data: { name: BAMBOO_ATTRIBUTION_TABLE_NAME },
    });
    expect(tables).toEqual([{ table_id: "tbl_created_1", name: BAMBOO_ATTRIBUTION_TABLE_NAME }]);
    expect(recordsByTable.get("tbl_created_1")).toEqual([
      expect.objectContaining({
        fields: expect.objectContaining({
          unique_id: "19562663",
          task_name: "最新记录",
          created_at: expect.any(Number),
        }),
      }),
    ]);
  });

  it("does not delete a legacy table that still contains records", async () => {
    const { api, client } = createApi();
    client.bitable.v1.appTableRecord.list.mockResolvedValueOnce({
      code: 0,
      data: { items: [{ record_id: "rec_existing" }] },
    });

    await expect(ensureBambooAttributionTable(api, "app_daily")).rejects.toThrow(
      "请先迁移并按 unique_id 去重",
    );
    expect(client.bitable.v1.appTable.delete).not.toHaveBeenCalled();
    expect(client.request).not.toHaveBeenCalled();
  });
});
