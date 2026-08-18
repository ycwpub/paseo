import type pino from "pino";
import { z } from "zod";
import type { PaseoMemoryState, PaseoMemoryUpdateInput } from "@getpaseo/protocol/messages";
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
import { retrieveRelevantMemoryDetails } from "./memory-retrieval.js";
import { isSafeMemoryContent } from "./memory-safety.js";
import { PaseoMemoryStore } from "./memory-store.js";

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
      }),
    )
    .max(8),
});

interface TurnContent {
  prompt: string;
  answer: string;
}

export interface PaseoMemoryServiceOptions {
  store: PaseoMemoryStore;
  agentManager: AgentManager;
  providerSnapshotManager: Pick<ProviderSnapshotManager, "listProviders">;
  readDaemonConfig: () => StructuredGenerationDaemonConfig;
  logger: pino.Logger;
  onChanged?: (state: PaseoMemoryState) => void;
}

export class PaseoMemoryService implements AgentPromptContextComposer {
  private readonly store: PaseoMemoryStore;
  private readonly agentManager: AgentManager;
  private readonly providerSnapshotManager: Pick<ProviderSnapshotManager, "listProviders">;
  private readonly readDaemonConfig: () => StructuredGenerationDaemonConfig;
  private readonly logger: pino.Logger;
  private readonly onChanged: (state: PaseoMemoryState) => void;
  private readonly queuedTurns = new Set<string>();
  private extractionQueue = Promise.resolve();
  private pendingExtractions = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(options: PaseoMemoryServiceOptions) {
    this.store = options.store;
    this.agentManager = options.agentManager;
    this.providerSnapshotManager = options.providerSnapshotManager;
    this.readDaemonConfig = options.readDaemonConfig;
    this.logger = options.logger.child({ module: "memory-service" });
    this.onChanged = options.onChanged ?? (() => undefined);
  }

  start(): void {
    if (this.unsubscribe) {
      return;
    }
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
    const state = this.store.getState();
    if (!state.settings.enabled) {
      return prompt;
    }
    const promptText =
      typeof prompt === "string"
        ? prompt
        : prompt
            .filter(
              (block): block is Extract<(typeof prompt)[number], { type: "text" }> =>
                block.type === "text",
            )
            .map((block) => block.text)
            .join("\n");
    const relevant = retrieveRelevantMemoryDetails(promptText, state.details, {
      limit: state.settings.maxRetrievedDetails,
    });
    this.store.markAccessed(relevant.map((detail) => detail.id));
    return composePromptWithMemory(prompt, state);
  }

  private handleAgentEvent(event: AgentManagerEvent): void {
    if (event.type !== "agent_stream" || event.event.type !== "turn_completed") {
      return;
    }
    const agent = this.agentManager.getAgent(event.agentId);
    if (!agent || agent.internal) {
      return;
    }
    const settings = this.store.getState().settings;
    if (!settings.enabled || !settings.autoExtract) {
      return;
    }
    const turnKey = `${event.agentId}:${event.event.turnId ?? event.timestamp ?? agent.updatedAt.toISOString()}`;
    if (this.queuedTurns.has(turnKey)) {
      return;
    }
    this.queuedTurns.add(turnKey);
    this.pendingExtractions += 1;
    this.store.setPendingExtractions(this.pendingExtractions);
    this.onChanged(this.store.getState());
    this.extractionQueue = this.extractionQueue
      .then(() => this.extractTurn(event.agentId))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
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

  private async extractTurn(agentId: string): Promise<void> {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent || agent.internal) {
      return;
    }
    const state = this.store.getState();
    if (!state.settings.enabled || !state.settings.autoExtract) {
      return;
    }
    const turn = latestTurnContent(this.agentManager.getTimeline(agentId));
    if (!turn) {
      return;
    }
    const related = retrieveRelevantMemoryDetails(`${turn.prompt}\n${turn.answer}`, state.details, {
      limit: 4,
    });
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
    if (providers.length === 0) {
      throw new Error("No available provider can extract memory");
    }
    const result = await generateStructuredAgentResponseWithFallback({
      manager: this.agentManager,
      cwd: agent.cwd,
      prompt: buildExtractionPrompt(turn, related),
      schema: ExtractedMemorySchema,
      schemaName: "PaseoMemoryExtraction",
      maxRetries: 1,
      providers,
      persistSession: false,
      logger: this.logger,
      agentConfigOverrides: {
        title: "Paseo memory extractor",
        internal: true,
      },
    });
    for (const memory of result.memories) {
      if (memory.confidence < 0.65 || !isSafeMemoryContent(memory.content)) {
        continue;
      }
      this.store.upsertExtractedMemory({
        ...memory,
        sourceAgentId: agentId,
      });
    }
    if (result.memories.length > 0) {
      this.onChanged(this.store.getState());
    }
  }
}

function latestTurnContent(timeline: readonly AgentTimelineItem[]): TurnContent | null {
  const answerChunks: string[] = [];
  let prompt: string | null = null;
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const item = timeline[index];
    if (item.type === "assistant_message" && prompt === null) {
      answerChunks.unshift(item.text);
      continue;
    }
    if (item.type === "user_message") {
      if (isSystemInjectedEnvelope(item.text)) {
        return null;
      }
      prompt = stripMemoryFromPromptText(item.text).trim();
      break;
    }
  }
  const answer = answerChunks.join("").trim();
  if (!prompt || !answer) {
    return null;
  }
  return { prompt, answer };
}

function buildExtractionPrompt(
  turn: TurnContent,
  related: readonly PaseoMemoryState["details"][number][],
): string {
  const existing = related.length
    ? related
        .map(
          (detail) =>
            `- id=${detail.id}; title=${detail.title}; category=${detail.category}\n${detail.content}`,
        )
        .join("\n\n")
    : "(none)";
  return [
    "Extract durable, user-useful long-term memories from the completed Paseo conversation.",
    "Return an empty memories array when the turn has no durable information.",
    "Store explicit preferences, stable facts, recurring procedures, project conventions, and confirmed decisions or outcomes.",
    "Do not store credentials, tokens, secrets, sensitive inferred attributes, hidden reasoning, raw logs, temporary errors, speculative claims, or one-off requests.",
    "Consolidate with a related memory by returning its id. Keep each memory concise and independently useful.",
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

export function describeMemoryExtractionError(error: unknown): string {
  if (error instanceof StructuredAgentFallbackError) {
    return error.attempts.map((attempt) => attempt.error ?? "unavailable").join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}
