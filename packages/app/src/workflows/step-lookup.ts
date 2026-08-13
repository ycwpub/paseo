import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";

export function findWorkflowStep(
  steps: WorkflowStep[],
  stepId: string | null,
): WorkflowStep | null {
  if (!stepId) {
    return null;
  }
  for (const step of steps) {
    if (step.id === stepId) {
      return step;
    }
    if (step.type === "for") {
      const nested = findWorkflowStep(step.steps, stepId);
      if (nested) {
        return nested;
      }
    }
    if (step.type === "switch") {
      for (const branch of step.cases) {
        const nested = findWorkflowStep(branch.steps, stepId);
        if (nested) {
          return nested;
        }
      }
      const defaultNested = findWorkflowStep(step.defaultSteps ?? [], stepId);
      if (defaultNested) {
        return defaultNested;
      }
    }
  }
  return null;
}
