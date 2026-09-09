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
  type AlertManualScanSummary,
  type AlertScanResult,
  type AlertScanWindow,
  type AlertTroubleshooterTrigger,
} from "./alert-troubleshooter-manager.js";
import type {
  AlertTroubleshooterRecord,
  AlertTroubleshooterRecordStore,
} from "./alert-troubleshooter-record-store.js";
import { isBambooAlertMessage } from "./bamboo-alert-message.js";
import { type BambooTroubleshooterDocumentPublication } from "./bamboo-troubleshooter-document-publisher.js";
import { BAMBOO_MAX_AUTOMATIC_RETRIES } from "./alert-troubleshooter-retry-policy.js";
import {
  executeBambooAgentPipeline,
  type BambooAgentOrchestrator,
  type BambooAgentOrchestratorDependencies,
} from "./bamboo-agent-orchestrator.js";
import { resolveBambooAgentOrchestratorDependencies } from "./bamboo-agent-orchestrator-dependencies.js";
import { classifyBambooExecutionFailure } from "./bamboo-execution-failure-policy.js";
import { BambooDedicatedBotListener } from "./bamboo-dedicated-bot-listener.js";
import type { BambooBotCredentialResolver } from "./bamboo-bot-credential-resolver.js";
import type { LarkChannelClientAdapter } from "../channels/lark/lark-client-adapter.js";
import {
  buildBambooGroupScanAudit,
  recoverBambooMessageFromScanAudit,
  writeBambooScanAudit,
  type BambooGroupScanAudit,
} from "./bamboo-scan-audit.js";

export { isBambooAlertMessage } from "./bamboo-alert-message.js";

export type BambooScanWindow = AlertScanWindow;
export const buildScheduledBambooScanWindow = buildScheduledAlertScanWindow;
export const buildRealtimeBambooScanWindow = buildRealtimeAlertScanWindow;

type ManagerOptions = ConstructorParameters<typeof ProjectAlertTroubleshooterManager>[0];

export class BambooTroubleshooterManager {
  private readonly manager: ProjectAlertTroubleshooterManager;
  private readonly dedicatedBotListener: BambooDedicatedBotListener | null;

  constructor(
    options: Omit<ManagerOptions, "definition"> & {
      recordStore: AlertTroubleshooterRecordStore;
      publishDocument?: (input: {
        config: AlertTroubleshooterConfig;
        record: AlertTroubleshooterRecord;
        workspaceCwd: string;
        wikiTarget: { spaceId: string; parentNodeToken: string };
        markdownFile?: string;
        auditFile?: string;
      }) => Promise<BambooTroubleshooterDocumentPublication>;
      agentOrchestratorDependencies?: Partial<BambooAgentOrchestratorDependencies>;
      agentOrchestrator?: BambooAgentOrchestrator;
      listChatMessages: (
        bot: string | AlertTroubleshooterConfig,
        chatId: string,
        window: AlertScanWindow,
      ) => Promise<NormalizedLarkMessageEvent[]>;
      resolveCommandEnvironment?: (config: AlertTroubleshooterConfig) => NodeJS.ProcessEnv;
      credentialResolver?: Pick<BambooBotCredentialResolver, "resolve">;
      startBotEvents?: LarkChannelClientAdapter["startEvents"];
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
        supportsAgentAutoArchive: true,
        classifyFailure: classifyBambooExecutionFailure,
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
        scanMessages: ({ config, window, cwd, trigger }) =>
          collectScheduledBambooAlerts(
            options.listChatMessages,
            options.recordStore,
            config,
            window,
            cwd,
            trigger === "schedule",
          ),
        recoverScannedMessage: ({ cwd, messageId }) =>
          recoverBambooMessageFromScanAudit({ cwd, messageId }),
        buildDefaultPrompt: ({ config, trigger, record, wikiTarget }) =>
          buildBambooPrompt(config, trigger, record, wikiTarget),
        buildPromptAppendix: ({ wikiTarget }) => buildBambooPromptAppendix(wikiTarget),
        executeRecord: (input) =>
          (options.agentOrchestrator ?? executeBambooAgentPipeline)(
            {
              ...input,
              commandEnvironment: options.resolveCommandEnvironment?.(input.config),
            },
            resolveBambooAgentOrchestratorDependencies({
              overrides: options.agentOrchestratorDependencies,
              publishDocument: options.publishDocument,
              recordStore: options.recordStore,
            }),
          ),
      },
    });
    this.dedicatedBotListener =
      options.credentialResolver && options.startBotEvents
        ? new BambooDedicatedBotListener({
            listProjects: () =>
              options.pluginService.listAppProjects(
                BAMBOO_TROUBLESHOOTER_PLUGIN_ID,
                BAMBOO_TROUBLESHOOTER_APP_ID,
              ),
            credentialResolver: options.credentialResolver,
            startEvents: options.startBotEvents,
            onMessage: (botAppId, event) => this.manager.observeIncomingMessage(botAppId, event),
            logger: options.logger,
          })
        : null;
  }

  start(): void {
    this.manager.start();
    this.dedicatedBotListener?.start();
  }

  async stop(): Promise<void> {
    await Promise.all([this.manager.stop(), this.dedicatedBotListener?.stop()]);
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

async function collectScheduledBambooAlerts(
  listChatMessages: (
    bot: string | AlertTroubleshooterConfig,
    chatId: string,
    window: AlertScanWindow,
  ) => Promise<NormalizedLarkMessageEvent[]>,
  recordStore: AlertTroubleshooterRecordStore,
  config: AlertTroubleshooterConfig,
  window: AlertScanWindow,
  cwd: string,
  resumeFromLatestMessage = true,
): Promise<AlertScanResult> {
  const startedAt = new Date();
  const alerts = new Map<string, NormalizedLarkMessageEvent>();
  const failures: AlertScanFailure[] = [];
  const groupAudits: BambooGroupScanAudit[] = [];
  for (const chat of config.chats) {
    let effectiveWindow = window;
    try {
      const latestMessageTime = resumeFromLatestMessage
        ? await recordStore.getLatestMessageTimeByChat?.({
            config,
            pluginId: BAMBOO_TROUBLESHOOTER_PLUGIN_ID,
            chatId: chat.chatId,
          })
        : null;
      const start =
        latestMessageTime === undefined || latestMessageTime === null
          ? window.start
          : new Date(Math.max(window.start.getTime(), latestMessageTime + 1));
      if (start > window.end) continue;
      effectiveWindow = { start, end: window.end };
      const messages = await listChatMessages(
        config.bot.kind === "existing" ? config.bot.botId : config,
        chat.chatId,
        {
          start,
          end: window.end,
        },
      );
      groupAudits.push(
        buildBambooGroupScanAudit({
          chatId: chat.chatId,
          ...(chat.name ? { chatName: chat.name } : {}),
          window: effectiveWindow,
          messages,
        }),
      );
      for (const message of messages) {
        if (isBambooAlertMessage(message.text, message.messageType)) {
          alerts.set(message.messageId, message);
        }
      }
    } catch (error) {
      const failure = {
        chatId: chat.chatId,
        ...(chat.name ? { chatName: chat.name } : {}),
        error: error instanceof Error ? error.message : String(error),
      };
      failures.push(failure);
      groupAudits.push(
        buildBambooGroupScanAudit({
          chatId: chat.chatId,
          ...(chat.name ? { chatName: chat.name } : {}),
          window: effectiveWindow,
          messages: [],
          error: failure.error,
        }),
      );
    }
  }
  const auditFile = await writeBambooScanAudit({
    cwd,
    startedAt,
    finishedAt: new Date(),
    window,
    groups: groupAudits,
    failures,
  });
  return { events: [...alerts.values()], failures, auditFile };
}

function buildBambooPrompt(
  config: AlertTroubleshooterConfig,
  trigger: AlertTroubleshooterTrigger,
  record: AlertTroubleshooterRecord,
  wikiTarget?: { spaceId: string; parentNodeToken: string },
): string {
  return [
    "执行单条 Bamboo 对账报警自动排查。",
    "先运行 `life-settle-ai-assistant bamboo guide alert-troubleshooter` 读取最新指引，再基于代码准备的本地输入文件完成单条归因。",
    `多维表格记录 ID：${record.recordId}`,
    `多维表格 unique_id：${record.uniqueId}`,
    record.resultId ? `Bamboo result_id：${record.resultId}` : "",
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
    "只允许读取排查所需证据并生成编排器指定的本地临时文件；不得更新 Base、飞书文档、Bamboo 卡片或群消息。",
    "文档发布、SOP 写回、状态更新、卡片更新和群消息回复统一由父编排代码在审核通过后执行。",
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
      ? "日报 Base Wiki 目标仅作为本地结果上下文；Agent 不得直接发布文档。"
      : "当前无法解析日报 Base Wiki 目标；Agent 仍只生成本地文件，不得尝试其它归档位置。",
    "只允许读取证据并写入父编排器指定的本地临时文件，不得调用任何写入型 runner 或飞书接口。",
    "父编排代码负责校验、审核门禁、文档与 SOP 发布以及最终状态回写。",
  ]
    .filter(Boolean)
    .join("\n");
}
