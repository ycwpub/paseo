import { describe, expect, it, vi } from "vitest";
import type { LarkAlertTroubleshooterApi } from "./lark-alert-troubleshooter-api.js";
import { BAMBOO_ATTRIBUTION_TABLE_NAME } from "./bamboo-attribution-table.js";
import { createBambooDailyBase } from "./bamboo-daily-base-creator.js";

function createApi(input?: { asyncMove?: boolean }) {
  const tables = [{ table_id: "tbl_default", name: "table" }];
  let taskCalls = 0;
  const client = {
    bitable: {
      v1: {
        app: {
          create: vi.fn(async () => ({
            code: 0,
            data: {
              app: {
                app_token: "app_daily",
                default_table_id: "tbl_default",
              },
            },
          })),
        },
        appTable: {
          list: vi.fn(async () => ({
            code: 0,
            data: { items: [...tables], has_more: false },
          })),
          create: vi.fn(async ({ data }: { data: { table: { name: string } } }) => {
            tables.push({ table_id: "tbl_attribution", name: data.table.name });
            return { code: 0, data: { table_id: "tbl_attribution" } };
          }),
          delete: vi.fn(async ({ path }: { path: { table_id: string } }) => {
            const index = tables.findIndex((table) => table.table_id === path.table_id);
            if (index >= 0) tables.splice(index, 1);
            return { code: 0 };
          }),
        },
        appTableField: {
          list: vi.fn(async () => ({
            code: 0,
            data: {
              items: [
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
              ].map((field_name, index) => ({ field_name, is_primary: index === 0 })),
            },
          })),
        },
        appTableRecord: {
          list: vi.fn(async () => ({ code: 0, data: { items: [], has_more: false } })),
        },
      },
    },
    wiki: {
      v2: {
        spaceNode: {
          moveDocsToWiki: vi.fn(async () => ({
            code: 0,
            data: input?.asyncMove
              ? { task_id: "task_move" }
              : { wiki_token: "wikcn_daily", applied: false },
          })),
        },
        task: {
          get: vi.fn(async () => {
            taskCalls += 1;
            return {
              code: 0,
              data: {
                task: {
                  task_id: "task_move",
                  move_result:
                    taskCalls === 1
                      ? []
                      : [
                          {
                            node: {
                              node_token: "wikcn_async",
                              obj_token: "app_daily",
                              obj_type: "bitable" as const,
                              node_type: "origin" as const,
                            },
                            status: 0,
                            status_msg: "",
                          },
                        ],
                },
              },
            };
          }),
        },
      },
    },
  };
  return {
    api: {
      client,
      request: async <T>(operation: () => Promise<T>) => operation(),
    } as unknown as LarkAlertTroubleshooterApi,
    client,
    tables,
  };
}

describe("Bamboo daily Base creator", () => {
  it("creates a Drive Base, keeps only the canonical table, then moves it into Wiki", async () => {
    const { api, client, tables } = createApi();

    await expect(
      createBambooDailyBase({
        api,
        spaceId: "space_1",
        parentNodeToken: "wikcn_root",
        title: "20260909-bamboo对账归因记录",
      }),
    ).resolves.toEqual({
      appToken: "app_daily",
      tableId: "tbl_attribution",
      nodeToken: "wikcn_daily",
    });

    expect(tables).toEqual([{ table_id: "tbl_attribution", name: BAMBOO_ATTRIBUTION_TABLE_NAME }]);
    expect(client.bitable.v1.app.create).toHaveBeenCalledWith({
      data: {
        name: "20260909-bamboo对账归因记录",
        time_zone: "Asia/Shanghai",
      },
    });
    expect(client.wiki.v2.spaceNode.moveDocsToWiki).toHaveBeenCalledWith({
      path: { space_id: "space_1" },
      data: {
        obj_type: "bitable",
        obj_token: "app_daily",
        parent_wiki_token: "wikcn_root",
      },
    });
  });

  it("waits for an asynchronous Wiki move task", async () => {
    const { api, client } = createApi({ asyncMove: true });
    const wait = vi.fn(async () => undefined);

    await expect(
      createBambooDailyBase({
        api,
        spaceId: "space_1",
        parentNodeToken: "wikcn_root",
        title: "20260909-bamboo对账归因记录",
        wait,
      }),
    ).resolves.toMatchObject({ nodeToken: "wikcn_async" });

    expect(client.wiki.v2.task.get).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(500);
  });
});
