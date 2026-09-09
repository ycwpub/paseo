import { describe, expect, it, vi } from "vitest";
import type { LarkAlertTroubleshooterApi } from "./lark-alert-troubleshooter-api.js";
import { ARGOS_ATTRIBUTION_FIELD_NAMES } from "./argos-alert-record.js";
import { ARGOS_ATTRIBUTION_TABLE_NAME } from "./argos-attribution-table.js";
import { createArgosDailyBase } from "./argos-daily-base-creator.js";

describe("Argos daily Base creator", () => {
  it("creates the canonical Base in Drive before moving it below the configured Wiki root", async () => {
    const canonicalFields = ARGOS_ATTRIBUTION_FIELD_NAMES.map((field_name, index) => ({
      field_id: `fld-${index}`,
      field_name,
      is_primary: index === 0,
    }));
    const client = {
      bitable: {
        v1: {
          app: {
            create: vi.fn(async () => ({
              code: 0,
              data: { app: { app_token: "app-daily" } },
            })),
          },
          appTable: {
            list: vi.fn(async () => ({
              code: 0,
              data: {
                items: [{ table_id: "tbl-daily", name: ARGOS_ATTRIBUTION_TABLE_NAME }],
              },
            })),
          },
          appTableField: {
            list: vi.fn(async () => ({
              code: 0,
              data: {
                items: canonicalFields,
              },
            })),
          },
        },
      },
      wiki: {
        v2: {
          spaceNode: {
            moveDocsToWiki: vi.fn(async () => ({
              code: 0,
              data: { wiki_token: "wikcn-daily", applied: false },
            })),
          },
        },
      },
    };
    const api = {
      client,
      request: async <T>(operation: () => Promise<T>) => operation(),
    } as unknown as LarkAlertTroubleshooterApi;

    await expect(
      createArgosDailyBase({
        api,
        spaceId: "space-1",
        parentNodeToken: "wikcn-root",
        title: "20260909-argos报警归因记录",
      }),
    ).resolves.toEqual({
      appToken: "app-daily",
      tableId: "tbl-daily",
      nodeToken: "wikcn-daily",
    });
    expect(client.bitable.v1.app.create).toHaveBeenCalledWith({
      data: { name: "20260909-argos报警归因记录", time_zone: "Asia/Shanghai" },
    });
    expect(client.wiki.v2.spaceNode.moveDocsToWiki).toHaveBeenCalledWith({
      path: { space_id: "space-1" },
      data: {
        obj_type: "bitable",
        obj_token: "app-daily",
        parent_wiki_token: "wikcn-root",
      },
    });
  });
});
