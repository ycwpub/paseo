import type pino from "pino";
import {
  alertTroubleshooterPromptVariableName,
  type AlertTroubleshooterConfig,
  type AlertTroubleshooterRuntime,
  type AlertTroubleshooterTask,
  type PluginAppState,
} from "@getpaseo/protocol/messages";
import type { BoundCreateAgentCommand } from "../agent/create-agent/create.js";
import { formatProviderModel } from "../agent/create-agent/create.js";
import { buildAssistantInitialPrompt } from "../assistants/assistant-prompt.js";
import type { AssistantStore } from "../assistants/assistant-store.js";
import type { NormalizedLarkMessageEvent } from "../channels/lark/lark-message-format.js";
import { readProjectConfigForProject } from "../project/project-config-storage.js";
import { resolveProjectSourceDirectory } from "../project/project-source-directory.js";
import { resolveTeamLeaderCreateContext } from "../team/team-agent-context.js";
import type { TeamStore } from "../team/team-store.js";
import type { PersistedProjectRecord, ProjectRegistry } from "../workspace-registry.js";
import type { PluginService } from "./plugin-service.js";
import type {
  AlertTroubleshooterAgentStageInput,
  AlertTroubleshooterAgentStageResult,
  AlertTroubleshooterAgentContinuationInput,
  AlertTroubleshooterCompletion,
  AlertTroubleshooterCompletionContext,
  AlertTroubleshooterRecordExecutionInput,
  AlertTroubleshooterRecordExecutionResult,
} from "./alert-troubleshooter-agent-execution.js";
import {
  AlertTroubleshooterPendingError,
  defaultAlertTroubleshooterFailureDecision,
  type AlertTroubleshooterFailureContext,
  type AlertTroubleshooterFailureDecision,
} from "./alert-troubleshooter-failure-policy.js";
import { archiveAlertTroubleshooterAgents } from "./alert-troubleshooter-agent-archive.js";
import {
  AlertTroubleshooterQueueStore,
  type AlertTroubleshooterQueueItem,
  type AlertTroubleshooterQueueTrigger,
} from "./alert-troubleshooter-queue-store.js";
import type {
  AlertTroubleshooterRecord,
  AlertTroubleshooterRecordStore,
} from "./alert-troubleshooter-record-store.js";
import { isAlertTroubleshooterActionDue } from "./alert-troubleshooter-schedule.js";
import {
  alertTroubleshooterLocalStage,
  isMissingAlertTroubleshooterRecordError,
  localAlertTroubleshooterRecordId,
  type AlertTroubleshooterLocalStage,
} from "./alert-troubleshooter-task-reference.js";

const SCHEDULER_TICK_MS = 30_000;
const EVENT_DEDUPE_TTL_MS = 24 * 60 * 60_000;
const TABLE_POLL_BATCH_SIZE = 20;
const TEMPLATE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu;

export type AlertTroubleshooterTrigger = AlertTroubleshooterQueueTrigger;

export interface AlertScanWindow {
  start: Date;
  end: Date;
}

export interface AlertScanFailure {
  chatId: string;
  chatName?: string;
  error: string;
}

export interface AlertScanResult {
  events: NormalizedLarkMessageEvent[];
  failures: AlertScanFailure[];
}

interface AlertScanExecutionOptions {
  persistStageFailures?: boolean;
  throwOnPartialFailure?: boolean;
  allowTablePollWhenDisabled?: boolean;
}

export type {
  AlertTroubleshooterCompletion,
  AlertTroubleshooterCompletionContext,
} from "./alert-troubleshooter-agent-execution.js";

interface AlertTroubleshooterOutcomePersistenceInput {
  config: AlertTroubleshooterConfig;
  item: AlertTroubleshooterQueueItem;
  agentId: string;
  completion: AlertTroubleshooterCompletion;
}

export interface AlertTroubleshooterDefinition {
  pluginId: string;
  appId: string;
  configDataKey: string;
  runtimeDataKey: string;
  logModule: string;
  agentTitle: string;
  labelKey: string;
  maxAutomaticRetries?: number;
  supportsAgentAutoArchive?: boolean;
  classifyFailure?(context: AlertTroubleshooterFailureContext): AlertTroubleshooterFailureDecision;
  outputSchema?: Record<string, unknown>;
  parseConfig(value: unknown): AlertTroubleshooterConfig | null;
  validateRecord?(record: AlertTroubleshooterRecord): void;
  matchesAlert(event: NormalizedLarkMessageEvent): boolean;
  scanMessages(input: {
    config: AlertTroubleshooterConfig;
    window: AlertScanWindow;
    cwd: string;
  }): Promise<NormalizedLarkMessageEvent[] | AlertScanResult>;
  buildDefaultPrompt(input: {
    config: AlertTroubleshooterConfig;
    trigger: AlertTroubleshooterTrigger;
    record: AlertTroubleshooterRecord;
    wikiTarget?: { spaceId: string; parentNodeToken: string };
  }): string;
  buildPromptAppendix?(input: {
    config: AlertTroubleshooterConfig;
    trigger: AlertTroubleshooterTrigger;
    record: AlertTroubleshooterRecord;
    wikiTarget?: { spaceId: string; parentNodeToken: string };
  }): string;
  parseCompletion?(message: string | null | undefined): AlertTroubleshooterCompletion;
  resolveCompletion?(
    input: AlertTroubleshooterCompletionContext,
  ): Promise<AlertTroubleshooterCompletion>;
  executeRecord?(
    input: AlertTroubleshooterRecordExecutionInput,
  ): Promise<AlertTroubleshooterRecordExecutionResult>;
}

export function buildScheduledAlertScanWindow(
  now: Date,
  config: AlertTroubleshooterConfig,
): AlertScanWindow {
  return {
    start: new Date(now.getTime() - config.schedule.lookbackMinutes * 60_000),
    end: new Date(now.getTime() - config.schedule.excludeRecentMinutes * 60_000),
  };
}

export function buildRealtimeAlertScanWindow(now: Date, eventTime: number | null): AlertScanWindow {
  const rawTimestamp = eventTime ?? now.getTime();
  const timestamp = rawTimestamp < 10_000_000_000 ? rawTimestamp * 1000 : rawTimestamp;
  const center = Math.min(timestamp, now.getTime());
  return {
    start: new Date(center - 10 * 60_000),
    end: new Date(Math.min(now.getTime(), center + 2 * 60_000)),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : String(error);
}

function operationError(operation: string, error: unknown): Error {
  return new Error(`${operation}失败：${errorMessage(error)}`);
}

function nextRuntime(
  current: unknown,
  patch: Partial<AlertTroubleshooterRuntime>,
): AlertTroubleshooterRuntime {
  const base =
    typeof current === "object" && current !== null
      ? (current as Partial<AlertTroubleshooterRuntime>)
      : {};
  return {
    status: base.status ?? "idle",
    lastScanStartedAt: base.lastScanStartedAt ?? null,
    lastScanFinishedAt: base.lastScanFinishedAt ?? null,
    nextScanAt: base.nextScanAt ?? null,
    lastQueuePollAt: base.lastQueuePollAt ?? null,
    queuedCount: base.queuedCount ?? 0,
    activeRecordId: base.activeRecordId ?? null,
    lastError: base.lastError ?? null,
    activeAgentId: base.activeAgentId ?? null,
    lastTrigger: base.lastTrigger ?? null,
    ...patch,
  };
}

function renderPromptTemplate(template: string, variables: Record<string, string>): string {
  const missing = new Set<string>();
  const rendered = template.replace(TEMPLATE_PATTERN, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined) {
      missing.add(name);
      return "";
    }
    return value;
  });
  if (missing.size > 0) {
    throw new Error(`处理提示词包含未知变量：${[...missing].join("、")}`);
  }
  return rendered;
}

function projectVariables(input: {
  paseoHome: string;
  project: PersistedProjectRecord;
}): Record<string, string> {
  const result = readProjectConfigForProject(input);
  if (!result.ok) return {};
  return Object.fromEntries(
    Object.entries(result.config?.project?.variables ?? {}).map(([name, value]) => [
      alertTroubleshooterPromptVariableName(name),
      value,
    ]),
  );
}

export class ProjectAlertTroubleshooterManager {
  private readonly logger: pino.Logger;
  private readonly queueStore: AlertTroubleshooterQueueStore;
  private readonly activeRuns = new Map<string, Promise<void>>();
  private readonly lastScheduledRun = new Map<string, number>();
  private readonly lastTablePoll = new Map<string, number>();
  private readonly observedMessageIds = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private tickInFlight: Promise<void> | null = null;

  constructor(
    private readonly options: {
      paseoHome: string;
      definition: AlertTroubleshooterDefinition;
      pluginService: Pick<PluginService, "listAppProjects" | "configureApp">;
      projectRegistry: Pick<ProjectRegistry, "get">;
      assistantStore: Pick<AssistantStore, "get">;
      teamStore: Pick<TeamStore, "get">;
      recordStore: AlertTroubleshooterRecordStore;
      createAgent: BoundCreateAgentCommand;
      waitForAgentCompletion?: (agentId: string) => Promise<{ lastMessage: string | null } | void>;
      continueAgent?: (
        agentId: string,
        prompt: string,
        outputSchema?: Record<string, unknown>,
      ) => Promise<{ lastMessage: string | null } | void>;
      cancelAgent?: (agentId: string) => Promise<void>;
      archiveAgent?: (agentId: string) => Promise<void>;
      createProjectWorkspace: (
        project: PersistedProjectRecord,
        title: string,
      ) => Promise<{ workspaceId: string; cwd: string }>;
      logger: pino.Logger;
      now?: () => Date;
    },
  ) {
    this.logger = options.logger.child({ module: options.definition.logModule });
    this.queueStore = new AlertTroubleshooterQueueStore(
      options.paseoHome,
      options.definition.pluginId,
      () => this.now(),
    );
  }

  start(): void {
    if (this.timer) return;
    this.requestTick();
    this.timer = setInterval(() => this.requestTick(), SCHEDULER_TICK_MS);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.tickInFlight) await this.tickInFlight;
    await Promise.allSettled(this.activeRuns.values());
  }

  async observeIncomingMessage(botId: string, event: NormalizedLarkMessageEvent): Promise<void> {
    if (!this.options.definition.matchesAlert(event)) return;
    this.pruneObservedMessages();
    const dedupeKey = `${botId}:${event.messageId}`;
    if (this.observedMessageIds.has(dedupeKey)) return;
    this.observedMessageIds.set(dedupeKey, this.now().getTime());
    for (const state of this.listConfiguredProjects()) {
      const config = this.readConfig(state);
      if (
        !config?.enabled ||
        !config.listenEnabled ||
        config.botId !== botId ||
        !config.chats.some((chat) => chat.chatId === event.chatId)
      ) {
        continue;
      }
      await this.ingestMessage(state, config, "message", event);
      this.queueProjectProcessing(state, config);
    }
  }

  async enqueueRecord(projectId: string, uniqueId: string): Promise<boolean> {
    const state = this.listConfiguredProjects().find(
      (candidate) => candidate.projectId === projectId,
    );
    if (!state) throw new Error(`Project ${projectId} 未配置该自动排查插件`);
    const config = this.readConfig(state);
    if (!config?.enabled) throw new Error("自动排查未启用");
    const normalizedUniqueId = uniqueId.trim();
    if (!normalizedUniqueId) throw new Error("请输入多维表格 unique_id");
    const explicitLocalStage = alertTroubleshooterLocalStage({
      recordId: localAlertTroubleshooterRecordId(normalizedUniqueId),
      uniqueId: normalizedUniqueId,
    });
    if (explicitLocalStage && explicitLocalStage !== "message_ingest") {
      this.enqueueLocalStageRetry(projectId, normalizedUniqueId);
      await this.updateRuntime(state, {
        queuedCount: this.queueStore.countQueued(projectId),
        lastError: null,
      });
      this.queueProjectProcessing(state, config, true);
      return true;
    }
    const record = this.options.recordStore.getRecordByUniqueId
      ? await this.options.recordStore.getRecordByUniqueId({
          config,
          pluginId: this.options.definition.pluginId,
          uniqueId: normalizedUniqueId,
        })
      : await this.options.recordStore.getRecord({
          config,
          pluginId: this.options.definition.pluginId,
          recordId: normalizedUniqueId,
          tableDate: this.now().toISOString().slice(0, 10).replaceAll("-", ""),
        });
    if (!record && normalizedUniqueId.startsWith("message_id:")) {
      this.enqueueLocalStageRetry(projectId, normalizedUniqueId);
      await this.updateRuntime(state, {
        queuedCount: this.queueStore.countQueued(projectId),
        lastError: null,
      });
      this.queueProjectProcessing(state, config, true);
      return true;
    }
    if (!record) throw new Error(`今天和昨天的归因记录中未找到 unique_id：${normalizedUniqueId}`);
    this.queueStore.enqueue(projectId, {
      recordId: record.recordId,
      uniqueId: record.uniqueId ?? `record_id:${record.recordId}`,
      resultId: record.resultId,
      tableDate: record.tableDate ?? this.now().toISOString().slice(0, 10).replaceAll("-", ""),
      messageId: record.messageId,
      trigger: "manual",
      force: true,
    });
    await this.updateRuntime(state, {
      queuedCount: this.queueStore.countQueued(projectId),
      lastError: null,
    });
    this.queueProjectProcessing(state, config, true);
    return true;
  }

  async enqueueResultId(projectId: string, resultId: string): Promise<boolean> {
    const state = this.listConfiguredProjects().find(
      (candidate) => candidate.projectId === projectId,
    );
    if (!state) throw new Error(`Project ${projectId} 未配置该自动排查插件`);
    const config = this.readConfig(state);
    if (!config?.enabled) throw new Error("自动排查未启用");
    const normalizedResultId = resultId.trim().replace(/^result_id\s*[:=：]\s*/iu, "");
    if (!normalizedResultId) throw new Error("请输入 Bamboo result_id");
    if (!this.options.recordStore.upsertManualResult) {
      throw new Error("当前自动排查插件不支持按 result_id 调试");
    }
    const record = await this.options.recordStore.upsertManualResult({
      config,
      projectId,
      pluginId: this.options.definition.pluginId,
      resultId: normalizedResultId,
    });
    this.queueStore.enqueue(projectId, {
      recordId: record.recordId,
      uniqueId: record.uniqueId,
      resultId: normalizedResultId,
      tableDate: record.tableDate,
      messageId: record.messageId,
      trigger: "manual",
      force: true,
    });
    await this.updateRuntime(state, {
      queuedCount: this.queueStore.countQueued(projectId),
      lastError: null,
    });
    this.queueProjectProcessing(state, config, true);
    return true;
  }

  listTasks(projectId: string): AlertTroubleshooterTask[] {
    return this.queueStore.list(projectId);
  }

  async pauseTasks(projectId: string, taskIds: readonly string[]): Promise<string[]> {
    const paused = this.queueStore.pause(projectId, taskIds);
    await Promise.allSettled(
      paused.flatMap((task) =>
        task.agentId && this.options.cancelAgent ? [this.options.cancelAgent(task.agentId)] : [],
      ),
    );
    const state = this.listConfiguredProjects().find(
      (candidate) => candidate.projectId === projectId,
    );
    const config = state ? this.readConfig(state) : null;
    if (config) {
      await Promise.allSettled(
        paused
          .filter((task) => !alertTroubleshooterLocalStage(task))
          .map((task) =>
            this.options.recordStore.markPaused({
              config,
              pluginId: this.options.definition.pluginId,
              recordId: task.recordId,
              tableDate: task.tableDate,
            }),
          ),
      );
    }
    return paused.map((task) => task.id);
  }

  async deleteTasks(projectId: string, taskIds: readonly string[]): Promise<string[]> {
    const tasks = this.queueStore
      .list(projectId)
      .filter((task) => taskIds.includes(task.id) && task.status === "running");
    await Promise.allSettled(
      tasks.flatMap((task) =>
        task.agentId && this.options.cancelAgent ? [this.options.cancelAgent(task.agentId)] : [],
      ),
    );
    return this.queueStore.deleteMany(projectId, taskIds).map((task) => task.id);
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private readConfig(state: PluginAppState): AlertTroubleshooterConfig | null {
    return this.options.definition.parseConfig(state.data[this.options.definition.configDataKey]);
  }

  private listConfiguredProjects(): PluginAppState[] {
    try {
      return this.options.pluginService.listAppProjects(
        this.options.definition.pluginId,
        this.options.definition.appId,
      );
    } catch {
      return [];
    }
  }

  private requestTick(): void {
    if (this.tickInFlight) return;
    const tick = this.tick().finally(() => {
      if (this.tickInFlight === tick) this.tickInFlight = null;
    });
    this.tickInFlight = tick;
  }

  private async tick(): Promise<void> {
    const now = this.now();
    for (const state of this.listConfiguredProjects()) {
      const config = this.readConfig(state);
      if (!config?.enabled || !state.projectId) continue;
      try {
        this.queueStore.promoteDueRetries(state.projectId, {
          intervalMinutes: config.queuePollIntervalMinutes,
          maxAutomaticRetries: this.options.definition.maxAutomaticRetries ?? 0,
        });
        if (config.schedule.enabled && this.isScanDue(state, config, now)) {
          this.lastScheduledRun.set(state.projectId, now.getTime());
          await this.scanProject(state, config, now);
        }
        if (
          config.troubleshootingEnabled &&
          this.queueStore.countQueued(state.projectId) === 0 &&
          this.isTablePollDue(state, config, now)
        ) {
          await this.pollUnclaimedRecords(state, config);
        }
        this.queueProjectProcessing(state, config);
      } catch (error) {
        this.logger.warn(
          { err: error, projectId: state.projectId },
          "Alert troubleshooting scheduler tick failed",
        );
        await this.updateRuntime(state, { status: "error", lastError: errorMessage(error) });
      }
    }
  }

  private isScanDue(state: PluginAppState, config: AlertTroubleshooterConfig, now: Date): boolean {
    const runtime = state.data[this.options.definition.runtimeDataKey] as
      | Partial<AlertTroubleshooterRuntime>
      | undefined;
    return isAlertTroubleshooterActionDue({
      now,
      intervalMinutes: config.schedule.intervalMinutes,
      inMemoryTimestamp: this.lastScheduledRun.get(state.projectId ?? ""),
      persistedTimestamp: runtime?.lastScanStartedAt,
    });
  }

  private isTablePollDue(
    state: PluginAppState,
    config: AlertTroubleshooterConfig,
    now: Date,
  ): boolean {
    const runtime = state.data[this.options.definition.runtimeDataKey] as
      | Partial<AlertTroubleshooterRuntime>
      | undefined;
    return isAlertTroubleshooterActionDue({
      now,
      intervalMinutes: config.queuePollIntervalMinutes,
      inMemoryTimestamp: this.lastTablePoll.get(state.projectId ?? ""),
      persistedTimestamp: runtime?.lastQueuePollAt,
    });
  }

  private async scanProject(
    state: PluginAppState,
    config: AlertTroubleshooterConfig,
    now: Date,
    options: AlertScanExecutionOptions = {},
  ): Promise<void> {
    if (!state.projectId) return;
    const project = await this.options.projectRegistry.get(state.projectId);
    if (!project || project.archivedAt) throw new Error(`Project ${state.projectId} 不存在`);
    const source = resolveProjectSourceDirectory({ paseoHome: this.options.paseoHome, project });
    await this.updateRuntime(state, {
      status: "scanning",
      lastScanStartedAt: now.toISOString(),
      lastError: null,
      lastTrigger: "schedule",
    });
    let scanResult: AlertScanResult;
    try {
      const result = await this.options.definition.scanMessages({
        config,
        window: buildScheduledAlertScanWindow(now, config),
        cwd: source.path,
      });
      scanResult = Array.isArray(result) ? { events: result, failures: [] } : result;
    } catch (error) {
      const failure = operationError("扫描飞书群消息", error);
      if (options.persistStageFailures !== false) {
        this.queueStore.recordFailure(state.projectId, {
          uniqueId: `scan:${now.toISOString()}`,
          trigger: "schedule",
          error: failure.message,
        });
      }
      throw failure;
    }
    const partialFailures: string[] = [];
    for (const failure of scanResult.failures) {
      const message = `扫描飞书群 ${failure.chatName ?? failure.chatId} 失败：${failure.error}`;
      partialFailures.push(message);
      if (options.persistStageFailures !== false) {
        this.queueStore.recordFailure(state.projectId, {
          uniqueId: `scan:${failure.chatId}:${now.toISOString()}`,
          trigger: "schedule",
          error: message,
        });
      }
    }
    for (const event of scanResult.events) {
      try {
        await this.ingestMessage(
          state,
          config,
          "schedule",
          event,
          scanResult.events.length || 1,
          options.persistStageFailures !== false,
        );
      } catch (error) {
        partialFailures.push(errorMessage(error));
        this.logger.warn(
          { err: error, projectId: state.projectId, messageId: event.messageId },
          "Alert scan message ingestion failed; continuing with remaining messages",
        );
      }
    }
    await this.pollUnclaimedRecords(state, config, {
      persistStageFailures: options.persistStageFailures,
      allowWhenDisabled: options.allowTablePollWhenDisabled,
    });
    await this.updateRuntime(state, {
      status: "idle",
      lastScanFinishedAt: this.now().toISOString(),
      nextScanAt: this.nextScanAt(config),
      queuedCount: this.queueStore.countQueued(state.projectId),
      lastError: null,
    });
    if (options.throwOnPartialFailure && partialFailures.length > 0) {
      throw new Error(partialFailures.join("\n"));
    }
  }

  private async ingestMessage(
    state: PluginAppState,
    config: AlertTroubleshooterConfig,
    trigger: AlertTroubleshooterQueueTrigger,
    event: NormalizedLarkMessageEvent,
    matchedCount = 1,
    persistStageFailure = true,
  ): Promise<void> {
    if (!state.projectId) return;
    await this.updateRuntime(state, { status: "ingesting", lastError: null, lastTrigger: trigger });
    let record: AlertTroubleshooterRecord;
    try {
      record = await this.options.recordStore.upsertMessage({
        config,
        projectId: state.projectId,
        pluginId: this.options.definition.pluginId,
        trigger,
        event,
      });
    } catch (error) {
      const failure = operationError("写入日报多维表格", error);
      if (persistStageFailure) {
        this.queueStore.recordFailure(state.projectId, {
          uniqueId: `message_id:${event.messageId}`,
          messageId: event.messageId,
          trigger,
          matchedCount,
          error: failure.message,
        });
      }
      throw failure;
    }
    this.queueStore.enqueue(state.projectId, {
      recordId: record.recordId,
      uniqueId: record.uniqueId ?? `record_id:${record.recordId}`,
      resultId: record.resultId,
      tableDate: record.tableDate ?? this.now().toISOString().slice(0, 10).replaceAll("-", ""),
      messageId: record.messageId,
      trigger,
      matchedCount,
    });
    await this.updateRuntime(state, {
      status: "idle",
      queuedCount: this.queueStore.countQueued(state.projectId),
    });
  }

  private async pollUnclaimedRecords(
    state: PluginAppState,
    config: AlertTroubleshooterConfig,
    options: {
      persistStageFailures?: boolean;
      allowWhenDisabled?: boolean;
    } = {},
  ): Promise<void> {
    if (!state.projectId || (!config.troubleshootingEnabled && !options.allowWhenDisabled)) return;
    const pollStartedAt = this.now();
    this.lastTablePoll.set(state.projectId, pollStartedAt.getTime());
    await this.updateRuntime(state, {
      status: "polling",
      lastQueuePollAt: pollStartedAt.toISOString(),
      lastError: null,
    });
    let records: AlertTroubleshooterRecord[];
    try {
      records = await this.options.recordStore.listUnclaimed({
        config,
        projectId: state.projectId,
        pluginId: this.options.definition.pluginId,
        limit: TABLE_POLL_BATCH_SIZE,
      });
    } catch (error) {
      const failedAt = this.now();
      const failure = operationError("读取或创建日报多维表格", error);
      if (options.persistStageFailures !== false) {
        this.queueStore.recordFailure(state.projectId, {
          uniqueId: `table_poll:${failedAt.toISOString()}`,
          trigger: "table",
          error: failure.message,
        });
      }
      throw failure;
    }
    for (const record of records) {
      this.queueStore.enqueue(state.projectId, {
        recordId: record.recordId,
        uniqueId: record.uniqueId ?? `record_id:${record.recordId}`,
        resultId: record.resultId,
        tableDate: record.tableDate ?? this.now().toISOString().slice(0, 10).replaceAll("-", ""),
        messageId: record.messageId,
        trigger: "table",
      });
    }
    await this.updateRuntime(state, {
      status: "idle",
      lastQueuePollAt: this.now().toISOString(),
      queuedCount: this.queueStore.countQueued(state.projectId),
    });
  }

  private queueProjectProcessing(
    state: PluginAppState,
    config: AlertTroubleshooterConfig,
    allowManualWhenDisabled = false,
  ): void {
    if (
      !state.projectId ||
      (!config.troubleshootingEnabled && !allowManualWhenDisabled) ||
      this.activeRuns.has(state.projectId)
    ) {
      return;
    }
    const run = this.consumeQueue(state, config, allowManualWhenDisabled)
      .catch((error) => {
        this.logger.warn(
          { err: error, projectId: state.projectId },
          "Alert troubleshooting queue consumer failed",
        );
      })
      .finally(() => {
        if (state.projectId) this.activeRuns.delete(state.projectId);
      });
    this.activeRuns.set(state.projectId, run);
  }

  private async consumeQueue(
    state: PluginAppState,
    config: AlertTroubleshooterConfig,
    allowManualWhenDisabled = false,
  ): Promise<void> {
    if (!state.projectId) return;
    const manualOnly = !config.troubleshootingEnabled && allowManualWhenDisabled;
    let currentConfig = config;
    let item = this.queueStore.claimNext(
      state.projectId,
      manualOnly
        ? {
            trigger: "manual",
            maxAutomaticRetries: this.options.definition.maxAutomaticRetries ?? 0,
          }
        : { maxAutomaticRetries: this.options.definition.maxAutomaticRetries ?? 0 },
    );
    while (item && (currentConfig.troubleshootingEnabled || item.trigger === "manual")) {
      await this.processQueueItem(state, currentConfig, item);
      const latest = this.listConfiguredProjects().find(
        (candidate) => candidate.projectId === state.projectId,
      );
      const latestConfig = latest ? this.readConfig(latest) : null;
      if (!latestConfig?.enabled) break;
      currentConfig = latestConfig;
      if (!currentConfig.troubleshootingEnabled && !manualOnly) break;
      item = this.queueStore.claimNext(
        state.projectId,
        manualOnly
          ? {
              trigger: "manual",
              maxAutomaticRetries: this.options.definition.maxAutomaticRetries ?? 0,
            }
          : { maxAutomaticRetries: this.options.definition.maxAutomaticRetries ?? 0 },
      );
    }
    await this.updateRuntime(state, {
      status: "idle",
      queuedCount: this.queueStore.countQueued(state.projectId),
      activeRecordId: null,
    });
  }

  private async processQueueItem(
    state: PluginAppState,
    config: AlertTroubleshooterConfig,
    item: AlertTroubleshooterQueueItem,
  ): Promise<void> {
    if (!state.projectId) return;
    let activeItem = item;
    const createdAgentIds = new Set<string>();
    try {
      const localStage = alertTroubleshooterLocalStage(activeItem);
      if (localStage) {
        await this.processLocalStageQueueItem(state, config, activeItem, localStage);
        return;
      }
      if (!state.defaultAgent) throw new Error("自动排查项目未配置 Provider 和模型");
      const project = await this.options.projectRegistry.get(state.projectId);
      if (!project || project.archivedAt) throw new Error(`Project ${state.projectId} 不存在`);
      const resolved = await this.resolveQueueRecord(state.projectId, config, activeItem);
      activeItem = resolved.item;
      const record = resolved.record;
      this.options.definition.validateRecord?.(record);
      await this.options.recordStore.markRunning({
        config,
        pluginId: this.options.definition.pluginId,
        recordId: activeItem.recordId,
        tableDate: activeItem.tableDate,
        claimId: `${this.options.definition.pluginId}:${state.projectId}`,
      });
      await this.updateRuntime(state, {
        status: "troubleshooting",
        activeRecordId: activeItem.recordId,
        lastTrigger: activeItem.trigger,
        lastError: null,
      });
      const workspace = await this.options.createProjectWorkspace(
        project,
        `${this.options.definition.agentTitle} · ${this.now().toLocaleString("zh-CN")}`,
      );
      const executionContext = await this.options.recordStore.resolveExecutionContext?.({
        config,
        pluginId: this.options.definition.pluginId,
        tableDate: activeItem.tableDate,
      });
      const wikiTarget =
        executionContext?.wikiTarget ??
        (await this.options.recordStore.resolveWikiTarget?.({
          config,
          pluginId: this.options.definition.pluginId,
          tableDate: activeItem.tableDate,
        }));
      const prompt = this.buildPrompt(
        config,
        state,
        project,
        record,
        activeItem.trigger,
        wikiTarget,
      );
      const launchAgent = (stage: AlertTroubleshooterAgentStageInput) =>
        this.launchAgentStage({
          config,
          state,
          item: activeItem,
          workspace,
          stage,
          onAgentCreated: (agentId) => createdAgentIds.add(agentId),
        });
      const continueAgent = (
        agentId: string,
        continuation: AlertTroubleshooterAgentContinuationInput,
      ) =>
        this.continueAgentStage({
          state,
          item: activeItem,
          agentId,
          continuation,
        });
      const execution = await this.executeRecord({
        config,
        state,
        project,
        record,
        item: activeItem,
        workspace,
        wikiTarget,
        closeContext: executionContext?.closeContext,
        prompt,
        launchAgent,
        continueAgent,
      });
      const latestTask = this.queueStore.get(state.projectId, activeItem.id);
      if (!latestTask || latestTask.status === "paused") return;
      const { agentId, completion } = execution;
      if (!execution.persistenceHandled) {
        await this.persistCompletion({ config, item: activeItem, agentId, completion });
      }
      this.queueStore.complete(
        state.projectId,
        activeItem.id,
        agentId,
        completion.status,
        execution.completionWarning,
      );
      await this.updateRuntime(state, {
        status: "idle",
        lastScanFinishedAt: this.now().toISOString(),
        nextScanAt: this.nextScanAt(config),
        queuedCount: this.queueStore.countQueued(state.projectId),
        activeRecordId: null,
        activeAgentId: agentId,
        lastError: null,
      });
    } catch (error) {
      await this.handleQueueItemFailure({ state, config, item: activeItem, error });
    } finally {
      await this.archiveTaskAgentsIfConfigured({
        state,
        config,
        itemId: activeItem.id,
        agentIds: createdAgentIds,
      });
    }
  }

  private async archiveTaskAgentsIfConfigured(input: {
    state: PluginAppState;
    config: AlertTroubleshooterConfig;
    itemId: string;
    agentIds: ReadonlySet<string>;
  }): Promise<void> {
    if (!input.state.projectId) return;
    const task = this.queueStore.get(input.state.projectId, input.itemId);
    await archiveAlertTroubleshooterAgents({
      enabled:
        this.options.definition.supportsAgentAutoArchive === true && input.config.autoArchiveAgents,
      status: task?.status ?? null,
      agentIds: input.agentIds,
      archiveAgent: this.options.archiveAgent,
      logger: this.logger,
      queueItemId: input.itemId,
    });
  }

  private async processLocalStageQueueItem(
    state: PluginAppState,
    config: AlertTroubleshooterConfig,
    item: AlertTroubleshooterQueueItem,
    stage: AlertTroubleshooterLocalStage,
  ): Promise<void> {
    if (!state.projectId) return;
    if (stage === "table_poll") {
      await this.pollUnclaimedRecords(state, config, {
        persistStageFailures: false,
        allowWhenDisabled: true,
      });
    } else {
      await this.scanProject(state, config, this.now(), {
        persistStageFailures: false,
        throwOnPartialFailure: true,
        allowTablePollWhenDisabled: true,
      });
    }
    this.queueStore.complete(state.projectId, item.id, null);
    await this.updateRuntime(state, {
      status: "idle",
      queuedCount: this.queueStore.countQueued(state.projectId),
      activeRecordId: null,
      activeAgentId: null,
      lastError: null,
    });
  }

  private async resolveQueueRecord(
    projectId: string,
    config: AlertTroubleshooterConfig,
    item: AlertTroubleshooterQueueItem,
  ): Promise<{ item: AlertTroubleshooterQueueItem; record: AlertTroubleshooterRecord }> {
    let directRecord: AlertTroubleshooterRecord | null = null;
    try {
      directRecord = await this.options.recordStore.getRecord({
        config,
        pluginId: this.options.definition.pluginId,
        recordId: item.recordId,
        tableDate: item.tableDate,
      });
    } catch (error) {
      if (!isMissingAlertTroubleshooterRecordError(error)) throw error;
    }
    if (directRecord) return { item, record: directRecord };

    let relocated: AlertTroubleshooterRecord | null = null;
    try {
      relocated = this.options.recordStore.relocateRecord
        ? await this.options.recordStore.relocateRecord({
            config,
            pluginId: this.options.definition.pluginId,
            uniqueId: item.uniqueId,
          })
        : await this.options.recordStore.getRecordByUniqueId({
            config,
            pluginId: this.options.definition.pluginId,
            uniqueId: item.uniqueId,
          });
    } catch (error) {
      if (!isMissingAlertTroubleshooterRecordError(error)) throw error;
    }
    if (!relocated) {
      throw new AlertTroubleshooterPendingError(
        `日报记录已迁移或删除，无法按 unique_id ${item.uniqueId} 重新定位；请刷新日报后重新创建任务`,
        "record_reference_missing",
      );
    }
    const updatedItem =
      this.queueStore.replaceRecordReference(projectId, item.id, {
        recordId: relocated.recordId,
        uniqueId: relocated.uniqueId,
        resultId: relocated.resultId,
        tableDate: relocated.tableDate,
        messageId: relocated.messageId,
      }) ?? item;
    return { item: updatedItem, record: relocated };
  }

  private async handleQueueItemFailure(input: {
    state: PluginAppState;
    config: AlertTroubleshooterConfig;
    item: AlertTroubleshooterQueueItem;
    error: unknown;
  }): Promise<void> {
    const projectId = input.state.projectId;
    if (!projectId) return;
    const message = errorMessage(input.error);
    const latestTask = this.queueStore.get(projectId, input.item.id);
    if (!latestTask || latestTask.status === "paused") {
      await this.updateRuntime(input.state, {
        status: "idle",
        queuedCount: this.queueStore.countQueued(projectId),
        activeRecordId: null,
        activeAgentId: null,
        lastError: null,
      });
      return;
    }
    const failedTask = this.queueStore.fail(projectId, input.item.id, message, {
      intervalMinutes: input.config.queuePollIntervalMinutes,
      maxAutomaticRetries: this.options.definition.maxAutomaticRetries ?? 0,
    });
    if (!failedTask) return;
    const failure = (
      this.options.definition.classifyFailure ?? defaultAlertTroubleshooterFailureDecision
    )({
      error: input.error,
      message,
      task: failedTask,
    });
    await this.persistFailureDisposition({
      projectId,
      config: input.config,
      item: input.item,
      task: failedTask,
      error: input.error,
      disposition: failure.disposition,
      reason: failure.reason,
    });
    await this.updateRuntime(input.state, {
      status: "error",
      queuedCount: this.queueStore.countQueued(projectId),
      activeRecordId: null,
      activeAgentId: null,
      lastError: message,
    });
  }

  private async persistFailureDisposition(input: {
    projectId: string;
    config: AlertTroubleshooterConfig;
    item: AlertTroubleshooterQueueItem;
    task: AlertTroubleshooterQueueItem;
    error: unknown;
    disposition: AlertTroubleshooterFailureDecision["disposition"];
    reason: string;
  }): Promise<void> {
    if (alertTroubleshooterLocalStage(input.item)) {
      if (input.disposition === "pending") {
        this.queueStore.complete(
          input.projectId,
          input.item.id,
          input.task.agentId,
          "pending",
          input.reason,
        );
      }
      return;
    }
    const recordInput = {
      config: input.config,
      pluginId: this.options.definition.pluginId,
      recordId: input.item.recordId,
      tableDate: input.item.tableDate,
      error: input.reason,
    };
    if (input.disposition === "retry") {
      await this.options.recordStore.markRetryScheduled?.(recordInput).catch(() => undefined);
      return;
    }
    if (input.disposition === "pending") {
      this.queueStore.complete(
        input.projectId,
        input.item.id,
        input.task.agentId,
        "pending",
        input.reason,
      );
      if (
        input.error instanceof AlertTroubleshooterPendingError &&
        input.error.reasonCode === "record_reference_missing"
      ) {
        return;
      }
      await this.options.recordStore.markPending?.(recordInput).catch(() => undefined);
      return;
    }
    await this.options.recordStore.markFailed(recordInput).catch(() => undefined);
  }

  private enqueueLocalStageRetry(projectId: string, uniqueId: string): void {
    this.queueStore.enqueue(projectId, {
      recordId: localAlertTroubleshooterRecordId(uniqueId),
      uniqueId,
      trigger: "manual",
      force: true,
    });
  }

  private executeRecord(
    input: AlertTroubleshooterRecordExecutionInput,
  ): Promise<AlertTroubleshooterRecordExecutionResult> {
    const executeRecord = this.options.definition.executeRecord;
    return executeRecord ? executeRecord(input) : this.executeSingleAgentRecord(input);
  }

  private async executeSingleAgentRecord(
    input: Omit<AlertTroubleshooterRecordExecutionInput, "launchAgent"> & {
      launchAgent(
        stage: AlertTroubleshooterAgentStageInput,
      ): Promise<AlertTroubleshooterAgentStageResult>;
    },
  ): Promise<AlertTroubleshooterRecordExecutionResult> {
    const result = await input.launchAgent({
      stage: "troubleshooting",
      title: `${this.options.definition.agentTitle} · ${
        input.project.customName ?? input.project.displayName
      }`,
      prompt: input.prompt,
      outputSchema: this.options.definition.outputSchema,
      notifyOnFinish: true,
    });
    return {
      agentId: result.agentId,
      completion: await this.resolveCompletion({
        message: result.lastMessage,
        config: input.config,
        record: input.record,
        workspaceCwd: input.workspace.cwd,
        wikiTarget: input.wikiTarget,
      }),
    };
  }

  private async launchAgentStage(input: {
    config: AlertTroubleshooterConfig;
    state: PluginAppState;
    item: AlertTroubleshooterQueueItem;
    workspace: { workspaceId: string; cwd: string };
    stage: AlertTroubleshooterAgentStageInput;
    onAgentCreated?: (agentId: string) => void;
  }): Promise<AlertTroubleshooterAgentStageResult> {
    if (!input.state.projectId || !input.state.defaultAgent) {
      throw new Error("自动排查项目未配置 Provider 和模型");
    }
    const identity = this.resolveIdentity(input.config, input.state, input.stage.prompt);
    const created = await this.options.createAgent({
      kind: "mcp",
      provider: formatProviderModel(
        input.state.defaultAgent.provider,
        input.state.defaultAgent.model,
      ),
      cwd: input.workspace.cwd,
      workspaceId: input.workspace.workspaceId,
      title: input.stage.title,
      initialPrompt: identity.prompt,
      outputSchema: input.stage.outputSchema,
      labels: {
        ...identity.labels,
        ...input.stage.labels,
        alertRecordId: input.item.recordId,
        alertQueueItemId: input.item.id,
        alertAgentStage: input.stage.stage,
      },
      unattended: true,
      promptFailure: "return-error",
      background: true,
      notifyOnFinish: input.stage.notifyOnFinish ?? false,
      internal: true,
    });
    const agentId = created.snapshot.id;
    input.onAgentCreated?.(agentId);
    if (created.initialPromptError) throw created.initialPromptError;
    this.queueStore.attachAgent(input.state.projectId, input.item.id, agentId);
    await this.updateRuntime(input.state, { activeAgentId: agentId });
    const completionResult = await this.options.waitForAgentCompletion?.(agentId);
    const latestTask = this.queueStore.get(input.state.projectId, input.item.id);
    if (!latestTask || latestTask.status === "paused") {
      throw new Error(`自动排查任务已停止：${input.item.id}`);
    }
    return { agentId, lastMessage: completionResult?.lastMessage ?? null };
  }

  private async continueAgentStage(input: {
    state: PluginAppState;
    item: AlertTroubleshooterQueueItem;
    agentId: string;
    continuation: AlertTroubleshooterAgentContinuationInput;
  }): Promise<AlertTroubleshooterAgentStageResult> {
    if (!input.state.projectId) {
      throw new Error("自动排查项目不存在，不能继续 Agent 返工");
    }
    if (!this.options.continueAgent) {
      throw new Error("当前运行时不支持继续原排查 Agent");
    }
    this.queueStore.attachAgent(input.state.projectId, input.item.id, input.agentId);
    await this.updateRuntime(input.state, { activeAgentId: input.agentId });
    const completion = await this.options.continueAgent(
      input.agentId,
      input.continuation.prompt,
      input.continuation.outputSchema,
    );
    const latestTask = this.queueStore.get(input.state.projectId, input.item.id);
    if (!latestTask || latestTask.status === "paused") {
      throw new Error(`自动排查任务已停止：${input.item.id}`);
    }
    return { agentId: input.agentId, lastMessage: completion?.lastMessage ?? null };
  }

  private async resolveCompletion(
    input: AlertTroubleshooterCompletionContext,
  ): Promise<AlertTroubleshooterCompletion> {
    if (this.options.definition.resolveCompletion) {
      return this.options.definition.resolveCompletion(input);
    }
    if (this.options.definition.parseCompletion) {
      return this.options.definition.parseCompletion(input.message);
    }
    return { status: "succeeded", summary: "Agent 执行完成" };
  }

  private async persistCompletion(
    input: AlertTroubleshooterOutcomePersistenceInput,
  ): Promise<void> {
    const hasCompletionHandler = Boolean(
      this.options.definition.parseCompletion ||
      this.options.definition.resolveCompletion ||
      this.options.definition.executeRecord,
    );
    if (hasCompletionHandler && this.options.recordStore.markOutcome) {
      await this.options.recordStore.markOutcome({
        config: input.config,
        pluginId: this.options.definition.pluginId,
        recordId: input.item.recordId,
        tableDate: input.item.tableDate,
        agentId: input.agentId,
        status: input.completion.status,
        summary: input.completion.summary,
        ...(input.completion.documentUrl ? { documentUrl: input.completion.documentUrl } : {}),
      });
      return;
    }
    if (input.completion.status !== "succeeded") {
      throw new Error(`记录存储不支持写入 ${input.completion.status} 终态`);
    }
    await this.options.recordStore.markSucceeded({
      config: input.config,
      pluginId: this.options.definition.pluginId,
      recordId: input.item.recordId,
      tableDate: input.item.tableDate,
      agentId: input.agentId,
    });
  }

  private buildPrompt(
    config: AlertTroubleshooterConfig,
    state: PluginAppState,
    project: PersistedProjectRecord,
    record: AlertTroubleshooterRecord,
    trigger: AlertTroubleshooterQueueTrigger,
    wikiTarget?: { spaceId: string; parentNodeToken: string },
  ): string {
    if (!config.promptTemplate.trim()) {
      return this.options.definition.buildDefaultPrompt({ config, trigger, record, wikiTarget });
    }
    const variables = {
      ...projectVariables({ paseoHome: this.options.paseoHome, project }),
      project_id: state.projectId ?? "",
      project_name: project.customName ?? project.displayName,
      project_directory: resolveProjectSourceDirectory({
        paseoHome: this.options.paseoHome,
        project,
      }).path,
      plugin_id: this.options.definition.pluginId,
      app_id: this.options.definition.appId,
      record_id: record.recordId,
      unique_id: record.uniqueId,
      result_id: record.resultId ?? "",
      message_id: record.messageId ?? "",
      chat_id: record.chatId ?? "",
      chat_name: record.chatName ?? "",
      message_text: record.messageText,
      message_time: record.messageTime ?? "",
      trigger,
      troubleshooting_sop_doc: config.troubleshootingSopDoc,
      attribution_record_root: config.attributionRecordRoot,
      target_space_id: wikiTarget?.spaceId ?? "",
      parent_wiki_token: wikiTarget?.parentNodeToken ?? "",
    };
    const prompt = renderPromptTemplate(config.promptTemplate, variables);
    const appendix = this.options.definition.buildPromptAppendix?.({
      config,
      trigger,
      record,
      wikiTarget,
    });
    return appendix?.trim() ? `${prompt.trim()}\n\n${appendix.trim()}` : prompt;
  }

  private nextScanAt(config: AlertTroubleshooterConfig): string | null {
    return config.schedule.enabled
      ? new Date(this.now().getTime() + config.schedule.intervalMinutes * 60_000).toISOString()
      : null;
  }

  private resolveIdentity(
    config: AlertTroubleshooterConfig,
    state: PluginAppState,
    prompt: string,
  ): { prompt: string; labels: Record<string, string> } {
    const labels = {
      pluginId: this.options.definition.pluginId,
      pluginProjectId: state.projectId ?? "",
      projectId: state.projectId ?? "",
      [this.options.definition.labelKey]: "true",
    };
    if (config.target.kind === "team") {
      const context = resolveTeamLeaderCreateContext(
        {
          assistantStore: this.options.assistantStore,
          teamStore: this.options.teamStore,
        },
        {
          teamId: config.target.teamId,
          userPrompt: prompt,
          labels,
          paseoHome: this.options.paseoHome,
        },
      );
      return { prompt: context.prompt, labels: context.labels };
    }
    if (config.target.kind === "assistant") {
      const assistant = this.options.assistantStore.get(config.target.assistantId);
      if (!assistant) throw new Error(`助手 ${config.target.assistantId} 不存在`);
      return {
        prompt: buildAssistantInitialPrompt(assistant, prompt, {
          paseoHome: this.options.paseoHome,
        }),
        labels: { ...labels, assistantId: assistant.id, assistantName: assistant.name },
      };
    }
    return { prompt, labels };
  }

  private async updateRuntime(
    state: PluginAppState,
    patch: Partial<AlertTroubleshooterRuntime>,
  ): Promise<void> {
    if (!state.projectId || !state.defaultAgent) return;
    const definition = this.options.definition;
    const latest = this.options.pluginService
      .listAppProjects(definition.pluginId, definition.appId)
      .find((candidate) => candidate.projectId === state.projectId);
    const current = latest ?? state;
    this.options.pluginService.configureApp(
      definition.pluginId,
      definition.appId,
      state.projectId,
      current.defaultAgent ?? state.defaultAgent,
      {
        [definition.runtimeDataKey]: nextRuntime(current.data[definition.runtimeDataKey], patch),
      },
    );
  }

  private pruneObservedMessages(): void {
    const cutoff = this.now().getTime() - EVENT_DEDUPE_TTL_MS;
    for (const [messageId, observedAt] of this.observedMessageIds) {
      if (observedAt < cutoff) this.observedMessageIds.delete(messageId);
    }
  }
}
