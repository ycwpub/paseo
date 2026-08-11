import type { WorkflowScriptFile, WorkflowStep } from "@getpaseo/protocol/workflow/types";

export interface WorkflowPlanNode {
  id: string;
  name: string | null;
  type: WorkflowStep["type"];
  path: string;
  nextNodeIds: string[];
  sideEffects: string[];
  requiresWriteBack: boolean;
  idempotencyKey: string | null;
  rollbackHint: string | null;
}

export interface WorkflowPlan {
  path: string;
  name: string;
  description: string | null;
  nodeCount: number;
  sideEffects: string[];
  requiresWriteBack: boolean;
  nodes: WorkflowPlanNode[];
}

export function buildWorkflowPlan(scriptFile: WorkflowScriptFile): WorkflowPlan {
  const nodes: WorkflowPlanNode[] = [];
  collectSequence(scriptFile.script.steps, [], null, nodes);
  const sideEffects = [...new Set(nodes.flatMap((node) => node.sideEffects))].toSorted();
  return {
    path: scriptFile.path,
    name: scriptFile.script.name,
    description: scriptFile.script.description ?? null,
    nodeCount: nodes.length,
    sideEffects,
    requiresWriteBack: nodes.some((node) => node.requiresWriteBack),
    nodes,
  };
}

function collectSequence(
  steps: WorkflowStep[],
  parentPath: string[],
  continuationId: string | null,
  nodes: WorkflowPlanNode[],
): void {
  steps.forEach((step, index) => {
    const sequentialNext = step.nextStepId ?? steps[index + 1]?.id ?? continuationId;
    const path = [...parentPath, step.id];
    const nestedStarts = collectNestedSteps(step, path, sequentialNext, nodes);
    const nextNodeIds = resolveNextNodeIds(nestedStarts, sequentialNext);
    nodes.push({
      id: step.id,
      name: step.name ?? null,
      type: step.type,
      path: path.join("/"),
      nextNodeIds: uniqueNonEmpty(nextNodeIds),
      sideEffects: step.sideEffects ?? [],
      requiresWriteBack: step.requiresWriteBack ?? false,
      idempotencyKey: step.idempotencyKey ?? null,
      rollbackHint: step.rollbackHint ?? null,
    });
  });
}

function resolveNextNodeIds(nestedStarts: string[], sequentialNext: string | null): string[] {
  if (nestedStarts.length > 0) {
    return nestedStarts;
  }
  return sequentialNext ? [sequentialNext] : [];
}

function collectNestedSteps(
  step: WorkflowStep,
  path: string[],
  sequentialNext: string | null,
  nodes: WorkflowPlanNode[],
): string[] {
  if (step.type === "switch") {
    return collectSwitchSteps(step, path, sequentialNext, nodes);
  }
  if (step.type === "for") {
    collectSequence(step.steps, [...path, "body"], step.id, nodes);
    return [step.steps[0]?.id ?? sequentialNext ?? "", sequentialNext ?? ""];
  }
  return [];
}

function collectSwitchSteps(
  step: Extract<WorkflowStep, { type: "switch" }>,
  path: string[],
  sequentialNext: string | null,
  nodes: WorkflowPlanNode[],
): string[] {
  const starts: string[] = [];
  for (const [caseIndex, candidate] of step.cases.entries()) {
    starts.push(candidate.steps[0]?.id ?? sequentialNext ?? "");
    collectSequence(candidate.steps, [...path, `case:${caseIndex}`], sequentialNext, nodes);
  }
  const defaultSteps = step.defaultSteps ?? [];
  starts.push(defaultSteps[0]?.id ?? sequentialNext ?? "");
  collectSequence(defaultSteps, [...path, "default"], sequentialNext, nodes);
  return starts;
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
