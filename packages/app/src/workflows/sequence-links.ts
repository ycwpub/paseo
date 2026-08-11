import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";

export interface WorkflowSequenceTarget {
  step: WorkflowStep;
  index: number;
}

export function resolveWorkflowSequenceTarget(
  steps: readonly WorkflowStep[],
  currentIndex: number,
): WorkflowSequenceTarget | null {
  const current = steps[currentIndex];
  if (!current || current.nextStepId === null) {
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
    if (step.nextStepId === undefined || step.nextStepId === null) {
      continue;
    }
    if (step.nextStepId === step.id) {
      return `Workflow step ${step.id} cannot point to itself`;
    }
    if (!ids.has(step.nextStepId)) {
      return `Workflow step ${step.id} points to a missing downstream step: ${step.nextStepId}`;
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
      index = resolveWorkflowSequenceTarget(steps, index)?.index ?? null;
    }
  }
  return null;
}

export function replaceWorkflowSequenceStep(
  steps: readonly WorkflowStep[],
  index: number,
  nextStep: WorkflowStep,
): WorkflowStep[] {
  const currentStep = steps[index];
  if (!currentStep) {
    return [...steps];
  }
  const renamed = currentStep.id !== nextStep.id;
  return steps.map((step, candidateIndex) => {
    if (candidateIndex === index) {
      return nextStep;
    }
    if (renamed && step.nextStepId === currentStep.id) {
      return { ...step, nextStepId: nextStep.id };
    }
    return step;
  });
}

export function removeWorkflowSequenceStep(
  steps: readonly WorkflowStep[],
  index: number,
): WorkflowStep[] {
  const removed = steps[index];
  if (!removed) {
    return [...steps];
  }
  const removedTargetId = resolveWorkflowSequenceTarget(steps, index)?.step.id ?? null;
  const next: WorkflowStep[] = [];
  for (const [candidateIndex, step] of steps.entries()) {
    if (candidateIndex === index) {
      continue;
    }
    next.push(step.nextStepId === removed.id ? { ...step, nextStepId: removedTargetId } : step);
  }
  return next;
}
