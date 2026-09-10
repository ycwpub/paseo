import type { LarkSubstituteTask } from "@getpaseo/protocol/messages";
import type { AgentManagerEvent } from "../../agent/agent-manager.js";
import type { AgentStreamEvent } from "../../agent/agent-sdk-types.js";

interface PendingLarkSubstituteRedelivery {
  clientMessageId: string;
  turnId: string | null;
  deliveryVersion: number;
}

export interface LarkSubstituteAgentRedeliveryDependencies {
  listTasks(): readonly LarkSubstituteTask[];
  getLastAssistantMessage(agentId: string): Promise<string | null>;
  send(agentId: string, text: string): Promise<unknown>;
  warn(input: Record<string, unknown>, message: string): void;
  error(input: Record<string, unknown>, message: string): void;
}

const CHINESE_REDELIVERY_PATTERNS = [
  /(?:重新|再次|再|重发|补发|改发).{0,24}(?:飞书|原(?:用户|话题|消息)|用户|话题)/u,
  /(?:通过|发到|发送到).{0,12}飞书/u,
  /(?:发送|发给|回复给|回复).{0,12}(?:原用户|用户|原话题|飞书)/u,
] as const;

const ENGLISH_REDELIVERY_PATTERN =
  /\b(?:re-?send|send again|reply again|send|reply)\b.{0,48}\b(?:lark|feishu|original user|user|thread)\b/iu;

export function isLarkSubstituteRedeliveryRequest(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (/<(?:lark_substitute_trigger|lark_message|paseo_system_message)\b/iu.test(normalized)) {
    return false;
  }
  return (
    CHINESE_REDELIVERY_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    ENGLISH_REDELIVERY_PATTERN.test(normalized)
  );
}

function taskForAgent(
  tasks: readonly LarkSubstituteTask[],
  agentId: string,
): LarkSubstituteTask | null {
  return (
    tasks
      .filter((task) => task.agentId === agentId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
  );
}

export class LarkSubstituteAgentRedelivery {
  private readonly pending = new Map<string, PendingLarkSubstituteRedelivery>();
  private readonly deliveryVersions = new Map<string, number>();
  private eventQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: LarkSubstituteAgentRedeliveryDependencies) {}

  noteDelivered(agentId: string): void {
    this.deliveryVersions.set(agentId, (this.deliveryVersions.get(agentId) ?? 0) + 1);
  }

  handle(event: AgentManagerEvent): Promise<void> {
    this.eventQueue = this.eventQueue
      .then(() => this.process(event))
      .catch((error: unknown) => {
        this.dependencies.error(
          { err: error },
          "Failed to process a Lark substitute redelivery event",
        );
      });
    return this.eventQueue;
  }

  private async process(event: AgentManagerEvent): Promise<void> {
    if (event.type !== "agent_stream") return;
    switch (event.event.type) {
      case "timeline":
        await this.handleTimeline(event.agentId, event.event);
        return;
      case "turn_failed":
      case "turn_canceled":
        this.handleAbortedTurn(event.agentId, event.event);
        return;
      case "turn_completed":
        await this.handleCompletedTurn(event.agentId, event.event);
        return;
      default:
        return;
    }
  }

  private handleTimeline(
    agentId: string,
    event: Extract<AgentStreamEvent, { type: "timeline" }>,
  ): void {
    if (event.item.type !== "user_message") return;
    const { item } = event;
    if (!item.clientMessageId || !isLarkSubstituteRedeliveryRequest(item.text)) return;
    if (!taskForAgent(this.dependencies.listTasks(), agentId)) return;
    this.pending.set(agentId, {
      clientMessageId: item.clientMessageId,
      turnId: event.turnId ?? null,
      deliveryVersion: this.deliveryVersions.get(agentId) ?? 0,
    });
  }

  private handleAbortedTurn(
    agentId: string,
    event: Extract<AgentStreamEvent, { type: "turn_failed" | "turn_canceled" }>,
  ): void {
    const pending = this.pending.get(agentId);
    if (!pending || (pending.turnId && pending.turnId !== event.turnId)) return;
    this.pending.delete(agentId);
  }

  private async handleCompletedTurn(
    agentId: string,
    event: Extract<AgentStreamEvent, { type: "turn_completed" }>,
  ): Promise<void> {
    const pending = this.pending.get(agentId);
    if (!pending || (pending.turnId && pending.turnId !== event.turnId)) return;
    this.pending.delete(agentId);
    if ((this.deliveryVersions.get(agentId) ?? 0) !== pending.deliveryVersion) {
      return;
    }

    const message = await this.dependencies.getLastAssistantMessage(agentId);
    if (!message) {
      this.dependencies.warn(
        {
          agentId,
          clientMessageId: pending.clientMessageId,
          turnId: event.turnId,
        },
        "Skipping Lark substitute redelivery because the Agent has no answer",
      );
      return;
    }

    try {
      await this.dependencies.send(agentId, message);
    } catch (error) {
      this.dependencies.error(
        {
          err: error,
          agentId,
          clientMessageId: pending.clientMessageId,
          turnId: event.turnId,
        },
        "Failed to redeliver a substitute Agent answer to Lark",
      );
    }
  }
}
