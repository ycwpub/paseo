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
  type AlertScanFailure,
  type AlertManualScanSummary,
  type AlertScanResult,
  type AlertScanWindow,
  type AlertTroubleshooterTrigger,
} from "./alert-troubleshooter-manager.js";
import type {
  AlertTroubleshooterRecord,
  AlertTroubleshooterRecordStore,
} from "./alert-troubleshooter-record-store.js";
import {
  executeArgosAgentPipeline,
  type ArgosAgentOrchestrator,
  type ArgosAgentOrchestratorDependencies,
} from "./argos-agent-orchestrator.js";
import { parseArgosAlertRecord } from "./argos-alert-record.js";
import { classifyArgosExecutionFailure } from "./argos-execution-failure-policy.js";
import {
  buildArgosGroupScanAudit,
  recoverArgosMessageFromScanAudit,
  writeArgosScanAudit,
  type ArgosGroupScanAudit,
} from "./argos-scan-audit.js";

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
      agentOrchestratorDependencies?: ArgosAgentOrchestratorDependencies;
      agentOrchestrator?: ArgosAgentOrchestrator;
      listChatMessages: (
        bot: string | AlertTroubleshooterConfig,
        chatId: string,
        window: AlertScanWindow,
      ) => Promise<NormalizedLarkMessageEvent[]>;
      resolveCommandEnvironment?: (config: AlertTroubleshooterConfig) => NodeJS.ProcessEnv;
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
        maxAutomaticRetries: 3,
        supportsAgentAutoArchive: true,
        classifyFailure: classifyArgosExecutionFailure,
        parseConfig: (value) => {
          const parsed = ArgosTroubleshooterConfigSchema.safeParse(value);
          return parsed.success ? parsed.data : null;
        },
        matchesAlert: (event) => parseArgosAlertRecord(event) !== null,
        scanMessages: ({ config, window, cwd }) =>
          collectScheduledAlerts(options.listChatMessages, config, window, cwd),
        recoverScannedMessage: ({ cwd, messageId }) =>
          recoverArgosMessageFromScanAudit({ cwd, messageId }),
        validateRecord: (record) => {
          if (!record.resultId?.trim() || !record.ruleId?.trim()) {
            throw new Error(
              `Argos 排查记录 ${record.recordId} 缺少 result_id 或 rule_id，请确认报警卡片包含有效详情链接`,
            );
          }
        },
        buildDefaultPrompt: ({ config, trigger, record, wikiTarget }) =>
          buildArgosPrompt(config, trigger, record, wikiTarget),
        buildPromptAppendix: ({ wikiTarget }) => buildArgosPromptAppendix(wikiTarget),
        executeRecord: (input) =>
          (options.agentOrchestrator ?? executeArgosAgentPipeline)(
            {
              ...input,
              commandEnvironment: options.resolveCommandEnvironment?.(input.config),
            },
            options.agentOrchestratorDependencies,
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

  scanNow(
    projectId: string,
    range: { lookbackMinutes: number; excludeRecentMinutes: number },
  ): Promise<AlertManualScanSummary> {
    return this.manager.scanNow(projectId, range);
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

async function collectScheduledAlerts(
  listChatMessages: (
    bot: string | AlertTroubleshooterConfig,
    chatId: string,
    window: AlertScanWindow,
  ) => Promise<NormalizedLarkMessageEvent[]>,
  config: AlertTroubleshooterConfig,
  window: AlertScanWindow,
  cwd: string,
): Promise<AlertScanResult> {
  const startedAt = new Date();
  const alerts = new Map<string, NormalizedLarkMessageEvent>();
  const failures: AlertScanFailure[] = [];
  const groupAudits: ArgosGroupScanAudit[] = [];
  for (const chat of config.chats) {
    try {
      const messages = await listChatMessages(
        config.bot.kind === "existing" ? config.bot.botId : config,
        chat.chatId,
        window,
      );
      groupAudits.push(
        buildArgosGroupScanAudit({
          chatId: chat.chatId,
          ...(chat.name ? { chatName: chat.name } : {}),
          window,
          messages,
        }),
      );
      for (const message of messages) {
        if (parseArgosAlertRecord(message)) alerts.set(message.messageId, message);
      }
    } catch (error) {
      const failure = {
        chatId: chat.chatId,
        ...(chat.name ? { chatName: chat.name } : {}),
        error: error instanceof Error ? error.message : String(error),
      };
      failures.push(failure);
      groupAudits.push(
        buildArgosGroupScanAudit({
          chatId: chat.chatId,
          ...(chat.name ? { chatName: chat.name } : {}),
          window,
          messages: [],
          error: failure.error,
        }),
      );
    }
  }
  const auditFile = await writeArgosScanAudit({
    cwd,
    startedAt,
    finishedAt: new Date(),
    window,
    groups: groupAudits,
    failures,
  });
  return { events: [...alerts.values()], failures, auditFile };
}

function buildArgosPrompt(
  config: AlertTroubleshooterConfig,
  trigger: AlertTroubleshooterTrigger,
  record: AlertTroubleshooterRecord,
  wikiTarget?: { spaceId: string; parentNodeToken: string },
): string {
  return [
    "执行单条 Argos 报警自动排查。",
    "先运行 `life-settle-ai-assistant argos_alarm guide alert-troubleshooter` 读取最新指引，再基于代码准备的本地输入文件完成单条归因。",
    `多维表格记录 ID：${record.recordId}`,
    `多维表格 unique_id：${record.uniqueId}`,
    record.resultId ? `result_id：${record.resultId}` : "",
    record.ruleId ? `rule_id：${record.ruleId}` : "",
    `触发方式：${trigger}`,
    `归因记录根目录：${config.attributionRecordRoot}`,
    wikiTarget ? `target_space_id：${wikiTarget.spaceId}` : "",
    wikiTarget ? `parent_wiki_token：${wikiTarget.parentNodeToken}` : "",
    `排查 SOP：${config.troubleshootingSopDoc}`,
    config.troubleshootingSkills.length > 0
      ? `增强排查 Skills：${config.troubleshootingSkills.join("、")}`
      : "",
    config.referenceFeishuDocs.length > 0
      ? `参考飞书文档：${config.referenceFeishuDocs.join("、")}`
      : "",
    `监听群：${config.chats
      .map((chat) => `${chat.name ?? chat.chatId}(${chat.chatId})`)
      .join("、")}`,
    `触发消息：chat_id=${record.chatId ?? ""}, message_id=${
      record.messageId ?? ""
    }\n${record.messageText}`,
    "只处理上述指定记录，不要批量扫描、认领或关闭其他记录。",
    "只允许读取排查所需证据并生成编排器指定的本地临时文件；不得更新 Base、飞书文档、SOP、卡片或群消息。",
    "文档发布、SOP 写回、状态更新和群消息回复统一由父编排代码在独立审核通过后执行。",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildArgosPromptAppendix(wikiTarget?: {
  spaceId: string;
  parentNodeToken: string;
}): string {
  return [
    "Paseo Argos 自动执行约束：",
    wikiTarget ? `target_space_id：${wikiTarget.spaceId}` : "",
    wikiTarget ? `parent_wiki_token：${wikiTarget.parentNodeToken}` : "",
    wikiTarget
      ? "日报 Base Wiki 目标仅作为本地结果上下文；Agent 不得直接发布文档。"
      : "当前无法解析日报 Base Wiki 目标；Agent 仍只生成本地文件，不得尝试其它归档位置。",
    "只允许读取证据并写入父编排器指定的本地临时文件，不得调用任何写入型 Runner 或飞书接口。",
    "父编排代码负责校验、独立审核、文档与 SOP 发布以及最终状态回写。",
  ]
    .filter(Boolean)
    .join("\n");
}
