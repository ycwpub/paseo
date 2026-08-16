import { describe, expect, it } from "vitest";
import {
  EMPTY_WORKFLOW_GRAPH_LAYOUT,
  hasWorkflowGraphLayoutOverrides,
  moveWorkflowGraphEdgeHandle,
  moveWorkflowGraphNode,
  sanitizeWorkflowGraphLayout,
} from "./graph-layout-preferences";

describe("workflow graph layout preferences", () => {
  it("updates node positions without mutating the previous layout", () => {
    const next = moveWorkflowGraphNode(EMPTY_WORKFLOW_GRAPH_LAYOUT, "scan", { x: 120.4, y: 80.6 });

    expect(next.nodes.scan).toEqual({ x: 120, y: 81 });
    expect(EMPTY_WORKFLOW_GRAPH_LAYOUT.nodes).toEqual({});
    expect(hasWorkflowGraphLayoutOverrides(next)).toBe(true);
  });

  it("updates forward and loop edge handles independently", () => {
    const controlled = moveWorkflowGraphEdgeHandle(EMPTY_WORKFLOW_GRAPH_LAYOUT, "a:b", "control", {
      x: 200,
      y: 90,
    });
    const loop = moveWorkflowGraphEdgeHandle(controlled, "b:a", "channel", { x: 0, y: 320 });
    const routed = moveWorkflowGraphEdgeHandle(loop, "b:a", "source_turn", { x: 420, y: 0 });

    expect(routed.edges["a:b"]?.control).toEqual({ x: 200, y: 90 });
    expect(routed.edges["b:a"]).toEqual({ channelY: 320, sourceTurnX: 420 });
  });

  it("drops malformed persisted values", () => {
    expect(
      sanitizeWorkflowGraphLayout({
        version: 1,
        nodes: { valid: { x: 20, y: 30 }, invalid: { x: "20", y: 30 } },
        edges: {
          valid: { sourceTurnX: 100, channelY: 200 },
          invalid: { control: { x: 10 } },
        },
      }),
    ).toEqual({
      nodes: { valid: { x: 20, y: 30 } },
      edges: { valid: { sourceTurnX: 100, channelY: 200 } },
    });
  });
});
