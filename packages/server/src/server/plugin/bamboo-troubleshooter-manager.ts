import {
  BAMBOO_TROUBLESHOOTER_APP_ID,
  BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY,
  BAMBOO_TROUBLESHOOTER_PLUGIN_ID,
  BAMBOO_TROUBLESHOOTER_RUNTIME_DATA_KEY,
  BambooTroubleshooterConfigSchema,
  type AlertTroubleshooterConfig,
} from "@getpaseo/protocol/messages";
import type { NormalizedLarkMessageEvent } from "../channels/lark/lark-message-format.js";
import {
  ProjectAlertTroubleshooterManager,
  buildRealtimeAlertScanWindow,
  buildScheduledAlertScanWindow,
  type AlertScanFailure,
  type AlertScanResult,
  type AlertScanWindow,
} from "./alert-troubleshooter-manager.js";
import type {
  AlertTroubleshooterRecord,
  AlertTroubleshooterRecordStore,
} from "./alert-troubleshooter-record-store.js";
import { isBambooAlertMessage } from "./bamboo-alert-message.js";
import {
  BAMBOO_TROUBLESHOOTER_OUTPUT_SCHEMA,
  parseBambooTroubleshooterCompletion,
} from "./bamboo-troubleshooter-completion.js";
import { resolveBambooTroubleshooterCompletion } from "./bamboo-troubleshooter-completion-resolver.js";
import { type BambooTroubleshooterDocumentPublication } from "./bamboo-troubleshooter-document-publisher.js";
import { BAMBOO_MAX_AUTOMATIC_RETRIES } from "./alert-troubleshooter-retry-policy.js";

export { isBambooAlertMessage } from "./bamboo-alert-message.js";

export type BambooScanWindow = AlertScanWindow;
export const buildScheduledBambooScanWindow = buildScheduledAlertScanWindow;
export const buildRealtimeBambooScanWindow = buildRealtimeAlertScanWindow;

type ManagerOptions = ConstructorParameters<typeof ProjectAlertTroubleshooterManager>[0];

export class BambooTroubleshooterManager {
  private readonly manager: ProjectAlertTroubleshooterManager;

  constructor(
    options: Omit<ManagerOptions, "definition"> & {
      recordStore: AlertTroubleshooterRecordStore;
      publishDocument?: (input: {
        config: AlertTroubleshooterConfig;
        record: AlertTroubleshooterRecord;
        workspaceCwd: string;
        wikiTarget: { spaceId: string; parentNodeToken: string };
      }) => Promise<BambooTroubleshooterDocumentPublication>;
      listChatMessages: (
        botId: string,
        chatId: string,
        window: AlertScanWindow,
      ) => Promise<NormalizedLarkMessageEvent[]>;
    },
  ) {
    this.manager = new ProjectAlertTroubleshooterManager({
      ...options,
      definition: {
        pluginId: BAMBOO_TROUBLESHOOTER_PLUGIN_ID,
        appId: BAMBOO_TROUBLESHOOTER_APP_ID,
        configDataKey: BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY,
        runtimeDataKey: BAMBOO_TROUBLESHOOTER_RUNTIME_DATA_KEY,
        logModule: "bamboo-troubleshooter-manager",
        agentTitle: "Bamboo 对账自动排查",
        labelKey: "bambooTroubleshooter",
        maxAutomaticRetries: BAMBOO_MAX_AUTOMATIC_RETRIES,
        outputSchema: BAMBOO_TROUBLESHOOTER_OUTPUT_SCHEMA,
        parseConfig: (value) => {
          const parsed = BambooTroubleshooterConfigSchema.safeParse(value);
          return parsed.success ? parsed.data : null;
        },
        validateRecord: (record) => {
          if (!record.resultId?.trim()) {
            throw new Error(
              `Bamboo 排查记录 ${record.recordId} 缺少 result_id，已跳过 Agent 执行；请修复日报记录后手动重试`,
            );
          }
        },
        matchesAlert: (event) => isBambooAlertMessage(event.text, event.messageType),
        scanMessages: ({ config, window }) =>
          collectScheduledBambooAlerts(
            options.listChatMessages,
            options.recordStore,
            config,
            window,
          ),
        buildDefaultPrompt: ({ config, trigger, record, wikiTarget }) =>
          buildBambooPrompt(config, trigger, record, wikiTarget),
        buildPromptAppendix: ({ wikiTarget }) => buildBambooPromptAppendix(wikiTarget),
        parseCompletion: (message) => {
          const result = parseBambooTroubleshooterCompletion(message);
          return {
            status: result.status,
            summary: result.summary,
            ...(result.feishu_doc_url ? { documentUrl: result.feishu_doc_url } : {}),
          };
        },
        resolveCompletion: async ({ message, config, record, workspaceCwd, wikiTarget }) =>
          resolveBambooTroubleshooterCompletion(
            {
              message,
              config,
              record,
              workspaceCwd,
              wikiTarget,
            },
            options.publishDocument,
          ),
      },
    });
  }

  start(): void {
    this.manager.start();
  }

  stop(): Promise<void> {
    return this.manager.stop();
  }

  observeIncomingMessage(botId: string, event: NormalizedLarkMessageEvent): Promise<void> {
    return this.manager.observeIncomingMessage(botId, event);
  }

  enqueueRecord(projectId: string, uniqueId: string): Promise<boolean> {
    return this.manager.enqueueRecord(projectId, uniqueId);
  }

  enqueueResultId(projectId: string, resultId: string): Promise<boolean> {
    return this.manager.enqueueResultId(projectId, resultId);
  }

  listTasks(projectId: string) {
    return this.manager.listTasks(projectId);
  }

  pauseTasks(projectId: string, taskIds: readonly string[]): Promise<string[]> {
    return this.manager.pauseTasks(projectId, taskIds);
  }

  deleteTasks(projectId: string, taskIds: readonly string[]): Promise<string[]> {
    return this.manager.deleteTasks(projectId, taskIds);
  }
}

async function collectScheduledBambooAlerts(
  listChatMessages: (
    botId: string,
    chatId: string,
    window: AlertScanWindow,
  ) => Promise<NormalizedLarkMessageEvent[]>,
  recordStore: AlertTroubleshooterRecordStore,
  config: AlertTroubleshooterConfig,
  window: AlertScanWindow,
): Promise<AlertScanResult> {
  const alerts = new Map<string, NormalizedLarkMessageEvent>();
  const failures: AlertScanFailure[] = [];
  for (const chat of config.chats) {
    try {
      const latestMessageTime = await recordStore.getLatestMessageTimeByChat?.({
        config,
        pluginId: BAMBOO_TROUBLESHOOTER_PLUGIN_ID,
        chatId: chat.chatId,
      });
      const start =
        latestMessageTime === undefined || latestMessageTime === null
          ? window.start
          : new Date(Math.max(window.start.getTime(), latestMessageTime + 1));
      if (start > window.end) continue;
      const messages = await listChatMessages(config.botId, chat.chatId, {
        start,
        end: window.end,
      });
      for (const message of messages) {
        if (isBambooAlertMessage(message.text, message.messageType)) {
          alerts.set(message.messageId, message);
        }
      }
    } catch (error) {
      failures.push({
        chatId: chat.chatId,
        ...(chat.name ? { chatName: chat.name } : {}),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { events: [...alerts.values()], failures };
}

function buildBambooPrompt(
  config: AlertTroubleshooterConfig,
  trigger: "message" | "schedule" | "table" | "manual",
  record: AlertTroubleshooterRecord,
  wikiTarget?: { spaceId: string; parentNodeToken: string },
): string {
  return [
    "执行单条 Bamboo 对账报警自动排查。",
    "先运行 `life-settle-ai-assistant bamboo guide alert-troubleshooter` 读取最新指引，再严格按 runner 单条状态机处理指定记录。",
    `多维表格记录 ID：${record.recordId}`,
    `多维表格 unique_id：${record.uniqueId}`,
    record.resultId ? `Bamboo result_id：${record.resultId}` : "",
    `触发方式：${trigger}`,
    `归因记录根目录：${config.attributionRecordRoot}`,
    wikiTarget ? `target_space_id：${wikiTarget.spaceId}` : "",
    wikiTarget ? `parent_wiki_token：${wikiTarget.parentNodeToken}` : "",
    `排查 SOP：${config.troubleshootingSopDoc}`,
    `监听群：${config.chats
      .map((chat) => `${chat.name ?? chat.chatId}(${chat.chatId})`)
      .join("、")}`,
    `触发消息：chat_id=${record.chatId ?? ""}, message_id=${
      record.messageId ?? ""
    }\n${record.messageText}`,
    "只处理上述指定记录，不要批量认领其他记录；结果必须包含明确终态、证据摘要和排查文档链接。",
    "不要手工解析卡片、直接调用飞书 OpenAPI，或绕过 runner 的状态机、结果校验和审查门禁。",
    "发布文档时必须把上述 target_space_id 和 parent_wiki_token 传给 runner 的 publish-troubleshooting-doc；validator 未通过或未得到 /wiki/ 链接时不得返回 succeeded。",
    '最终一条消息必须只包含 JSON：{"status":"succeeded|pending|not_support","summary":"...","feishu_doc_url":"https://.../wiki/..."}；succeeded 必须提供归因根目录下的 Wiki 文档链接。',
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildBambooPromptAppendix(wikiTarget?: {
  spaceId: string;
  parentNodeToken: string;
}): string {
  return [
    "Paseo 自动执行约束：",
    wikiTarget ? `target_space_id：${wikiTarget.spaceId}` : "",
    wikiTarget ? `parent_wiki_token：${wikiTarget.parentNodeToken}` : "",
    wikiTarget
      ? "发布文档时必须把上述 target_space_id 和 parent_wiki_token 传给 runner 的 publish-troubleshooting-doc。"
      : "如果无法解析日报 Base 的 Wiki 节点，不得把普通 docx 链接作为 succeeded 结果。",
    "不要手工解析卡片、直接调用飞书 OpenAPI，或绕过 runner 的状态机、结果校验和审查门禁。",
    '最终一条消息必须只包含 JSON：{"status":"succeeded|pending|not_support","summary":"...","feishu_doc_url":"https://.../wiki/..."}；succeeded 必须提供归因根目录下的 Wiki 文档链接。',
  ]
    .filter(Boolean)
    .join("\n");
}
