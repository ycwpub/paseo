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

export interface AlertTroubleshooterCompletion {
  status: "succeeded" | "pending" | "not_support";
  summary: string;
  documentUrl?: string;
}

export interface AlertTroubleshooterDefinition {
  pluginId: string;
  appId: string;
  configDataKey: string;
  runtimeDataKey: string;
  logModule: string;
  agentTitle: string;
  labelKey: string;
  parseConfig(value: unknown): AlertTroubleshooterConfig | null;
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
  }): string;
  parseCompletion?(message: string | null | undefined): AlertTroubleshooterCompletion;
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
      cancelAgent?: (agentId: string) => Promise<void>;
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
        paused.map((task) =>
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
      this.queueStore.recordFailure(state.projectId, {
        uniqueId: `scan:${now.toISOString()}`,
        trigger: "schedule",
        error: failure.message,
      });
      throw failure;
    }
    for (const failure of scanResult.failures) {
      this.queueStore.recordFailure(state.projectId, {
        uniqueId: `scan:${failure.chatId}:${now.toISOString()}`,
        trigger: "schedule",
        error: `扫描飞书群 ${failure.chatName ?? failure.chatId} 失败：${failure.error}`,
      });
    }
    for (const event of scanResult.events) {
      try {
        await this.ingestMessage(state, config, "schedule", event, scanResult.events.length || 1);
      } catch (error) {
        this.logger.warn(
          { err: error, projectId: state.projectId, messageId: event.messageId },
          "Alert scan message ingestion failed; continuing with remaining messages",
        );
      }
    }
    await this.pollUnclaimedRecords(state, config);
    await this.updateRuntime(state, {
      status: "idle",
      lastScanFinishedAt: this.now().toISOString(),
      nextScanAt: this.nextScanAt(config),
      queuedCount: this.queueStore.countQueued(state.projectId),
      lastError: null,
    });
  }

  private async ingestMessage(
    state: PluginAppState,
    config: AlertTroubleshooterConfig,
    trigger: AlertTroubleshooterQueueTrigger,
    event: NormalizedLarkMessageEvent,
    matchedCount = 1,
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
      this.queueStore.recordFailure(state.projectId, {
        uniqueId: `message_id:${event.messageId}`,
        messageId: event.messageId,
        trigger,
        matchedCount,
        error: failure.message,
      });
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
  ): Promise<void> {
    if (!state.projectId || !config.troubleshootingEnabled) return;
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
      this.queueStore.recordFailure(state.projectId, {
        uniqueId: `table_poll:${failedAt.toISOString()}`,
        trigger: "table",
        error: failure.message,
      });
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
      manualOnly ? { trigger: "manual" } : undefined,
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
        manualOnly ? { trigger: "manual" } : undefined,
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
    try {
      if (!state.defaultAgent) throw new Error("自动排查项目未配置 Provider 和模型");
      const project = await this.options.projectRegistry.get(state.projectId);
      if (!project || project.archivedAt) throw new Error(`Project ${state.projectId} 不存在`);
      const record = await this.options.recordStore.getRecord({
        config,
        pluginId: this.options.definition.pluginId,
        recordId: item.recordId,
        tableDate: item.tableDate,
      });
      if (!record) throw new Error(`多维表格记录 ${item.recordId} 不存在`);
      await this.options.recordStore.markRunning({
        config,
        pluginId: this.options.definition.pluginId,
        recordId: item.recordId,
        tableDate: item.tableDate,
        claimId: `${this.options.definition.pluginId}:${state.projectId}`,
      });
      await this.updateRuntime(state, {
        status: "troubleshooting",
        activeRecordId: item.recordId,
        lastTrigger: item.trigger,
        lastError: null,
      });
      const workspace = await this.options.createProjectWorkspace(
        project,
        `${this.options.definition.agentTitle} · ${this.now().toLocaleString("zh-CN")}`,
      );
      const prompt = this.buildPrompt(config, state, project, record, item.trigger);
      const identity = this.resolveIdentity(config, state, prompt);
      const created = await this.options.createAgent({
        kind: "mcp",
        provider: formatProviderModel(state.defaultAgent.provider, state.defaultAgent.model),
        cwd: workspace.cwd,
        workspaceId: workspace.workspaceId,
        title: `${this.options.definition.agentTitle} · ${project.customName ?? project.displayName}`,
        initialPrompt: identity.prompt,
        labels: {
          ...identity.labels,
          alertRecordId: item.recordId,
          alertQueueItemId: item.id,
        },
        unattended: true,
        promptFailure: "return-error",
        background: true,
        notifyOnFinish: true,
        internal: true,
      });
      if (created.initialPromptError) throw created.initialPromptError;
      const agentId = created.snapshot.id;
      this.queueStore.attachAgent(state.projectId, item.id, agentId);
      await this.updateRuntime(state, { activeAgentId: agentId });
      const completionResult = await this.options.waitForAgentCompletion?.(agentId);
      const latestTask = this.queueStore.get(state.projectId, item.id);
      if (!latestTask || latestTask.status === "paused") return;
      const completion = this.options.definition.parseCompletion
        ? this.options.definition.parseCompletion(completionResult?.lastMessage)
        : { status: "succeeded" as const, summary: "Agent 执行完成" };
      this.queueStore.complete(state.projectId, item.id, agentId, completion.status);
      if (this.options.definition.parseCompletion && this.options.recordStore.markOutcome) {
        await this.options.recordStore.markOutcome({
          config,
          pluginId: this.options.definition.pluginId,
          recordId: item.recordId,
          tableDate: item.tableDate,
          agentId,
          status: completion.status,
          summary: completion.summary,
          ...(completion.documentUrl ? { documentUrl: completion.documentUrl } : {}),
        });
      } else if (completion.status === "succeeded") {
        await this.options.recordStore.markSucceeded({
          config,
          pluginId: this.options.definition.pluginId,
          recordId: item.recordId,
          tableDate: item.tableDate,
          agentId,
        });
      } else {
        throw new Error(`记录存储不支持写入 ${completion.status} 终态`);
      }
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
      const message = errorMessage(error);
      const latestTask = this.queueStore.get(state.projectId, item.id);
      if (!latestTask || latestTask.status === "paused") {
        await this.updateRuntime(state, {
          status: "idle",
          queuedCount: this.queueStore.countQueued(state.projectId),
          activeRecordId: null,
          activeAgentId: null,
          lastError: null,
        });
        return;
      }
      this.queueStore.fail(state.projectId, item.id, message);
      await this.options.recordStore
        .markFailed({
          config,
          pluginId: this.options.definition.pluginId,
          recordId: item.recordId,
          tableDate: item.tableDate,
          error: message,
        })
        .catch(() => undefined);
      await this.updateRuntime(state, {
        status: "error",
        queuedCount: this.queueStore.countQueued(state.projectId),
        activeRecordId: null,
        activeAgentId: null,
        lastError: message,
      });
    }
  }

  private buildPrompt(
    config: AlertTroubleshooterConfig,
    state: PluginAppState,
    project: PersistedProjectRecord,
    record: AlertTroubleshooterRecord,
    trigger: AlertTroubleshooterQueueTrigger,
  ): string {
    if (!config.promptTemplate.trim()) {
      return this.options.definition.buildDefaultPrompt({ config, trigger, record });
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
    };
    return renderPromptTemplate(config.promptTemplate, variables);
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
