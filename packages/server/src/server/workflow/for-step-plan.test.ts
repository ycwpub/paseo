import { describe, expect, it } from "vitest";
import type { WorkflowForStep } from "@getpaseo/protocol/workflow/types";
import { createWorkflowForIterationPlan } from "./for-step-plan.js";

function createStep(overrides: Partial<WorkflowForStep>): WorkflowForStep {
  return {
    id: "loop",
    type: "for",
    mode: "array",
    items: "{{data.items}}",
    steps: [{ id: "body", type: "bash", initialCommand: "output='{}'" }],
    maxIterations: 100,
    concurrency: 1,
    ...overrides,
  };
}

describe("createWorkflowForIterationPlan", () => {
  it("iterates JSON arrays and treats zero as an unlimited cap", () => {
    const plan = createWorkflowForIterationPlan({
      step: createStep({ maxIterations: 0 }),
      resolveExpression: () => ["alpha", { id: 2 }],
    });

    expect(plan.iterationCount).toBe(2);
    expect(plan.count).toBe(2);
    expect(plan.itemAt(0)).toBe("alpha");
    expect(plan.itemAt(1)).toEqual({ id: 2 });
  });

  it("counts down non-negative integers before each iteration", () => {
    const plan = createWorkflowForIterationPlan({
      step: createStep({ mode: "number" }),
      resolveExpression: () => 3,
    });

    expect(plan.iterationCount).toBe(3);
    expect(plan.count).toBe(3);
    expect([plan.itemAt(0), plan.itemAt(1), plan.itemAt(2)]).toEqual([3, 2, 1]);
  });

  it("supports bounded and unlimited true loops", () => {
    const bounded = createWorkflowForIterationPlan({
      step: createStep({ mode: "true", items: undefined, maxIterations: 2 }),
      resolveExpression: () => {
        throw new Error("true mode must not resolve an expression");
      },
    });
    const unlimited = createWorkflowForIterationPlan({
      step: createStep({ mode: "true", items: undefined, maxIterations: 0 }),
      resolveExpression: () => {
        throw new Error("true mode must not resolve an expression");
      },
    });

    expect(bounded).toMatchObject({ iterationCount: 2, count: 2 });
    expect(bounded.itemAt(0)).toBe(true);
    expect(unlimited).toMatchObject({ iterationCount: null, count: 0 });
  });

  it("rejects invalid expressions and caps", () => {
    expect(() =>
      createWorkflowForIterationPlan({
        step: createStep({ mode: "array" }),
        resolveExpression: () => ({ item: "not-an-array" }),
      }),
    ).toThrow("must resolve to a JSON array");
    expect(() =>
      createWorkflowForIterationPlan({
        step: createStep({ mode: "number" }),
        resolveExpression: () => -1,
      }),
    ).toThrow("must resolve to a non-negative integer");
    expect(() =>
      createWorkflowForIterationPlan({
        step: createStep({ maxIterations: 1 }),
        resolveExpression: () => ["alpha", "beta"],
      }),
    ).toThrow("maximum is 1");
  });
});
