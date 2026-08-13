const MIN_EXPANDED_EDITOR_HEIGHT = 260;
const MAX_EXPANDED_EDITOR_HEIGHT = 640;
const EXPANDED_EDITOR_VIEWPORT_RATIO = 0.56;

export function calculateExpandedWorkflowEditorHeight(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return MIN_EXPANDED_EDITOR_HEIGHT;
  }
  return Math.round(
    Math.min(
      MAX_EXPANDED_EDITOR_HEIGHT,
      Math.max(MIN_EXPANDED_EDITOR_HEIGHT, viewportHeight * EXPANDED_EDITOR_VIEWPORT_RATIO),
    ),
  );
}
