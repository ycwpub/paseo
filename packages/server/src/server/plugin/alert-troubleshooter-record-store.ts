import * as lark from "@larksuiteoapi/node-sdk";
import type { AlertTroubleshooterConfig } from "@getpaseo/protocol/messages";
import type {
  LarkChannelStore,
  StoredLarkChannelConfig,
} from "../channels/lark/lark-channel-store.js";
import type { NormalizedLarkMessageEvent } from "../channels/lark/lark-message-format.js";
import type { AlertTroubleshooterQueueTrigger } from "./alert-troubleshooter-queue-store.js";
import {
  alertTableDateKey,
  resolveDailyAlertTable,
  type AlertTroubleshooterTableLocation,
} from "./alert-troubleshooter-daily-table.js";

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

function createClient(config: StoredLarkChannelConfig): lark.Client {
  if (!config.appId || !config.appSecret) {
    throw new Error("飞书机器人缺少 App ID 或 App Secret");
  }
  return new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    appType: lark.AppType.SelfBuild,
    domain: config.domain === "lark" ? lark.Domain.Lark : lark.Domain.Feishu,
  });
}

function assertSuccess(result: { code?: number; msg?: string }): void {
  if (typeof result.code === "number" && result.code !== 0) {
    throw new Error(
      result.msg
        ? `飞书多维表格接口失败：${result.msg}（${result.code}）`
        : `飞书多维表格接口返回错误码 ${result.code}`,
    );
  }
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

function toRecord(record: LarkRecord, tableDate: string): AlertTroubleshooterRecord | null {
  const recordId = record.record_id?.trim();
  if (!recordId) return null;
  const messageId = textValue(record.fields[FIELDS.messageId]);
  const uniqueId =
    textValue(record.fields[FIELDS.uniqueId]) ??
    (messageId ? `message_id:${messageId}` : `record_id:${recordId}`);
  return {
    recordId,
    uniqueId,
    resultId: textValue(record.fields[FIELDS.resultId]),
    tableDate,
    messageId,
    chatId: textValue(record.fields[FIELDS.chatId]),
    chatName: textValue(record.fields[FIELDS.chatName]),
    messageText: textValue(record.fields[FIELDS.content]) ?? "",
    messageTime: textValue(record.fields[FIELDS.messageTime]),
    trigger: normalizeTrigger(record.fields[FIELDS.trigger]),
  };
}

function extractResultId(text: string): string | null {
  return /\bresult[_\s-]*id\s*[:=：]\s*([a-zA-Z0-9_-]+)/iu.exec(text)?.[1]?.trim() ?? null;
}

function uniqueIdForEvent(event: NormalizedLarkMessageEvent, resultId: string | null): string {
  return resultId ? `result_id:${resultId}` : `message_id:${event.messageId}`;
}

export class LarkAlertTroubleshooterRecordStore implements AlertTroubleshooterRecordStore {
  private readonly locations = new Map<string, AlertTroubleshooterTableLocation>();

  constructor(private readonly channelStore: Pick<LarkChannelStore, "getBot">) {}

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
    const { client, location, primaryField } = await this.context(
      input.config,
      input.pluginId,
      tableDate,
    );
    const existing = await this.findByMessageId(client, location, input.event.messageId);
    if (existing) return existing;
    const chat = input.config.chats.find((candidate) => candidate.chatId === input.event.chatId);
    const resultId = extractResultId(input.event.text);
    const uniqueId = uniqueIdForEvent(input.event, resultId);
    const fields: Record<string, string> = {
      [primaryField]: `${chat?.name ?? input.event.chatId} · ${input.event.messageId}`,
      [FIELDS.messageId]: input.event.messageId,
      [FIELDS.chatId]: input.event.chatId,
      [FIELDS.chatName]: chat?.name ?? "",
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
      [FIELDS.uniqueId]: uniqueId,
      [FIELDS.resultId]: resultId ?? "",
    };
    const result = await client.bitable.v1.appTableRecord.create({
      path: { app_token: location.appToken, table_id: location.tableId },
      params: { client_token: `${input.pluginId}:${input.projectId}:${input.event.messageId}` },
      data: { fields },
    });
    assertSuccess(result);
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
    const tableDate = alertTableDateKey(new Date());
    const { client, location } = await this.context(input.config, input.pluginId, tableDate);
    const result = await client.bitable.v1.appTableRecord.search({
      path: { app_token: location.appToken, table_id: location.tableId },
      params: { page_size: Math.min(Math.max(input.limit * 4, 20), 200) },
      data: {
        field_names: Object.values(FIELDS),
        sort: [{ field_name: FIELDS.messageTime, desc: false }],
      },
    });
    assertSuccess(result);
    return ((result.data?.items ?? []) as LarkRecord[])
      .filter((record) => {
        const status = textValue(record.fields[FIELDS.status]);
        return (
          (!status || status === STATUS_UNCLAIMED) &&
          textValue(record.fields[FIELDS.projectId]) === input.projectId &&
          textValue(record.fields[FIELDS.pluginId]) === input.pluginId
        );
      })
      .flatMap((record) => {
        const normalized = toRecord(record, tableDate);
        return normalized ? [normalized] : [];
      })
      .slice(0, input.limit);
  }

  async getRecord(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    recordId: string;
    tableDate: string;
  }): Promise<AlertTroubleshooterRecord | null> {
    const { client, location } = await this.context(input.config, input.pluginId, input.tableDate);
    const result = await client.bitable.v1.appTableRecord.get({
      path: {
        app_token: location.appToken,
        table_id: location.tableId,
        record_id: input.recordId,
      },
      params: { text_field_as_array: false },
    });
    assertSuccess(result);
    return result.data?.record ? toRecord(result.data.record as LarkRecord, input.tableDate) : null;
  }

  async getRecordByUniqueId(input: {
    config: AlertTroubleshooterConfig;
    pluginId: string;
    uniqueId: string;
  }): Promise<AlertTroubleshooterRecord | null> {
    const now = new Date();
    const dateKeys = [
      alertTableDateKey(now),
      alertTableDateKey(new Date(now.getTime() - 24 * 60 * 60_000)),
    ];
    for (const tableDate of dateKeys) {
      const { client, location } = await this.context(input.config, input.pluginId, tableDate);
      const result = await client.bitable.v1.appTableRecord.search({
        path: { app_token: location.appToken, table_id: location.tableId },
        params: { page_size: 1 },
        data: {
          field_names: Object.values(FIELDS),
          filter: {
            conjunction: "and",
            conditions: [{ field_name: FIELDS.uniqueId, operator: "is", value: [input.uniqueId] }],
          },
        },
      });
      assertSuccess(result);
      const record = (result.data?.items?.[0] ?? null) as LarkRecord | null;
      if (record) return toRecord(record, tableDate);
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
    const uniqueId = `result_id:${resultId}`;
    const existing = await this.getRecordByUniqueId({
      config: input.config,
      pluginId: input.pluginId,
      uniqueId,
    });
    if (existing) return existing;

    const tableDate = alertTableDateKey(new Date());
    const { client, location, primaryField } = await this.context(
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
      [FIELDS.status]: STATUS_UNCLAIMED,
      [FIELDS.claimId]: "",
      [FIELDS.claimedAt]: "",
      [FIELDS.completedAt]: "",
      [FIELDS.error]: "",
      [FIELDS.projectId]: input.projectId,
      [FIELDS.pluginId]: input.pluginId,
      [FIELDS.agentId]: "",
      [FIELDS.uniqueId]: uniqueId,
      [FIELDS.resultId]: resultId,
    };
    const result = await client.bitable.v1.appTableRecord.create({
      path: { app_token: location.appToken, table_id: location.tableId },
      params: { client_token: `${input.pluginId}:${input.projectId}:${uniqueId}` },
      data: { fields },
    });
    assertSuccess(result);
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
      [FIELDS.status]: STATUS_RUNNING,
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
      [FIELDS.status]: STATUS_SUCCEEDED,
      [FIELDS.agentId]: input.agentId,
      [FIELDS.completedAt]: new Date().toISOString(),
      [FIELDS.error]: "",
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
      [FIELDS.status]: STATUS_FAILED,
      [FIELDS.completedAt]: new Date().toISOString(),
      [FIELDS.error]: input.error.slice(0, 10_000),
    });
  }

  private async update(
    config: AlertTroubleshooterConfig,
    pluginId: string,
    tableDate: string,
    recordId: string,
    fields: Record<string, string>,
  ): Promise<void> {
    const { client, location } = await this.context(config, pluginId, tableDate);
    const result = await client.bitable.v1.appTableRecord.update({
      path: {
        app_token: location.appToken,
        table_id: location.tableId,
        record_id: recordId,
      },
      data: { fields },
    });
    assertSuccess(result);
  }

  private async findByMessageId(
    client: lark.Client,
    location: AlertTroubleshooterTableLocation,
    messageId: string,
  ): Promise<AlertTroubleshooterRecord | null> {
    const result = await client.bitable.v1.appTableRecord.search({
      path: { app_token: location.appToken, table_id: location.tableId },
      params: { page_size: 1 },
      data: {
        field_names: Object.values(FIELDS),
        filter: {
          conjunction: "and",
          conditions: [{ field_name: FIELDS.messageId, operator: "is", value: [messageId] }],
        },
      },
    });
    assertSuccess(result);
    const record = (result.data?.items?.[0] ?? null) as LarkRecord | null;
    return record ? toRecord(record, location.dateKey) : null;
  }

  private async context(
    config: AlertTroubleshooterConfig,
    pluginId: string,
    tableDate: string,
  ): Promise<{
    client: lark.Client;
    location: AlertTroubleshooterTableLocation;
    primaryField: string;
  }> {
    const bot = this.channelStore.getBot(config.botId);
    if (!bot) throw new Error(`飞书机器人 ${config.botId} 不存在`);
    const client = createClient(bot.config);
    const cacheKey = `${config.botId}:${config.attributionRecordRoot}:${pluginId}:${tableDate}`;
    const location =
      this.locations.get(cacheKey) ??
      (await resolveDailyAlertTable({
        client,
        rootUrl: config.attributionRecordRoot,
        pluginId,
        dateKey: tableDate,
      }));
    this.locations.set(cacheKey, location);
    const primaryField = await this.ensureFields(client, location);
    return { client, location, primaryField };
  }

  private async ensureFields(
    client: lark.Client,
    location: AlertTroubleshooterTableLocation,
  ): Promise<string> {
    const result = await client.bitable.v1.appTableField.list({
      path: { app_token: location.appToken, table_id: location.tableId },
      params: { page_size: 100 },
    });
    assertSuccess(result);
    const fields = result.data?.items ?? [];
    const primaryField = fields.find((field) => field.is_primary)?.field_name;
    if (!primaryField) throw new Error("多维表格缺少主字段");
    const existing = new Set(fields.map((field) => field.field_name));
    for (const fieldName of Object.values(FIELDS)) {
      if (existing.has(fieldName) || fieldName === primaryField) continue;
      const created = await client.bitable.v1.appTableField.create({
        path: { app_token: location.appToken, table_id: location.tableId },
        data: { field_name: fieldName, type: 1 },
      });
      assertSuccess(created);
    }
    return primaryField;
  }
}
