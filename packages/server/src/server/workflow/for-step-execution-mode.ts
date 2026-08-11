import type { WorkflowForStep } from "@getpaseo/protocol/workflow/types";

export interface WorkflowForExecutionConfig {
  mode: "serial" | "parallel";
  concurrency: number;
  loopVariableModificationAllowed: boolean;
}

export class WorkflowForExecutionModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowForExecutionModeError";
  }
}

export function resolveWorkflowForExecutionConfig(
  step: WorkflowForStep,
): WorkflowForExecutionConfig {
  const mode = step.executionMode ?? "serial";
  const configuredConcurrency = step.concurrency ?? 1;
  if (mode === "serial" && configuredConcurrency !== 1) {
    throw new WorkflowForExecutionModeError(
      `For step ${step.id} in serial mode requires concurrency 1`,
    );
  }
  if (
    mode === "parallel" &&
    (step.mode ?? "array") === "true" &&
    (step.maxIterations ?? 100) === 0
  ) {
    throw new WorkflowForExecutionModeError(
      `For step ${step.id} cannot run an unlimited True loop in parallel`,
    );
  }
  return {
    mode,
    concurrency: mode === "parallel" ? configuredConcurrency : 1,
    loopVariableModificationAllowed: mode === "serial",
  };
}
