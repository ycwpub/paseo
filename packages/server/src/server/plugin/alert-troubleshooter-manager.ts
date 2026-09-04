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
import { resolveProjectSourceDirectory } from "../project/project-source-directory.js";
import { resolveTeamLeaderCreateContext } from "../team/team-agent-context.js";
import type { TeamStore } from "../team/team-store.js";
import type { PersistedProjectRecord, ProjectRegistry } from "../workspace-registry.js";
import type { PluginService } from "./plugin-service.js";

const SCHEDULER_TICK_MS = 30_000;
const EVENT_DEDUPE_TTL_MS = 24 * 60 * 60_000;

export type AlertTroubleshooterTrigger = "message" | "schedule";

export interface AlertScanWindow {
  start: Date;
  end: Date;
}

export interface AlertTroubleshooterPreparation {
  skip?: boolean;
  context?: string;
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
  prepareRun(input: {
    config: AlertTroubleshooterConfig;
    trigger: AlertTroubleshooterTrigger;
    event?: NormalizedLarkMessageEvent;
    window: AlertScanWindow;
    cwd: string;
  }): Promise<AlertTroubleshooterPreparation>;
  buildPrompt(input: {
    config: AlertTroubleshooterConfig;
    trigger: AlertTroubleshooterTrigger;
    event?: NormalizedLarkMessageEvent;
    preparation: AlertTroubleshooterPreparation;
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
    lastError: base.lastError ?? null,
    activeAgentId: base.activeAgentId ?? null,
    lastTrigger: base.lastTrigger ?? null,
    ...patch,
  };
}

export class ProjectAlertTroubleshooterManager {
  private readonly logger: pino.Logger;
  private readonly activeRuns = new Map<string, Promise<void>>();
  private readonly lastScheduledRun = new Map<string, number>();
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
      createAgent: BoundCreateAgentCommand;
      createProjectWorkspace: (
        project: PersistedProjectRecord,
        title: string,
      ) => Promise<{ workspaceId: string; cwd: string }>;
      logger: pino.Logger;
      now?: () => Date;
    },
  ) {
    this.logger = options.logger.child({ module: options.definition.logModule });
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
        config.botId !== botId ||
        !config.chats.some((chat) => chat.chatId === event.chatId)
      ) {
        continue;
      }
      this.queueRun(state, config, "message", event);
    }
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
      if (!config?.enabled || !config.schedule.enabled || !state.projectId) continue;
      const lastRun = this.lastScheduledRun.get(state.projectId) ?? 0;
      if (now.getTime() - lastRun < config.schedule.intervalMinutes * 60_000) continue;
      this.lastScheduledRun.set(state.projectId, now.getTime());
      this.queueRun(state, config, "schedule");
    }
  }

  private queueRun(
    state: PluginAppState,
    config: AlertTroubleshooterConfig,
    trigger: AlertTroubleshooterTrigger,
    event?: NormalizedLarkMessageEvent,
  ): void {
    if (!state.projectId || this.activeRuns.has(state.projectId)) return;
    const run = this.run(state, config, trigger, event)
      .catch((error) => {
        this.logger.warn(
          { err: error, projectId: state.projectId, trigger },
          "Alert troubleshooting run failed",
        );
      })
      .finally(() => {
        if (state.projectId) this.activeRuns.delete(state.projectId);
      });
    this.activeRuns.set(state.projectId, run);
  }

  private async run(
    state: PluginAppState,
    config: AlertTroubleshooterConfig,
    trigger: AlertTroubleshooterTrigger,
    event?: NormalizedLarkMessageEvent,
  ): Promise<void> {
    if (!state.projectId || !state.defaultAgent) return;
    const now = this.now();
    const project = await this.options.projectRegistry.get(state.projectId);
    if (!project || project.archivedAt) throw new Error(`Project ${state.projectId} 不存在`);
    const source = resolveProjectSourceDirectory({ paseoHome: this.options.paseoHome, project });
    const window =
      trigger === "message"
        ? buildRealtimeAlertScanWindow(now, event?.createTime ?? null)
        : buildScheduledAlertScanWindow(now, config);
    await this.updateRuntime(state, {
      status: "scanning",
      lastScanStartedAt: now.toISOString(),
      lastError: null,
      activeAgentId: null,
      lastTrigger: trigger,
    });
    try {
      const preparation = await this.options.definition.prepareRun({
        config,
        trigger,
        event,
        window,
        cwd: source.path,
      });
      if (preparation.skip) {
        await this.finishWithoutAgent(state, config);
        return;
      }
      await this.updateRuntime(state, { status: "troubleshooting" });
      const workspace = await this.options.createProjectWorkspace(
        project,
        `${this.options.definition.agentTitle} · ${now.toLocaleString("zh-CN")}`,
      );
      const prompt = this.options.definition.buildPrompt({
        config,
        trigger,
        event,
        preparation,
      });
      const identity = this.resolveIdentity(config, state, prompt);
      const created = await this.options.createAgent({
        kind: "mcp",
        provider: formatProviderModel(state.defaultAgent.provider, state.defaultAgent.model),
        cwd: workspace.cwd,
        workspaceId: workspace.workspaceId,
        title: `${this.options.definition.agentTitle} · ${project.customName ?? project.displayName}`,
        initialPrompt: identity.prompt,
        labels: identity.labels,
        unattended: true,
        promptFailure: "return-error",
        background: true,
        notifyOnFinish: true,
        internal: true,
      });
      if (created.initialPromptError) throw created.initialPromptError;
      await this.updateRuntime(state, {
        status: "idle",
        lastScanFinishedAt: this.now().toISOString(),
        nextScanAt: this.nextScanAt(config),
        activeAgentId: created.snapshot.id,
        lastError: null,
      });
    } catch (error) {
      await this.updateRuntime(state, {
        status: "error",
        lastScanFinishedAt: this.now().toISOString(),
        lastError: errorMessage(error),
        activeAgentId: null,
      });
      throw error;
    }
  }

  private nextScanAt(config: AlertTroubleshooterConfig): string | null {
    return config.schedule.enabled
      ? new Date(this.now().getTime() + config.schedule.intervalMinutes * 60_000).toISOString()
      : null;
  }

  private async finishWithoutAgent(
    state: PluginAppState,
    config: AlertTroubleshooterConfig,
  ): Promise<void> {
    await this.updateRuntime(state, {
      status: "idle",
      lastScanFinishedAt: this.now().toISOString(),
      nextScanAt: this.nextScanAt(config),
      activeAgentId: null,
      lastError: null,
    });
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
