import type { WorkflowNodeRun, WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { resolveWorkflowSequenceTarget } from "./sequence-links";

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
  entryStepId: string | null;
  terminals: WorkflowGraphTerminal[];
}

export interface WorkflowGraphTerminal {
  stepId: string;
  kind: WorkflowGraphEdge["kind"];
  label: string | null;
}

interface BuildSequenceResult {
  nodes: WorkflowGraphNode[];
  terminals: IncomingDependency[];
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
  applyGraphDependencies(built.nodes, edges);
  return {
    nodes: built.nodes,
    edges,
    entryStepId: steps[0]?.id ?? null,
    terminals: built.terminals,
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
  const completionByIndex: IncomingDependency[][] = [];
  for (const step of steps) {
    const runs = context.runsByStepId.get(step.id) ?? [];
    const node: WorkflowGraphNode = {
      stepId: step.id,
      stepName: step.name ?? null,
      stepType: step.type,
      dependencies: [],
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
        branchTerminals.push(...built.terminals);
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
      branchTerminals.push(...defaultBuilt.terminals);
      completionByIndex.push(deduplicateDependencies(branchTerminals));
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
      for (const terminal of built.terminals) {
        if (terminal.stepId !== step.id) {
          context.edges.push({
            from: terminal.stepId,
            to: step.id,
            kind: "loop_back",
            label: null,
          });
        }
      }
    }

    completionByIndex.push([{ stepId: step.id, kind: "sequence", label: null }]);
  }

  const firstStep = steps[0];
  if (firstStep) {
    addDependencyEdges(incoming, firstStep.id, context);
  }
  for (const [index, completion] of completionByIndex.entries()) {
    const target = resolveWorkflowSequenceTarget(steps, index);
    if (target) {
      addDependencyEdges(completion, target.step.id, context);
    }
  }
  const terminalIndex = findReachableTerminalIndex(steps);
  return {
    nodes,
    terminals:
      terminalIndex === null
        ? deduplicateDependencies(incoming)
        : deduplicateDependencies(completionByIndex[terminalIndex] ?? []),
  };
}

function addDependencyEdges(
  dependencies: IncomingDependency[],
  targetStepId: string,
  context: BuildContext,
): void {
  for (const dependency of dependencies) {
    context.edges.push({
      from: dependency.stepId,
      to: targetStepId,
      kind: dependency.kind,
      label: dependency.label,
    });
  }
}

function findReachableTerminalIndex(steps: readonly WorkflowStep[]): number | null {
  if (steps.length === 0) {
    return null;
  }
  const visited = new Set<number>();
  let index = 0;
  while (!visited.has(index)) {
    visited.add(index);
    const target = resolveWorkflowSequenceTarget(steps, index);
    if (!target) {
      return index;
    }
    index = target.index;
  }
  return index;
}

function applyGraphDependencies(nodes: WorkflowGraphNode[], edges: WorkflowGraphEdge[]): void {
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind === "loop_back") {
      continue;
    }
    const dependencies = incoming.get(edge.to) ?? [];
    dependencies.push(edge.from);
    incoming.set(edge.to, dependencies);
  }
  const visit = (sequence: WorkflowGraphNode[]) => {
    for (const node of sequence) {
      node.dependencies = unique(incoming.get(node.stepId) ?? []);
      for (const branch of node.branches) {
        visit(branch.nodes);
      }
    }
  };
  visit(nodes);
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
