import {
  ARGOS_TROUBLESHOOTER_APP_ID,
  ARGOS_TROUBLESHOOTER_CONFIG_DATA_KEY,
  ARGOS_TROUBLESHOOTER_PLUGIN_ID,
  ARGOS_TROUBLESHOOTER_RUNTIME_DATA_KEY,
  ArgosTroubleshooterConfigSchema,
  type AlertTroubleshooterConfig,
} from "@getpaseo/protocol/messages";
import type { NormalizedLarkMessageEvent } from "../channels/lark/lark-message-format.js";
import {
  ProjectAlertTroubleshooterManager,
  type AlertScanWindow,
  type AlertTroubleshooterTrigger,
} from "./alert-troubleshooter-manager.js";
import type {
  AlertTroubleshooterRecord,
  AlertTroubleshooterRecordStore,
} from "./alert-troubleshooter-record-store.js";

type ManagerOptions = ConstructorParameters<typeof ProjectAlertTroubleshooterManager>[0];

export function isArgosAlertMessage(text: string, messageType?: string | null): boolean {
  const normalized = text.toLowerCase();
  const hasArgosMarker =
    normalized.includes("argos") ||
    normalized.includes("阿尔戈斯") ||
    /https?:\/\/[^\s]*argos/iu.test(text);
  const hasAlertMarker =
    normalized.includes("报警") ||
    normalized.includes("告警") ||
    normalized.includes("alert") ||
    normalized.includes("alarm") ||
    normalized.includes("event_id") ||
    normalized.includes("rule_id");
  return hasArgosMarker && (hasAlertMarker || messageType === "interactive");
}

export class ArgosTroubleshooterManager {
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
        pluginId: ARGOS_TROUBLESHOOTER_PLUGIN_ID,
        appId: ARGOS_TROUBLESHOOTER_APP_ID,
        configDataKey: ARGOS_TROUBLESHOOTER_CONFIG_DATA_KEY,
        runtimeDataKey: ARGOS_TROUBLESHOOTER_RUNTIME_DATA_KEY,
        logModule: "argos-troubleshooter-manager",
        agentTitle: "Argos 报警自动排查",
        labelKey: "argosTroubleshooter",
        parseConfig: (value) => {
          const parsed = ArgosTroubleshooterConfigSchema.safeParse(value);
          return parsed.success ? parsed.data : null;
        },
        matchesAlert: (event) => isArgosAlertMessage(event.text, event.messageType),
        scanMessages: ({ config, window }) =>
          collectScheduledAlerts(options.listChatMessages, config, window),
        buildDefaultPrompt: ({ config, trigger, record }) =>
          buildArgosPrompt(config, trigger, record),
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

  enqueueRecord(projectId: string, recordId: string): Promise<boolean> {
    return this.manager.enqueueRecord(projectId, recordId);
  }
}

async function collectScheduledAlerts(
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
      if (isArgosAlertMessage(message.text, message.messageType)) {
        alerts.set(message.messageId, message);
      }
    }
  }
  return [...alerts.values()];
}

function buildArgosPrompt(
  config: AlertTroubleshooterConfig,
  trigger: AlertTroubleshooterTrigger,
  record: AlertTroubleshooterRecord,
): string {
  return [
    "执行单条 Argos 报警自动排查，并自主完成从告警识别、证据收集、根因分析到归因记录的闭环。",
    "先读取排查 SOP 飞书文档，再根据告警中的服务、规则、指标、日志、trace、变更和代码线索选择可用工具逐层排查。",
    "不得仅复述告警；必须给出证据、根因或明确的待验证假设、影响范围、处置建议和后续行动。",
    "无法访问某项数据时，记录缺失权限或缺失工具并继续使用其余证据，不要卡住。",
    `多维表格记录 ID：${record.recordId}`,
    `触发方式：${trigger}`,
    `排查 SOP：${config.troubleshootingSopDoc}`,
    `归因记录飞书文档：${config.attributionRecordRoot}`,
    `消息记录表：${config.recordTableUrl}`,
    `监听群：${config.chats.map((chat) => `${chat.name ?? chat.chatId}(${chat.chatId})`).join("、")}`,
    `群：${record.chatName ?? record.chatId ?? ""} (${record.chatId ?? ""})`,
    `消息 ID：${record.messageId ?? ""}`,
    record.messageTime ? `时间：${record.messageTime}` : "",
    "以下为本次需要排查的 Argos 告警原始证据：",
    record.messageText,
    "完成后更新归因记录飞书文档；保留排查过程、关键查询条件、证据链接和最终结论，避免重复处理同一消息 ID。",
  ]
    .filter(Boolean)
    .join("\n\n");
}
