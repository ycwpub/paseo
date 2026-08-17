import { describe, expect, it } from "vitest";
import { ServerInfoStatusPayloadSchema } from "../messages.js";
import { WorkflowNodeRunSchema, WorkflowScriptSchema } from "./types.js";

describe("Python workflow protocol", () => {
  it("accepts an editable Python node with execution settings", () => {
    const script = WorkflowScriptSchema.parse({
      apiVersion: "paseo.sh/workflow/v1",
      kind: "Workflow",
      version: 1,
      name: "Python workflow",
      steps: [
        {
          id: "transform",
          name: "Transform payload",
          type: "python",
          code: 'print("{\\"answer\\":\\"ok\\"}")',
          variables: { customer: { type: "string", default: "Alice" } },
          pythonPath: "/usr/bin/python3",
          cwd: "/tmp",
          env: { MODE: "review" },
          timeoutMs: 30_000,
          retry: { maxAttempts: 2 },
        },
      ],
    });

    expect(script.steps[0]).toMatchObject({
      id: "transform",
      type: "python",
      pythonPath: "/usr/bin/python3",
      env: { MODE: "review" },
      timeoutMs: 30_000,
    });
  });

  it("accepts a Python module function instead of inline code", () => {
    const script = WorkflowScriptSchema.parse({
      apiVersion: "paseo.sh/workflow/v1",
      kind: "Workflow",
      version: 1,
      name: "Python module workflow",
      steps: [
        {
          id: "prepare",
          type: "python",
          module: "scripts.prepare_auto_troubleshoot",
          function: "run_node",
        },
      ],
    });

    expect(script.steps[0]).toMatchObject({
      type: "python",
      module: "scripts.prepare_auto_troubleshoot",
      function: "run_node",
    });
  });

  it("requires exactly one Python execution mode", () => {
    const base = {
      apiVersion: "paseo.sh/workflow/v1",
      kind: "Workflow",
      version: 1,
      name: "Invalid Python workflow",
    } as const;

    expect(
      WorkflowScriptSchema.safeParse({
        ...base,
        steps: [
          {
            id: "both",
            type: "python",
            code: 'output = {"data": {}}',
            module: "scripts.prepare",
            function: "run_node",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      WorkflowScriptSchema.safeParse({
        ...base,
        steps: [{ id: "missing-function", type: "python", module: "scripts.prepare" }],
      }).success,
    ).toBe(false);
    expect(
      WorkflowScriptSchema.safeParse({
        ...base,
        steps: [{ id: "missing-mode", type: "python" }],
      }).success,
    ).toBe(false);
  });

  it("keeps Python run records compatible with clients that know Bash nodes", () => {
    const nodeRun = WorkflowNodeRunSchema.parse({
      id: "run-node",
      stepId: "transform",
      stepName: "Transform payload",
      stepType: "bash",
      executor: "python",
      iterationPath: [],
      startedAt: "2026-08-12T00:00:00.000Z",
      endedAt: "2026-08-12T00:00:01.000Z",
      status: "succeeded",
      inputFilePath: "",
      outputFilePath: null,
      inputControl: "",
      outputControl: "",
      error: null,
      agentId: null,
      output: null,
    });

    expect(nodeRun.stepType).toBe("bash");
    expect(nodeRun.executor).toBe("python");
  });

  it("keeps Python support optional in server info", () => {
    const current = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "server-1",
      features: { workflowPython: true },
    });
    const older = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "server-2",
    });

    expect(current.features?.workflowPython).toBe(true);
    expect(older.features?.workflowPython).toBeUndefined();
  });
});
