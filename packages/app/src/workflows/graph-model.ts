import type { WorkflowNodeRun, WorkflowStep } from "@getpaseo/protocol/workflow/types";

export type WorkflowGraphStatus = WorkflowNodeRun["status"] | "not_run" | "skipped";

export interface WorkflowGraphBranch {
  id: string;
  kind: "case" | "default" | "loop";
  label: string;
  nodes: WorkflowGraphNode[];
}

export interface WorkflowGraphNode {
  stepId: string;
  stepName: string | null;
  stepType: WorkflowStep["type"];
  dependencies: string[];
  branches: WorkflowGraphBranch[];
  runs: WorkflowNodeRun[];
  latestRun: WorkflowNodeRun | null;
  status: WorkflowGraphStatus;
}

export interface WorkflowGraphEdge {
  from: string;
  to: string;
  kind: "sequence" | "branch" | "loop_back";
  label: string | null;
}

export interface WorkflowGraphModel {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
}

interface BuildSequenceResult {
  nodes: WorkflowGraphNode[];
  terminalIds: string[];
}

interface BuildContext {
  edges: WorkflowGraphEdge[];
  runsByStepId: Map<string, WorkflowNodeRun[]>;
}

interface IncomingDependency {
  stepId: string;
  kind: WorkflowGraphEdge["kind"];
  label: string | null;
}

export function buildWorkflowGraphModel(
  steps: WorkflowStep[],
  nodeRuns: WorkflowNodeRun[] = [],
): WorkflowGraphModel {
  const runsByStepId = groupRunsByStepId(nodeRuns);
  const edges: WorkflowGraphEdge[] = [];
  const built = buildSequence(steps, [], { edges, runsByStepId });
  return {
    nodes: built.nodes,
    edges,
  };
}

export function findWorkflowGraphNode(
  nodes: WorkflowGraphNode[],
  stepId: string,
): WorkflowGraphNode | null {
  for (const node of nodes) {
    if (node.stepId === stepId) {
      return node;
    }
    for (const branch of node.branches) {
      const nested = findWorkflowGraphNode(branch.nodes, stepId);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function buildSequence(
  steps: WorkflowStep[],
  incoming: IncomingDependency[],
  context: BuildContext,
): BuildSequenceResult {
  const nodes: WorkflowGraphNode[] = [];
  let dependencies = incoming;
  for (const step of steps) {
    for (const dependency of dependencies) {
      context.edges.push({
        from: dependency.stepId,
        to: step.id,
        kind: dependency.kind,
        label: dependency.label,
      });
    }
    const runs = context.runsByStepId.get(step.id) ?? [];
    const node: WorkflowGraphNode = {
      stepId: step.id,
      stepName: step.name ?? null,
      stepType: step.type,
      dependencies: unique(dependencies.map((dependency) => dependency.stepId)),
      branches: [],
      runs,
      latestRun: runs.at(-1) ?? null,
      status: deriveGraphStatus(runs),
    };
    nodes.push(node);

    if (step.type === "switch") {
      const branchTerminals: IncomingDependency[] = [];
      for (const [index, candidate] of step.cases.entries()) {
        const label = candidate.equals;
        const built = buildSequence(
          candidate.steps,
          [{ stepId: step.id, kind: "branch", label }],
          context,
        );
        node.branches.push({
          id: `${step.id}:case:${index}`,
          kind: "case",
          label,
          nodes: built.nodes,
        });
        branchTerminals.push(...terminalDependencies(built.terminalIds, step.id, "sequence", null));
      }
      const defaultBuilt = buildSequence(
        step.defaultSteps ?? [],
        [{ stepId: step.id, kind: "branch", label: null }],
        context,
      );
      node.branches.push({
        id: `${step.id}:default`,
        kind: "default",
        label: "",
        nodes: defaultBuilt.nodes,
      });
      branchTerminals.push(
        ...terminalDependencies(defaultBuilt.terminalIds, step.id, "sequence", null),
      );
      dependencies = deduplicateDependencies(branchTerminals);
      continue;
    }

    if (step.type === "for") {
      const built = buildSequence(
        step.steps,
        [{ stepId: step.id, kind: "branch", label: null }],
        context,
      );
      node.branches.push({
        id: `${step.id}:loop`,
        kind: "loop",
        label: "",
        nodes: built.nodes,
      });
      for (const terminalId of built.terminalIds) {
        if (terminalId !== step.id) {
          context.edges.push({
            from: terminalId,
            to: step.id,
            kind: "loop_back",
            label: null,
          });
        }
      }
    }

    dependencies = [{ stepId: step.id, kind: "sequence", label: null }];
  }

  return {
    nodes,
    terminalIds:
      steps.length === 0
        ? unique(incoming.map((dependency) => dependency.stepId))
        : unique(dependencies.map((dependency) => dependency.stepId)),
  };
}

function terminalDependencies(
  terminalIds: string[],
  fallbackStepId: string,
  kind: WorkflowGraphEdge["kind"],
  label: string | null,
): IncomingDependency[] {
  const ids = terminalIds.length > 0 ? terminalIds : [fallbackStepId];
  return ids.map((stepId) => ({ stepId, kind, label }));
}

function groupRunsByStepId(nodeRuns: WorkflowNodeRun[]): Map<string, WorkflowNodeRun[]> {
  const grouped = new Map<string, WorkflowNodeRun[]>();
  for (const run of nodeRuns) {
    const runs = grouped.get(run.stepId) ?? [];
    runs.push(run);
    grouped.set(run.stepId, runs);
  }
  return grouped;
}

function deriveGraphStatus(runs: WorkflowNodeRun[]): WorkflowGraphStatus {
  if (runs.length === 0) {
    return "not_run";
  }
  if (runs.some((run) => run.status === "running")) {
    return "running";
  }
  const latest = runs.at(-1);
  if (!latest) {
    return "not_run";
  }
  if (latest.status === "succeeded" && latest.skippedReason) {
    return "skipped";
  }
  return latest.status;
}

function deduplicateDependencies(dependencies: IncomingDependency[]): IncomingDependency[] {
  const seen = new Set<string>();
  return dependencies.filter((dependency) => {
    const key = `${dependency.stepId}:${dependency.kind}:${dependency.label ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
