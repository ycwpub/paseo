import type { WorkflowForStep } from "@getpaseo/protocol/workflow/types";

export type WorkflowForPlanErrorCode = "WORKFLOW_INVALID_GRAPH" | "WORKFLOW_INVALID_INPUT";

export class WorkflowForPlanError extends Error {
  constructor(
    message: string,
    readonly code: WorkflowForPlanErrorCode,
  ) {
    super(message);
    this.name = "WorkflowForPlanError";
  }
}

export interface WorkflowForIterationPlan {
  iterationCount: number | null;
  count: number;
  itemAt: (index: number) => unknown;
}

interface CreateWorkflowForIterationPlanInput {
  step: WorkflowForStep;
  resolveExpression: (expression: string) => unknown;
}

export function createWorkflowForIterationPlan(
  input: CreateWorkflowForIterationPlanInput,
): WorkflowForIterationPlan {
  const mode = input.step.mode ?? "array";
  const maxIterations = input.step.maxIterations ?? 100;
  if (mode === "true") {
    return {
      iterationCount: maxIterations === 0 ? null : maxIterations,
      count: maxIterations,
      itemAt: () => true,
    };
  }

  const expression = input.step.items;
  if (!expression) {
    throw new WorkflowForPlanError(
      `For step ${input.step.id} in ${mode} mode requires an items expression`,
      "WORKFLOW_INVALID_GRAPH",
    );
  }
  const value = input.resolveExpression(expression);
  if (mode === "array") {
    if (!Array.isArray(value)) {
      throw new WorkflowForPlanError(
        `For step ${input.step.id} items expression must resolve to a JSON array`,
        "WORKFLOW_INVALID_INPUT",
      );
    }
    enforceMaximumIterations(input.step, value.length, maxIterations);
    return {
      iterationCount: value.length,
      count: value.length,
      itemAt: (index) => structuredClone(value[index]),
    };
  }

  if (!Number.isSafeInteger(value) || typeof value !== "number" || value < 0) {
    throw new WorkflowForPlanError(
      `For step ${input.step.id} items expression must resolve to a non-negative integer`,
      "WORKFLOW_INVALID_INPUT",
    );
  }
  enforceMaximumIterations(input.step, value, maxIterations);
  return {
    iterationCount: value,
    count: value,
    itemAt: (index) => value - index,
  };
}

function enforceMaximumIterations(
  step: WorkflowForStep,
  iterationCount: number,
  maxIterations: number,
): void {
  if (maxIterations === 0 || iterationCount <= maxIterations) {
    return;
  }
  throw new WorkflowForPlanError(
    `For step ${step.id} produced ${iterationCount} iterations; maximum is ${maxIterations}`,
    "WORKFLOW_INVALID_INPUT",
  );
}
