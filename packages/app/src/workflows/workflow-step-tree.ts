import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { replaceWorkflowSequenceStep } from "@/workflows/sequence-links";

export interface WorkflowStepEditContext {
  step: WorkflowStep;
  siblingSteps: WorkflowStep[];
  depth: number;
}

export function findWorkflowStepEditContext(
  steps: WorkflowStep[],
  stepId: string | null,
  depth = 0,
): WorkflowStepEditContext | null {
  if (stepId === null) {
    return null;
  }

  const directStep = steps.find((step) => step.id === stepId);
  if (directStep) {
    return {
      step: directStep,
      siblingSteps: steps,
      depth,
    };
  }

  for (const step of steps) {
    if (step.type === "for") {
      const nested = findWorkflowStepEditContext(step.steps, stepId, depth + 1);
      if (nested) {
        return nested;
      }
    }
    if (step.type === "switch") {
      for (const branch of step.cases) {
        const nested = findWorkflowStepEditContext(branch.steps, stepId, depth + 1);
        if (nested) {
          return nested;
        }
      }
      const defaultNested = findWorkflowStepEditContext(step.defaultSteps ?? [], stepId, depth + 1);
      if (defaultNested) {
        return defaultNested;
      }
    }
  }

  return null;
}

function replaceNestedWorkflowStep(
  steps: WorkflowStep[],
  stepId: string,
  nextStep: WorkflowStep,
): { steps: WorkflowStep[]; replaced: boolean } {
  const directIndex = steps.findIndex((step) => step.id === stepId);
  if (directIndex >= 0) {
    return {
      steps: replaceWorkflowSequenceStep(steps, directIndex, nextStep),
      replaced: true,
    };
  }

  for (const [index, step] of steps.entries()) {
    if (step.type === "for") {
      const nested = replaceNestedWorkflowStep(step.steps, stepId, nextStep);
      if (nested.replaced) {
        return {
          steps: steps.map((candidate, candidateIndex) =>
            candidateIndex === index ? { ...step, steps: nested.steps } : candidate,
          ),
          replaced: true,
        };
      }
    }

    if (step.type === "switch") {
      for (const [caseIndex, branch] of step.cases.entries()) {
        const nested = replaceNestedWorkflowStep(branch.steps, stepId, nextStep);
        if (nested.replaced) {
          return {
            steps: steps.map((candidate, candidateIndex) =>
              candidateIndex === index
                ? {
                    ...step,
                    cases: step.cases.map((candidateBranch, candidateCaseIndex) =>
                      candidateCaseIndex === caseIndex
                        ? { ...branch, steps: nested.steps }
                        : candidateBranch,
                    ),
                  }
                : candidate,
            ),
            replaced: true,
          };
        }
      }

      const nestedDefault = replaceNestedWorkflowStep(step.defaultSteps ?? [], stepId, nextStep);
      if (nestedDefault.replaced) {
        return {
          steps: steps.map((candidate, candidateIndex) =>
            candidateIndex === index ? { ...step, defaultSteps: nestedDefault.steps } : candidate,
          ),
          replaced: true,
        };
      }
    }
  }

  return { steps, replaced: false };
}

export function updateWorkflowStepById(
  steps: WorkflowStep[],
  stepId: string,
  nextStep: WorkflowStep,
): WorkflowStep[] {
  return replaceNestedWorkflowStep(steps, stepId, nextStep).steps;
}
