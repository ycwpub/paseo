import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoundCreateAgentCommand } from "../agent/create-agent/create.js";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowService } from "./service.js";

const tempDirs: string[] = [];
const workflowV1 = {
  apiVersion: "paseo.sh/workflow/v1",
  kind: "Workflow",
  version: 1,
} as const;

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function nodeCommand(source: string): string {
  const wrappedSource = ["const input = JSON.parse(process.argv[1]);", source].join("\n");
  const command = [shellQuote(process.execPath), "-e", shellQuote(wrappedSource), '"$input"'].join(
    " ",
  );
  return `output="$(${command})"`;
}

function appendVisitCommand(label: string): string {
  return nodeCommand(
    [
      "process.stdout.write(JSON.stringify({",
      "  data: {",
      "    ...input.data,",
      `    control: ${JSON.stringify(label)},`,
      `    visited: [...(input.data.visited ?? []), ${JSON.stringify(label)}]`,
      "  }",
      "}));",
    ].join("\n"),
  );
}

function echoNodeInputCommand(): string {
  return nodeCommand(
    ["process.stdout.write(JSON.stringify({", "  data: { received: input }", "}));"].join("\n"),
  );
}

function modifyVariablesCommand(): string {
  return nodeCommand(
    [
      "process.stdout.write(JSON.stringify({",
      "  data: { status: 'done' },",
      "  modify: {",
      "    workflow: { var: { trace: 'updated' } },",
      "    loop: { var: { cursor: '1' } }",
      "  }",
      "}));",
    ].join("\n"),
  );
}

async function createService(): Promise<{ home: string; service: WorkflowService }> {
  const home = await mkdtemp(join(tmpdir(), "paseo-workflow-node-run-"));
  tempDirs.push(home);
  const service = new WorkflowService({
    paseoHome: home,
    logger: pino({ enabled: false }),
    agentManager: {
      runAgent: async () => {
        throw new Error("Agent execution is not expected in this test");
      },
      waitForAgentEvent: async () => {
        throw new Error("Agent execution is not expected in this test");
      },
    } as never,
    createAgent: (async () => {
      throw new Error("Agent creation is not expected in this test");
    }) as BoundCreateAgentCommand,
    createDirectoryWorkspace: async () => {
      throw new Error("Workspace creation is not expected in this test");
    },
    createPaseoWorktreeWorkspace: async () => {
      throw new Error("Worktree creation is not expected in this test");
    },
    archiveWorkspace: async () => undefined,
  });
  await service.start();
  return { home, service };
}

describe("WorkflowService node runs", () => {
  it("runs only the requested top-level node", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        name: "Single node",
        steps: [
          { id: "first", type: "bash", initialCommand: appendVisitCommand("first") },
          { id: "worker", type: "bash", initialCommand: appendVisitCommand("worker") },
          { id: "last", type: "bash", initialCommand: appendVisitCommand("last") },
        ],
      }),
    );

    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"customer":"Alice"}',
      targetNodeId: "worker",
    });

    expect(run.status).toBe("succeeded");
    expect(run.targetNodeId).toBe("worker");
    expect(run.targetInputMode).toBe("upstream_output");
    expect(run.nodeRuns.map((node) => node.stepId)).toEqual(["worker"]);
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      control: "worker",
      customer: "Alice",
      visited: ["worker"],
    });
  });

  it("passes a complete node input directly without mapping or variable filling", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        name: "Direct node input",
        variables: {
          trace: { type: "string", default: "framework-trace" },
        },
        steps: [
          {
            id: "worker",
            type: "bash",
            initialCommand: echoNodeInputCommand(),
            inputs: {
              mappedCustomer: "{{data.customer}}",
            },
            inputSchema: {
              type: "object",
              required: ["customer"],
              properties: {
                customer: { type: "string" },
              },
            },
            variables: {
              role: { type: "string", default: "framework-role" },
            },
          },
        ],
      }),
    );
    const directInput = {
      data: { customer: "Alice" },
      origin_input: { requestId: "request-1", customer: "Original Alice" },
      workflow: { var: { trace: "manual-trace" } },
      loop: { var: { item: "manual-item", index: 2, count: 4 } },
      node: { var: { role: "manual-role" } },
    };

    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: JSON.stringify(directInput),
      targetNodeId: "worker",
      targetInputMode: "node_input",
    });

    expect(run.status).toBe("succeeded");
    expect(run.targetInputMode).toBe("node_input");
    expect(JSON.parse(run.inputPayload ?? "{}")).toEqual(directInput);
    expect(JSON.parse(run.nodeRuns[0]?.inputPayload ?? "{}")).toEqual(directInput);
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({ received: directInput });
  });

  it("requires a target node and a complete envelope for direct node input", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        name: "Direct node validation",
        steps: [{ id: "worker", type: "bash", initialCommand: echoNodeInputCommand() }],
      }),
    );

    await expect(
      service.runScript({
        scriptPath,
        inputPayload: '{"data":{},"workflow":{"var":{}},"node":{"var":{}}}',
        targetInputMode: "node_input",
      }),
    ).rejects.toThrow("Direct node input requires a target workflow node");
    await expect(
      service.runScript({
        scriptPath,
        inputPayload: '{"data":{}}',
        targetNodeId: "worker",
        targetInputMode: "node_input",
      }),
    ).rejects.toThrow(
      "Direct node input must contain data, origin_input, workflow.var, and node.var objects",
    );
    expect(await service.listRuns()).toEqual([]);
  });

  it("keeps the original Workflow input available to every node and For iteration", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        name: "Original input",
        steps: [
          {
            id: "prepare",
            type: "bash",
            initialCommand: appendVisitCommand("prepare"),
          },
          {
            id: "route",
            type: "switch",
            switchVar: "{{data.route}}",
            cases: [
              {
                equals: "review",
                steps: [
                  {
                    id: "branch",
                    type: "bash",
                    initialCommand: appendVisitCommand("branch"),
                  },
                ],
              },
            ],
          },
          {
            id: "items",
            type: "for",
            mode: "array",
            items: "{{data.items}}",
            steps: [
              {
                id: "worker",
                type: "bash",
                initialCommand: appendVisitCommand("worker"),
              },
            ],
          },
        ],
      }),
    );
    const originalInput = {
      requestId: "request-1",
      route: "review",
      items: [{ id: 1 }, { id: 2 }],
    };

    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: JSON.stringify(originalInput),
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(run.nodeRuns.map((nodeRun) => nodeRun.stepId)).toEqual([
      "prepare",
      "route",
      "branch",
      "items",
      "worker",
      "worker",
    ]);
    for (const nodeRun of run.nodeRuns) {
      expect(JSON.parse(nodeRun.inputPayload ?? "{}").origin_input).toEqual(originalInput);
    }
  });

  it("records the complete node output envelope including variable modifications", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        name: "Complete node output",
        variables: {
          trace: { type: "string", default: "initial" },
        },
        steps: [
          {
            id: "loop",
            type: "for",
            mode: "array",
            items: "{{data.items}}",
            loopVariables: {
              cursor: { type: "string", default: "0" },
            },
            steps: [
              {
                id: "worker",
                type: "bash",
                initialCommand: modifyVariablesCommand(),
              },
            ],
          },
        ],
      }),
    );

    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"items":[1]}',
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({ status: "done" });
    const workerRun = run.nodeRuns.find((node) => node.stepId === "worker");
    expect(JSON.parse(workerRun?.outputPayload ?? "{}")).toEqual({
      data: { status: "done" },
      modify: {
        workflow: { var: { trace: "updated" } },
        loop: { var: { cursor: "1" } },
      },
      base_resp: {
        status_code: 0,
        status_msg: "",
        forbid_retry: 0,
      },
    });
  });

  it("treats a missing For control field as an empty control value", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        name: "Optional For control",
        steps: [
          {
            id: "loop",
            type: "for",
            mode: "array",
            items: "{{data.items}}",
            forControl: "{{data.control}}",
            steps: [
              {
                id: "worker",
                type: "bash",
                initialCommand: nodeCommand(
                  "process.stdout.write(JSON.stringify({ data: { status: 'done' } }));",
                ),
              },
            ],
          },
        ],
      }),
    );

    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"items":[1,2]}',
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(run.nodeRuns.filter((node) => node.stepId === "worker")).toHaveLength(2);
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({ status: "done" });
  });

  it("finds and runs a nested node directly", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        name: "Nested target",
        steps: [
          {
            id: "route",
            type: "switch",
            cases: [
              {
                equals: "yes",
                steps: [
                  {
                    id: "loop",
                    type: "for",
                    mode: "array",
                    items: "{{data.items}}",
                    steps: [
                      {
                        id: "worker",
                        type: "bash",
                        initialCommand: appendVisitCommand("nested-worker"),
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: "{}",
      targetNodeId: "worker",
    });

    expect(run.nodeRuns.map((node) => node.stepId)).toEqual(["worker"]);
    expect(JSON.parse(run.outputPayload ?? "{}")).toMatchObject({
      control: "nested-worker",
      visited: ["nested-worker"],
    });
  });

  it("runs the selected control node with its child flow", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        name: "Switch target",
        steps: [
          {
            id: "route",
            type: "switch",
            cases: [
              {
                equals: "yes",
                steps: [
                  {
                    id: "matched",
                    type: "bash",
                    initialCommand: appendVisitCommand("matched"),
                  },
                ],
              },
            ],
            defaultSteps: [
              {
                id: "fallback",
                type: "bash",
                initialCommand: appendVisitCommand("fallback"),
              },
            ],
          },
          { id: "after", type: "bash", initialCommand: appendVisitCommand("after") },
        ],
      }),
    );

    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"control":"yes"}',
      targetNodeId: "route",
    });

    expect(run.nodeRuns.map((node) => node.stepId)).toEqual(["route", "matched"]);
    expect(JSON.parse(run.outputPayload ?? "{}")).toMatchObject({
      control: "matched",
      visited: ["matched"],
    });
  });

  it("rejects an unknown node before creating a run", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        name: "Unknown target",
        steps: [{ id: "worker", type: "bash", initialCommand: appendVisitCommand("worker") }],
      }),
    );

    await expect(
      service.runScript({
        scriptPath,
        inputPayload: "{}",
        targetNodeId: "missing",
      }),
    ).rejects.toThrow("Workflow node not found: missing");
    expect(await service.listRuns()).toEqual([]);
  });
});
