import { describe, expect, it } from "vitest";
import { WorkflowRunRequestSchema } from "./rpc-schemas.js";
import { WorkflowRunSchema } from "./types.js";

describe("workflow node runs", () => {
  it("accepts a target node ID and input mode on workflow run requests", () => {
    const request = WorkflowRunRequestSchema.parse({
      type: "workflow/run",
      requestId: "request-run",
      scriptPath: "/tmp/workflow.json",
      inputPayload:
        '{"data":{"control":""},"origin_input":{"requestId":"request-1"},"workflow":{"var":{}},"node":{"var":{}}}',
      targetNodeId: "worker",
      targetInputMode: "node_input",
    });
    expect(request.targetNodeId).toBe("worker");
    expect(request.targetInputMode).toBe("node_input");

    expect(
      WorkflowRunRequestSchema.safeParse({
        type: "workflow/run",
        requestId: "request-run",
        scriptPath: "/tmp/workflow.json",
        inputPayload: '{"control":""}',
        targetNodeId: "   ",
      }).success,
    ).toBe(false);
    expect(
      WorkflowRunRequestSchema.safeParse({
        type: "workflow/run",
        requestId: "request-run",
        scriptPath: "/tmp/workflow.json",
        inputPayload: '{"data":{},"origin_input":{},"workflow":{"var":{}},"node":{"var":{}}}',
        targetInputMode: "node_input",
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
    expect(run.targetInputMode).toBe("upstream_output");
  });
});
