import * as lark from "@larksuiteoapi/node-sdk";
import type { AlertTroubleshooterConfig } from "@getpaseo/protocol/messages";
import type {
  LarkChannelStore,
  StoredLarkChannelConfig,
} from "../channels/lark/lark-channel-store.js";
import type { NormalizedLarkMessageEvent } from "../channels/lark/lark-message-format.js";
import type { AlertTroubleshooterQueueTrigger } from "./alert-troubleshooter-queue-store.js";

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
} as const;

const STATUS_UNCLAIMED = "未认领";
const STATUS_RUNNING = "处理中";
const STATUS_SUCCEEDED = "已完成";
const STATUS_FAILED = "失败";

type RecordFields = Record<string, unknown>;

export interface AlertTroubleshooterRecord {
  recordId: string;
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
    recordId: string;
  }): Promise<AlertTroubleshooterRecord | null>;
  markRunning(input: {
    config: AlertTroubleshooterConfig;
    recordId: string;
    claimId: string;
  }): Promise<void>;
  markSucceeded(input: {
    config: AlertTroubleshooterConfig;
    recordId: string;
    agentId: string;
  }): Promise<void>;
  markFailed(input: {
    config: AlertTroubleshooterConfig;
    recordId: string;
    error: string;
  }): Promise<void>;
}

interface TableLocation {
  appToken: string;
  tableId: string;
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

function toRecord(record: LarkRecord): AlertTroubleshooterRecord | null {
  const recordId = record.record_id?.trim();
  if (!recordId) return null;
  return {
    recordId,
    messageId: textValue(record.fields[FIELDS.messageId]),
    chatId: textValue(record.fields[FIELDS.chatId]),
    chatName: textValue(record.fields[FIELDS.chatName]),
    messageText: textValue(record.fields[FIELDS.content]) ?? "",
    messageTime: textValue(record.fields[FIELDS.messageTime]),
    trigger: normalizeTrigger(record.fields[FIELDS.trigger]),
  };
}

function parseTableUrl(value: string): { token: string; tableId: string | null; wiki: boolean } {
  const url = new URL(value);
  const segments = url.pathname.split("/").filter(Boolean);
  const baseIndex = segments.findIndex((segment) => segment === "base" || segment === "bitable");
  const wikiIndex = segments.findIndex((segment) => segment === "wiki");
  const token =
    (baseIndex >= 0 ? segments[baseIndex + 1] : undefined) ??
    (wikiIndex >= 0 ? segments[wikiIndex + 1] : undefined);
  if (!token) {
    throw new Error("多维表格链接无效，请使用飞书 Base 或 Wiki 多维表格链接");
  }
  return {
    token,
    tableId: url.searchParams.get("table") ?? url.searchParams.get("table_id"),
    wiki: wikiIndex >= 0,
  };
}

export class LarkAlertTroubleshooterRecordStore implements AlertTroubleshooterRecordStore {
  constructor(private readonly channelStore: Pick<LarkChannelStore, "getBot">) {}

  async upsertMessage(input: {
    config: AlertTroubleshooterConfig;
    projectId: string;
    pluginId: string;
    trigger: AlertTroubleshooterQueueTrigger;
    event: NormalizedLarkMessageEvent;
  }): Promise<AlertTroubleshooterRecord> {
    const { client, location, primaryField } = await this.context(input.config);
    const existing = await this.findByMessageId(client, location, input.event.messageId);
    if (existing) return existing;
    const chat = input.config.chats.find((candidate) => candidate.chatId === input.event.chatId);
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
    };
    const result = await client.bitable.v1.appTableRecord.create({
      path: { app_token: location.appToken, table_id: location.tableId },
      params: { client_token: `${input.pluginId}:${input.projectId}:${input.event.messageId}` },
      data: { fields },
    });
    assertSuccess(result);
    const record = result.data?.record as LarkRecord | undefined;
    const normalized = record ? toRecord(record) : null;
    if (!normalized) throw new Error("飞书多维表格新增记录后未返回 record_id");
    return normalized;
  }

  async listUnclaimed(input: {
    config: AlertTroubleshooterConfig;
    projectId: string;
    pluginId: string;
    limit: number;
  }): Promise<AlertTroubleshooterRecord[]> {
    const { client, location } = await this.context(input.config);
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
        const normalized = toRecord(record);
        return normalized ? [normalized] : [];
      })
      .slice(0, input.limit);
  }

  async getRecord(input: {
    config: AlertTroubleshooterConfig;
    recordId: string;
  }): Promise<AlertTroubleshooterRecord | null> {
    const { client, location } = await this.context(input.config);
    const result = await client.bitable.v1.appTableRecord.get({
      path: {
        app_token: location.appToken,
        table_id: location.tableId,
        record_id: input.recordId,
      },
      params: { text_field_as_array: false },
    });
    assertSuccess(result);
    return result.data?.record ? toRecord(result.data.record as LarkRecord) : null;
  }

  markRunning(input: {
    config: AlertTroubleshooterConfig;
    recordId: string;
    claimId: string;
  }): Promise<void> {
    return this.update(input.config, input.recordId, {
      [FIELDS.status]: STATUS_RUNNING,
      [FIELDS.claimId]: input.claimId,
      [FIELDS.claimedAt]: new Date().toISOString(),
      [FIELDS.error]: "",
    });
  }

  markSucceeded(input: {
    config: AlertTroubleshooterConfig;
    recordId: string;
    agentId: string;
  }): Promise<void> {
    return this.update(input.config, input.recordId, {
      [FIELDS.status]: STATUS_SUCCEEDED,
      [FIELDS.agentId]: input.agentId,
      [FIELDS.completedAt]: new Date().toISOString(),
      [FIELDS.error]: "",
    });
  }

  markFailed(input: {
    config: AlertTroubleshooterConfig;
    recordId: string;
    error: string;
  }): Promise<void> {
    return this.update(input.config, input.recordId, {
      [FIELDS.status]: STATUS_FAILED,
      [FIELDS.completedAt]: new Date().toISOString(),
      [FIELDS.error]: input.error.slice(0, 10_000),
    });
  }

  private async update(
    config: AlertTroubleshooterConfig,
    recordId: string,
    fields: Record<string, string>,
  ): Promise<void> {
    const { client, location } = await this.context(config);
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
    location: TableLocation,
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
    return record ? toRecord(record) : null;
  }

  private async context(config: AlertTroubleshooterConfig): Promise<{
    client: lark.Client;
    location: TableLocation;
    primaryField: string;
  }> {
    const bot = this.channelStore.getBot(config.botId);
    if (!bot) throw new Error(`飞书机器人 ${config.botId} 不存在`);
    const client = createClient(bot.config);
    const location = await this.resolveLocation(client, config.recordTableUrl);
    const primaryField = await this.ensureFields(client, location);
    return { client, location, primaryField };
  }

  private async resolveLocation(client: lark.Client, tableUrl: string): Promise<TableLocation> {
    const parsed = parseTableUrl(tableUrl);
    let appToken = parsed.token;
    if (parsed.wiki) {
      const result = await client.wiki.v2.space.getNode({
        params: { token: parsed.token, obj_type: "wiki" },
      });
      assertSuccess(result);
      if (result.data?.node?.obj_type !== "bitable" || !result.data.node.obj_token) {
        throw new Error("配置的 Wiki 链接不是多维表格");
      }
      appToken = result.data.node.obj_token;
    }
    let tableId = parsed.tableId;
    if (!tableId) {
      const result = await client.bitable.v1.appTable.list({
        path: { app_token: appToken },
        params: { page_size: 1 },
      });
      assertSuccess(result);
      tableId = result.data?.items?.[0]?.table_id ?? null;
    }
    if (!tableId) throw new Error("多维表格链接中缺少 table 参数，且未找到默认数据表");
    return { appToken, tableId };
  }

  private async ensureFields(client: lark.Client, location: TableLocation): Promise<string> {
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
