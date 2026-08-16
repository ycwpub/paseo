import { describe, expect, it } from "vitest";
import type { WorkflowForStep } from "@getpaseo/protocol/workflow/types";
import { resolveWorkflowForExecutionConfig } from "./for-step-execution-mode.js";

function createStep(overrides: Partial<WorkflowForStep> = {}): WorkflowForStep {
  return {
    id: "loop",
    type: "for",
    mode: "array",
    items: "{{data.items}}",
    steps: [{ id: "body", type: "bash", initialCommand: "output='{}'" }],
    ...overrides,
  };
}

describe("resolveWorkflowForExecutionConfig", () => {
  it("defaults to serial execution and forces one active iteration", () => {
    expect(resolveWorkflowForExecutionConfig(createStep())).toEqual({
      mode: "serial",
      concurrency: 1,
      loopVariableModificationAllowed: true,
    });
  });

  it("uses configured parallel concurrency and disables Loop variable modifications", () => {
    expect(
      resolveWorkflowForExecutionConfig(createStep({ executionMode: "parallel", concurrency: 4 })),
    ).toEqual({
      mode: "parallel",
      concurrency: 4,
      loopVariableModificationAllowed: false,
    });
  });

  it("rejects concurrency on serial execution and unlimited concurrent True loops", () => {
    expect(() =>
      resolveWorkflowForExecutionConfig(createStep({ executionMode: "serial", concurrency: 2 })),
    ).toThrow("serial mode requires concurrency 1");
    expect(() =>
      resolveWorkflowForExecutionConfig(
        createStep({
          mode: "true",
          items: undefined,
          executionMode: "parallel",
          concurrency: 1,
          maxIterations: 0,
        }),
      ),
    ).toThrow("cannot run an unlimited True loop in parallel");
  });
});
