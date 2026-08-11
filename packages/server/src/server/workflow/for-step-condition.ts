import type { WorkflowForStep } from "@getpaseo/protocol/workflow/types";

export type WorkflowForControl = "" | "break" | "continue";

export class WorkflowForConditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowForConditionError";
  }
}

export function resolveWorkflowForControl(input: {
  step: WorkflowForStep;
  resolveOptional: (expression: string) => unknown;
}): WorkflowForControl {
  const legacyControl = input.step.forControl
    ? normalizeControl(input.step, input.resolveOptional(input.step.forControl))
    : "";
  if (legacyControl) {
    return legacyControl;
  }
  if (
    input.step.breakWhen &&
    resolveBooleanCondition(input.step, "breakWhen", input.resolveOptional(input.step.breakWhen))
  ) {
    return "break";
  }
  if (
    input.step.continueWhen &&
    resolveBooleanCondition(
      input.step,
      "continueWhen",
      input.resolveOptional(input.step.continueWhen),
    )
  ) {
    return "continue";
  }
  return "";
}

function normalizeControl(step: WorkflowForStep, value: unknown): WorkflowForControl {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (value === "break" || value === "continue") {
    return value;
  }
  throw new WorkflowForConditionError(
    `For step ${step.id} control must resolve to "break", "continue", or an empty value`,
  );
}

function resolveBooleanCondition(
  step: WorkflowForStep,
  field: "breakWhen" | "continueWhen",
  value: unknown,
): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value !== "boolean") {
    throw new WorkflowForConditionError(`For step ${step.id} ${field} must resolve to a boolean`);
  }
  return value;
}
