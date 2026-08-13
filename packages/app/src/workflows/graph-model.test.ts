import { describe, expect, it } from "vitest";
import type { WorkflowNodeRun, WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { buildWorkflowGraphModel, findWorkflowGraphNode } from "./graph-model";

describe("workflow graph model", () => {
  it("models sequence, switch branches, merge dependencies, and loop-back edges", () => {
    const steps: WorkflowStep[] = [
      { id: "prepare", type: "bash", initialCommand: "true" },
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
      {
        id: "loop",
        type: "for",
        steps: [{ id: "worker", type: "bash", initialCommand: "true" }],
      },
      { id: "finish", type: "bash", initialCommand: "true" },
    ];

    const model = buildWorkflowGraphModel(steps);

    expect(model.edges).toEqual([
      { from: "prepare", to: "route", kind: "sequence", label: null },
      { from: "route", to: "approve", kind: "branch", label: "yes" },
      { from: "route", to: "reject", kind: "branch", label: "no" },
      { from: "approve", to: "loop", kind: "sequence", label: null },
      { from: "reject", to: "loop", kind: "sequence", label: null },
      { from: "route", to: "loop", kind: "branch", label: null },
      { from: "loop", to: "worker", kind: "branch", label: null },
      { from: "worker", to: "loop", kind: "loop_back", label: null },
      { from: "loop", to: "finish", kind: "sequence", label: null },
    ]);
    expect(findWorkflowGraphNode(model.nodes, "loop")?.dependencies).toEqual([
      "approve",
      "reject",
      "route",
    ]);
  });

  it("aggregates repeated node runs and exposes the latest runtime state", () => {
    const steps: WorkflowStep[] = [
      { id: "worker", type: "bash", initialCommand: "true" },
      { id: "pending", type: "bash", initialCommand: "true" },
    ];
    const runs = [
      createNodeRun("first", "worker", "succeeded"),
      createNodeRun("second", "worker", "running"),
    ];

    const model = buildWorkflowGraphModel(steps, runs);
    const worker = findWorkflowGraphNode(model.nodes, "worker");
    const pending = findWorkflowGraphNode(model.nodes, "pending");

    expect(worker?.status).toBe("running");
    expect(worker?.runs.map((run) => run.id)).toEqual(["first", "second"]);
    expect(worker?.latestRun?.id).toBe("second");
    expect(pending?.status).toBe("not_run");
  });
});

function createNodeRun(
  id: string,
  stepId: string,
  status: WorkflowNodeRun["status"],
): WorkflowNodeRun {
  return {
    id,
    stepId,
    stepName: null,
    stepType: "bash",
    iterationPath: [],
    startedAt: "2026-08-12T00:00:00.000Z",
    endedAt: status === "running" ? null : "2026-08-12T00:00:01.000Z",
    status,
    attempt: 1,
    maxAttempts: 1,
    retryDelayMs: null,
    inputPayload: "{}",
    outputPayload: status === "running" ? null : "{}",
    inputFilePath: "",
    outputFilePath: null,
    inputControl: "",
    outputControl: null,
    error: null,
    errorCode: null,
    agentId: null,
    agentPrompt: null,
    agentResponse: null,
    workflowPath: null,
    workflowRunId: null,
    output: null,
  };
}
