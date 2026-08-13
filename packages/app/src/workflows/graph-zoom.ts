export const MIN_WORKFLOW_GRAPH_ZOOM = 0.5;
export const MAX_WORKFLOW_GRAPH_ZOOM = 2;
export const DEFAULT_WORKFLOW_GRAPH_ZOOM = 1;
export const WORKFLOW_GRAPH_ZOOM_STEP = 0.25;

export interface WorkflowGraphZoomGeometry {
  scale: number;
  contentWidth: number;
  contentHeight: number;
  viewportHeight: number;
}

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

export function calculateWorkflowGraphZoomGeometry(
  layoutWidth: number,
  layoutHeight: number,
  zoom: number,
): WorkflowGraphZoomGeometry {
  const scale = clampWorkflowGraphZoom(zoom);
  return {
    scale,
    contentWidth: Math.max(0, layoutWidth) * scale,
    contentHeight: Math.max(0, layoutHeight) * scale,
    viewportHeight: Math.max(0, layoutHeight),
  };
}
