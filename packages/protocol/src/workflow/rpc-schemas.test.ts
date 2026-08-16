import { describe, expect, it } from "vitest";
import { validateWSOutboundMessage } from "../validation/ws-outbound.js";
import { WorkflowRunRequestSchema } from "./rpc-schemas.js";

const nestedScript = {
  apiVersion: "paseo.sh/workflow/v1",
  kind: "Workflow",
  version: 1,
  name: "nested workflow",
  steps: [
    {
      id: "route",
      type: "switch",
      cases: [
        {
          equals: "run",
          steps: [
            {
              id: "loop",
              type: "for",
              items: "{{data.items}}",
              steps: [
                {
                  id: "worker",
                  type: "bash",
                  initialCommand: "echo run",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("workflow WebSocket response schemas", () => {
  it("accepts an input JSON payload when starting a workflow", () => {
    expect(
      WorkflowRunRequestSchema.safeParse({
        type: "workflow/run",
        requestId: "request-run",
        scriptPath: "/tmp/workflow.json",
        inputPayload: '{"control":"","error":"","customer":{"name":"Alice"}}',
      }).success,
    ).toBe(true);
    expect(
      WorkflowRunRequestSchema.safeParse({
        type: "workflow/run",
        requestId: "request-run",
        scriptPath: "/tmp/workflow.json",
        inputFilePath: "/tmp/input.json",
      }).success,
    ).toBe(false);
  });

  it("accepts nested workflow scripts in the generated outbound validator", () => {
    const parsed = validateWSOutboundMessage({
      type: "session",
      message: {
        type: "workflow/inspect/response",
        payload: {
          requestId: "request-1",
          script: {
            path: "/tmp/workflow.json",
            script: nestedScript,
          },
          latestRun: null,
          error: null,
        },
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts nested workflow scripts in save responses", () => {
    const parsed = validateWSOutboundMessage({
      type: "session",
      message: {
        type: "workflow/save/response",
        payload: {
          requestId: "request-2",
          script: {
            path: "/tmp/workflow.json",
            script: nestedScript,
          },
          error: null,
        },
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts cancelled workflow runs with structured error metadata", () => {
    const parsed = validateWSOutboundMessage({
      type: "session",
      message: {
        type: "workflow/cancel-run/response",
        payload: {
          requestId: "request-3",
          run: {
            id: "run-1",
            scriptPath: "/tmp/workflow.json",
            scriptSnapshot: nestedScript,
            status: "cancelled",
            inputFilePath: "/tmp/input.txt",
            outputFilePath: null,
            control: "",
            error: "Workflow run was cancelled",
            errorCode: "WORKFLOW_CANCELLED",
            startedAt: "2026-08-11T00:00:00.000Z",
            endedAt: "2026-08-11T00:00:01.000Z",
            nodeRuns: [],
          },
          error: null,
        },
      },
    });

    expect(parsed.success).toBe(true);
  });
});
