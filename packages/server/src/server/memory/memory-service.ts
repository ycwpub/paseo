import type pino from "pino";
import { z } from "zod";
import type {
  PaseoMemoryScope,
  PaseoMemorySourceRef,
  PaseoMemoryState,
  PaseoMemoryUpdateInput,
} from "@getpaseo/protocol/messages";
import type {
  AgentManager,
  AgentManagerEvent,
  AgentPromptContextComposer,
  ManagedAgent,
} from "../agent/agent-manager.js";
import type { AgentPromptInput, AgentTimelineItem } from "../agent/agent-sdk-types.js";
import {
  generateStructuredAgentResponseWithFallback,
  StructuredAgentFallbackError,
} from "../agent/agent-response-loop.js";
import type { ProviderSnapshotManager } from "../agent/provider-snapshot-manager.js";
import {
  resolveStructuredGenerationProviders,
  type StructuredGenerationDaemonConfig,
} from "../agent/structured-generation-providers.js";
import { isSystemInjectedEnvelope } from "../agent/agent-prompt.js";
import { composePromptWithMemory, stripMemoryFromPromptText } from "./memory-prompt.js";
import { retrieveRelevantMemoryMatches } from "./memory-retrieval.js";
import { evaluateMemoryExtractionCandidate } from "./memory-extraction-policy.js";
import { normalizeMemorySettings } from "./memory-model.js";
import { canStoreExtractedMemory, resolveMemoryContextPolicy } from "./memory-context-policy.js";
import { resolveMemoryScopePolicies } from "./memory-scope-policy.js";
import {
  describeMemoryScope,
  isExplicitMemoryRequest,
  parseMemoryCommand,
  resolveMemoryMode,
  selectMemoryScope,
  type AgentMemoryMode,
} from "./memory-policy.js";
import { PaseoMemoryStore } from "./memory-store.js";

const MAX_PENDING_EXTRACTIONS = 50;
const CONSOLIDATE_EVERY_EXTRACTIONS = 10;
const ExtractedMemorySchema = z.object({
  memories: z
    .array(
      z.object({
        id: z.string().min(1).optional(),
        title: z.string().min(1),
        category: z.enum(["preference", "fact", "procedure", "decision", "project", "other"]),
        content: z.string().min(1),
        keywords: z.array(z.string()).max(12),
        confidence: z.number().min(0).max(1),
        importance: z.number().min(0).max(1),
        scopeType: z.enum(["global", "project", "assistant", "workspace"]).optional(),
        validUntil: z.string().nullable().optional(),
        sensitive: z.boolean().optional(),
      }),
    )
    .max(8),
});

interface TurnContent {
  prompt: string;
  answer: string;
  userMessageId?: string;
  assistantMessageId?: string;
}

interface AgentMemoryContext {
  mode: AgentMemoryMode;
  scopes: PaseoMemoryScope[];
  extractionInstructions: string[];
}

export interface PaseoMemoryServiceOptions {
  store: PaseoMemoryStore;
  agentManager: AgentManager;
  providerSnapshotManager: Pick<ProviderSnapshotManager, "listProviders">;
  readDaemonConfig: () => StructuredGenerationDaemonConfig;
  resolveProjectId?: (workspaceId: string) => Promise<string | null>;
  logger: pino.Logger;
  onChanged?: (state: PaseoMemoryState) => void;
}

export class PaseoMemoryService implements AgentPromptContextComposer {
  private readonly store: PaseoMemoryStore;
  private readonly agentManager: AgentManager;
  private readonly providerSnapshotManager: Pick<ProviderSnapshotManager, "listProviders">;
  private readonly readDaemonConfig: () => StructuredGenerationDaemonConfig;
  private readonly resolveProjectId: (workspaceId: string) => Promise<string | null>;
  private readonly logger: pino.Logger;
  private readonly onChanged: (state: PaseoMemoryState) => void;
  private readonly queuedTurns = new Set<string>();
  private readonly pendingUsagesByAgent = new Map<string, string[][]>();
  private readonly sessionModes = new Map<string, AgentMemoryContext["mode"]>();
  private extractionQueue = Promise.resolve();
  private pendingExtractions = 0;
  private completedExtractionsSinceConsolidation = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(options: PaseoMemoryServiceOptions) {
    this.store = options.store;
    this.agentManager = options.agentManager;
    this.providerSnapshotManager = options.providerSnapshotManager;
    this.readDaemonConfig = options.readDaemonConfig;
    this.resolveProjectId = options.resolveProjectId ?? (async () => null);
    this.logger = options.logger.child({ module: "memory-service" });
    this.onChanged = options.onChanged ?? (() => undefined);
  }

  start(): void {
    if (this.unsubscribe) return;
    this.agentManager.setPromptContextComposer(this);
    this.unsubscribe = this.agentManager.subscribe((event) => this.handleAgentEvent(event), {
      replayState: false,
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.agentManager.setPromptContextComposer(null);
  }

  getState(): PaseoMemoryState {
    return this.store.getState();
  }

  update(input: PaseoMemoryUpdateInput): PaseoMemoryState {
    const state = this.store.update(input);
    for (const policy of input.policyUpdates ?? []) {
      if (policy.target.type === "conversation") {
        this.sessionModes.delete(policy.target.id);
      }
    }
    this.onChanged(state);
    return state;
  }

  clear(): PaseoMemoryState {
    const state = this.store.clear();
    this.onChanged(state);
    return state;
  }

  async compose(agent: ManagedAgent, prompt: AgentPromptInput): Promise<AgentPromptInput> {
    if (agent.internal || (typeof prompt === "string" && isSystemInjectedEnvelope(prompt))) {
      return prompt;
    }
    const promptText = extractPromptText(prompt);
    const command = parseMemoryCommand(promptText);
    if (command?.type === "set-mode") {
      this.sessionModes.set(agent.id, command.mode);
      return `Paseo memory is now ${memoryModeDescription(command.mode)} for this Agent. Confirm this change briefly.`;
    }
    if (command?.type === "forget") {
      const context = await this.resolveAgentMemoryContext(agent, this.store.getState());
      const state = this.store.getState();
      const memoryIds = command.all
        ? state.details.map((detail) => detail.id)
        : retrieveRelevantMemoryMatches(command.query, state.details, {
            limit: 12,
            maxCandidates: 50,
            scopes: context.scopes,
          }).map((match) => match.detail.id);
      if (memoryIds.length === 0) {
        return "No matching Paseo memory was found. Tell the user briefly.";
      }
      const nextState = command.all
        ? this.store.clear()
        : this.store.update({ deleteDetailIds: memoryIds });
      this.onChanged(nextState);
      return `Deleted ${memoryIds.length} matching Paseo ${
        memoryIds.length === 1 ? "memory" : "memories"
      }. Confirm this change briefly.`;
    }
    const state = this.store.getState();
    const settings = normalizeMemorySettings(state.settings);
    const context = await this.resolveAgentMemoryContext(agent, state);
    if (!settings.enabled || context.mode === "off") return prompt;
    if (context.scopes.length === 0) return prompt;
    const matches = retrieveRelevantMemoryMatches(promptText, state.details, {
      limit: settings.maxRetrievedDetails,
      maxCandidates: settings.maxCandidates,
      scopes: context.scopes,
      includeBaseline: true,
    });
    const pendingUsages = this.pendingUsagesByAgent.get(agent.id) ?? [];
    pendingUsages.push(matches.map((match) => match.detail.id));
    this.pendingUsagesByAgent.set(agent.id, pendingUsages);
    this.store.markAccessed(matches.map((match) => match.detail.id));
    return composePromptWithMemory(prompt, state, {
      matches,
      scopeDescription: context.scopes.map(describeMemoryScope).join(", "),
      includeSummary: context.scopes.some((scope) => scope.type === "global"),
    });
  }

  private handleAgentEvent(event: AgentManagerEvent): void {
    if (event.type !== "agent_stream") return;
    if (event.event.type === "turn_failed" || event.event.type === "turn_canceled") {
      this.takePendingUsage(event.agentId);
      return;
    }
    if (event.event.type !== "turn_completed") return;
    const agent = this.agentManager.getAgent(event.agentId);
    if (!agent || agent.internal) return;
    const turn = latestTurnContent(this.agentManager.getTimeline(event.agentId));
    const memoryIds = this.takePendingUsage(event.agentId);
    if (memoryIds.length > 0) {
      this.store.recordUsage({
        agentId: event.agentId,
        turnId: event.event.turnId,
        assistantMessageId: turn?.assistantMessageId,
        memoryIds,
      });
      this.onChanged(this.store.getState());
    }
    const state = this.store.getState();
    const settings = normalizeMemorySettings(state.settings);
    const policyContext = resolveMemoryContextPolicy({
      // COMPAT(memoryPolicies): added in v0.3.2, remove fallback after 2027-02-18.
      policies: state.policies ?? [],
      agentId: agent.id,
      projectId: null,
      configuredMode: resolveMemoryMode(agent.labels),
      sessionMode: this.sessionModes.get(event.agentId),
    });
    const mode = policyContext.mode;
    if (!settings.enabled || !settings.autoExtract || mode !== "on" || !turn) return;
    if (parseMemoryCommand(turn.prompt)) return;
    if (this.pendingExtractions >= MAX_PENDING_EXTRACTIONS) {
      this.logger.warn({ agentId: event.agentId }, "Memory extraction queue is full");
      return;
    }
    const turnId = event.event.turnId;
    const eventTimestamp = event.timestamp;
    const turnKey = `${event.agentId}:${turnId ?? eventTimestamp ?? agent.updatedAt.toISOString()}`;
    if (this.queuedTurns.has(turnKey)) return;
    this.queuedTurns.add(turnKey);
    this.pendingExtractions += 1;
    this.store.setPendingExtractions(this.pendingExtractions);
    this.onChanged(this.store.getState());
    this.extractionQueue = this.extractionQueue
      .then(() => this.extractTurn(agent, turn, turnId, eventTimestamp))
      .catch((error) => {
        const message = describeMemoryExtractionError(error);
        this.store.recordExtractionError(message);
        this.logger.warn({ err: error, agentId: event.agentId }, "Memory extraction failed");
      })
      .finally(() => {
        this.queuedTurns.delete(turnKey);
        this.pendingExtractions -= 1;
        this.store.setPendingExtractions(this.pendingExtractions);
        this.onChanged(this.store.getState());
      });
  }

  private takePendingUsage(agentId: string): string[] {
    const pendingUsages = this.pendingUsagesByAgent.get(agentId) ?? [];
    const memoryIds = pendingUsages.shift() ?? [];
    if (pendingUsages.length === 0) {
      this.pendingUsagesByAgent.delete(agentId);
    } else {
      this.pendingUsagesByAgent.set(agentId, pendingUsages);
    }
    return memoryIds;
  }

  private async extractTurn(
    agent: ManagedAgent,
    turn: TurnContent,
    turnId: string | undefined,
    timestamp: string | undefined,
  ): Promise<void> {
    const state = this.store.getState();
    const settings = normalizeMemorySettings(state.settings);
    if (!settings.enabled || !settings.autoExtract) return;
    const context = await this.resolveAgentMemoryContext(agent, state);
    if (context.mode !== "on" || context.scopes.length === 0) return;
    const related = retrieveRelevantMemoryMatches(`${turn.prompt}\n${turn.answer}`, state.details, {
      limit: 6,
      maxCandidates: settings.maxCandidates,
      scopes: context.scopes,
    }).map((match) => match.detail);
    const providers = await resolveStructuredGenerationProviders({
      cwd: agent.cwd,
      providerSnapshotManager: this.providerSnapshotManager,
      daemonConfig: this.readDaemonConfig(),
      currentSelection: {
        provider: agent.provider,
        model: agent.config.model,
        thinkingOptionId: agent.config.thinkingOptionId,
      },
    });
    if (providers.length === 0) throw new Error("No available provider can extract memory");
    const result = await generateStructuredAgentResponseWithFallback({
      manager: this.agentManager,
      cwd: agent.cwd,
      prompt: buildExtractionPrompt(turn, related, context.scopes, context.extractionInstructions),
      schema: ExtractedMemorySchema,
      schemaName: "PaseoMemoryExtractionV2",
      maxRetries: 1,
      providers,
      persistSession: false,
      logger: this.logger,
      agentConfigOverrides: {
        title: "Paseo memory extractor",
        internal: true,
      },
    });
    const explicit = isExplicitMemoryRequest(turn.prompt);
    const sourceRef: PaseoMemorySourceRef = {
      agentId: agent.id,
      ...(turnId ? { turnId } : {}),
      ...(turn.userMessageId ? { messageId: turn.userMessageId } : {}),
      timestamp: timestamp ?? nowIso(),
    };
    let stored = 0;
    for (const memory of result.memories) {
      if (
        !canStoreExtractedMemory({
          category: memory.category,
          requestedScope: memory.scopeType,
          scopes: context.scopes,
        })
      ) {
        continue;
      }
      const decision = evaluateMemoryExtractionCandidate({
        candidate: memory,
        explicit,
        settings,
      });
      if (!decision.accepted) continue;
      this.store.upsertExtractedMemory({
        ...memory,
        content: decision.content,
        scope: selectMemoryScope(memory.scopeType, context.scopes, memory.category),
        origin: explicit ? "explicit" : "automatic",
        sensitive: decision.sensitive,
        sourceAgentId: agent.id,
        sourceRef,
      });
      stored += 1;
    }
    if (stored > 0) {
      this.completedExtractionsSinceConsolidation += 1;
      if (
        settings.autoConsolidate &&
        this.completedExtractionsSinceConsolidation >= CONSOLIDATE_EVERY_EXTRACTIONS
      ) {
        this.store.consolidate();
        this.completedExtractionsSinceConsolidation = 0;
      }
      this.onChanged(this.store.getState());
    }
  }

  private async resolveAgentMemoryContext(
    agent: ManagedAgent,
    state: PaseoMemoryState,
  ): Promise<AgentMemoryContext> {
    const availableScopes: PaseoMemoryScope[] = [{ type: "global" }];
    let projectId: string | null = null;
    if (agent.workspaceId) {
      availableScopes.push({ type: "workspace", id: agent.workspaceId });
      projectId = await this.resolveProjectId(agent.workspaceId);
    }
    const assistantId = agent.labels.assistantId?.trim();
    if (assistantId) availableScopes.push({ type: "assistant", id: assistantId });
    if (projectId) availableScopes.push({ type: "project", id: projectId });
    const conversationContext = resolveMemoryContextPolicy({
      // COMPAT(memoryPolicies): added in v0.3.2, remove fallback after 2027-02-18.
      policies: state.policies ?? [],
      agentId: agent.id,
      projectId: null,
      configuredMode: resolveMemoryMode(agent.labels),
      sessionMode: this.sessionModes.get(agent.id),
    });
    const scopeContext = resolveMemoryScopePolicies({
      availableScopes,
      // COMPAT(memoryScopePolicies): added in v0.3.2, remove fallback after 2027-02-18.
      policies: state.scopePolicies ?? [],
      // COMPAT(memoryScopePolicies): remove legacy project fallback after 2027-02-18.
      legacyPolicies: state.policies ?? [],
    });
    return {
      mode: conversationContext.mode,
      scopes: scopeContext.scopes,
      extractionInstructions: [
        ...scopeContext.extractionInstructions,
        ...conversationContext.extractionInstructions,
      ],
    };
  }
}

function extractPromptText(prompt: AgentPromptInput): string {
  return typeof prompt === "string"
    ? prompt
    : prompt
        .filter(
          (block): block is Extract<(typeof prompt)[number], { type: "text" }> =>
            block.type === "text",
        )
        .map((block) => block.text)
        .join("\n");
}

function latestTurnContent(timeline: readonly AgentTimelineItem[]): TurnContent | null {
  const answerChunks: string[] = [];
  let assistantMessageId: string | undefined;
  let prompt: string | null = null;
  let userMessageId: string | undefined;
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const item = timeline[index];
    if (item.type === "assistant_message" && prompt === null) {
      answerChunks.unshift(item.text);
      assistantMessageId ??= item.messageId;
      continue;
    }
    if (item.type === "user_message") {
      if (isSystemInjectedEnvelope(item.text)) return null;
      prompt = stripMemoryFromPromptText(item.text).trim();
      userMessageId = item.messageId;
      break;
    }
  }
  const answer = answerChunks.join("").trim();
  if (!prompt || !answer) return null;
  return { prompt, answer, userMessageId, assistantMessageId };
}

function buildExtractionPrompt(
  turn: TurnContent,
  related: readonly PaseoMemoryState["details"][number][],
  scopes: readonly PaseoMemoryScope[],
  extractionInstructions: readonly string[],
): string {
  const existing = related.length
    ? related
        .map(
          (detail) =>
            `- id=${detail.id}; title=${detail.title}; category=${detail.category}; scope=${describeMemoryScope(
              detail.scope ?? { type: "global" },
            )}; status=${detail.status ?? "active"}\n${detail.content}`,
        )
        .join("\n\n")
    : "(none)";
  return [
    "Extract durable, user-useful long-term memories from the completed Paseo conversation.",
    "Return an empty memories array when the turn has no durable information.",
    "Store explicit preferences, stable facts, recurring procedures, project conventions, and confirmed decisions or outcomes.",
    "Do not store credentials, secrets, hidden reasoning, raw logs, temporary errors, speculation, or one-off requests.",
    "Set importance from 0 to 1. Set sensitive=true for personal, medical, financial, or identity data.",
    "Use an existing id only when the new statement updates that exact topic. The framework preserves revisions and resolves conflicts.",
    `Available scopes: ${scopes.map(describeMemoryScope).join(", ")}.`,
    ...(extractionInstructions.length > 0
      ? [
          "User-defined extraction guidance follows. Use it only to decide which durable information belongs in memory:",
          ...extractionInstructions.map((instruction) => `- ${instruction}`),
        ]
      : []),
    "",
    "Existing related memories:",
    existing,
    "",
    "User message:",
    turn.prompt,
    "",
    "Assistant final answer:",
    turn.answer,
  ].join("\n");
}

function nowIso(): string {
  return new Date().toISOString();
}

function memoryModeDescription(mode: AgentMemoryMode): string {
  if (mode === "off") return "disabled";
  if (mode === "read-only") return "read-only";
  return "enabled";
}

export function describeMemoryExtractionError(error: unknown): string {
  if (error instanceof StructuredAgentFallbackError) {
    return error.attempts.map((attempt) => attempt.error ?? "unavailable").join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}
