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

function nodeCommand(source: string): string {
  return [
    shellQuote(process.execPath),
    "-e",
    shellQuote(
      [
        'const fs = require("node:fs");',
        'const input = JSON.parse(fs.readFileSync(0, "utf8"));',
        "const writeResult = (value) => fs.writeSync(3, JSON.stringify(value));",
        source,
      ].join("\n"),
    ),
  ].join(" ");
}

async function createService(): Promise<{ home: string; service: WorkflowService }> {
  const home = await mkdtemp(join(tmpdir(), "paseo-workflow-v2-"));
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

describe("WorkflowService v2 data contract", () => {
  it("maps explicit inputs, validates schemas, branches, loops, and stores artifacts", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        apiVersion: "paseo.sh/workflow/v1",
        kind: "Workflow",
        version: 2,
        name: "Structured workflow",
        inputContract: {
          properties: {
            project: { type: "string" },
          },
          required: ["project"],
        },
        steps: [
          {
            id: "prepare",
            type: "bash",
            initialCommand: nodeCommand(`
writeResult({
  outputs: {
    project: input.project,
    route: "process",
    items: ["alpha", "beta", "gamma"]
  },
  artifacts: [{
    name: "manifest",
    uri: "file:///tmp/manifest.json",
    mediaType: "application/json"
  }]
});`),
            inputs: {
              project: "{{workflow.inputs.project}}",
            },
            inputSchema: {
              type: "object",
              required: ["project"],
              properties: {
                project: { type: "string" },
              },
              additionalProperties: false,
            },
            outputSchema: {
              type: "object",
              required: ["route", "items"],
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
            switchOn: "{{nodes.prepare.outputs.route}}",
            cases: [
              {
                equals: "process",
                steps: [
                  {
                    id: "loop",
                    type: "for",
                    items: "{{nodes.prepare.outputs.items}}",
                    maxIterations: 10,
                    concurrency: 1,
                    steps: [
                      {
                        id: "process-item",
                        type: "bash",
                        inputs: {
                          project: "{{workflow.inputs.project}}",
                          item: "{{loop.item}}",
                          index: "{{loop.index}}",
                        },
                        initialCommand: nodeCommand(`
writeResult({
  outputs: {
    project: input.project,
    item: input.item,
    index: input.index
  },
  flow: {
    action: input.item === "beta" ? "break" : "next"
  }
});`),
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
    });
    expect(run.control).toBe("");
    expect(run.artifacts).toEqual([
      {
        name: "manifest",
        uri: "file:///tmp/manifest.json",
        mediaType: "application/json",
      },
    ]);
    expect(run.nodeRuns.find((node) => node.stepId === "prepare")?.artifacts).toEqual(
      run.artifacts,
    );
    expect(run.nodeRuns.filter((node) => node.stepId === "process-item")).toHaveLength(2);
  });

  it("rejects the legacy bare result shape in v2", async () => {
    const { home, service } = await createService();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        apiVersion: "paseo.sh/workflow/v1",
        kind: "Workflow",
        version: 2,
        name: "Invalid result",
        steps: [
          {
            id: "invalid",
            type: "bash",
            initialCommand: nodeCommand("writeResult({ answer: 'legacy' });"),
          },
        ],
      }),
    );

    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: "{}",
    });

    expect(run.status).toBe("failed");
    expect(run.error).toContain("must use the v2 envelope");
  });
});
