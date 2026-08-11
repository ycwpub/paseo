import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";

export function resolveNextWorkflowStep(
  steps: readonly WorkflowStep[],
  currentIndex: number,
): { step: WorkflowStep; index: number } | null {
  const current = steps[currentIndex];
  if (!current) {
    return null;
  }
  if (current.nextStepId === null) {
    return null;
  }
  if (current.nextStepId !== undefined) {
    const index = steps.findIndex((candidate) => candidate.id === current.nextStepId);
    const step = steps[index];
    return index >= 0 && step ? { step, index } : null;
  }
  const index = currentIndex + 1;
  const step = steps[index];
  return step ? { step, index } : null;
}

export function validateWorkflowSequenceLinks(steps: readonly WorkflowStep[]): string | null {
  const ids = new Set(steps.map((step) => step.id));
  for (const step of steps) {
    if (step.nextStepId !== undefined && step.nextStepId !== null) {
      if (step.nextStepId === step.id) {
        return `Workflow step ${step.id} cannot point to itself`;
      }
      if (!ids.has(step.nextStepId)) {
        return `Workflow step ${step.id} points to a missing downstream step: ${step.nextStepId}`;
      }
    }
  }

  for (let startIndex = 0; startIndex < steps.length; startIndex += 1) {
    const visited = new Set<number>();
    let index: number | null = startIndex;
    while (index !== null) {
      if (visited.has(index)) {
        return `Workflow sequence contains a cycle at step ${steps[index]?.id ?? index}`;
      }
      visited.add(index);
      index = resolveNextWorkflowStep(steps, index)?.index ?? null;
    }
  }
  return null;
}
