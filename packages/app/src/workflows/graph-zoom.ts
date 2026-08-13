export const MIN_WORKFLOW_GRAPH_ZOOM = 0.5;
export const MAX_WORKFLOW_GRAPH_ZOOM = 2;
export const DEFAULT_WORKFLOW_GRAPH_ZOOM = 1;
export const WORKFLOW_GRAPH_ZOOM_STEP = 0.25;

export function clampWorkflowGraphZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_WORKFLOW_GRAPH_ZOOM;
  }
  return Math.min(MAX_WORKFLOW_GRAPH_ZOOM, Math.max(MIN_WORKFLOW_GRAPH_ZOOM, value));
}

export function zoomWorkflowGraphIn(value: number): number {
  return clampWorkflowGraphZoom(value + WORKFLOW_GRAPH_ZOOM_STEP);
}

export function zoomWorkflowGraphOut(value: number): number {
  return clampWorkflowGraphZoom(value - WORKFLOW_GRAPH_ZOOM_STEP);
}

export function formatWorkflowGraphZoom(value: number): string {
  return `${Math.round(clampWorkflowGraphZoom(value) * 100)}%`;
}
