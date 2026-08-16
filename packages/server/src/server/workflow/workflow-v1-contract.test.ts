import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import type { BoundCreateAgentCommand } from "../agent/create-agent/create.js";
import { WorkflowService } from "./service.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function nodeOutputCommand(source: string): string {
  const program = [
    "const input = JSON.parse(process.argv[1]);",
    source,
    "process.stdout.write(JSON.stringify(output));",
  ].join("\n");
  return `output="$(${shellQuote(process.execPath)} -e ${shellQuote(program)} "$input")"`;
}

async function createService(): Promise<{ home: string; service: WorkflowService }> {
  const home = await mkdtemp(join(tmpdir(), "paseo-workflow-v1-"));
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

describe("WorkflowService version 1 data contract", () => {
  it("validates schemas, maps variables, branches, loops, and fills artifacts", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        apiVersion: "paseo.sh/workflow/v1",
        kind: "Workflow",
        version: 1,
        name: "Structured workflow",
        variables: {
          traceId: { type: "string", default: "" },
        },
        outputSchema: {
          type: "object",
          required: ["project", "item", "index", "traceId", "control"],
          properties: {
            project: { type: "string" },
            item: { type: "string" },
            index: { type: "integer" },
            traceId: { type: "string" },
            control: { const: "break" },
          },
        },
        steps: [
          {
            id: "prepare",
            type: "bash",
            initialCommand: nodeOutputCommand(`
output = {
  data: {
    project: input.data.project,
    route: "process",
    items: ["alpha", "beta", "gamma"]
  },
  modify: {
    workflow: { var: { traceId: "trace-1" } }
  }
};`),
            inputs: {
              project: "{{workflow.inputs.project}}",
            },
            inputSchema: {
              type: "object",
              required: ["project"],
              properties: {
                project: { type: "string" },
              },
            },
            outputSchema: {
              type: "object",
              required: ["project", "route", "items"],
              properties: {
                project: { type: "string" },
                route: { const: "process" },
                items: { type: "array", items: { type: "string" } },
              },
            },
          },
          {
            id: "route",
            type: "switch",
            switchVar: "{{data.route}}",
            cases: [
              {
                equals: "process",
                steps: [
                  {
                    id: "loop",
                    type: "for",
                    mode: "items",
                    items: "{{data.items}}",
                    forControl: "{{data.control}}",
                    maxIterations: 10,
                    concurrency: 1,
                    steps: [
                      {
                        id: "process-item",
                        type: "bash",
                        inputs: {
                          project: "{{workflow.inputs.project}}",
                          item: "{{data.loop.item}}",
                          index: "{{data.loop.index}}",
                          traceId: "{{workflow.var.traceId}}",
                        },
                        initialCommand: nodeOutputCommand(`
output = {
  data: {
    project: input.data.project,
    item: input.data.item,
    index: input.data.index,
    traceId: input.data.traceId,
    control: input.data.item === "beta" ? "break" : ""
  }
};`),
                      },
                    ],
                  },
                ],
              },
            ],
            defaultSteps: [],
          },
        ],
      }),
    );

    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"project":"paseo"}',
    });

    expect(run.status).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      project: "paseo",
      item: "beta",
      index: 1,
      traceId: "trace-1",
      control: "break",
    });
    expect(run.artifacts).toEqual([]);
    expect(run.nodeRuns.find((node) => node.stepId === "prepare")?.artifacts).toEqual([]);
    expect(run.nodeRuns.filter((node) => node.stepId === "process-item")).toHaveLength(2);
  });

  it("rejects removed bare result shapes", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        apiVersion: "paseo.sh/workflow/v1",
        kind: "Workflow",
        version: 1,
        name: "Invalid result",
        steps: [
          {
            id: "invalid",
            type: "bash",
            initialCommand: nodeOutputCommand("output = { answer: 'legacy' };"),
          },
        ],
      }),
    );

    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: "{}",
    });

    expect(run.status).toBe("failed");
    expect(run.error).toContain("must use the envelope");
  });

  it("does not retry when base_resp forbids retry", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        apiVersion: "paseo.sh/workflow/v1",
        kind: "Workflow",
        version: 1,
        name: "No retry",
        steps: [
          {
            id: "fail",
            type: "bash",
            retry: { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 1, jitter: false },
            initialCommand: nodeOutputCommand(`
output = {
  data: {},
  base_resp: {
    status_code: 7,
    status_msg: "permanent failure",
    forbid_retry: 1
  }
};`),
          },
        ],
      }),
    );

    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: "{}",
    });

    expect(run.status).toBe("failed");
    expect(run.error).toBe("permanent failure");
    expect(run.nodeRuns).toHaveLength(1);
    expect(run.nodeRuns[0]?.attempt).toBe(1);
  });
});
