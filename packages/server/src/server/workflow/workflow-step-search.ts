import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";

export function findWorkflowStep(
  steps: readonly WorkflowStep[],
  stepId: string,
): WorkflowStep | null {
  for (const step of steps) {
    if (step.id === stepId) {
      return step;
    }
    if (step.type === "switch") {
      for (const candidate of step.cases) {
        const nested = findWorkflowStep(candidate.steps, stepId);
        if (nested) {
          return nested;
        }
      }
      const defaultNested = findWorkflowStep(step.defaultSteps ?? [], stepId);
      if (defaultNested) {
        return defaultNested;
      }
    } else if (step.type === "for") {
      const nested = findWorkflowStep(step.steps, stepId);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}
