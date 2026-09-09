import type { AlertTroubleshooterConfig } from "@getpaseo/protocol/messages";
import type { NormalizedLarkMessageEvent } from "../channels/lark/lark-message-format.js";
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
} from "./bamboo-alert-record-contract.js";
import {
  bambooManualFields,
  bambooMessageFields,
  bambooStatusFields,
  parseBambooExtra,
  type BitableWritableFields,
} from "./bamboo-attribution-record.js";
import { BAMBOO_ATTRIBUTION_FIELD_NAMES } from "./bamboo-attribution-table.js";
import type { BambooBotCredentialResolver } from "./bamboo-bot-credential-resolver.js";
import { isMissingAlertTroubleshooterRecordError } from "./alert-troubleshooter-task-reference.js";

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
  alarmRecordDetailId?: string;
  taskId?: string;
  ruleId?: string;
  taskName?: string;
  taskTime?: string;
  bambooUrl?: string;
  extra?: Record<string, unknown>;
  tableDate: string;
  messageId: string | null;
  chatId: string | null;
  chatName: string | null;
  messageText: string;
  messageTime: string | null;
  trigger: AlertTroubleshooterQueueTrigger;
}

export interface AlertTroubleshooterRecordStore {
  resolveExecutionContext?(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    tableDate: string;
  }): Promise<{
    wikiTarget: { spaceId: string; parentNodeToken: string };
    closeContext: {
      baseToken: string;
      tableId: string;
      parentWikiToken: string;
      targetSpaceId: string;
    };
  }>;
  resolveWikiTarget?(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    tableDate: string;
  }): Promise<{ spaceId: string; parentNodeToken: string }>;
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
  relocateRecord?(input: {
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
  markRetryScheduled?(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
    error: string;
  }): Promise<void>;
  markPending?(input: {
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

function isStaleTableLocationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(?:1254004|1254041|WrongTableId|TableIdNotFound)\b/iu.test(message);
}

function dateTimeValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const text = textValue(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : text;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = textValue(value);
    if (text) return text;
  }
  return null;
}

function toRecord(record: LarkRecord, tableDate: string): AlertTroubleshooterRecord | null {
  const recordId = record.record_id?.trim();
  if (!recordId) return null;
  const extra = parseBambooExtra(record.fields[BAMBOO_RECORD_FIELDS.extra]);
  const messageId = firstText(record.fields[FIELDS.messageId], extra.message_id);
  const uniqueId = firstText(record.fields[BAMBOO_RECORD_FIELDS.uniqueId]);
  return {
    recordId,
    uniqueId: uniqueId ?? (messageId ? `message_id:${messageId}` : `record_id:${recordId}`),
    resultId: textValue(record.fields[BAMBOO_RECORD_FIELDS.resultId]),
    alarmRecordDetailId:
      textValue(record.fields[BAMBOO_RECORD_FIELDS.alarmRecordDetailId]) ?? undefined,
    taskId: textValue(record.fields[BAMBOO_RECORD_FIELDS.taskId]) ?? undefined,
    ruleId: textValue(extra.rule_id) ?? textValue(extra.rules_id) ?? undefined,
    taskName: textValue(record.fields[BAMBOO_RECORD_FIELDS.taskName]) ?? undefined,
    taskTime: dateTimeValue(record.fields[BAMBOO_RECORD_FIELDS.taskTime]) ?? undefined,
    bambooUrl: textValue(record.fields[BAMBOO_RECORD_FIELDS.bambooUrl]) ?? undefined,
    extra,
    tableDate,
    messageId,
    chatId: firstText(record.fields[FIELDS.chatId], extra.chat_id, extra.group_id),
    chatName: firstText(record.fields[FIELDS.chatName], extra.chat_name),
    messageText:
      firstText(record.fields[FIELDS.content], record.fields[BAMBOO_RECORD_FIELDS.taskName]) ?? "",
    messageTime: firstText(
      record.fields[FIELDS.messageTime],
      extra.message_sent_at,
      dateTimeValue(record.fields[BAMBOO_RECORD_FIELDS.taskTime]),
    ),
    trigger: normalizeTrigger(record.fields[FIELDS.trigger] ?? extra.trigger),
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

function isUnclaimedRecordForProject(input: {
  record: LarkRecord;
  projectId: string;
  pluginId: string;
  bamboo: boolean;
}): boolean {
  if (!isClaimableStatus(recordStatus(input.record), input.bamboo)) return false;
  const extra = parseBambooExtra(input.record.fields[BAMBOO_RECORD_FIELDS.extra]);
  const recordProjectId =
    textValue(input.record.fields[FIELDS.projectId]) ?? textValue(extra.project_id);
  const recordPluginId =
    textValue(input.record.fields[FIELDS.pluginId]) ?? textValue(extra.plugin_id);
  if (!input.bamboo) {
    return recordProjectId === input.projectId && recordPluginId === input.pluginId;
  }
  return (
    (recordProjectId === null || recordProjectId === input.projectId) &&
    (recordPluginId === null || recordPluginId === input.pluginId)
  );
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
}): BitableWritableFields {
  if (input.bambooRecord) {
    return bambooMessageFields(input.bambooRecord, {
      projectId: input.projectId,
      pluginId: input.pluginId,
      trigger: input.trigger,
      chatName: input.chatName,
    });
  }
  return {
    [input.primaryField]: `${input.chatName || input.event.chatId} · ${input.event.messageId}`,
    [FIELDS.messageId]: input.event.messageId,
    [FIELDS.chatId]: input.event.chatId,
    [FIELDS.chatName]: input.chatName,
    [FIELDS.content]: input.event.text,
    [FIELDS.messageTime]: eventTime(input.event) ?? "",
    [FIELDS.trigger]: input.trigger,
    [FIELDS.status]: STATUS_UNCLAIMED,
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
  private readonly credentialResolver: Pick<BambooBotCredentialResolver, "resolve">;

  constructor(
    resolverOrChannelStore:
      | Pick<BambooBotCredentialResolver, "resolve">
      | {
          getBot(botId: string): {
            config: import("../channels/lark/lark-channel-store.js").StoredLarkChannelConfig;
          } | null;
        },
    _legacyOauthService?: unknown,
  ) {
    this.credentialResolver =
      "resolve" in resolverOrChannelStore
        ? resolverOrChannelStore
        : {
            resolve: (config) => {
              const bot = resolverOrChannelStore.getBot(config.botId);
              if (!bot) throw new Error(`飞书机器人 ${config.botId} 不存在`);
              return { identity: `existing:${config.botId}`, config: bot.config };
            },
          };
  }

  async resolveExecutionContext(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    tableDate: string;
  }): Promise<{
    wikiTarget: { spaceId: string; parentNodeToken: string };
    closeContext: {
      baseToken: string;
      tableId: string;
      parentWikiToken: string;
      targetSpaceId: string;
    };
  }> {
    const { location } = await this.context(input.config, input.pluginId, input.tableDate);
    return {
      wikiTarget: {
        spaceId: location.spaceId,
        parentNodeToken: location.nodeToken,
      },
      closeContext: {
        baseToken: location.appToken,
        tableId: location.tableId,
        parentWikiToken: location.nodeToken,
        targetSpaceId: location.spaceId,
      },
    };
  }

  async resolveWikiTarget(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    tableDate: string;
  }): Promise<{ spaceId: string; parentNodeToken: string }> {
    const { location } = await this.context(input.config, input.pluginId, input.tableDate);
    return {
      spaceId: location.spaceId,
      parentNodeToken: location.nodeToken,
    };
  }

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
      ? await this.findByUniqueId(api, location, uniqueId, true)
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
              projectId: bamboo ? `table:${location.tableId}` : input.projectId,
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
    const bamboo = isBambooPlugin(input.pluginId);
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
              field_names: bamboo ? [...BAMBOO_ATTRIBUTION_FIELD_NAMES] : Object.values(FIELDS),
              sort: [
                {
                  field_name: bamboo ? BAMBOO_RECORD_FIELDS.taskTime : FIELDS.messageTime,
                  desc: false,
                },
              ],
            },
          }),
        { identity: "bot", requiredScopes: ["base:record:read"] },
      );
      for (const record of (result.data?.items ?? []) as LarkRecord[]) {
        if (
          !isUnclaimedRecordForProject({
            record,
            projectId: input.projectId,
            pluginId: input.pluginId,
            bamboo,
          })
        )
          continue;
        const normalized = toRecord(record, tableDate);
        if (!normalized || (bamboo && !normalized.resultId)) continue;
        records.push(normalized);
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
      const bamboo = isBambooPlugin(input.pluginId);
      const result = await api.request(
        () =>
          api.client.bitable.v1.appTableRecord.search({
            path: { app_token: location.appToken, table_id: location.tableId },
            params: { page_size: 200 },
            data: bamboo
              ? { field_names: [BAMBOO_RECORD_FIELDS.extra] }
              : {
                  field_names: [FIELDS.chatId, FIELDS.messageTime],
                  filter: {
                    conjunction: "and",
                    conditions: [
                      {
                        field_name: FIELDS.chatId,
                        operator: "is",
                        value: [input.chatId],
                      },
                    ],
                  },
                },
          }),
        { identity: "bot", requiredScopes: ["base:record:read"] },
      );
      for (const record of (result.data?.items ?? []) as LarkRecord[]) {
        const extra = parseBambooExtra(record.fields[BAMBOO_RECORD_FIELDS.extra]);
        if (
          bamboo &&
          textValue(extra.chat_id) !== input.chatId &&
          textValue(extra.group_id) !== input.chatId
        ) {
          continue;
        }
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
      { identity: "bot", requiredScopes: ["base:record:read"] },
    );
    return result.data?.record ? toRecord(result.data.record as LarkRecord, input.tableDate) : null;
  }

  async getRecordByUniqueId(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    uniqueId: string;
  }): Promise<AlertTroubleshooterRecord | null> {
    const recordReference = /^record_id:(?:(\d{8}):)?(.+)$/u.exec(input.uniqueId.trim());
    const recordId = recordReference?.[2]?.trim();
    if (recordId) {
      const tableDates = recordReference?.[1] ? [recordReference[1]] : recentDateKeys();
      for (const tableDate of tableDates) {
        const context = await this.existingContext(input.config, input.pluginId, tableDate);
        if (!context) continue;
        let result;
        try {
          result = await context.api.request(
            () =>
              context.api.client.bitable.v1.appTableRecord.get({
                path: {
                  app_token: context.location.appToken,
                  table_id: context.location.tableId,
                  record_id: recordId,
                },
                params: { text_field_as_array: false },
              }),
            { identity: "bot", requiredScopes: ["base:record:read"] },
          );
        } catch (error) {
          if (isMissingAlertTroubleshooterRecordError(error)) continue;
          throw error;
        }
        const record = result.data?.record
          ? toRecord(result.data.record as LarkRecord, tableDate)
          : null;
        if (record) return record;
      }
      return null;
    }
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
        const record = await this.findByUniqueId(
          context.api,
          context.location,
          uniqueId,
          isBambooPlugin(input.pluginId),
        );
        if (record) return record;
      }
    }
    return null;
  }

  async relocateRecord(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    uniqueId: string;
  }): Promise<AlertTroubleshooterRecord | null> {
    const bot = this.credentialResolver.resolve(input.config);
    const cachePrefix = `${bot.identity}:${input.config.attributionRecordRoot}:${input.pluginId}:`;
    for (const cacheKey of this.locations.keys()) {
      if (cacheKey.startsWith(cachePrefix)) this.locations.delete(cacheKey);
    }
    return this.getRecordByUniqueId(input);
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
    const { api, location } = await this.context(input.config, input.pluginId, tableDate);
    const fields = bambooManualFields({
      resultId,
      projectId: input.projectId,
      pluginId: input.pluginId,
    });
    const result = await api.request(
      () =>
        api.client.bitable.v1.appTableRecord.create({
          path: { app_token: location.appToken, table_id: location.tableId },
          params: {
            client_token: createLarkRecordClientToken({
              pluginId: input.pluginId,
              projectId: `table:${location.tableId}`,
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
    const bamboo = isBambooPlugin(input.pluginId);
    return this.update(
      input.config,
      input.pluginId,
      input.tableDate,
      input.recordId,
      bamboo
        ? {
            ...bambooStatusFields("processing"),
            [BAMBOO_RECORD_FIELDS.aiSessionId]: input.claimId,
            [BAMBOO_RECORD_FIELDS.lastError]: "",
          }
        : {
            [FIELDS.status]: STATUS_RUNNING,
            [FIELDS.claimId]: input.claimId,
            [FIELDS.claimedAt]: new Date().toISOString(),
            [FIELDS.error]: "",
          },
    );
  }

  markSucceeded(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
    agentId: string;
  }): Promise<void> {
    const bamboo = isBambooPlugin(input.pluginId);
    return this.update(
      input.config,
      input.pluginId,
      input.tableDate,
      input.recordId,
      bamboo
        ? {
            ...bambooStatusFields("succeeded"),
            [BAMBOO_RECORD_FIELDS.aiSessionId]: input.agentId,
            [BAMBOO_RECORD_FIELDS.aiFinishedAt]: Date.now(),
            [BAMBOO_RECORD_FIELDS.lastError]: "",
          }
        : {
            [FIELDS.status]: STATUS_SUCCEEDED,
            [FIELDS.agentId]: input.agentId,
            [FIELDS.completedAt]: new Date().toISOString(),
            [FIELDS.error]: "",
          },
    );
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
      [BAMBOO_RECORD_FIELDS.aiSessionId]: input.agentId,
      [BAMBOO_RECORD_FIELDS.aiSummary]: input.summary,
      [BAMBOO_RECORD_FIELDS.aiResult]: input.documentUrl ?? "",
      [BAMBOO_RECORD_FIELDS.aiFinishedAt]: Date.now(),
      [BAMBOO_RECORD_FIELDS.lastError]: "",
    });
  }

  markPaused(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
  }): Promise<void> {
    return this.update(
      input.config,
      input.pluginId,
      input.tableDate,
      input.recordId,
      isBambooPlugin(input.pluginId)
        ? {
            ...bambooStatusFields("pending"),
            [BAMBOO_RECORD_FIELDS.lastError]: "任务已暂停",
          }
        : {
            [FIELDS.status]: STATUS_PAUSED,
            [FIELDS.completedAt]: new Date().toISOString(),
            [FIELDS.error]: "",
          },
    );
  }

  markFailed(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
    error: string;
  }): Promise<void> {
    const bamboo = isBambooPlugin(input.pluginId);
    return this.update(
      input.config,
      input.pluginId,
      input.tableDate,
      input.recordId,
      bamboo
        ? {
            ...bambooStatusFields("failed"),
            [BAMBOO_RECORD_FIELDS.aiFinishedAt]: Date.now(),
            [BAMBOO_RECORD_FIELDS.lastError]: input.error.slice(0, 10_000),
          }
        : {
            [FIELDS.status]: STATUS_FAILED,
            [FIELDS.completedAt]: new Date().toISOString(),
            [FIELDS.error]: input.error.slice(0, 10_000),
          },
    );
  }

  markRetryScheduled(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
    error: string;
  }): Promise<void> {
    const bamboo = isBambooPlugin(input.pluginId);
    return this.update(
      input.config,
      input.pluginId,
      input.tableDate,
      input.recordId,
      bamboo
        ? {
            ...bambooStatusFields("init"),
            [BAMBOO_RECORD_FIELDS.aiSessionId]: "",
            [BAMBOO_RECORD_FIELDS.lastError]: input.error.slice(0, 10_000),
          }
        : {
            [FIELDS.status]: STATUS_UNCLAIMED,
            [FIELDS.claimId]: "",
            [FIELDS.claimedAt]: "",
            [FIELDS.completedAt]: "",
            [FIELDS.error]: input.error.slice(0, 10_000),
          },
    );
  }

  markPending(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
    error: string;
  }): Promise<void> {
    const bamboo = isBambooPlugin(input.pluginId);
    return this.update(
      input.config,
      input.pluginId,
      input.tableDate,
      input.recordId,
      bamboo
        ? {
            ...bambooStatusFields("pending"),
            [BAMBOO_RECORD_FIELDS.aiFinishedAt]: Date.now(),
            [BAMBOO_RECORD_FIELDS.lastError]: input.error.slice(0, 10_000),
          }
        : {
            [FIELDS.status]: "待处理",
            [FIELDS.completedAt]: new Date().toISOString(),
            [FIELDS.error]: input.error.slice(0, 10_000),
          },
    );
  }

  private async update(
    config: AlertTroubleshooterConfig,
    pluginId: string,
    tableDate: string,
    recordId: string,
    fields: BitableWritableFields,
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
              conditions: [
                {
                  field_name: FIELDS.messageId,
                  operator: "is",
                  value: [messageId],
                },
              ],
            },
          },
        }),
      { identity: "bot", requiredScopes: ["base:record:read"] },
    );
    const record = (result.data?.items?.[0] ?? null) as LarkRecord | null;
    return record ? toRecord(record, location.dateKey) : null;
  }

  private async findByUniqueId(
    api: LarkAlertTroubleshooterApi,
    location: AlertTroubleshooterTableLocation,
    uniqueId: string,
    bamboo: boolean,
  ): Promise<AlertTroubleshooterRecord | null> {
    const result = await api.request(
      () =>
        api.client.bitable.v1.appTableRecord.search({
          path: { app_token: location.appToken, table_id: location.tableId },
          params: { page_size: 1 },
          data: {
            field_names: bamboo ? [...BAMBOO_ATTRIBUTION_FIELD_NAMES] : Object.values(FIELDS),
            filter: {
              conjunction: "and",
              conditions: [
                {
                  field_name: FIELDS.uniqueId,
                  operator: "is",
                  value: [uniqueId],
                },
              ],
            },
          },
        }),
      { identity: "bot", requiredScopes: ["base:record:read"] },
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
    const bot = this.credentialResolver.resolve(config);
    const api = await createLarkAlertTroubleshooterApi({
      config: bot.config,
    });
    const cacheKey = `${bot.identity}:${config.attributionRecordRoot}:${pluginId}:${tableDate}`;
    let location = this.locations.get(cacheKey);
    if (location) {
      try {
        const primaryField = await this.ensureFields(api, location, pluginId);
        return { api, location, primaryField };
      } catch (error) {
        if (!isStaleTableLocationError(error)) throw error;
        this.locations.delete(cacheKey);
      }
    }
    location = await resolveDailyAlertTable({
      api,
      rootUrl: config.attributionRecordRoot,
      pluginId,
      dateKey: tableDate,
    });
    this.locations.set(cacheKey, location);
    try {
      const primaryField = await this.ensureFields(api, location, pluginId);
      return { api, location, primaryField };
    } catch (error) {
      if (!isStaleTableLocationError(error)) throw error;
      this.locations.delete(cacheKey);
      location = await resolveDailyAlertTable({
        api,
        rootUrl: config.attributionRecordRoot,
        pluginId,
        dateKey: tableDate,
      });
      this.locations.set(cacheKey, location);
      const primaryField = await this.ensureFields(api, location, pluginId);
      return { api, location, primaryField };
    }
  }

  private async existingContext(
    config: AlertTroubleshooterConfig,
    pluginId: string,
    tableDate: string,
  ): Promise<{
    api: LarkAlertTroubleshooterApi;
    location: AlertTroubleshooterTableLocation;
  } | null> {
    const bot = this.credentialResolver.resolve(config);
    const api = await createLarkAlertTroubleshooterApi({
      config: bot.config,
    });
    const cacheKey = `${bot.identity}:${config.attributionRecordRoot}:${pluginId}:${tableDate}`;
    const cached = this.locations.get(cacheKey);
    if (cached) {
      try {
        await this.ensureFields(api, cached, pluginId);
        return { api, location: cached };
      } catch (error) {
        if (!isStaleTableLocationError(error)) throw error;
        this.locations.delete(cacheKey);
      }
    }
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
    if (isBambooPlugin(pluginId)) {
      const fieldNames = fields.map((field) => field.field_name);
      const existing = new Set(fieldNames);
      if (
        primaryField !== BAMBOO_RECORD_FIELDS.uniqueId ||
        fieldNames.length !== BAMBOO_ATTRIBUTION_FIELD_NAMES.length ||
        BAMBOO_ATTRIBUTION_FIELD_NAMES.some((fieldName) => !existing.has(fieldName))
      ) {
        throw new Error("Bamboo 归因记录表结构不符合最小字段规范");
      }
      return primaryField;
    }
    const existing = new Set(fields.map((field) => field.field_name));
    const requiredFields = Object.values(FIELDS);
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
