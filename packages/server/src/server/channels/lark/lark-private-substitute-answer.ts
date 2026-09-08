import type { AgentManager, AgentManagerEvent } from "../../agent/agent-manager.js";

export const LARK_SUBSTITUTE_SKIP_ANSWER = "<paseo-no-substitute-answer />";

export type PreparedLarkPrivateSubstituteAnswer =
  | { kind: "skip" }
  | { kind: "answer"; text: string };

interface PendingPrivateSubstituteAnswer {
  hasSeenRunning: boolean;
  previousMessage: string | null;
  resolve: (answer: PreparedLarkPrivateSubstituteAnswer) => void;
  reject: (error: Error) => void;
}

export class LarkPrivateSubstituteAnswerWaiter {
  private readonly pending = new Map<string, PendingPrivateSubstituteAnswer>();

  wait(
    agentId: string,
    previousMessage: string | null,
  ): Promise<PreparedLarkPrivateSubstituteAnswer> {
    return new Promise((resolve, reject) => {
      this.pending.set(agentId, {
        hasSeenRunning: false,
        previousMessage,
        resolve,
        reject,
      });
    });
  }

  cancel(agentId: string, error: Error): void {
    const pending = this.pending.get(agentId);
    if (!pending) return;
    this.pending.delete(agentId);
    pending.reject(error);
  }

  async handle(
    event: AgentManagerEvent,
    agentManager: Pick<AgentManager, "getLastAssistantMessage">,
  ): Promise<boolean> {
    if (event.type !== "agent_state") return false;
    const pending = this.pending.get(event.agent.id);
    if (!pending) return false;
    if (event.agent.lifecycle === "running") {
      pending.hasSeenRunning = true;
      return true;
    }
    if (event.agent.lifecycle === "error") {
      this.pending.delete(event.agent.id);
      pending.reject(new Error(event.agent.lastError ?? "Paseo agent failed."));
      return true;
    }
    if (event.agent.lifecycle === "closed") {
      this.pending.delete(event.agent.id);
      pending.reject(new Error("Agent 已关闭，未生成替身回答"));
      return true;
    }
    if (event.agent.lifecycle !== "idle" || !pending.hasSeenRunning) return true;

    this.pending.delete(event.agent.id);
    let message: string | null;
    try {
      message = await agentManager.getLastAssistantMessage(event.agent.id);
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
      return true;
    }
    if (!message || message === pending.previousMessage) {
      pending.reject(new Error("Agent 未生成替身回答"));
      return true;
    }
    if (message.trim() === LARK_SUBSTITUTE_SKIP_ANSWER) {
      pending.resolve({ kind: "skip" });
      return true;
    }
    pending.resolve({ kind: "answer", text: message });
    return true;
  }
}
