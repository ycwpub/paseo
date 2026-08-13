import type { WorkflowGraphEdge, WorkflowGraphModel, WorkflowGraphNode } from "./graph-model";

export const WORKFLOW_GRAPH_NODE_WIDTH = 188;
export const WORKFLOW_GRAPH_NODE_HEIGHT = 76;

const BOUNDARY_NODE_WIDTH = 92;
const BOUNDARY_NODE_HEIGHT = 34;
const COLUMN_GAP = 72;
const ROW_GAP = 36;
const CANVAS_PADDING_X = 32;
const CANVAS_PADDING_Y = 28;
const LOOP_GUTTER = 42;

export interface WorkflowGraphLayoutNode {
  id: string;
  kind: "start" | "step" | "end";
  node: WorkflowGraphNode | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rank: number;
  lane: number;
}

export interface WorkflowGraphLayoutEdge extends WorkflowGraphEdge {
  id: string;
  path: string;
  labelX: number;
  labelY: number;
}

export interface WorkflowGraphLayout {
  width: number;
  height: number;
  nodes: WorkflowGraphLayoutNode[];
  edges: WorkflowGraphLayoutEdge[];
}

interface FlattenedNode {
  node: WorkflowGraphNode;
  lane: number;
}

export function layoutWorkflowGraph(model: WorkflowGraphModel): WorkflowGraphLayout {
  const flattened = flattenGraphNodes(model.nodes);
  const ranks = calculateRanks(flattened, model.edges, model.entryStepId);
  const realNodes = flattened.map(({ node, lane }) =>
    createLayoutNode(node.stepId, "step", node, (ranks.get(node.stepId) ?? 0) + 1, lane),
  );
  const maxRank = Math.max(0, ...realNodes.map((node) => node.rank));
  const start = createLayoutNode("__workflow_start__", "start", null, 0, 0);
  const end = createLayoutNode("__workflow_end__", "end", null, maxRank + 1, 0);
  const nodes = [start, ...realNodes, end];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const graphEdges = addBoundaryEdges(model);
  const edges = graphEdges.flatMap((edge, index) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) {
      return [];
    }
    const route = routeEdge(from, to, edge.kind);
    return [
      {
        ...edge,
        id: `${edge.from}:${edge.to}:${edge.kind}:${edge.label ?? ""}:${index}`,
        ...route,
      },
    ];
  });
  const laneCount = Math.max(1, ...realNodes.map((node) => node.lane + 1));
  const contentWidth = Math.max(...nodes.map((node) => node.x + node.width));
  return {
    width: contentWidth + CANVAS_PADDING_X,
    height:
      CANVAS_PADDING_Y * 2 +
      laneCount * WORKFLOW_GRAPH_NODE_HEIGHT +
      Math.max(0, laneCount - 1) * ROW_GAP +
      (edges.some((edge) => edge.kind === "loop_back") ? LOOP_GUTTER : 0),
    nodes,
    edges,
  };
}

function flattenGraphNodes(nodes: WorkflowGraphNode[]): FlattenedNode[] {
  const flattened: FlattenedNode[] = [];
  let nextLane = 1;
  function visit(sequence: WorkflowGraphNode[], lane: number): void {
    for (const node of sequence) {
      flattened.push({ node, lane });
      for (const branch of node.branches) {
        if (branch.nodes.length === 0) {
          continue;
        }
        const branchLane = nextLane;
        nextLane += 1;
        visit(branch.nodes, branchLane);
      }
    }
  }
  visit(nodes, 0);
  return flattened;
}

function calculateRanks(
  nodes: FlattenedNode[],
  edges: WorkflowGraphEdge[],
  entryStepId: string | null,
): Map<string, number> {
  const ranks = new Map<string, number>();
  const order = new Map(nodes.map(({ node }, index) => [node.stepId, index]));
  const forwardEdges = edges
    .filter((edge) => edge.kind !== "loop_back")
    .toSorted(
      (left, right) =>
        (order.get(left.from) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.from) ?? Number.MAX_SAFE_INTEGER),
    );
  if (entryStepId) {
    ranks.set(entryStepId, 0);
  }
  for (const { node } of nodes) {
    if (!ranks.has(node.stepId)) {
      const maxRank = Math.max(-1, ...ranks.values());
      ranks.set(node.stepId, maxRank + 1);
    }
    propagateRanks(ranks, forwardEdges, nodes.length);
  }
  return ranks;
}

function propagateRanks(
  ranks: Map<string, number>,
  edges: WorkflowGraphEdge[],
  nodeCount: number,
): void {
  for (let pass = 0; pass < nodeCount; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      const fromRank = ranks.get(edge.from);
      const toRank = ranks.get(edge.to);
      if (fromRank === undefined) {
        continue;
      }
      const requiredRank = fromRank + 1;
      if (toRank !== undefined && toRank >= requiredRank) {
        continue;
      }
      ranks.set(edge.to, requiredRank);
      changed = true;
    }
    if (!changed) {
      break;
    }
  }
}

function createLayoutNode(
  id: string,
  kind: WorkflowGraphLayoutNode["kind"],
  node: WorkflowGraphNode | null,
  rank: number,
  lane: number,
): WorkflowGraphLayoutNode {
  return {
    id,
    kind,
    node,
    rank,
    lane,
    x: CANVAS_PADDING_X + rank * (WORKFLOW_GRAPH_NODE_WIDTH + COLUMN_GAP),
    y:
      CANVAS_PADDING_Y +
      lane * (WORKFLOW_GRAPH_NODE_HEIGHT + ROW_GAP) +
      (kind === "step" ? 0 : (WORKFLOW_GRAPH_NODE_HEIGHT - BOUNDARY_NODE_HEIGHT) / 2),
    width: kind === "step" ? WORKFLOW_GRAPH_NODE_WIDTH : BOUNDARY_NODE_WIDTH,
    height: kind === "step" ? WORKFLOW_GRAPH_NODE_HEIGHT : BOUNDARY_NODE_HEIGHT,
  };
}

function addBoundaryEdges(model: WorkflowGraphModel): WorkflowGraphEdge[] {
  if (!model.entryStepId) {
    return [
      {
        from: "__workflow_start__",
        to: "__workflow_end__",
        kind: "sequence",
        label: null,
      },
    ];
  }
  return [
    {
      from: "__workflow_start__",
      to: model.entryStepId,
      kind: "sequence",
      label: null,
    },
    ...model.edges,
    ...model.terminals.map(
      (terminal): WorkflowGraphEdge => ({
        from: terminal.stepId,
        to: "__workflow_end__",
        kind: terminal.kind,
        label: terminal.label,
      }),
    ),
  ];
}

function routeEdge(
  from: WorkflowGraphLayoutNode,
  to: WorkflowGraphLayoutNode,
  kind: WorkflowGraphEdge["kind"],
): Pick<WorkflowGraphLayoutEdge, "path" | "labelX" | "labelY"> {
  const sourceX = from.x + from.width;
  const sourceY = from.y + from.height / 2;
  const targetX = to.x;
  const targetY = to.y + to.height / 2;
  if (kind === "loop_back") {
    const returnY = Math.max(from.y + from.height, to.y + to.height) + LOOP_GUTTER / 2;
    const sourceTurnX = sourceX + COLUMN_GAP / 2;
    const targetTurnX = targetX - COLUMN_GAP / 2;
    return {
      path: `M ${sourceX} ${sourceY} C ${sourceTurnX} ${sourceY}, ${sourceTurnX} ${returnY}, ${sourceX} ${returnY} L ${targetTurnX} ${returnY} C ${targetTurnX} ${returnY}, ${targetTurnX} ${targetY}, ${targetX} ${targetY}`,
      labelX: (sourceX + targetX) / 2,
      labelY: returnY,
    };
  }
  const middleX = (sourceX + targetX) / 2;
  return {
    path: `M ${sourceX} ${sourceY} C ${middleX} ${sourceY}, ${middleX} ${targetY}, ${targetX} ${targetY}`,
    labelX: middleX,
    labelY: (sourceY + targetY) / 2,
  };
}
