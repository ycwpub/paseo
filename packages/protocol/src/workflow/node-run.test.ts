import { describe, expect, it } from "vitest";
import { WorkflowRunRequestSchema } from "./rpc-schemas.js";
import { WorkflowRunSchema } from "./types.js";

describe("workflow node runs", () => {
  it("accepts a target node ID on workflow run requests", () => {
    expect(
      WorkflowRunRequestSchema.parse({
        type: "workflow/run",
        requestId: "request-run",
        scriptPath: "/tmp/workflow.json",
        inputPayload: '{"control":""}',
        targetNodeId: "worker",
      }).targetNodeId,
    ).toBe("worker");

    expect(
      WorkflowRunRequestSchema.safeParse({
        type: "workflow/run",
        requestId: "request-run",
        scriptPath: "/tmp/workflow.json",
        inputPayload: '{"control":""}',
        targetNodeId: "   ",
      }).success,
    ).toBe(false);
  });

  it("defaults a missing targetNodeId for persisted version 1 runs", () => {
    const run = WorkflowRunSchema.parse({
      id: "run-1",
      scriptPath: "/tmp/workflow.json",
      scriptSnapshot: {
        apiVersion: "paseo.sh/workflow/v1",
        kind: "Workflow",
        version: 1,
        name: "Version 1",
        steps: [{ id: "worker", type: "bash", initialCommand: "echo '{}'" }],
      },
      status: "succeeded",
      inputFilePath: "",
      outputFilePath: null,
      control: "",
      error: null,
      startedAt: "2026-08-12T00:00:00.000Z",
      endedAt: "2026-08-12T00:00:01.000Z",
      nodeRuns: [],
    });

    expect(run.targetNodeId).toBeNull();
  });
});
