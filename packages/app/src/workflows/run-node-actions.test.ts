import { describe, expect, it } from "vitest";
import { deriveWorkflowNodeActions, deriveWorkflowNodeIdentity } from "./run-node-actions";

describe("deriveWorkflowNodeActions", () => {
  it("allows Agent nodes to expand while keeping agent navigation available", () => {
    expect(
      deriveWorkflowNodeActions({
        stepType: "agent",
        agentId: "agent-1",
      }),
    ).toEqual({
      canExpand: true,
      canOpenAgent: true,
    });
  });

  it("allows every node to expand even when there is no linked agent", () => {
    expect(deriveWorkflowNodeActions({ stepType: "agent", agentId: null })).toEqual({
      canExpand: true,
      canOpenAgent: false,
    });
    expect(deriveWorkflowNodeActions({ stepType: "bash", agentId: null })).toEqual({
      canExpand: true,
      canOpenAgent: false,
    });
  });
});

describe("deriveWorkflowNodeIdentity", () => {
  it("keeps the configured node name and node ID as separate values", () => {
    expect(deriveWorkflowNodeIdentity({ stepId: "prepare-data", stepName: "准备数据" })).toEqual({
      id: "prepare-data",
      name: "准备数据",
    });
  });

  it("does not replace a missing name with the node ID", () => {
    expect(deriveWorkflowNodeIdentity({ stepId: "node1", stepName: "  " })).toEqual({
      id: "node1",
      name: null,
    });
  });
});
