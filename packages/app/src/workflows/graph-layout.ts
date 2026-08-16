import type { WorkflowGraphEdge, WorkflowGraphModel, WorkflowGraphNode } from "./graph-model";

export const WORKFLOW_GRAPH_NODE_WIDTH = 188;
export const WORKFLOW_GRAPH_NODE_HEIGHT = 76;

const BOUNDARY_NODE_WIDTH = 92;
const BOUNDARY_NODE_HEIGHT = 34;
const COLUMN_GAP = 72;
const ROW_GAP = 36;
const CANVAS_PADDING_X = 32;
const CANVAS_PADDING_Y = 28;
const LOOP_ROUTE_CLEARANCE = 18;
const LOOP_CHANNEL_GAP = 28;

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
  const loopReturnYByEdgeIndex = allocateLoopBackChannels(model, graphEdges, nodeById);
  const edges = graphEdges.flatMap((edge, index) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) {
      return [];
    }
    const route = routeEdge(from, to, edge.kind, loopReturnYByEdgeIndex.get(index));
    return [
      {
        ...edge,
        id: `${edge.from}:${edge.to}:${edge.kind}:${edge.label ?? ""}:${index}`,
        ...route,
      },
    ];
  });
  const contentWidth = Math.max(...nodes.map((node) => node.x + node.width));
  const contentBottom = Math.max(
    ...nodes.map((node) => node.y + node.height),
    ...edges.map((edge) => edge.labelY + (edge.kind === "loop_back" ? 10 : 0)),
  );
  return {
    width: contentWidth + CANVAS_PADDING_X,
    height: contentBottom + CANVAS_PADDING_Y,
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
  loopReturnY?: number,
): Pick<WorkflowGraphLayoutEdge, "path" | "labelX" | "labelY"> {
  const sourceX = from.x + from.width;
  const sourceY = from.y + from.height / 2;
  const targetX = to.x;
  const targetY = to.y + to.height / 2;
  if (kind === "loop_back") {
    const returnY =
      loopReturnY ?? Math.max(from.y + from.height, to.y + to.height) + LOOP_ROUTE_CLEARANCE;
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

interface LoopChannelCandidate {
  edgeIndex: number;
  baseY: number;
  startX: number;
  endX: number;
  targetLane: number;
}

interface AssignedLoopChannel {
  y: number;
  startX: number;
  endX: number;
}

function allocateLoopBackChannels(
  model: WorkflowGraphModel,
  edges: WorkflowGraphEdge[],
  nodeById: Map<string, WorkflowGraphLayoutNode>,
): Map<number, number> {
  const subtreeBottomByStepId = calculateSubtreeBottomByStepId(model.nodes, nodeById);
  const candidates = edges.flatMap((edge, edgeIndex): LoopChannelCandidate[] => {
    if (edge.kind !== "loop_back") {
      return [];
    }
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) {
      return [];
    }
    const sourceX = from.x + from.width;
    const sourceTurnX = sourceX + COLUMN_GAP / 2;
    const targetTurnX = to.x - COLUMN_GAP / 2;
    return [
      {
        edgeIndex,
        baseY:
          Math.max(subtreeBottomByStepId.get(edge.to) ?? to.y + to.height, from.y + from.height) +
          LOOP_ROUTE_CLEARANCE,
        startX: Math.min(targetTurnX, sourceX),
        endX: Math.max(sourceTurnX, to.x),
        targetLane: to.lane,
      },
    ];
  });
  candidates.sort(
    (left, right) =>
      left.baseY - right.baseY ||
      right.targetLane - left.targetLane ||
      left.endX - left.startX - (right.endX - right.startX) ||
      left.edgeIndex - right.edgeIndex,
  );

  const assigned: AssignedLoopChannel[] = [];
  const returnYByEdgeIndex = new Map<number, number>();
  for (const candidate of candidates) {
    let y = candidate.baseY;
    while (true) {
      const conflicts = assigned.filter(
        (channel) =>
          horizontalRangesOverlap(candidate, channel) && Math.abs(channel.y - y) < LOOP_CHANNEL_GAP,
      );
      if (conflicts.length === 0) {
        break;
      }
      y = Math.max(...conflicts.map((channel) => channel.y)) + LOOP_CHANNEL_GAP;
    }
    assigned.push({ y, startX: candidate.startX, endX: candidate.endX });
    returnYByEdgeIndex.set(candidate.edgeIndex, y);
  }
  return returnYByEdgeIndex;
}

function calculateSubtreeBottomByStepId(
  nodes: WorkflowGraphNode[],
  nodeById: Map<string, WorkflowGraphLayoutNode>,
): Map<string, number> {
  const result = new Map<string, number>();
  const visit = (node: WorkflowGraphNode): number => {
    const positioned = nodeById.get(node.stepId);
    let bottom = positioned ? positioned.y + positioned.height : 0;
    for (const branch of node.branches) {
      for (const child of branch.nodes) {
        bottom = Math.max(bottom, visit(child));
      }
    }
    result.set(node.stepId, bottom);
    return bottom;
  };
  for (const node of nodes) {
    visit(node);
  }
  return result;
}

function horizontalRangesOverlap(
  left: Pick<LoopChannelCandidate, "startX" | "endX">,
  right: Pick<AssignedLoopChannel, "startX" | "endX">,
): boolean {
  return left.startX < right.endX && right.startX < left.endX;
}
