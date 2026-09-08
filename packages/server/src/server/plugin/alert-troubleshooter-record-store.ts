import type { AlertTroubleshooterConfig } from "@getpaseo/protocol/messages";
import type { LarkChannelStore } from "../channels/lark/lark-channel-store.js";
import type { NormalizedLarkMessageEvent } from "../channels/lark/lark-message-format.js";
import type { LarkUserOAuthService } from "../channels/lark/lark-user-oauth-service.js";
import type { AlertTroubleshooterQueueTrigger } from "./alert-troubleshooter-queue-store.js";
import {
  alertTableDateKey,
  resolveDailyAlertTable,
  resolveExistingDailyAlertTable,
  type AlertTroubleshooterTableLocation,
} from "./alert-troubleshooter-daily-table.js";
import {
  createLarkAlertTroubleshooterApi,
  type LarkAlertTroubleshooterApi,
} from "./lark-alert-troubleshooter-api.js";
import { createLarkRecordClientToken } from "./lark-record-client-token.js";
import {
  BAMBOO_RECORD_FIELDS,
  bambooMessageSentAtMs,
  normalizeBambooUniqueId,
  parseBambooAlertRecord,
  type BambooRecordStatus,
} from "./bamboo-alert-record-contract.js";

const FIELDS = {
  messageId: "消息 ID",
  chatId: "群 ID",
  chatName: "群名称",
  content: "消息内容",
  messageTime: "消息时间",
  trigger: "触发方式",
  status: "处理状态",
  claimId: "认领标识",
  claimedAt: "认领时间",
  completedAt: "完成时间",
  error: "错误信息",
  projectId: "Project ID",
  pluginId: "插件 ID",
  agentId: "Agent ID",
  uniqueId: "unique_id",
  resultId: "result_id",
} as const;

const STATUS_UNCLAIMED = "未认领";
const STATUS_RUNNING = "处理中";
const STATUS_PAUSED = "已暂停";
const STATUS_SUCCEEDED = "已完成";
const STATUS_FAILED = "失败";

type RecordFields = Record<string, unknown>;

export interface AlertTroubleshooterRecord {
  recordId: string;
  uniqueId: string;
  resultId: string | null;
  tableDate: string;
  messageId: string | null;
  chatId: string | null;
  chatName: string | null;
  messageText: string;
  messageTime: string | null;
  trigger: AlertTroubleshooterQueueTrigger;
}

export interface AlertTroubleshooterRecordStore {
  upsertMessage(input: {
    config: AlertTroubleshooterConfig;
    projectId: string;
    pluginId: string;
    trigger: AlertTroubleshooterQueueTrigger;
    event: NormalizedLarkMessageEvent;
  }): Promise<AlertTroubleshooterRecord>;
  listUnclaimed(input: {
    config: AlertTroubleshooterConfig;
    projectId: string;
    pluginId: string;
    limit: number;
  }): Promise<AlertTroubleshooterRecord[]>;
  getLatestMessageTimeByChat?(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    chatId: string;
  }): Promise<number | null>;
  getRecord(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
  }): Promise<AlertTroubleshooterRecord | null>;
  getRecordByUniqueId(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    uniqueId: string;
  }): Promise<AlertTroubleshooterRecord | null>;
  upsertManualResult?(input: {
    config: AlertTroubleshooterConfig;
    projectId: string;
    pluginId: string;
    resultId: string;
  }): Promise<AlertTroubleshooterRecord>;
  markRunning(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
    claimId: string;
  }): Promise<void>;
  markSucceeded(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
    agentId: string;
  }): Promise<void>;
  markOutcome?(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
    agentId: string;
    status: "succeeded" | "pending" | "not_support";
    summary: string;
    documentUrl?: string;
  }): Promise<void>;
  markPaused(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
  }): Promise<void>;
  markFailed(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
    error: string;
  }): Promise<void>;
}

interface LarkRecord {
  record_id?: string;
  fields: RecordFields;
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const text = value
      .map((item) =>
        item && typeof item === "object" && "text" in item
          ? String((item as { text?: unknown }).text ?? "")
          : String(item ?? ""),
      )
      .join("")
      .trim();
    return text || null;
  }
  return null;
}

function eventTime(event: NormalizedLarkMessageEvent): string | null {
  if (event.createTime === null) return null;
  const timestamp = event.createTime < 10_000_000_000 ? event.createTime * 1000 : event.createTime;
  return new Date(timestamp).toISOString();
}

function normalizeTrigger(value: unknown): AlertTroubleshooterQueueTrigger {
  const trigger = textValue(value);
  return trigger === "message" ||
    trigger === "schedule" ||
    trigger === "table" ||
    trigger === "manual"
    ? trigger
    : "table";
}

function jsonObject(value: unknown): Record<string, unknown> {
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

function toRecord(record: LarkRecord, tableDate: string): AlertTroubleshooterRecord | null {
  const recordId = record.record_id?.trim();
  if (!recordId) return null;
  const extra = jsonObject(record.fields[BAMBOO_RECORD_FIELDS.extra]);
  const messageId =
    textValue(record.fields[FIELDS.messageId]) ?? textValue(extra.message_id) ?? null;
  const uniqueId =
    textValue(record.fields[FIELDS.uniqueId]) ??
    (messageId ? `message_id:${messageId}` : `record_id:${recordId}`);
  return {
    recordId,
    uniqueId,
    resultId: textValue(record.fields[FIELDS.resultId]),
    tableDate,
    messageId,
    chatId:
      textValue(record.fields[FIELDS.chatId]) ??
      textValue(extra.chat_id) ??
      textValue(extra.group_id),
    chatName: textValue(record.fields[FIELDS.chatName]),
    messageText:
      textValue(record.fields[FIELDS.content]) ??
      textValue(record.fields[BAMBOO_RECORD_FIELDS.taskName]) ??
      "",
    messageTime:
      textValue(record.fields[FIELDS.messageTime]) ??
      textValue(extra.message_sent_at) ??
      textValue(record.fields[BAMBOO_RECORD_FIELDS.taskTime]),
    trigger: normalizeTrigger(record.fields[FIELDS.trigger]),
  };
}

function isBambooPlugin(pluginId: string): boolean {
  return pluginId.includes("bamboo");
}

function recentDateKeys(now = new Date()): string[] {
  return [alertTableDateKey(now), alertTableDateKey(new Date(now.getTime() - 24 * 60 * 60_000))];
}

function recordStatus(record: LarkRecord): string | null {
  return (
    textValue(record.fields[BAMBOO_RECORD_FIELDS.status]) ?? textValue(record.fields[FIELDS.status])
  );
}

function isClaimableStatus(status: string | null, bamboo: boolean): boolean {
  return bamboo
    ? !status || status === "init" || status === "failed" || status === STATUS_UNCLAIMED
    : !status || status === STATUS_UNCLAIMED;
}

function bambooStatusFields(status: BambooRecordStatus): Record<string, string> {
  let legacy: string = status;
  if (status === "init") legacy = STATUS_UNCLAIMED;
  else if (status === "processing") legacy = STATUS_RUNNING;
  else if (status === "succeeded") legacy = STATUS_SUCCEEDED;
  else if (status === "failed") legacy = STATUS_FAILED;
  return {
    [BAMBOO_RECORD_FIELDS.status]: status,
    [FIELDS.status]: legacy,
  };
}

function bambooInitialFields(
  record: ReturnType<typeof parseBambooAlertRecord>,
): Record<string, string> {
  if (!record) return {};
  return {
    ...bambooStatusFields("init"),
    [BAMBOO_RECORD_FIELDS.alarmRecordDetailId]: "",
    [BAMBOO_RECORD_FIELDS.taskId]: record.taskId,
    [BAMBOO_RECORD_FIELDS.taskName]: record.taskName,
    [BAMBOO_RECORD_FIELDS.taskTime]: record.taskTime,
    [BAMBOO_RECORD_FIELDS.bambooUrl]: record.bambooUrl,
    [BAMBOO_RECORD_FIELDS.createdAt]: new Date().toISOString(),
    [BAMBOO_RECORD_FIELDS.taskSql]: "",
    [BAMBOO_RECORD_FIELDS.taskResultNum]: record.taskResultNum,
    [BAMBOO_RECORD_FIELDS.taskResultObject]: "",
    [BAMBOO_RECORD_FIELDS.extra]: record.extra,
    [BAMBOO_RECORD_FIELDS.aiSummary]: "",
    [BAMBOO_RECORD_FIELDS.aiResult]: "",
    [BAMBOO_RECORD_FIELDS.aiFinishedAt]: "",
    [BAMBOO_RECORD_FIELDS.lastError]: "",
  };
}

function messageRecordFields(input: {
  primaryField: string;
  projectId: string;
  pluginId: string;
  trigger: AlertTroubleshooterQueueTrigger;
  event: NormalizedLarkMessageEvent;
  chatName: string;
  uniqueId: string;
  resultId: string | null;
  bambooRecord: ReturnType<typeof parseBambooAlertRecord>;
}): Record<string, string> {
  return {
    [input.primaryField]: `${input.chatName || input.event.chatId} · ${input.event.messageId}`,
    [FIELDS.messageId]: input.event.messageId,
    [FIELDS.chatId]: input.event.chatId,
    [FIELDS.chatName]: input.chatName,
    [FIELDS.content]: input.event.text,
    [FIELDS.messageTime]: eventTime(input.event) ?? "",
    [FIELDS.trigger]: input.trigger,
    ...(input.bambooRecord ? bambooInitialFields(input.bambooRecord) : {}),
    ...(!input.bambooRecord ? { [FIELDS.status]: STATUS_UNCLAIMED } : {}),
    [FIELDS.claimId]: "",
    [FIELDS.claimedAt]: "",
    [FIELDS.completedAt]: "",
    [FIELDS.error]: "",
    [FIELDS.projectId]: input.projectId,
    [FIELDS.pluginId]: input.pluginId,
    [FIELDS.agentId]: "",
    [FIELDS.uniqueId]: input.uniqueId,
    [FIELDS.resultId]: input.resultId ?? "",
  };
}

export class LarkAlertTroubleshooterRecordStore implements AlertTroubleshooterRecordStore {
  private readonly locations = new Map<string, AlertTroubleshooterTableLocation>();

  constructor(
    private readonly channelStore: Pick<LarkChannelStore, "getBot">,
    private readonly oauthService: Pick<LarkUserOAuthService, "getValidUserAccessToken">,
  ) {}

  async upsertMessage(input: {
    config: AlertTroubleshooterConfig;
    projectId: string;
    pluginId: string;
    trigger: AlertTroubleshooterQueueTrigger;
    event: NormalizedLarkMessageEvent;
  }): Promise<AlertTroubleshooterRecord> {
    const tableDate = alertTableDateKey(
      input.event.createTime === null
        ? new Date()
        : new Date(
            input.event.createTime < 10_000_000_000
              ? input.event.createTime * 1000
              : input.event.createTime,
          ),
    );
    const { api, location, primaryField } = await this.context(
      input.config,
      input.pluginId,
      tableDate,
    );
    const chat = input.config.chats.find((candidate) => candidate.chatId === input.event.chatId);
    const bamboo = isBambooPlugin(input.pluginId);
    const bambooRecord = bamboo ? parseBambooAlertRecord(input.event) : null;
    if (bamboo && !bambooRecord) {
      throw new Error(`Bamboo 报警消息 ${input.event.messageId} 无法提取 result_id，已跳过入表`);
    }
    const resultId = bambooRecord?.resultId ?? null;
    const uniqueId = bambooRecord?.uniqueId ?? `message_id:${input.event.messageId}`;
    const existing = bamboo
      ? await this.findByUniqueId(api, location, uniqueId)
      : await this.findByMessageId(api, location, input.event.messageId);
    if (existing) return existing;
    const fields = messageRecordFields({
      primaryField,
      projectId: input.projectId,
      pluginId: input.pluginId,
      trigger: input.trigger,
      event: input.event,
      chatName: chat?.name ?? "",
      uniqueId,
      resultId,
      bambooRecord,
    });
    const result = await api.request(
      () =>
        api.client.bitable.v1.appTableRecord.create({
          path: { app_token: location.appToken, table_id: location.tableId },
          params: {
            client_token: createLarkRecordClientToken({
              pluginId: input.pluginId,
              projectId: input.projectId,
              uniqueId,
            }),
          },
          data: { fields },
        }),
      { identity: "bot", requiredScopes: ["base:record:create"] },
    );
    const record = result.data?.record as LarkRecord | undefined;
    const normalized = record ? toRecord(record, tableDate) : null;
    if (!normalized) throw new Error("飞书多维表格新增记录后未返回 record_id");
    return normalized;
  }

  async listUnclaimed(input: {
    config: AlertTroubleshooterConfig;
    projectId: string;
    pluginId: string;
    limit: number;
  }): Promise<AlertTroubleshooterRecord[]> {
    const records: AlertTroubleshooterRecord[] = [];
    for (const tableDate of recentDateKeys()) {
      const context = await this.existingContext(input.config, input.pluginId, tableDate);
      if (!context) continue;
      const { api, location } = context;
      const result = await api.request(
        () =>
          api.client.bitable.v1.appTableRecord.search({
            path: { app_token: location.appToken, table_id: location.tableId },
            params: { page_size: Math.min(Math.max(input.limit * 4, 20), 200) },
            data: {
              field_names: [...Object.values(FIELDS), ...Object.values(BAMBOO_RECORD_FIELDS)],
              sort: [{ field_name: FIELDS.messageTime, desc: false }],
            },
          }),
        { identity: "bot", requiredScopes: ["base:record:retrieve"] },
      );
      for (const record of (result.data?.items ?? []) as LarkRecord[]) {
        const recordProjectId = textValue(record.fields[FIELDS.projectId]);
        const recordPluginId = textValue(record.fields[FIELDS.pluginId]);
        const bamboo = isBambooPlugin(input.pluginId);
        if (
          !isClaimableStatus(recordStatus(record), bamboo) ||
          (!bamboo && recordProjectId !== input.projectId) ||
          (!bamboo && recordPluginId !== input.pluginId) ||
          (bamboo && recordProjectId !== null && recordProjectId !== input.projectId) ||
          (bamboo && recordPluginId !== null && recordPluginId !== input.pluginId)
        ) {
          continue;
        }
        const normalized = toRecord(record, tableDate);
        if (normalized) records.push(normalized);
        if (records.length >= input.limit) return records;
      }
    }
    return records;
  }

  async getLatestMessageTimeByChat(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    chatId: string;
  }): Promise<number | null> {
    let latest: number | null = null;
    for (const tableDate of recentDateKeys()) {
      const context = await this.existingContext(input.config, input.pluginId, tableDate);
      if (!context) continue;
      const { api, location } = context;
      const result = await api.request(
        () =>
          api.client.bitable.v1.appTableRecord.search({
            path: { app_token: location.appToken, table_id: location.tableId },
            params: { page_size: 200 },
            data: {
              field_names: [FIELDS.chatId, FIELDS.messageTime, BAMBOO_RECORD_FIELDS.extra],
              filter: {
                conjunction: "and",
                conditions: [{ field_name: FIELDS.chatId, operator: "is", value: [input.chatId] }],
              },
            },
          }),
        { identity: "bot", requiredScopes: ["base:record:retrieve"] },
      );
      for (const record of (result.data?.items ?? []) as LarkRecord[]) {
        const fromExtra = bambooMessageSentAtMs(record.fields[BAMBOO_RECORD_FIELDS.extra]);
        const fromLegacy = Date.parse(textValue(record.fields[FIELDS.messageTime]) ?? "");
        const timestamp = fromExtra ?? (Number.isFinite(fromLegacy) ? fromLegacy : null);
        if (timestamp !== null && (latest === null || timestamp > latest)) latest = timestamp;
      }
    }
    return latest;
  }

  async getRecord(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
  }): Promise<AlertTroubleshooterRecord | null> {
    const { api, location } = await this.context(input.config, input.pluginId, input.tableDate);
    const result = await api.request(
      () =>
        api.client.bitable.v1.appTableRecord.get({
          path: {
            app_token: location.appToken,
            table_id: location.tableId,
            record_id: input.recordId,
          },
          params: { text_field_as_array: false },
        }),
      { identity: "bot", requiredScopes: ["base:record:retrieve"] },
    );
    return result.data?.record ? toRecord(result.data.record as LarkRecord, input.tableDate) : null;
  }

  async getRecordByUniqueId(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    uniqueId: string;
  }): Promise<AlertTroubleshooterRecord | null> {
    const uniqueIds = isBambooPlugin(input.pluginId)
      ? [
          normalizeBambooUniqueId(input.uniqueId),
          `result_id:${normalizeBambooUniqueId(input.uniqueId)}`,
        ]
      : [input.uniqueId];
    for (const tableDate of recentDateKeys()) {
      const context = await this.existingContext(input.config, input.pluginId, tableDate);
      if (!context) continue;
      for (const uniqueId of uniqueIds) {
        const record = await this.findByUniqueId(context.api, context.location, uniqueId);
        if (record) return record;
      }
    }
    return null;
  }

  async upsertManualResult(input: {
    config: AlertTroubleshooterConfig;
    projectId: string;
    pluginId: string;
    resultId: string;
  }): Promise<AlertTroubleshooterRecord> {
    const resultId = input.resultId.trim();
    if (!resultId) throw new Error("请输入 Bamboo result_id");
    const uniqueId = resultId;
    const existing = await this.getRecordByUniqueId({
      config: input.config,
      pluginId: input.pluginId,
      uniqueId,
    });
    if (existing) return existing;

    const tableDate = alertTableDateKey(new Date());
    const { api, location, primaryField } = await this.context(
      input.config,
      input.pluginId,
      tableDate,
    );
    const fields: Record<string, string> = {
      [primaryField]: `Bamboo result_id ${resultId} · 手动调试`,
      [FIELDS.messageId]: "",
      [FIELDS.chatId]: "",
      [FIELDS.chatName]: "",
      [FIELDS.content]: `手动指定 Bamboo result_id 进行调试：${resultId}`,
      [FIELDS.messageTime]: new Date().toISOString(),
      [FIELDS.trigger]: "manual",
      ...bambooStatusFields("init"),
      [FIELDS.claimId]: "",
      [FIELDS.claimedAt]: "",
      [FIELDS.completedAt]: "",
      [FIELDS.error]: "",
      [FIELDS.projectId]: input.projectId,
      [FIELDS.pluginId]: input.pluginId,
      [FIELDS.agentId]: "",
      [FIELDS.uniqueId]: uniqueId,
      [FIELDS.resultId]: resultId,
      [BAMBOO_RECORD_FIELDS.taskName]: `Bamboo result_id ${resultId}`,
      [BAMBOO_RECORD_FIELDS.taskTime]: new Date().toISOString(),
      [BAMBOO_RECORD_FIELDS.createdAt]: new Date().toISOString(),
      [BAMBOO_RECORD_FIELDS.taskResultNum]: "0",
      [BAMBOO_RECORD_FIELDS.extra]: JSON.stringify({ manual: true }),
    };
    const result = await api.request(
      () =>
        api.client.bitable.v1.appTableRecord.create({
          path: { app_token: location.appToken, table_id: location.tableId },
          params: {
            client_token: createLarkRecordClientToken({
              pluginId: input.pluginId,
              projectId: input.projectId,
              uniqueId,
            }),
          },
          data: { fields },
        }),
      { identity: "bot", requiredScopes: ["base:record:create"] },
    );
    const record = result.data?.record as LarkRecord | undefined;
    const normalized = record ? toRecord(record, tableDate) : null;
    if (!normalized) throw new Error("创建 Bamboo result_id 调试记录后未返回 record_id");
    return normalized;
  }

  markRunning(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
    claimId: string;
  }): Promise<void> {
    return this.update(input.config, input.pluginId, input.tableDate, input.recordId, {
      ...(isBambooPlugin(input.pluginId)
        ? bambooStatusFields("processing")
        : { [FIELDS.status]: STATUS_RUNNING }),
      [FIELDS.claimId]: input.claimId,
      [FIELDS.claimedAt]: new Date().toISOString(),
      [FIELDS.error]: "",
    });
  }

  markSucceeded(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
    agentId: string;
  }): Promise<void> {
    return this.update(input.config, input.pluginId, input.tableDate, input.recordId, {
      ...(isBambooPlugin(input.pluginId)
        ? bambooStatusFields("succeeded")
        : { [FIELDS.status]: STATUS_SUCCEEDED }),
      [FIELDS.agentId]: input.agentId,
      [FIELDS.completedAt]: new Date().toISOString(),
      [FIELDS.error]: "",
    });
  }

  markOutcome(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
    agentId: string;
    status: "succeeded" | "pending" | "not_support";
    summary: string;
    documentUrl?: string;
  }): Promise<void> {
    return this.update(input.config, input.pluginId, input.tableDate, input.recordId, {
      ...bambooStatusFields(input.status),
      [FIELDS.agentId]: input.agentId,
      [FIELDS.completedAt]: new Date().toISOString(),
      [FIELDS.error]: "",
      [BAMBOO_RECORD_FIELDS.aiSummary]: input.summary,
      [BAMBOO_RECORD_FIELDS.aiResult]: input.documentUrl ?? "",
      [BAMBOO_RECORD_FIELDS.aiFinishedAt]: new Date().toISOString(),
      [BAMBOO_RECORD_FIELDS.lastError]: "",
    });
  }

  markPaused(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
  }): Promise<void> {
    return this.update(input.config, input.pluginId, input.tableDate, input.recordId, {
      [FIELDS.status]: STATUS_PAUSED,
      [FIELDS.completedAt]: new Date().toISOString(),
      [FIELDS.error]: "",
    });
  }

  markFailed(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
    error: string;
  }): Promise<void> {
    return this.update(input.config, input.pluginId, input.tableDate, input.recordId, {
      ...(isBambooPlugin(input.pluginId)
        ? bambooStatusFields("failed")
        : { [FIELDS.status]: STATUS_FAILED }),
      [FIELDS.completedAt]: new Date().toISOString(),
      [FIELDS.error]: input.error.slice(0, 10_000),
      ...(isBambooPlugin(input.pluginId)
        ? { [BAMBOO_RECORD_FIELDS.lastError]: input.error.slice(0, 10_000) }
        : {}),
    });
  }

  private async update(
    config: AlertTroubleshooterConfig,
    pluginId: string,
    tableDate: string,
    recordId: string,
    fields: Record<string, string>,
  ): Promise<void> {
    const { api, location } = await this.context(config, pluginId, tableDate);
    await api.request(
      () =>
        api.client.bitable.v1.appTableRecord.update({
          path: {
            app_token: location.appToken,
            table_id: location.tableId,
            record_id: recordId,
          },
          data: { fields },
        }),
      { identity: "bot", requiredScopes: ["base:record:update"] },
    );
  }

  private async findByMessageId(
    api: LarkAlertTroubleshooterApi,
    location: AlertTroubleshooterTableLocation,
    messageId: string,
  ): Promise<AlertTroubleshooterRecord | null> {
    const result = await api.request(
      () =>
        api.client.bitable.v1.appTableRecord.search({
          path: { app_token: location.appToken, table_id: location.tableId },
          params: { page_size: 1 },
          data: {
            field_names: Object.values(FIELDS),
            filter: {
              conjunction: "and",
              conditions: [{ field_name: FIELDS.messageId, operator: "is", value: [messageId] }],
            },
          },
        }),
      { identity: "bot", requiredScopes: ["base:record:retrieve"] },
    );
    const record = (result.data?.items?.[0] ?? null) as LarkRecord | null;
    return record ? toRecord(record, location.dateKey) : null;
  }

  private async findByUniqueId(
    api: LarkAlertTroubleshooterApi,
    location: AlertTroubleshooterTableLocation,
    uniqueId: string,
  ): Promise<AlertTroubleshooterRecord | null> {
    const result = await api.request(
      () =>
        api.client.bitable.v1.appTableRecord.search({
          path: { app_token: location.appToken, table_id: location.tableId },
          params: { page_size: 1 },
          data: {
            field_names: [...Object.values(FIELDS), ...Object.values(BAMBOO_RECORD_FIELDS)],
            filter: {
              conjunction: "and",
              conditions: [{ field_name: FIELDS.uniqueId, operator: "is", value: [uniqueId] }],
            },
          },
        }),
      { identity: "bot", requiredScopes: ["base:record:retrieve"] },
    );
    const record = (result.data?.items?.[0] ?? null) as LarkRecord | null;
    return record ? toRecord(record, location.dateKey) : null;
  }

  private async context(
    config: AlertTroubleshooterConfig,
    pluginId: string,
    tableDate: string,
  ): Promise<{
    api: LarkAlertTroubleshooterApi;
    location: AlertTroubleshooterTableLocation;
    primaryField: string;
  }> {
    const bot = this.channelStore.getBot(config.botId);
    if (!bot) throw new Error(`飞书机器人 ${config.botId} 不存在`);
    const api = await createLarkAlertTroubleshooterApi({
      config: bot.config,
      oauthService: this.oauthService,
    });
    const cacheKey = `${config.botId}:${config.attributionRecordRoot}:${pluginId}:${tableDate}`;
    const location =
      this.locations.get(cacheKey) ??
      (await resolveDailyAlertTable({
        api,
        rootUrl: config.attributionRecordRoot,
        pluginId,
        dateKey: tableDate,
      }));
    this.locations.set(cacheKey, location);
    const primaryField = await this.ensureFields(api, location, pluginId);
    return { api, location, primaryField };
  }

  private async existingContext(
    config: AlertTroubleshooterConfig,
    pluginId: string,
    tableDate: string,
  ): Promise<{
    api: LarkAlertTroubleshooterApi;
    location: AlertTroubleshooterTableLocation;
  } | null> {
    const bot = this.channelStore.getBot(config.botId);
    if (!bot) throw new Error(`飞书机器人 ${config.botId} 不存在`);
    const api = await createLarkAlertTroubleshooterApi({
      config: bot.config,
      oauthService: this.oauthService,
    });
    const cacheKey = `${config.botId}:${config.attributionRecordRoot}:${pluginId}:${tableDate}`;
    const cached = this.locations.get(cacheKey);
    if (cached) return { api, location: cached };
    const location = await resolveExistingDailyAlertTable({
      api,
      rootUrl: config.attributionRecordRoot,
      pluginId,
      dateKey: tableDate,
    });
    if (!location) return null;
    await this.ensureFields(api, location, pluginId);
    this.locations.set(cacheKey, location);
    return { api, location };
  }

  private async ensureFields(
    api: LarkAlertTroubleshooterApi,
    location: AlertTroubleshooterTableLocation,
    pluginId: string,
  ): Promise<string> {
    const result = await api.request(
      () =>
        api.client.bitable.v1.appTableField.list({
          path: { app_token: location.appToken, table_id: location.tableId },
          params: { page_size: 100 },
        }),
      { identity: "bot", requiredScopes: ["base:field:read"] },
    );
    const fields = result.data?.items ?? [];
    const primaryField = fields.find((field) => field.is_primary)?.field_name;
    if (!primaryField) throw new Error("多维表格缺少主字段");
    const existing = new Set(fields.map((field) => field.field_name));
    const requiredFields = [
      ...Object.values(FIELDS),
      ...(isBambooPlugin(pluginId) ? Object.values(BAMBOO_RECORD_FIELDS) : []),
    ];
    for (const fieldName of requiredFields) {
      if (existing.has(fieldName) || fieldName === primaryField) continue;
      await api.request(
        () =>
          api.client.bitable.v1.appTableField.create({
            path: { app_token: location.appToken, table_id: location.tableId },
            data: { field_name: fieldName, type: 1 },
          }),
        { identity: "bot", requiredScopes: ["base:field:create"] },
      );
    }
    return primaryField;
  }
}
