import { execFile } from "node:child_process";
import { promisify } from "node:util";
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

const execFileAsync = promisify(execFile);

export type BambooScanWindow = AlertScanWindow;
export const buildScheduledBambooScanWindow = buildScheduledAlertScanWindow;
export const buildRealtimeBambooScanWindow = buildRealtimeAlertScanWindow;

export function isBambooAlertMessage(text: string, messageType?: string | null): boolean {
  const normalized = text.toLowerCase();
  const hasAlertMarker =
    normalized.includes("报警") ||
    normalized.includes("告警") ||
    normalized.includes("result_id") ||
    normalized.includes("task_id") ||
    normalized.includes("离线数据质量");
  return (
    (normalized.includes("bamboo") && hasAlertMarker) ||
    (messageType === "interactive" && hasAlertMarker)
  );
}

type ManagerOptions = ConstructorParameters<typeof ProjectAlertTroubleshooterManager>[0];

export class BambooTroubleshooterManager {
  private readonly manager: ProjectAlertTroubleshooterManager;

  constructor(
    options: Omit<ManagerOptions, "definition"> & {
      runScanner?: (input: {
        chatId: string;
        scanDirUrl: string;
        window: AlertScanWindow;
        cwd: string;
      }) => Promise<void>;
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
        prepareRun: async ({ config, window, cwd }) => {
          for (const chat of config.chats) {
            const input = {
              chatId: chat.chatId,
              scanDirUrl: config.attributionRecordRoot,
              window,
              cwd,
            };
            if (options.runScanner) {
              await options.runScanner(input);
              continue;
            }
            await runBambooScanner(input);
          }
          return {};
        },
        buildPrompt: ({ config, trigger, event }) => buildBambooPrompt(config, trigger, event),
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
}

async function runBambooScanner(input: {
  chatId: string;
  scanDirUrl: string;
  window: AlertScanWindow;
  cwd: string;
}): Promise<void> {
  await execFileAsync(
    "life-settle-ai-assistant",
    [
      "bamboo-alerts-to-excel",
      "--chat-id",
      input.chatId,
      "--scan-dir-url",
      input.scanDirUrl,
      "--start",
      input.window.start.toISOString(),
      "--end",
      input.window.end.toISOString(),
      "--init-status",
      "init",
    ],
    { cwd: input.cwd, timeout: 10 * 60_000, maxBuffer: 10 * 1024 * 1024 },
  );
}

function buildBambooPrompt(
  config: AlertTroubleshooterConfig,
  trigger: "message" | "schedule",
  event?: NormalizedLarkMessageEvent,
): string {
  return [
    "执行 Bamboo 对账报警自动排查。",
    "首先运行 `life-settle-ai-assistant bamboo-alerts-auto-troubleshoot` 并完整遵守输出规范。",
    "目录中的每条报警必须由 fresh context 子 Agent 按 `life-settle-ai-assistant bamboo-alert-troubleshooter` 排查和审查。",
    `触发方式：${trigger === "message" ? "飞书实时报警消息" : "定时补偿扫描"}`,
    `归因记录目录：${config.attributionRecordRoot}`,
    `排查 SOP：${config.troubleshootingSopDoc}`,
    `监听群：${config.chats.map((chat) => `${chat.name ?? chat.chatId}(${chat.chatId})`).join("、")}`,
    event ? `触发消息：chat_id=${event.chatId}, message_id=${event.messageId}\n${event.text}` : "",
    "扫描阶段已经由宿主执行，请直接从归因记录目录执行今天和昨天的自动排查闭环。",
    "不要手工解析卡片、手工更新 Base、直接调用飞书 OpenAPI，或绕过 runner 的状态机和审查门禁。",
  ]
    .filter(Boolean)
    .join("\n\n");
}
