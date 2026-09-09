import { describe, expect, it, vi } from "vitest";
import type { LarkAlertTroubleshooterApi } from "./lark-alert-troubleshooter-api.js";
import {
  ARGOS_ATTRIBUTION_TABLE_NAME,
  ensureArgosAttributionTable,
} from "./argos-attribution-table.js";
import { ARGOS_ATTRIBUTION_FIELD_NAMES } from "./argos-alert-record.js";

describe("Argos attribution table", () => {
  it("turns a new Base default table into the canonical Argos table", async () => {
    const fields = [{ field_id: "fld-primary", field_name: "文本", is_primary: true }];
    const client = {
      bitable: {
        v1: {
          appTable: {
            list: vi.fn(async () => ({
              code: 0,
              data: { items: [{ table_id: "tbl-default", name: "数据表" }] },
            })),
            patch: vi.fn(async () => ({ code: 0 })),
          },
          appTableField: {
            list: vi.fn(async () => ({ code: 0, data: { items: fields } })),
            update: vi.fn(async ({ data }: { data: { field_name: string } }) => {
              fields[0] = { ...fields[0]!, field_name: data.field_name };
              return { code: 0 };
            }),
            create: vi.fn(async () => ({ code: 0 })),
          },
        },
      },
    };
    const api = {
      client,
      request: async <T>(operation: () => Promise<T>) => operation(),
    } as unknown as LarkAlertTroubleshooterApi;

    await expect(ensureArgosAttributionTable(api, "app-1")).resolves.toBe("tbl-default");

    expect(client.bitable.v1.appTable.patch).toHaveBeenCalledWith({
      path: { app_token: "app-1", table_id: "tbl-default" },
      data: { name: ARGOS_ATTRIBUTION_TABLE_NAME },
    });
    expect(client.bitable.v1.appTableField.update).toHaveBeenCalledWith({
      path: {
        app_token: "app-1",
        table_id: "tbl-default",
        field_id: "fld-primary",
      },
      data: { field_name: "unique_id", type: 1 },
    });
    const createdFieldNames = client.bitable.v1.appTableField.create.mock.calls.map(
      ([request]) => request.data.field_name,
    );
    expect(createdFieldNames).toEqual(ARGOS_ATTRIBUTION_FIELD_NAMES.slice(1));
  });
});
