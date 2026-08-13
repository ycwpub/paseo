import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKFLOW_GRAPH_ZOOM,
  MAX_WORKFLOW_GRAPH_ZOOM,
  MIN_WORKFLOW_GRAPH_ZOOM,
  clampWorkflowGraphZoom,
  formatWorkflowGraphZoom,
  zoomWorkflowGraphIn,
  zoomWorkflowGraphOut,
} from "./graph-zoom";

describe("workflow graph zoom", () => {
  it("steps in and out by a quarter", () => {
    expect(zoomWorkflowGraphIn(DEFAULT_WORKFLOW_GRAPH_ZOOM)).toBe(1.25);
    expect(zoomWorkflowGraphOut(DEFAULT_WORKFLOW_GRAPH_ZOOM)).toBe(0.75);
  });

  it("clamps zoom to the supported range", () => {
    expect(zoomWorkflowGraphIn(MAX_WORKFLOW_GRAPH_ZOOM)).toBe(MAX_WORKFLOW_GRAPH_ZOOM);
    expect(zoomWorkflowGraphOut(MIN_WORKFLOW_GRAPH_ZOOM)).toBe(MIN_WORKFLOW_GRAPH_ZOOM);
    expect(clampWorkflowGraphZoom(Number.NaN)).toBe(DEFAULT_WORKFLOW_GRAPH_ZOOM);
  });

  it("formats zoom as a percentage", () => {
    expect(formatWorkflowGraphZoom(1.25)).toBe("125%");
  });
});
