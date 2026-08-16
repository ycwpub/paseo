import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  WorkflowGraphEdgeHandleId,
  WorkflowGraphLayoutOverrides,
  WorkflowGraphPoint,
} from "./graph-layout";

const STORAGE_PREFIX = "paseo.workflow-graph-layout.v1:";

export const EMPTY_WORKFLOW_GRAPH_LAYOUT: WorkflowGraphLayoutOverrides = {
  nodes: {},
  edges: {},
};

export async function loadWorkflowGraphLayout(
  layoutKey: string | null | undefined,
): Promise<WorkflowGraphLayoutOverrides> {
  if (!layoutKey) {
    return EMPTY_WORKFLOW_GRAPH_LAYOUT;
  }
  try {
    const serialized = await AsyncStorage.getItem(storageKey(layoutKey));
    return serialized
      ? sanitizeWorkflowGraphLayout(JSON.parse(serialized))
      : EMPTY_WORKFLOW_GRAPH_LAYOUT;
  } catch {
    return EMPTY_WORKFLOW_GRAPH_LAYOUT;
  }
}

export async function saveWorkflowGraphLayout(
  layoutKey: string | null | undefined,
  layout: WorkflowGraphLayoutOverrides,
): Promise<void> {
  if (!layoutKey) {
    return;
  }
  if (!hasWorkflowGraphLayoutOverrides(layout)) {
    await AsyncStorage.removeItem(storageKey(layoutKey));
    return;
  }
  await AsyncStorage.setItem(storageKey(layoutKey), JSON.stringify({ version: 1, ...layout }));
}

export function moveWorkflowGraphNode(
  layout: WorkflowGraphLayoutOverrides,
  nodeId: string,
  point: WorkflowGraphPoint,
): WorkflowGraphLayoutOverrides {
  return {
    ...layout,
    nodes: {
      ...layout.nodes,
      [nodeId]: normalizePoint(point),
    },
  };
}

export function moveWorkflowGraphEdgeHandle(
  layout: WorkflowGraphLayoutOverrides,
  edgeId: string,
  handleId: WorkflowGraphEdgeHandleId,
  point: WorkflowGraphPoint,
): WorkflowGraphLayoutOverrides {
  const current = layout.edges[edgeId] ?? {};
  const normalized = normalizePoint(point);
  const edge = { ...current };
  if (handleId === "control") {
    edge.control = normalized;
  } else if (handleId === "source_turn") {
    edge.sourceTurnX = normalized.x;
  } else if (handleId === "target_turn") {
    edge.targetTurnX = normalized.x;
  } else {
    edge.channelY = normalized.y;
  }
  return {
    ...layout,
    edges: {
      ...layout.edges,
      [edgeId]: edge,
    },
  };
}

export function hasWorkflowGraphLayoutOverrides(layout: WorkflowGraphLayoutOverrides): boolean {
  return Object.keys(layout.nodes).length > 0 || Object.keys(layout.edges).length > 0;
}

export function sanitizeWorkflowGraphLayout(value: unknown): WorkflowGraphLayoutOverrides {
  if (!isRecord(value)) {
    return EMPTY_WORKFLOW_GRAPH_LAYOUT;
  }
  const nodes: WorkflowGraphLayoutOverrides["nodes"] = {};
  const edges: WorkflowGraphLayoutOverrides["edges"] = {};
  if (isRecord(value.nodes)) {
    for (const [nodeId, candidate] of Object.entries(value.nodes)) {
      if (isPoint(candidate)) {
        nodes[nodeId] = normalizePoint(candidate);
      }
    }
  }
  if (isRecord(value.edges)) {
    for (const [edgeId, candidate] of Object.entries(value.edges)) {
      if (!isRecord(candidate)) {
        continue;
      }
      const edge: WorkflowGraphLayoutOverrides["edges"][string] = {};
      if (isPoint(candidate.control)) {
        edge.control = normalizePoint(candidate.control);
      }
      if (Number.isFinite(candidate.sourceTurnX)) {
        edge.sourceTurnX = Number(candidate.sourceTurnX);
      }
      if (Number.isFinite(candidate.targetTurnX)) {
        edge.targetTurnX = Number(candidate.targetTurnX);
      }
      if (Number.isFinite(candidate.channelY)) {
        edge.channelY = Number(candidate.channelY);
      }
      if (Object.keys(edge).length > 0) {
        edges[edgeId] = edge;
      }
    }
  }
  return { nodes, edges };
}

function storageKey(layoutKey: string): string {
  return `${STORAGE_PREFIX}${layoutKey}`;
}

function normalizePoint(point: WorkflowGraphPoint): WorkflowGraphPoint {
  return {
    x: Math.max(0, Math.round(point.x)),
    y: Math.max(0, Math.round(point.y)),
  };
}

function isPoint(value: unknown): value is WorkflowGraphPoint {
  return isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
