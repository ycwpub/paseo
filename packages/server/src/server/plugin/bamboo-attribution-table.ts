import type { LarkAlertTroubleshooterApi } from "./lark-alert-troubleshooter-api.js";
import { createLarkRecordClientToken } from "./lark-record-client-token.js";

export const BAMBOO_ATTRIBUTION_TABLE_NAME = "归因记录";
const BAMBOO_ATTRIBUTION_MIGRATION_TABLE_PREFIX = "归因记录（迁移中）";

export const BAMBOO_ATTRIBUTION_FIELD_NAMES = [
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
] as const;

const BAMBOO_ATTRIBUTION_FIELDS = [
  { field_name: "unique_id", type: 1 },
  { field_name: "result_id", type: 1 },
  { field_name: "alarm_record_detail_id", type: 1 },
  { field_name: "task_id", type: 1 },
  { field_name: "task_name", type: 1 },
  {
    field_name: "task_time",
    type: 5,
    property: { date_formatter: "yyyy-MM-dd HH:mm" },
  },
  { field_name: "bamboo_url", type: 1 },
  {
    field_name: "created_at",
    type: 5,
    property: { date_formatter: "yyyy-MM-dd HH:mm" },
  },
  { field_name: "task_sql", type: 1 },
  { field_name: "task_result_num", type: 2, property: { formatter: "0" } },
  { field_name: "task_result_object", type: 1 },
  { field_name: "extra", type: 1 },
  {
    field_name: "status",
    type: 3,
    property: {
      options: ["succeeded", "failed", "processing", "init", "not_support", "pending"].map(
        (name) => ({ name }),
      ),
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
  field_name?: string;
  is_primary?: boolean;
}

interface BitableRecord {
  record_id?: string;
  fields?: Record<string, unknown>;
  created_time?: number;
  last_modified_time?: number;
}

async function listTables(
  api: LarkAlertTroubleshooterApi,
  appToken: string,
): Promise<BitableTable[]> {
  const tables: BitableTable[] = [];
  let pageToken: string | undefined;
  do {
    const result = await api.request(
      () =>
        api.client.bitable.v1.appTable.list({
          path: { app_token: appToken },
          params: {
            page_size: 100,
            ...(pageToken ? { page_token: pageToken } : {}),
          },
        }),
      { identity: "bot", requiredScopes: ["base:table:read"] },
    );
    tables.push(...(result.data?.items ?? []));
    pageToken = result.data?.has_more ? result.data.page_token : undefined;
  } while (pageToken);
  return tables;
}

async function createAttributionTable(
  api: LarkAlertTroubleshooterApi,
  appToken: string,
  name = BAMBOO_ATTRIBUTION_TABLE_NAME,
): Promise<string> {
  const result = await api.request(
    () =>
      api.client.bitable.v1.appTable.create({
        path: { app_token: appToken },
        data: {
          table: {
            name,
            default_view_name: "全部记录",
            fields: [...BAMBOO_ATTRIBUTION_FIELDS],
          },
        },
      }),
    { identity: "bot", requiredScopes: ["base:table:create"] },
  );
  const tableId = result.data?.table_id;
  if (!tableId) throw new Error("创建 Bamboo 归因记录表后未返回 table_id");
  return tableId;
}

async function isCanonicalTable(
  api: LarkAlertTroubleshooterApi,
  appToken: string,
  tableId: string,
): Promise<boolean> {
  const result = await api.request(
    () =>
      api.client.bitable.v1.appTableField.list({
        path: { app_token: appToken, table_id: tableId },
        params: { page_size: 100 },
      }),
    { identity: "bot", requiredScopes: ["base:field:read"] },
  );
  const fields = (result.data?.items ?? []) as BitableField[];
  const names = fields.map((field) => field.field_name).filter((name): name is string => !!name);
  const primary = fields.find((field) => field.is_primary)?.field_name;
  const expected = [...BAMBOO_ATTRIBUTION_FIELD_NAMES];
  const actual = new Set(names);
  return !(
    primary !== BAMBOO_ATTRIBUTION_FIELD_NAMES[0] ||
    names.length !== expected.length ||
    expected.some((name) => !actual.has(name))
  );
}

function scalarCellValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.length === 1) return scalarCellValue(value[0]);
    return JSON.stringify(value);
  }
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    return (
      scalarCellValue(candidate.link) ??
      scalarCellValue(candidate.text) ??
      scalarCellValue(candidate.name) ??
      JSON.stringify(value)
    );
  }
  return null;
}

function timestampCellValue(value: unknown): number | null {
  const scalar = scalarCellValue(value);
  if (typeof scalar === "number" && Number.isFinite(scalar)) {
    return scalar < 1_000_000_000_000 ? scalar * 1000 : scalar;
  }
  if (typeof scalar !== "string" || !scalar.trim()) return null;
  const parsed = Date.parse(scalar);
  return Number.isFinite(parsed) ? parsed : null;
}

function textCellValue(value: unknown): string {
  const scalar = scalarCellValue(value);
  return scalar === null ? "" : String(scalar).trim();
}

function numberCellValue(value: unknown): number {
  const scalar = scalarCellValue(value);
  const parsed = Number(scalar);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function normalizeMigratedRecord(record: BitableRecord): Record<string, string | number | boolean> {
  const source = record.fields ?? {};
  const resultId = textCellValue(source.result_id);
  const uniqueId = textCellValue(source.unique_id) || resultId;
  if (!uniqueId) {
    throw new Error(
      `旧 Bamboo 归因记录 ${record.record_id ?? "(unknown)"} 缺少 unique_id/result_id`,
    );
  }
  const fields: Record<string, string | number | boolean> = {
    unique_id: uniqueId,
    result_id: resultId || uniqueId,
    alarm_record_detail_id: textCellValue(source.alarm_record_detail_id) || "0",
    task_id: textCellValue(source.task_id),
    task_name: textCellValue(source.task_name) || `Bamboo result_id ${resultId || uniqueId}`,
    bamboo_url: textCellValue(source.bamboo_url),
    task_sql: textCellValue(source.task_sql),
    task_result_num: numberCellValue(source.task_result_num),
    task_result_object: textCellValue(source.task_result_object),
    extra: textCellValue(source.extra),
    status: textCellValue(source.status) || "init",
    ai_session_id: textCellValue(source.ai_session_id),
    ai_summary: textCellValue(source.ai_summary),
    ai_result: textCellValue(source.ai_result),
    last_error: textCellValue(source.last_error),
  };
  const taskTime = timestampCellValue(source.task_time);
  const createdAt = timestampCellValue(source.created_at) ?? record.created_time ?? null;
  const aiFinishedAt = timestampCellValue(source.ai_finished_at);
  if (taskTime !== null) fields.task_time = taskTime;
  if (createdAt !== null) fields.created_at = createdAt;
  if (aiFinishedAt !== null) fields.ai_finished_at = aiFinishedAt;
  return fields;
}

async function listRecords(
  api: LarkAlertTroubleshooterApi,
  appToken: string,
  tableId: string,
): Promise<BitableRecord[]> {
  const records: BitableRecord[] = [];
  let pageToken: string | undefined;
  do {
    const result = await api.request(
      () =>
        api.client.bitable.v1.appTableRecord.list({
          path: { app_token: appToken, table_id: tableId },
          params: {
            page_size: 500,
            ...(pageToken ? { page_token: pageToken } : {}),
          },
        }),
      { identity: "bot", requiredScopes: ["base:record:read"] },
    );
    records.push(...((result.data?.items ?? []) as BitableRecord[]));
    pageToken = result.data?.has_more ? result.data.page_token : undefined;
  } while (pageToken);
  return records;
}

function deduplicateMigratedRecords(records: readonly BitableRecord[]): Array<{
  fields: Record<string, string | number | boolean>;
}> {
  const latestByUniqueId = new Map<string, BitableRecord>();
  for (const record of records) {
    const normalized = normalizeMigratedRecord(record);
    const uniqueId = String(normalized.unique_id);
    const previous = latestByUniqueId.get(uniqueId);
    if (
      !previous ||
      (record.last_modified_time ?? record.created_time ?? 0) >=
        (previous.last_modified_time ?? previous.created_time ?? 0)
    ) {
      latestByUniqueId.set(uniqueId, record);
    }
  }
  return [...latestByUniqueId.values()].map((record) => ({
    fields: normalizeMigratedRecord(record),
  }));
}

async function migrateAttributionTable(
  api: LarkAlertTroubleshooterApi,
  appToken: string,
  sourceTableId: string,
): Promise<string> {
  const sourceRecords = await listRecords(api, appToken, sourceTableId);
  const records = deduplicateMigratedRecords(sourceRecords);
  const migrationName = `${BAMBOO_ATTRIBUTION_MIGRATION_TABLE_PREFIX}-${sourceTableId.slice(-6)}`;
  const targetTableId = await createAttributionTable(api, appToken, migrationName);
  const backupName = `${BAMBOO_ATTRIBUTION_TABLE_NAME}（迁移备份-${sourceTableId.slice(-6)}）`;
  let sourceRenamed = false;
  let targetRenamed = false;
  try {
    for (let index = 0; index < records.length; index += 500) {
      const chunk = records.slice(index, index + 500);
      await api.request(
        () =>
          api.client.bitable.v1.appTableRecord.batchCreate({
            path: { app_token: appToken, table_id: targetTableId },
            params: {
              client_token: createLarkRecordClientToken({
                pluginId: "bamboo-attribution-table-migration",
                projectId: appToken,
                uniqueId: `${sourceTableId}:${targetTableId}:${index}`,
              }),
            },
            data: { records: chunk },
          }),
        { identity: "bot", requiredScopes: ["base:record:create"] },
      );
    }
    const migratedRecords = await listRecords(api, appToken, targetTableId);
    const migratedUniqueIds = new Set(
      migratedRecords.map((record) => textCellValue(record.fields?.unique_id)).filter(Boolean),
    );
    const expectedUniqueIds = new Set(
      records.map((record) => textCellValue(record.fields.unique_id)).filter(Boolean),
    );
    if (
      migratedRecords.length !== records.length ||
      migratedUniqueIds.size !== expectedUniqueIds.size ||
      [...expectedUniqueIds].some((uniqueId) => !migratedUniqueIds.has(uniqueId))
    ) {
      throw new Error("Bamboo 归因记录旧表迁移校验失败，已保留旧表");
    }
    await api.request(
      () =>
        api.client.bitable.v1.appTable.patch({
          path: { app_token: appToken, table_id: sourceTableId },
          data: { name: backupName },
        }),
      { identity: "bot", requiredScopes: ["base:table:update"] },
    );
    sourceRenamed = true;
    await api.request(
      () =>
        api.client.bitable.v1.appTable.patch({
          path: { app_token: appToken, table_id: targetTableId },
          data: { name: BAMBOO_ATTRIBUTION_TABLE_NAME },
        }),
      { identity: "bot", requiredScopes: ["base:table:update"] },
    );
    targetRenamed = true;
    await api.request(
      () =>
        api.client.bitable.v1.appTable.delete({
          path: { app_token: appToken, table_id: sourceTableId },
        }),
      { identity: "bot", requiredScopes: ["base:table:delete"] },
    );
    return targetTableId;
  } catch (error) {
    if (sourceRenamed && !targetRenamed) {
      try {
        await api.request(
          () =>
            api.client.bitable.v1.appTable.patch({
              path: { app_token: appToken, table_id: sourceTableId },
              data: { name: BAMBOO_ATTRIBUTION_TABLE_NAME },
            }),
          { identity: "bot", requiredScopes: ["base:table:update"] },
        );
      } catch {
        // Preserve the original failure; both tables and all records remain available.
      }
    }
    if (!targetRenamed) {
      try {
        await api.request(
          () =>
            api.client.bitable.v1.appTable.delete({
              path: { app_token: appToken, table_id: targetTableId },
            }),
          { identity: "bot", requiredScopes: ["base:table:delete"] },
        );
      } catch {
        // The original table still owns the authoritative records.
      }
    }
    throw new Error(
      `Bamboo 归因记录旧表迁移失败，旧表数据仍保留：${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}

async function deleteDashboards(api: LarkAlertTroubleshooterApi, appToken: string): Promise<void> {
  const dashboardIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const result = await api.request(
      () =>
        api.client.bitable.v1.appDashboard.list({
          path: { app_token: appToken },
          params: {
            page_size: 100,
            ...(pageToken ? { page_token: pageToken } : {}),
          },
        }),
      { identity: "bot", requiredScopes: ["base:dashboard:read"] },
    );
    dashboardIds.push(...(result.data?.dashboards ?? []).map((dashboard) => dashboard.block_id));
    pageToken = result.data?.has_more ? result.data.page_token : undefined;
  } while (pageToken);
  for (const dashboardId of dashboardIds) {
    await api.request(
      () =>
        api.client.request({
          method: "DELETE",
          url: `${api.client.domain}/open-apis/base/v3/bases/${appToken}/dashboards/${dashboardId}`,
        }),
      { identity: "bot", requiredScopes: ["base:dashboard:delete"] },
    );
  }
}

function isGeneratedSurfacePermissionError(
  error: unknown,
  requiredScopes: readonly string[],
): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /\b(?:99991672|99991679)\b/u.test(message) &&
    requiredScopes.some((scope) => message.includes(scope))
  );
}

async function cleanupGeneratedSurface(
  operation: () => Promise<void>,
  requiredScopes: readonly string[],
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (isGeneratedSurfacePermissionError(error, requiredScopes)) return;
    throw error;
  }
}

async function disableWorkflows(api: LarkAlertTroubleshooterApi, appToken: string): Promise<void> {
  const result = await api.request(
    () => api.client.bitable.v1.appWorkflow.list({ path: { app_token: appToken } }),
    { identity: "bot", requiredScopes: ["base:workflow:read"] },
  );
  for (const workflow of result.data?.workflows ?? []) {
    if (workflow.status === "disabled") continue;
    await api.request(
      () =>
        api.client.request({
          method: "PATCH",
          url: `${api.client.domain}/open-apis/base/v3/bases/${appToken}/workflows/${workflow.workflow_id}/disable`,
        }),
      { identity: "bot", requiredScopes: ["base:workflow:update"] },
    );
  }
}

async function deleteOtherTables(
  api: LarkAlertTroubleshooterApi,
  appToken: string,
  attributionTableId: string,
): Promise<void> {
  const tables = await listTables(api, appToken);
  for (const table of tables) {
    if (!table.table_id || table.table_id === attributionTableId) continue;
    await api.request(
      () =>
        api.client.bitable.v1.appTable.delete({
          path: { app_token: appToken, table_id: table.table_id! },
        }),
      { identity: "bot", requiredScopes: ["base:table:delete"] },
    );
  }
}

async function assertOtherTablesEmpty(
  api: LarkAlertTroubleshooterApi,
  appToken: string,
  attributionTableId: string,
): Promise<void> {
  const tables = await listTables(api, appToken);
  for (const table of tables) {
    if (!table.table_id || table.table_id === attributionTableId) continue;
    const result = await api.request(
      () =>
        api.client.bitable.v1.appTableRecord.list({
          path: { app_token: appToken, table_id: table.table_id! },
          params: { page_size: 1 },
        }),
      { identity: "bot", requiredScopes: ["base:record:read"] },
    );
    if ((result.data?.items?.length ?? 0) > 0) {
      throw new Error(
        `旧数据表“${table.name ?? table.table_id}”仍有记录，已停止自动删除；请先迁移并按 unique_id 去重`,
      );
    }
  }
}

/**
 * Wiki-created Bases contain a default table and may contain generated
 * dashboards/workflows. Create the canonical table first so the last-table
 * restriction cannot strand the Base, then remove generated surfaces.
 */
export async function ensureBambooAttributionTable(
  api: LarkAlertTroubleshooterApi,
  appToken: string,
): Promise<string> {
  const tables = await listTables(api, appToken);
  const matches = tables.filter((table) => table.name === BAMBOO_ATTRIBUTION_TABLE_NAME);
  if (matches.length > 1) {
    throw new Error(`日报多维表格中存在多个“${BAMBOO_ATTRIBUTION_TABLE_NAME}”数据表`);
  }

  let tableId = matches[0]?.table_id ?? (await createAttributionTable(api, appToken));
  if (!tableId) throw new Error("日报多维表格中的归因记录表缺少 table_id");
  if (!(await isCanonicalTable(api, appToken, tableId))) {
    tableId = await migrateAttributionTable(api, appToken, tableId);
  }
  if (!(await isCanonicalTable(api, appToken, tableId))) {
    throw new Error(
      `Bamboo 归因记录表结构不一致：要求主字段为 unique_id，且字段仅为 ${BAMBOO_ATTRIBUTION_FIELD_NAMES.join("、")}`,
    );
  }
  await assertOtherTablesEmpty(api, appToken, tableId);
  await cleanupGeneratedSurface(
    () => deleteDashboards(api, appToken),
    ["base:dashboard:read", "base:dashboard:delete"],
  );
  await cleanupGeneratedSurface(
    () => disableWorkflows(api, appToken),
    ["base:workflow:read", "base:workflow:update"],
  );
  await deleteOtherTables(api, appToken, tableId);

  const remaining = await listTables(api, appToken);
  if (
    remaining.length !== 1 ||
    remaining[0]?.table_id !== tableId ||
    remaining[0]?.name !== BAMBOO_ATTRIBUTION_TABLE_NAME
  ) {
    throw new Error("Bamboo 日报清理失败：多维表格必须只保留“归因记录”数据表");
  }
  return tableId;
}
