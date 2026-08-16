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
const LOOP_SIDE_CLEARANCE = 24;
const MIN_CANVAS_COORDINATE = 12;

export interface WorkflowGraphPoint {
  x: number;
  y: number;
}

export interface WorkflowGraphEdgeOverride {
  control?: WorkflowGraphPoint;
  sourceTurnX?: number;
  targetTurnX?: number;
  channelY?: number;
}

export interface WorkflowGraphLayoutOverrides {
  nodes: Record<string, WorkflowGraphPoint>;
  edges: Record<string, WorkflowGraphEdgeOverride>;
}

export type WorkflowGraphEdgeHandleId = "control" | "source_turn" | "channel" | "target_turn";

export interface WorkflowGraphEdgeHandle {
  id: WorkflowGraphEdgeHandleId;
  x: number;
  y: number;
  axis: "x" | "y" | "both";
}

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
  handles: WorkflowGraphEdgeHandle[];
  route:
    | {
        kind: "forward";
        controlX: number;
        controlY: number;
      }
    | {
        kind: "loop_back";
        sourceTurnX: number;
        targetTurnX: number;
        channelY: number;
      };
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

interface LoopBackRoute {
  sourceTurnX: number;
  targetTurnX: number;
  channelY: number;
}

export function layoutWorkflowGraph(
  model: WorkflowGraphModel,
  overrides: WorkflowGraphLayoutOverrides = { nodes: {}, edges: {} },
): WorkflowGraphLayout {
  const flattened = flattenGraphNodes(model.nodes);
  const ranks = calculateRanks(flattened, model.edges, model.entryStepId);
  const realNodes = flattened.map(({ node, lane }) =>
    createLayoutNode(node.stepId, "step", node, (ranks.get(node.stepId) ?? 0) + 1, lane),
  );
  const maxRank = Math.max(0, ...realNodes.map((node) => node.rank));
  const start = createLayoutNode("__workflow_start__", "start", null, 0, 0);
  const end = createLayoutNode("__workflow_end__", "end", null, maxRank + 1, 0);
  const nodes = [start, ...realNodes, end].map((node) =>
    applyNodeOverride(node, overrides.nodes[node.id]),
  );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const graphEdges = addBoundaryEdges(model).map((edge, index) =>
    Object.assign({}, edge, { id: createEdgeId(edge, index) }),
  );
  const loopRoutesByEdgeId = allocateLoopBackRoutes(model, graphEdges, nodeById);
  const edges = graphEdges.flatMap((edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) {
      return [];
    }
    const route = routeEdge(
      from,
      to,
      edge.kind,
      loopRoutesByEdgeId.get(edge.id),
      overrides.edges[edge.id],
    );
    return [
      {
        ...edge,
        ...route,
      },
    ];
  });
  const contentWidth = Math.max(
    ...nodes.map((node) => node.x + node.width),
    ...edges.flatMap((edge) => edge.handles.map((handle) => handle.x)),
  );
  const contentBottom = Math.max(
    ...nodes.map((node) => node.y + node.height),
    ...edges.flatMap((edge) => [
      edge.labelY + (edge.kind === "loop_back" ? 10 : 0),
      ...edge.handles.map((handle) => handle.y),
    ]),
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

function applyNodeOverride(
  node: WorkflowGraphLayoutNode,
  override: WorkflowGraphPoint | undefined,
): WorkflowGraphLayoutNode {
  if (!override) {
    return node;
  }
  return {
    ...node,
    x: Math.max(MIN_CANVAS_COORDINATE, override.x),
    y: Math.max(MIN_CANVAS_COORDINATE, override.y),
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

function createEdgeId(edge: WorkflowGraphEdge, index: number): string {
  return `${edge.from}:${edge.to}:${edge.kind}:${edge.label ?? ""}:${index}`;
}

function routeEdge(
  from: WorkflowGraphLayoutNode,
  to: WorkflowGraphLayoutNode,
  kind: WorkflowGraphEdge["kind"],
  loopRoute: LoopBackRoute | undefined,
  override: WorkflowGraphEdgeOverride | undefined,
): Pick<WorkflowGraphLayoutEdge, "path" | "labelX" | "labelY" | "handles" | "route"> {
  const sourceX = from.x + from.width;
  const sourceY = from.y + from.height / 2;
  const targetX = to.x;
  const targetY = to.y + to.height / 2;
  if (kind === "loop_back") {
    const channelY =
      override?.channelY ??
      loopRoute?.channelY ??
      Math.max(from.y + from.height, to.y + to.height) + LOOP_ROUTE_CLEARANCE;
    const sourceTurnX = override?.sourceTurnX ?? loopRoute?.sourceTurnX ?? sourceX + COLUMN_GAP / 2;
    const targetTurnX = override?.targetTurnX ?? loopRoute?.targetTurnX ?? targetX - COLUMN_GAP / 2;
    return {
      path: `M ${sourceX} ${sourceY} L ${sourceTurnX} ${sourceY} L ${sourceTurnX} ${channelY} L ${targetTurnX} ${channelY} L ${targetTurnX} ${targetY} L ${targetX} ${targetY}`,
      labelX: (sourceTurnX + targetTurnX) / 2,
      labelY: channelY,
      handles: [
        {
          id: "source_turn",
          x: sourceTurnX,
          y: (sourceY + channelY) / 2,
          axis: "x",
        },
        {
          id: "channel",
          x: (sourceTurnX + targetTurnX) / 2,
          y: channelY,
          axis: "y",
        },
        {
          id: "target_turn",
          x: targetTurnX,
          y: (targetY + channelY) / 2,
          axis: "x",
        },
      ],
      route: { kind: "loop_back", sourceTurnX, targetTurnX, channelY },
    };
  }
  const controlX = override?.control?.x ?? (sourceX + targetX) / 2;
  const controlY = override?.control?.y ?? (sourceY + targetY) / 2;
  return {
    path: `M ${sourceX} ${sourceY} C ${controlX} ${sourceY}, ${controlX} ${controlY}, ${controlX} ${controlY} C ${controlX} ${controlY}, ${controlX} ${targetY}, ${targetX} ${targetY}`,
    labelX: controlX,
    labelY: controlY,
    handles: [{ id: "control", x: controlX, y: controlY, axis: "both" }],
    route: { kind: "forward", controlX, controlY },
  };
}

interface LoopRouteCandidate {
  edgeId: string;
  baseY: number;
  baseSourceTurnX: number;
  baseTargetTurnX: number;
  sourceY: number;
  targetY: number;
  horizontalStartX: number;
  horizontalEndX: number;
  targetLane: number;
}

interface AssignedLoopRoute {
  sourceTurnX: number;
  targetTurnX: number;
  channelY: number;
  sourceY: number;
  targetY: number;
  horizontalStartX: number;
  horizontalEndX: number;
}

function allocateLoopBackRoutes(
  model: WorkflowGraphModel,
  edges: Array<WorkflowGraphEdge & { id: string }>,
  nodeById: Map<string, WorkflowGraphLayoutNode>,
): Map<string, LoopBackRoute> {
  const subtreeBoundsByStepId = calculateSubtreeBoundsByStepId(model.nodes, nodeById);
  const candidates = edges.flatMap((edge): LoopRouteCandidate[] => {
    if (edge.kind !== "loop_back") {
      return [];
    }
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) {
      return [];
    }
    const sourceX = from.x + from.width;
    const sourceY = from.y + from.height / 2;
    const targetY = to.y + to.height / 2;
    const bounds = subtreeBoundsByStepId.get(edge.to) ?? {
      left: to.x,
      right: to.x + to.width,
      bottom: to.y + to.height,
    };
    const baseSourceTurnX = Math.max(sourceX + COLUMN_GAP / 2, bounds.right + LOOP_SIDE_CLEARANCE);
    const baseTargetTurnX = Math.max(
      MIN_CANVAS_COORDINATE,
      Math.min(to.x - COLUMN_GAP / 2, bounds.left - LOOP_SIDE_CLEARANCE),
    );
    return [
      {
        edgeId: edge.id,
        baseY: Math.max(bounds.bottom, from.y + from.height) + LOOP_ROUTE_CLEARANCE,
        baseSourceTurnX,
        baseTargetTurnX,
        sourceY,
        targetY,
        horizontalStartX: baseTargetTurnX,
        horizontalEndX: baseSourceTurnX,
        targetLane: to.lane,
      },
    ];
  });
  candidates.sort(
    (left, right) =>
      left.baseY - right.baseY ||
      right.targetLane - left.targetLane ||
      left.horizontalEndX -
        left.horizontalStartX -
        (right.horizontalEndX - right.horizontalStartX) ||
      left.edgeId.localeCompare(right.edgeId),
  );

  const assigned: AssignedLoopRoute[] = [];
  const routeByEdgeId = new Map<string, LoopBackRoute>();
  for (const candidate of candidates) {
    let channelY = candidate.baseY;
    while (true) {
      const conflicts = assigned.filter(
        (route) =>
          horizontalRangesOverlap(candidate, route) &&
          Math.abs(route.channelY - channelY) < LOOP_CHANNEL_GAP,
      );
      if (conflicts.length === 0) {
        break;
      }
      channelY = Math.max(...conflicts.map((route) => route.channelY)) + LOOP_CHANNEL_GAP;
    }
    let sourceTurnX = candidate.baseSourceTurnX;
    while (true) {
      const parallelConflicts = assigned.filter(
        (route) =>
          verticalRangesOverlap(candidate.sourceY, channelY, route.sourceY, route.channelY) &&
          Math.abs(route.sourceTurnX - sourceTurnX) < LOOP_CHANNEL_GAP,
      );
      const horizontalCrossings = assigned.filter(
        (route) =>
          valueFallsInsideRange(sourceTurnX, route.horizontalStartX, route.horizontalEndX) &&
          valueFallsInsideRange(route.channelY, candidate.sourceY, channelY),
      );
      if (parallelConflicts.length === 0 && horizontalCrossings.length === 0) {
        break;
      }
      sourceTurnX =
        Math.max(
          sourceTurnX,
          ...parallelConflicts.map((route) => route.sourceTurnX),
          ...horizontalCrossings.map((route) => route.horizontalEndX),
        ) + LOOP_CHANNEL_GAP;
    }
    let targetTurnX = candidate.baseTargetTurnX;
    while (true) {
      const parallelConflicts = assigned.filter(
        (route) =>
          verticalRangesOverlap(candidate.targetY, channelY, route.targetY, route.channelY) &&
          Math.abs(route.targetTurnX - targetTurnX) < LOOP_CHANNEL_GAP,
      );
      const horizontalCrossings = assigned.filter(
        (route) =>
          valueFallsInsideRange(targetTurnX, route.horizontalStartX, route.horizontalEndX) &&
          valueFallsInsideRange(route.channelY, candidate.targetY, channelY),
      );
      if (parallelConflicts.length === 0 && horizontalCrossings.length === 0) {
        break;
      }
      targetTurnX = Math.max(
        MIN_CANVAS_COORDINATE,
        Math.min(
          targetTurnX,
          ...parallelConflicts.map((route) => route.targetTurnX),
          ...horizontalCrossings.map((route) => route.horizontalStartX),
        ) - LOOP_CHANNEL_GAP,
      );
      if (targetTurnX === MIN_CANVAS_COORDINATE) {
        break;
      }
    }
    const route = {
      sourceTurnX,
      targetTurnX,
      channelY,
      sourceY: candidate.sourceY,
      targetY: candidate.targetY,
      horizontalStartX: targetTurnX,
      horizontalEndX: sourceTurnX,
    };
    assigned.push(route);
    routeByEdgeId.set(candidate.edgeId, { sourceTurnX, targetTurnX, channelY });
  }
  return routeByEdgeId;
}

interface WorkflowGraphBounds {
  left: number;
  right: number;
  bottom: number;
}

function calculateSubtreeBoundsByStepId(
  nodes: WorkflowGraphNode[],
  nodeById: Map<string, WorkflowGraphLayoutNode>,
): Map<string, WorkflowGraphBounds> {
  const result = new Map<string, WorkflowGraphBounds>();
  const visit = (node: WorkflowGraphNode): WorkflowGraphBounds => {
    const positioned = nodeById.get(node.stepId);
    const bounds: WorkflowGraphBounds = positioned
      ? {
          left: positioned.x,
          right: positioned.x + positioned.width,
          bottom: positioned.y + positioned.height,
        }
      : { left: Number.MAX_SAFE_INTEGER, right: 0, bottom: 0 };
    for (const branch of node.branches) {
      for (const child of branch.nodes) {
        const childBounds = visit(child);
        bounds.left = Math.min(bounds.left, childBounds.left);
        bounds.right = Math.max(bounds.right, childBounds.right);
        bounds.bottom = Math.max(bounds.bottom, childBounds.bottom);
      }
    }
    result.set(node.stepId, bounds);
    return bounds;
  };
  for (const node of nodes) {
    visit(node);
  }
  return result;
}

function horizontalRangesOverlap(
  left: Pick<LoopRouteCandidate, "horizontalStartX" | "horizontalEndX">,
  right: Pick<AssignedLoopRoute, "horizontalStartX" | "horizontalEndX">,
): boolean {
  return (
    left.horizontalStartX < right.horizontalEndX && right.horizontalStartX < left.horizontalEndX
  );
}

function verticalRangesOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): boolean {
  const firstTop = Math.min(firstStart, firstEnd);
  const firstBottom = Math.max(firstStart, firstEnd);
  const secondTop = Math.min(secondStart, secondEnd);
  const secondBottom = Math.max(secondStart, secondEnd);
  return firstTop < secondBottom && secondTop < firstBottom;
}

function valueFallsInsideRange(value: number, start: number, end: number): boolean {
  return value > Math.min(start, end) && value < Math.max(start, end);
}
