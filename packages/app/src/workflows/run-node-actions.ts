import type { WorkflowNodeRun } from "@getpaseo/protocol/workflow/types";

export interface WorkflowNodeActions {
  canExpand: boolean;
  canOpenAgent: boolean;
}

export interface WorkflowNodeIdentity {
  id: string;
  name: string | null;
}

export function deriveWorkflowNodeActions(
  node: Pick<WorkflowNodeRun, "agentId" | "stepType">,
): WorkflowNodeActions {
  return {
    canExpand: true,
    canOpenAgent: node.stepType === "agent" && Boolean(node.agentId),
  };
}

export function deriveWorkflowNodeIdentity(
  node: Pick<WorkflowNodeRun, "stepId" | "stepName">,
): WorkflowNodeIdentity {
  const name = node.stepName?.trim();
  return {
    id: node.stepId,
    name: name || null,
  };
}
