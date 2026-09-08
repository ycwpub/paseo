import { describe, expect, test, vi } from "vitest";
import type { AgentManager } from "../../agent/agent-manager.js";
import {
  LARK_SUBSTITUTE_SKIP_ANSWER,
  LarkPrivateSubstituteAnswerWaiter,
} from "./lark-private-substitute-answer.js";

function agentState(id: string, lifecycle: "idle" | "running" | "error", lastError?: string) {
  return {
    type: "agent_state" as const,
    agent: {
      id,
      lifecycle,
      lastError,
    },
  } as Parameters<LarkPrivateSubstituteAnswerWaiter["handle"]>[0];
}

describe("LarkPrivateSubstituteAnswerWaiter", () => {
  test("resolves the generated answer only after the agent run completes", async () => {
    const waiter = new LarkPrivateSubstituteAnswerWaiter();
    const agentManager = {
      getLastAssistantMessage: vi.fn(async () => "最终答案"),
    } as unknown as Pick<AgentManager, "getLastAssistantMessage">;
    const answer = waiter.wait("agent-1", null);

    expect(await waiter.handle(agentState("agent-1", "running"), agentManager)).toBe(true);
    expect(await waiter.handle(agentState("agent-1", "idle"), agentManager)).toBe(true);

    await expect(answer).resolves.toEqual({ kind: "answer", text: "最终答案" });
  });

  test("turns the exact question-policy sentinel into a skipped decision", async () => {
    const waiter = new LarkPrivateSubstituteAnswerWaiter();
    const agentManager = {
      getLastAssistantMessage: vi.fn(async () => LARK_SUBSTITUTE_SKIP_ANSWER),
    } as unknown as Pick<AgentManager, "getLastAssistantMessage">;
    const answer = waiter.wait("agent-1", null);

    await waiter.handle(agentState("agent-1", "running"), agentManager);
    await waiter.handle(agentState("agent-1", "idle"), agentManager);

    await expect(answer).resolves.toEqual({ kind: "skip" });
  });
});
