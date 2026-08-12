import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoundCreateAgentCommand } from "../agent/create-agent/create.js";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowService } from "./service.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function nodeCommand(source: string): string {
  return [shellQuote(process.execPath), "-e", shellQuote(source), '"$1"'].join(" ");
}

function appendVisitCommand(label: string): string {
  return nodeCommand(
    [
      "const input = JSON.parse(process.argv[1]);",
      "process.stdout.write(JSON.stringify({",
      `  ...input, control: ${JSON.stringify(label)},`,
      `  visited: [...(input.visited ?? []), ${JSON.stringify(label)}]`,
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
        version: 1,
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
    expect(run.nodeRuns.map((node) => node.stepId)).toEqual(["worker"]);
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      control: "worker",
      error: "",
      customer: "Alice",
      visited: ["worker"],
    });
  });

  it("finds and runs a nested node directly", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        version: 1,
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
        version: 1,
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
        version: 1,
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
