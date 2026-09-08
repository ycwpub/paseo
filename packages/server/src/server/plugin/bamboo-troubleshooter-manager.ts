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
  type AlertScanWindow,
} from "./alert-troubleshooter-manager.js";
import type {
  AlertTroubleshooterRecord,
  AlertTroubleshooterRecordStore,
} from "./alert-troubleshooter-record-store.js";
import { isBambooAlertMessage } from "./bamboo-alert-message.js";

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
        parseConfig: (value) => {
          const parsed = BambooTroubleshooterConfigSchema.safeParse(value);
          return parsed.success ? parsed.data : null;
        },
        matchesAlert: (event) => isBambooAlertMessage(event.text, event.messageType),
        scanMessages: ({ config, window }) =>
          collectScheduledBambooAlerts(options.listChatMessages, config, window),
        buildDefaultPrompt: ({ config, trigger, record }) =>
          buildBambooPrompt(config, trigger, record),
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
  config: AlertTroubleshooterConfig,
  window: AlertScanWindow,
): Promise<NormalizedLarkMessageEvent[]> {
  const alerts = new Map<string, NormalizedLarkMessageEvent>();
  for (const chat of config.chats) {
    const messages = await listChatMessages(config.botId, chat.chatId, window);
    for (const message of messages) {
      if (isBambooAlertMessage(message.text, message.messageType)) {
        alerts.set(message.messageId, message);
      }
    }
  }
  return [...alerts.values()];
}

function buildBambooPrompt(
  config: AlertTroubleshooterConfig,
  trigger: "message" | "schedule" | "table" | "manual",
  record: AlertTroubleshooterRecord,
): string {
  return [
    "执行单条 Bamboo 对账报警自动排查。",
    "先读取 `life-settle-ai-assistant bamboo-alert-troubleshooter` 指引，再严格按 runner 状态机处理指定记录。",
    `多维表格记录 ID：${record.recordId}`,
    `多维表格 unique_id：${record.uniqueId}`,
    record.resultId ? `Bamboo result_id：${record.resultId}` : "",
    `触发方式：${trigger}`,
    `归因记录根目录：${config.attributionRecordRoot}`,
    `排查 SOP：${config.troubleshootingSopDoc}`,
    `监听群：${config.chats.map((chat) => `${chat.name ?? chat.chatId}(${chat.chatId})`).join("、")}`,
    `触发消息：chat_id=${record.chatId ?? ""}, message_id=${record.messageId ?? ""}\n${record.messageText}`,
    "只处理上述指定记录，不要批量认领其他记录。",
    "不要手工解析卡片、手工更新 Base、直接调用飞书 OpenAPI，或绕过 runner 的状态机和审查门禁。",
  ]
    .filter(Boolean)
    .join("\n\n");
}
