import type { AlertTroubleshooterQueueTrigger } from "./alert-troubleshooter-queue-store.js";
import {
  BAMBOO_RECORD_FIELDS,
  type BambooAlertRecordData,
  type BambooRecordStatus,
} from "./bamboo-alert-record-contract.js";

export type BitableWritableFields = Record<string, string | number | boolean>;

export interface BambooAttributionMetadata {
  projectId: string;
  pluginId: string;
  trigger: AlertTroubleshooterQueueTrigger;
  chatName: string;
}

export function parseBambooExtra(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function bambooStatusFields(status: BambooRecordStatus): BitableWritableFields {
  return { [BAMBOO_RECORD_FIELDS.status]: status };
}

export function bambooMessageFields(
  record: BambooAlertRecordData,
  metadata: BambooAttributionMetadata,
): BitableWritableFields {
  const taskTime = Date.parse(record.taskTime);
  return {
    [BAMBOO_RECORD_FIELDS.uniqueId]: record.uniqueId,
    [BAMBOO_RECORD_FIELDS.resultId]: record.resultId,
    [BAMBOO_RECORD_FIELDS.alarmRecordDetailId]: "",
    [BAMBOO_RECORD_FIELDS.taskId]: record.taskId,
    [BAMBOO_RECORD_FIELDS.taskName]: record.taskName,
    ...(Number.isFinite(taskTime) ? { [BAMBOO_RECORD_FIELDS.taskTime]: taskTime } : {}),
    [BAMBOO_RECORD_FIELDS.bambooUrl]: record.bambooUrl,
    [BAMBOO_RECORD_FIELDS.createdAt]: Date.now(),
    [BAMBOO_RECORD_FIELDS.taskSql]: "",
    [BAMBOO_RECORD_FIELDS.taskResultNum]: Math.trunc(Number(record.taskResultNum) || 0),
    [BAMBOO_RECORD_FIELDS.taskResultObject]: "",
    [BAMBOO_RECORD_FIELDS.extra]: JSON.stringify({
      ...parseBambooExtra(record.extra),
      project_id: metadata.projectId,
      plugin_id: metadata.pluginId,
      trigger: metadata.trigger,
      chat_name: metadata.chatName,
    }),
    ...bambooStatusFields("init"),
    [BAMBOO_RECORD_FIELDS.aiSessionId]: "",
    [BAMBOO_RECORD_FIELDS.aiSummary]: "",
    [BAMBOO_RECORD_FIELDS.aiResult]: "",
    [BAMBOO_RECORD_FIELDS.lastError]: "",
  };
}

export function bambooManualFields(input: {
  resultId: string;
  projectId: string;
  pluginId: string;
  now?: number;
}): BitableWritableFields {
  const now = input.now ?? Date.now();
  return {
    [BAMBOO_RECORD_FIELDS.uniqueId]: input.resultId,
    [BAMBOO_RECORD_FIELDS.resultId]: input.resultId,
    [BAMBOO_RECORD_FIELDS.alarmRecordDetailId]: "",
    [BAMBOO_RECORD_FIELDS.taskId]: "",
    [BAMBOO_RECORD_FIELDS.taskName]: `Bamboo result_id ${input.resultId}`,
    [BAMBOO_RECORD_FIELDS.taskTime]: now,
    [BAMBOO_RECORD_FIELDS.bambooUrl]: "",
    [BAMBOO_RECORD_FIELDS.createdAt]: now,
    [BAMBOO_RECORD_FIELDS.taskSql]: "",
    [BAMBOO_RECORD_FIELDS.taskResultNum]: 0,
    [BAMBOO_RECORD_FIELDS.taskResultObject]: "",
    [BAMBOO_RECORD_FIELDS.extra]: JSON.stringify({
      manual: true,
      trigger: "manual",
      project_id: input.projectId,
      plugin_id: input.pluginId,
    }),
    ...bambooStatusFields("init"),
    [BAMBOO_RECORD_FIELDS.aiSessionId]: "",
    [BAMBOO_RECORD_FIELDS.aiSummary]: "",
    [BAMBOO_RECORD_FIELDS.aiResult]: "",
    [BAMBOO_RECORD_FIELDS.lastError]: "",
  };
}
