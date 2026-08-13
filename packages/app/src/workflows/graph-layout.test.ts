import { describe, expect, it } from "vitest";
import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { buildWorkflowGraphModel } from "./graph-model";
import {
  layoutWorkflowGraph,
  WORKFLOW_GRAPH_NODE_HEIGHT,
  WORKFLOW_GRAPH_NODE_WIDTH,
} from "./graph-layout";

describe("workflow graph layout", () => {
  it("lays a linear workflow out from left to right with start and end nodes", () => {
    const layout = createLayout([
      { id: "first", type: "bash", initialCommand: "true" },
      { id: "second", type: "python", code: "print('{}')" },
    ]);

    expect(layout.nodes.map((candidate) => [candidate.id, candidate.rank, candidate.lane])).toEqual(
      [
        ["__workflow_start__", 0, 0],
        ["first", 1, 0],
        ["second", 2, 0],
        ["__workflow_end__", 3, 0],
      ],
    );
    expect(layout.edges.map((edge) => [edge.from, edge.to])).toEqual([
      ["__workflow_start__", "first"],
      ["first", "second"],
      ["second", "__workflow_end__"],
    ]);
  });

  it("places switch branches in separate lanes and merges them into a later rank", () => {
    const layout = createLayout([
      {
        id: "route",
        type: "switch",
        cases: [
          {
            equals: "yes",
            steps: [{ id: "approve", type: "bash", initialCommand: "true" }],
          },
          {
            equals: "no",
            steps: [{ id: "reject", type: "bash", initialCommand: "true" }],
          },
        ],
        defaultSteps: [],
      },
      { id: "finish", type: "bash", initialCommand: "true" },
    ]);

    expect(node(layout, "route")).toMatchObject({ rank: 1, lane: 0 });
    expect(node(layout, "approve")).toMatchObject({ rank: 2, lane: 1 });
    expect(node(layout, "reject")).toMatchObject({ rank: 2, lane: 2 });
    expect(node(layout, "finish")).toMatchObject({ rank: 3, lane: 0 });
    expect(
      layout.edges.some(
        (edge) =>
          edge.from === "route" &&
          edge.to === "finish" &&
          edge.kind === "branch" &&
          edge.label === null,
      ),
    ).toBe(true);
  });

  it("keeps loop bodies off the main lane and renders a loop-back edge", () => {
    const layout = createLayout([
      {
        id: "loop",
        type: "for",
        steps: [{ id: "worker", type: "bash", initialCommand: "true" }],
      },
      { id: "finish", type: "bash", initialCommand: "true" },
    ]);

    expect(node(layout, "loop")).toMatchObject({ rank: 1, lane: 0 });
    expect(node(layout, "worker")).toMatchObject({ rank: 2, lane: 1 });
    expect(node(layout, "finish")).toMatchObject({ rank: 2, lane: 0 });
    expect(
      layout.edges.some(
        (edge) => edge.from === "worker" && edge.to === "loop" && edge.kind === "loop_back",
      ),
    ).toBe(true);
  });

  it("connects a terminal loop controller to workflow end", () => {
    const layout = createLayout([
      {
        id: "loop",
        type: "for",
        steps: [{ id: "worker", type: "bash", initialCommand: "true" }],
      },
    ]);

    expect(
      layout.edges.some(
        (edge) =>
          edge.from === "loop" && edge.to === "__workflow_end__" && edge.kind === "sequence",
      ),
    ).toBe(true);
    expect(
      layout.edges.some((edge) => edge.from === "worker" && edge.to === "__workflow_end__"),
    ).toBe(false);
  });

  it("connects every terminal switch branch to workflow end", () => {
    const layout = createLayout([
      {
        id: "route",
        type: "switch",
        cases: [
          {
            equals: "yes",
            steps: [{ id: "approve", type: "bash", initialCommand: "true" }],
          },
        ],
        defaultSteps: [],
      },
    ]);

    expect(
      layout.edges.some((edge) => edge.from === "approve" && edge.to === "__workflow_end__"),
    ).toBe(true);
    expect(
      layout.edges.some(
        (edge) =>
          edge.from === "route" &&
          edge.to === "__workflow_end__" &&
          edge.kind === "branch" &&
          edge.label === null,
      ),
    ).toBe(true);
  });

  it("uses stable fixed-size nodes without overlaps", () => {
    const layout = createLayout([
      {
        id: "route",
        type: "switch",
        cases: [
          {
            equals: "a",
            steps: [
              { id: "a1", type: "bash", initialCommand: "true" },
              { id: "a2", type: "bash", initialCommand: "true" },
            ],
          },
          {
            equals: "b",
            steps: [{ id: "b1", type: "bash", initialCommand: "true" }],
          },
        ],
      },
      { id: "finish", type: "bash", initialCommand: "true" },
    ]);

    for (const current of layout.nodes.filter((candidate) => candidate.kind === "step")) {
      expect(current.width).toBe(WORKFLOW_GRAPH_NODE_WIDTH);
      expect(current.height).toBe(WORKFLOW_GRAPH_NODE_HEIGHT);
      for (const candidate of layout.nodes) {
        if (current.id === candidate.id) {
          continue;
        }
        expect(overlaps(current, candidate)).toBe(false);
      }
    }
  });
});

function createLayout(steps: WorkflowStep[]) {
  return layoutWorkflowGraph(buildWorkflowGraphModel(steps));
}

function node(layout: ReturnType<typeof createLayout>, id: string) {
  const result = layout.nodes.find((candidate) => candidate.id === id);
  if (!result) {
    throw new Error(`Missing layout node: ${id}`);
  }
  return result;
}

function overlaps(left: ReturnType<typeof node>, right: ReturnType<typeof node>): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}
