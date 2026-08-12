import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";

export interface WorkflowRunTarget {
  id: string;
  name: string | null;
  type: WorkflowStep["type"];
}

export function collectWorkflowRunTargets(steps: WorkflowStep[]): WorkflowRunTarget[] {
  const targets: WorkflowRunTarget[] = [];
  const visit = (items: WorkflowStep[]) => {
    for (const step of items) {
      targets.push({
        id: step.id,
        name: step.name?.trim() || null,
        type: step.type,
      });
      if (step.type === "switch") {
        for (const candidate of step.cases) {
          visit(candidate.steps);
        }
        visit(step.defaultSteps ?? []);
      } else if (step.type === "for") {
        visit(step.steps);
      }
    }
  };
  visit(steps);
  return targets;
}
