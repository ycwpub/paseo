import type { LarkAlertTroubleshooterApi } from "./lark-alert-troubleshooter-api.js";
import { ARGOS_ATTRIBUTION_FIELD_NAMES } from "./argos-alert-record.js";

export const ARGOS_ATTRIBUTION_TABLE_NAME = "归因记录";

const ARGOS_ATTRIBUTION_FIELDS = [
  { field_name: "unique_id", type: 1 },
  { field_name: "result_id", type: 1 },
  { field_name: "rule_id", type: 1 },
  { field_name: "alarm_record_detail_id", type: 1 },
  { field_name: "psm", type: 1 },
  { field_name: "level", type: 1 },
  { field_name: "rule_name", type: 1 },
  {
    field_name: "result_time",
    type: 5,
    property: { date_formatter: "yyyy-MM-dd HH:mm" },
  },
  {
    field_name: "create_time",
    type: 5,
    property: { date_formatter: "yyyy-MM-dd HH:mm" },
  },
  { field_name: "result_url", type: 1 },
  { field_name: "rule_url", type: 1 },
  { field_name: "rule_content", type: 1 },
  { field_name: "result_content", type: 1 },
  { field_name: "extra", type: 1 },
  {
    field_name: "status",
    type: 3,
    property: {
      options: ["init", "processing", "succeeded", "failed", "pending"].map((name) => ({
        name,
      })),
    },
  },
  { field_name: "ai_session_id", type: 1 },
  { field_name: "ai_summary", type: 1 },
  { field_name: "ai_result", type: 1 },
  {
    field_name: "ai_finished_at",
    type: 5,
    property: { date_formatter: "yyyy-MM-dd HH:mm" },
  },
  { field_name: "last_error", type: 1 },
] as const;

interface BitableTable {
  table_id?: string;
  name?: string;
}

interface BitableField {
  field_id?: string;
  field_name?: string;
  is_primary?: boolean;
}

async function listTables(
  api: LarkAlertTroubleshooterApi,
  appToken: string,
): Promise<BitableTable[]> {
  const result = await api.request(
    () =>
      api.client.bitable.v1.appTable.list({
        path: { app_token: appToken },
        params: { page_size: 100 },
      }),
    { identity: "bot", requiredScopes: ["base:table:read"] },
  );
  return result.data?.items ?? [];
}

async function listFields(
  api: LarkAlertTroubleshooterApi,
  appToken: string,
  tableId: string,
): Promise<BitableField[]> {
  const result = await api.request(
    () =>
      api.client.bitable.v1.appTableField.list({
        path: { app_token: appToken, table_id: tableId },
        params: { page_size: 100 },
      }),
    { identity: "bot", requiredScopes: ["base:field:read"] },
  );
  return result.data?.items ?? [];
}

export async function ensureArgosAttributionTable(
  api: LarkAlertTroubleshooterApi,
  appToken: string,
): Promise<string> {
  const tables = await listTables(api, appToken);
  const table =
    tables.find((candidate) => candidate.name === ARGOS_ATTRIBUTION_TABLE_NAME) ?? tables[0];
  if (!table?.table_id) throw new Error("Argos 日报多维表格中未找到数据表");
  const tableId = table.table_id;
  if (table.name !== ARGOS_ATTRIBUTION_TABLE_NAME) {
    await api.request(
      () =>
        api.client.bitable.v1.appTable.patch({
          path: { app_token: appToken, table_id: tableId },
          data: { name: ARGOS_ATTRIBUTION_TABLE_NAME },
        }),
      { identity: "bot", requiredScopes: ["base:table:update"] },
    );
  }
  let fields = await listFields(api, appToken, tableId);
  const primary = fields.find((field) => field.is_primary);
  if (primary?.field_id && primary.field_name !== ARGOS_ATTRIBUTION_FIELD_NAMES[0]) {
    await api.request(
      () =>
        api.client.bitable.v1.appTableField.update({
          path: {
            app_token: appToken,
            table_id: tableId,
            field_id: primary.field_id!,
          },
          data: { field_name: ARGOS_ATTRIBUTION_FIELD_NAMES[0], type: 1 },
        }),
      { identity: "bot", requiredScopes: ["base:field:update"] },
    );
    fields = await listFields(api, appToken, tableId);
  }
  const existing = new Set(fields.map((field) => field.field_name));
  for (const field of ARGOS_ATTRIBUTION_FIELDS) {
    if (existing.has(field.field_name)) continue;
    await api.request(
      () =>
        api.client.bitable.v1.appTableField.create({
          path: { app_token: appToken, table_id: tableId },
          data: field,
        }),
      { identity: "bot", requiredScopes: ["base:field:create"] },
    );
  }
  return tableId;
}
