import type { NormalizedLarkMessageEvent } from "../channels/lark/lark-message-format.js";
import { BAMBOO_RECORD_FIELDS, parseBambooAlertRecord } from "./bamboo-alert-record-contract.js";
import { bambooStatusFields, type BitableWritableFields } from "./bamboo-attribution-record.js";
import { BAMBOO_ATTRIBUTION_FIELD_NAMES } from "./bamboo-attribution-table.js";
import {
  ARGOS_ATTRIBUTION_FIELD_NAMES,
  ARGOS_RECORD_FIELDS,
  argosStatusFields,
  parseArgosAlertRecord,
} from "./argos-alert-record.js";

export interface LegacyAlertRecordFields {
  messageTime: string;
  chatId: string;
  status: string;
  claimId: string;
  claimedAt: string;
  completedAt: string;
  error: string;
  agentId: string;
}

export type AlertRecordKind = "bamboo" | "argos" | "legacy";

export interface AlertMessageDescriptor {
  kind: AlertRecordKind;
  canonical: boolean;
  bambooRecord: ReturnType<typeof parseBambooAlertRecord>;
  argosRecord: ReturnType<typeof parseArgosAlertRecord>;
  resultId: string | null;
  uniqueId: string;
  recordDate: Date;
}

interface RecordSearchData {
  field_names: string[];
  sort: Array<{ field_name: string; desc: boolean }>;
  filter?: {
    conjunction: "and";
    conditions: Array<{
      field_name: string;
      operator: "is";
      value: string[];
    }>;
  };
}

export function alertRecordKind(pluginId: string): AlertRecordKind {
  if (pluginId.includes("bamboo")) return "bamboo";
  if (pluginId.includes("argos")) return "argos";
  return "legacy";
}

export function isCanonicalAlertRecordPlugin(pluginId: string): boolean {
  return alertRecordKind(pluginId) !== "legacy";
}

function eventDate(event: NormalizedLarkMessageEvent): Date {
  if (event.createTime === null) return new Date();
  const timestamp = event.createTime < 10_000_000_000 ? event.createTime * 1000 : event.createTime;
  return new Date(timestamp);
}

export function parseAlertMessageDescriptor(
  pluginId: string,
  event: NormalizedLarkMessageEvent,
): AlertMessageDescriptor {
  const kind = alertRecordKind(pluginId);
  const bambooRecord = kind === "bamboo" ? parseBambooAlertRecord(event) : null;
  const argosRecord = kind === "argos" ? parseArgosAlertRecord(event) : null;
  if (kind === "bamboo" && !bambooRecord) {
    throw new Error(`Bamboo 报警消息 ${event.messageId} 无法提取 result_id，已跳过入表`);
  }
  if (kind === "argos" && !argosRecord) {
    throw new Error(`Argos 报警消息 ${event.messageId} 无法提取 rule_id/result_id，已跳过入表`);
  }
  const argosDate = argosRecord?.resultTime ? new Date(argosRecord.resultTime) : null;
  const recordDate = argosDate && !Number.isNaN(argosDate.getTime()) ? argosDate : eventDate(event);
  return {
    kind,
    canonical: kind !== "legacy",
    bambooRecord,
    argosRecord,
    resultId: bambooRecord?.resultId ?? argosRecord?.resultId ?? null,
    uniqueId: bambooRecord?.uniqueId ?? argosRecord?.uniqueId ?? `message_id:${event.messageId}`,
    recordDate,
  };
}

export function recordFieldNames(pluginId: string, legacyFields: Record<string, string>): string[] {
  const kind = alertRecordKind(pluginId);
  if (kind === "bamboo") return [...BAMBOO_ATTRIBUTION_FIELD_NAMES];
  if (kind === "argos") return [...ARGOS_ATTRIBUTION_FIELD_NAMES];
  return Object.values(legacyFields);
}

export function recordSortField(pluginId: string, legacyFields: LegacyAlertRecordFields): string {
  const kind = alertRecordKind(pluginId);
  if (kind === "bamboo") return BAMBOO_RECORD_FIELDS.taskTime;
  if (kind === "argos") return ARGOS_RECORD_FIELDS.resultTime;
  return legacyFields.messageTime;
}

export function latestMessageSearchData(
  pluginId: string,
  chatId: string,
  legacyFields: LegacyAlertRecordFields,
): RecordSearchData {
  const kind = alertRecordKind(pluginId);
  if (kind === "bamboo") {
    return {
      field_names: [BAMBOO_RECORD_FIELDS.extra, BAMBOO_RECORD_FIELDS.taskTime],
      sort: [{ field_name: BAMBOO_RECORD_FIELDS.taskTime, desc: true }],
    };
  }
  if (kind === "argos") {
    return {
      field_names: [
        ARGOS_RECORD_FIELDS.extra,
        ARGOS_RECORD_FIELDS.createTime,
        ARGOS_RECORD_FIELDS.resultTime,
      ],
      sort: [{ field_name: ARGOS_RECORD_FIELDS.createTime, desc: true }],
    };
  }
  return {
    field_names: [legacyFields.chatId, legacyFields.messageTime],
    filter: {
      conjunction: "and",
      conditions: [
        {
          field_name: legacyFields.chatId,
          operator: "is",
          value: [chatId],
        },
      ],
    },
    sort: [{ field_name: legacyFields.messageTime, desc: true }],
  };
}

export function recordExtraField(pluginId: string): string {
  return alertRecordKind(pluginId) === "argos"
    ? ARGOS_RECORD_FIELDS.extra
    : BAMBOO_RECORD_FIELDS.extra;
}

export function recordCanonicalTimeField(pluginId: string): string {
  return alertRecordKind(pluginId) === "argos"
    ? ARGOS_RECORD_FIELDS.createTime
    : BAMBOO_RECORD_FIELDS.taskTime;
}

export function firstFiniteTimestamp(...values: Array<number | null>): number | null {
  return values.find((value): value is number => value !== null && Number.isFinite(value)) ?? null;
}

export function runningRecordFields(
  pluginId: string,
  claimId: string,
  legacyFields: LegacyAlertRecordFields,
): BitableWritableFields {
  const kind = alertRecordKind(pluginId);
  if (kind === "bamboo") {
    return {
      ...bambooStatusFields("processing"),
      [BAMBOO_RECORD_FIELDS.aiSessionId]: claimId,
      [BAMBOO_RECORD_FIELDS.lastError]: "",
    };
  }
  if (kind === "argos") {
    return {
      ...argosStatusFields("processing"),
      [ARGOS_RECORD_FIELDS.aiSessionId]: claimId,
      [ARGOS_RECORD_FIELDS.lastError]: "",
    };
  }
  return {
    [legacyFields.status]: "处理中",
    [legacyFields.claimId]: claimId,
    [legacyFields.claimedAt]: new Date().toISOString(),
    [legacyFields.error]: "",
  };
}

export function succeededRecordFields(
  pluginId: string,
  agentId: string,
  legacyFields: LegacyAlertRecordFields,
): BitableWritableFields {
  const kind = alertRecordKind(pluginId);
  if (kind === "bamboo") {
    return {
      ...bambooStatusFields("succeeded"),
      [BAMBOO_RECORD_FIELDS.aiSessionId]: agentId,
      [BAMBOO_RECORD_FIELDS.aiFinishedAt]: Date.now(),
      [BAMBOO_RECORD_FIELDS.lastError]: "",
    };
  }
  if (kind === "argos") {
    return {
      ...argosStatusFields("succeeded"),
      [ARGOS_RECORD_FIELDS.aiSessionId]: agentId,
      [ARGOS_RECORD_FIELDS.aiFinishedAt]: Date.now(),
      [ARGOS_RECORD_FIELDS.lastError]: "",
    };
  }
  return {
    [legacyFields.status]: "已完成",
    [legacyFields.agentId]: agentId,
    [legacyFields.completedAt]: new Date().toISOString(),
    [legacyFields.error]: "",
  };
}

export function outcomeRecordFields(input: {
  pluginId: string;
  agentId: string;
  status: "succeeded" | "pending" | "not_support";
  summary: string;
  documentUrl?: string;
}): BitableWritableFields {
  const argos = alertRecordKind(input.pluginId) === "argos";
  const fields = argos ? ARGOS_RECORD_FIELDS : BAMBOO_RECORD_FIELDS;
  return {
    ...(argos ? argosStatusFields(input.status) : bambooStatusFields(input.status)),
    [fields.aiSessionId]: input.agentId,
    [fields.aiSummary]: input.summary,
    [fields.aiResult]: input.documentUrl ?? "",
    [fields.aiFinishedAt]: Date.now(),
    [fields.lastError]: "",
  };
}

export function pausedRecordFields(
  pluginId: string,
  legacyFields: LegacyAlertRecordFields,
): BitableWritableFields {
  const kind = alertRecordKind(pluginId);
  if (kind === "bamboo") {
    return {
      ...bambooStatusFields("pending"),
      [BAMBOO_RECORD_FIELDS.lastError]: "任务已暂停",
    };
  }
  if (kind === "argos") {
    return {
      ...argosStatusFields("pending"),
      [ARGOS_RECORD_FIELDS.lastError]: "任务已暂停",
    };
  }
  return {
    [legacyFields.status]: "已暂停",
    [legacyFields.completedAt]: new Date().toISOString(),
    [legacyFields.error]: "",
  };
}

function canonicalFailedFields(
  kind: Exclude<AlertRecordKind, "legacy">,
  error: string,
): BitableWritableFields {
  if (kind === "argos") {
    return {
      ...argosStatusFields("failed"),
      [ARGOS_RECORD_FIELDS.aiFinishedAt]: Date.now(),
      [ARGOS_RECORD_FIELDS.lastError]: error.slice(0, 10_000),
    };
  }
  return {
    ...bambooStatusFields("failed"),
    [BAMBOO_RECORD_FIELDS.aiFinishedAt]: Date.now(),
    [BAMBOO_RECORD_FIELDS.lastError]: error.slice(0, 10_000),
  };
}

function canonicalRetryFields(
  kind: Exclude<AlertRecordKind, "legacy">,
  error: string,
): BitableWritableFields {
  if (kind === "argos") {
    return {
      ...argosStatusFields("init"),
      [ARGOS_RECORD_FIELDS.aiSessionId]: "",
      [ARGOS_RECORD_FIELDS.lastError]: error.slice(0, 10_000),
    };
  }
  return {
    ...bambooStatusFields("init"),
    [BAMBOO_RECORD_FIELDS.aiSessionId]: "",
    [BAMBOO_RECORD_FIELDS.lastError]: error.slice(0, 10_000),
  };
}

function canonicalPendingFields(
  kind: Exclude<AlertRecordKind, "legacy">,
  error: string,
): BitableWritableFields {
  if (kind === "argos") {
    return {
      ...argosStatusFields("pending"),
      [ARGOS_RECORD_FIELDS.aiFinishedAt]: Date.now(),
      [ARGOS_RECORD_FIELDS.lastError]: error.slice(0, 10_000),
    };
  }
  return {
    ...bambooStatusFields("pending"),
    [BAMBOO_RECORD_FIELDS.aiFinishedAt]: Date.now(),
    [BAMBOO_RECORD_FIELDS.lastError]: error.slice(0, 10_000),
  };
}

export function failedRecordFields(
  pluginId: string,
  error: string,
  legacyFields: LegacyAlertRecordFields,
): BitableWritableFields {
  const kind = alertRecordKind(pluginId);
  if (kind !== "legacy") return canonicalFailedFields(kind, error);
  return {
    [legacyFields.status]: "失败",
    [legacyFields.completedAt]: new Date().toISOString(),
    [legacyFields.error]: error.slice(0, 10_000),
  };
}

export function retryScheduledRecordFields(
  pluginId: string,
  error: string,
  legacyFields: LegacyAlertRecordFields,
): BitableWritableFields {
  const kind = alertRecordKind(pluginId);
  if (kind !== "legacy") return canonicalRetryFields(kind, error);
  return {
    [legacyFields.status]: "未认领",
    [legacyFields.claimId]: "",
    [legacyFields.claimedAt]: "",
    [legacyFields.completedAt]: "",
    [legacyFields.error]: error.slice(0, 10_000),
  };
}

export function pendingRecordFields(
  pluginId: string,
  error: string,
  legacyFields: LegacyAlertRecordFields,
): BitableWritableFields {
  const kind = alertRecordKind(pluginId);
  if (kind !== "legacy") return canonicalPendingFields(kind, error);
  return {
    [legacyFields.status]: "待处理",
    [legacyFields.completedAt]: new Date().toISOString(),
    [legacyFields.error]: error.slice(0, 10_000),
  };
}
