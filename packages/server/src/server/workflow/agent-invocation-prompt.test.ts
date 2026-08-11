import { describe, expect, it } from "vitest";
import type { WorkflowAgentStep } from "@getpaseo/protocol/workflow/types";
import { resolveWorkflowAgentInvocationPrompt } from "./agent-invocation-prompt.js";

function createStep(overrides: Partial<WorkflowAgentStep> = {}): WorkflowAgentStep {
  return {
    id: "review",
    type: "agent",
    lifecycle: "workflow",
    initialPrompt: "initial",
    config: { provider: "codex" },
    ...overrides,
  };
}

describe("resolveWorkflowAgentInvocationPrompt", () => {
  it("uses the initial prompt for the first invocation", () => {
    expect(
      resolveWorkflowAgentInvocationPrompt({
        step: createStep({
          subsequentPromptMode: "custom",
          subsequentPrompt: "follow-up",
        }),
        isFirstInvocation: true,
        initialPrompt: "rendered initial",
        subsequentPrompt: "rendered follow-up",
      }),
    ).toBe("rendered initial");
  });

  it("reuses the rendered initial prompt by default", () => {
    expect(
      resolveWorkflowAgentInvocationPrompt({
        step: createStep(),
        isFirstInvocation: false,
        initialPrompt: "rendered initial",
      }),
    ).toBe("rendered initial");
  });

  it("uses the custom subsequent prompt after the first invocation", () => {
    expect(
      resolveWorkflowAgentInvocationPrompt({
        step: createStep({
          subsequentPromptMode: "custom",
          subsequentPrompt: "follow-up",
        }),
        isFirstInvocation: false,
        initialPrompt: "rendered initial",
        subsequentPrompt: "rendered follow-up",
      }),
    ).toBe("rendered follow-up");
  });
});
