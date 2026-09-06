import type pino from "pino";
import type {
  AlertTroubleshooterConfig,
  AlertTroubleshooterRuntime,
  PluginAppState,
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

const SCHEDULER_TICK_MS = 30_000;
const EVENT_DEDUPE_TTL_MS = 24 * 60 * 60_000;
const TABLE_POLL_BATCH_SIZE = 20;
const TEMPLATE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu;

export type AlertTroubleshooterTrigger = AlertTroubleshooterQueueTrigger;

export interface AlertScanWindow {
  start: Date;
  end: Date;
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
  }): Promise<NormalizedLarkMessageEvent[]>;
  buildDefaultPrompt(input: {
    config: AlertTroubleshooterConfig;
    trigger: AlertTroubleshooterTrigger;
    record: AlertTroubleshooterRecord;
  }): string;
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
  return result.ok ? { ...result.config?.project?.variables } : {};
}

export class ProjectAlertTroubleshooterManager {
  private readonly logger: pino.Logger;
  private readonly queueStore: AlertTroubleshooterQueueStore;
  private readonly activeRuns = new Map<string, Promise<void>>();
  private readonly lastScheduledRun = new Map<string, number>();
  private readonly lastTablePoll = new Map<string, number>();
  private readonly observedMessageIds = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;

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
      waitForAgentCompletion?: (agentId: string) => Promise<void>;
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
    void this.tick();
    this.timer = setInterval(() => void this.tick(), SCHEDULER_TICK_MS);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
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

  async enqueueRecord(projectId: string, recordId: string): Promise<boolean> {
    const state = this.listConfiguredProjects().find(
      (candidate) => candidate.projectId === projectId,
    );
    if (!state) throw new Error(`Project ${projectId} 未配置该自动排查插件`);
    const config = this.readConfig(state);
    if (!config?.enabled) throw new Error("自动排查未启用");
    const normalizedRecordId = recordId.trim();
    if (!normalizedRecordId) throw new Error("请输入多维表格记录 ID");
    const record = await this.options.recordStore.getRecord({
      config,
      recordId: normalizedRecordId,
    });
    if (!record) throw new Error(`未找到多维表格记录 ${normalizedRecordId}`);
    this.queueStore.enqueue(projectId, {
      recordId: record.recordId,
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

  private async tick(): Promise<void> {
    const now = this.now();
    for (const state of this.listConfiguredProjects()) {
      const config = this.readConfig(state);
      if (!config?.enabled || !state.projectId) continue;
      try {
        if (config.schedule.enabled && this.isScanDue(state.projectId, config, now)) {
          this.lastScheduledRun.set(state.projectId, now.getTime());
          await this.scanProject(state, config, now);
        }
        if (
          config.troubleshootingEnabled &&
          this.queueStore.countQueued(state.projectId) === 0 &&
          this.isTablePollDue(state.projectId, config, now)
        ) {
          this.lastTablePoll.set(state.projectId, now.getTime());
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

  private isScanDue(projectId: string, config: AlertTroubleshooterConfig, now: Date): boolean {
    const lastRun = this.lastScheduledRun.get(projectId) ?? 0;
    return now.getTime() - lastRun >= config.schedule.intervalMinutes * 60_000;
  }

  private isTablePollDue(projectId: string, config: AlertTroubleshooterConfig, now: Date): boolean {
    const lastPoll = this.lastTablePoll.get(projectId) ?? 0;
    return now.getTime() - lastPoll >= config.queuePollIntervalMinutes * 60_000;
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
    const events = await this.options.definition.scanMessages({
      config,
      window: buildScheduledAlertScanWindow(now, config),
      cwd: source.path,
    });
    for (const event of events) {
      await this.ingestMessage(state, config, "schedule", event);
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
  ): Promise<void> {
    if (!state.projectId) return;
    await this.updateRuntime(state, { status: "ingesting", lastError: null, lastTrigger: trigger });
    const record = await this.options.recordStore.upsertMessage({
      config,
      projectId: state.projectId,
      pluginId: this.options.definition.pluginId,
      trigger,
      event,
    });
    this.queueStore.enqueue(state.projectId, {
      recordId: record.recordId,
      messageId: record.messageId,
      trigger,
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
    await this.updateRuntime(state, { status: "polling", lastError: null });
    const records = await this.options.recordStore.listUnclaimed({
      config,
      projectId: state.projectId,
      pluginId: this.options.definition.pluginId,
      limit: TABLE_POLL_BATCH_SIZE,
    });
    for (const record of records) {
      this.queueStore.enqueue(state.projectId, {
        recordId: record.recordId,
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
        recordId: item.recordId,
      });
      if (!record) throw new Error(`多维表格记录 ${item.recordId} 不存在`);
      await this.options.recordStore.markRunning({
        config,
        recordId: item.recordId,
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
      await this.updateRuntime(state, { activeAgentId: agentId });
      await this.options.waitForAgentCompletion?.(agentId);
      this.queueStore.complete(state.projectId, item.id, agentId);
      await this.options.recordStore.markSucceeded({
        config,
        recordId: item.recordId,
        agentId,
      });
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
      this.queueStore.fail(state.projectId, item.id, message);
      await this.options.recordStore
        .markFailed({ config, recordId: item.recordId, error: message })
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
      projectId: state.projectId ?? "",
      projectName: project.customName ?? project.displayName,
      projectDirectory: resolveProjectSourceDirectory({
        paseoHome: this.options.paseoHome,
        project,
      }).path,
      pluginId: this.options.definition.pluginId,
      appId: this.options.definition.appId,
      recordId: record.recordId,
      messageId: record.messageId ?? "",
      chatId: record.chatId ?? "",
      chatName: record.chatName ?? "",
      messageText: record.messageText,
      messageTime: record.messageTime ?? "",
      trigger,
      troubleshootingSopDoc: config.troubleshootingSopDoc,
      attributionRecordRoot: config.attributionRecordRoot,
      recordTableUrl: config.recordTableUrl,
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
