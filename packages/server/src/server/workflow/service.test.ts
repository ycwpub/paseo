import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import type { Assistant, Team } from "@getpaseo/protocol/messages";
import type { BoundCreateAgentCommand } from "../agent/create-agent/create.js";
import { WorkflowService } from "./service.js";

const tempDirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function nodeCommand(source: string, ...args: string[]): string {
  const wrappedSource = [
    'const __paseoFs = require("fs");',
    "const __paseoInputEnvelope = JSON.parse(process.argv.at(-1));",
    "process.argv[process.argv.length - 1] = JSON.stringify(__paseoInputEnvelope.data);",
    "const __paseoWriteResult = (value) =>",
    "  __paseoFs.writeFileSync(process.env.PASEO_TEST_RESULT_FILE, JSON.stringify({",
    "    data: value,",
    "  }));",
    "const __paseoWriteEnvelope = (value) =>",
    "  __paseoFs.writeFileSync(process.env.PASEO_TEST_RESULT_FILE, JSON.stringify(value));",
    source,
  ].join("\n");
  const command = [
    shellQuote(process.execPath),
    "-e",
    shellQuote(wrappedSource),
    ...args.map(shellQuote),
    '"$input"',
  ].join(" ");
  return [
    '__paseo_test_result="$(mktemp)"',
    `PASEO_TEST_RESULT_FILE="$__paseo_test_result" ${command}`,
    "__paseo_test_status=$?",
    "if [ $__paseo_test_status -ne 0 ]; then",
    '  rm -f "$__paseo_test_result"',
    "  exit $__paseo_test_status",
    "fi",
    'output="$(cat "$__paseo_test_result")"',
    'rm -f "$__paseo_test_result"',
  ].join("\n");
}

const workflowV1 = {
  apiVersion: "paseo.sh/workflow/v1",
  kind: "Workflow",
} as const;

function createAssistant(id: string, name: string, prompt: string): Assistant {
  return {
    id,
    name,
    description: "",
    prompt,
    memoryEnabled: false,
    memory: "",
    memorySummary: "",
    memoryFiles: { summaryPath: "", detailFiles: [] },
    resourceSelection: {
      mode: "all-enabled",
      selectedMcpServerIds: [],
      selectedSkillIds: [],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createService(home: string): WorkflowService {
  return new WorkflowService({
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
}

async function createTempHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "paseo-workflow-"));
  tempDirs.push(home);
  return home;
}

describe("WorkflowService", () => {
  it("validates required workflow input fields before creating a run", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "Input contract",
        steps: [
          {
            id: "never",
            type: "bash",
            inputSchema: {
              type: "object",
              additionalProperties: false,
              properties: {
                scan_dir_url: { type: "string" },
                group_ids: { type: "array" },
              },
              required: ["scan_dir_url", "group_ids"],
            },
            initialCommand: "exit 99",
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();

    await expect(
      service.runScript({
        scriptPath,
        inputPayload: "{}",
      }),
    ).rejects.toThrow("scan_dir_url");
    expect(await service.listRuns()).toEqual([]);
  });

  it("validates schema input and applies workflow command environment variables", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "Input schema and environment",
        environment: {
          variables: {
            FIXED_WIKI_URL: "https://example.test/wiki",
          },
        },
        steps: [
          {
            id: "inspect",
            type: "bash",
            inputSchema: {
              type: "object",
              additionalProperties: false,
              properties: {
                mode: { type: "string" },
                max_work_items: { type: "integer" },
              },
              required: ["mode", "max_work_items"],
            },
            initialCommand: nodeCommand(
              [
                "const input = JSON.parse(process.argv.at(-1));",
                "__paseoWriteResult({",
                "  ...input,",
                "  wiki: process.env.FIXED_WIKI_URL",
                "});",
              ].join("\n"),
            ),
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"mode":"scan_only","max_work_items":0}',
    });

    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      mode: "scan_only",
      max_work_items: 0,
      wiki: "https://example.test/wiki",
    });
    expect(run.nodeRuns[0]).toMatchObject({
      environmentSource: "daemon",
      exitCode: 0,
      cwd: home,
    });
    expect(run.nodeRuns[0]?.expandedInstruction).toContain("FIXED_WIKI_URL");
  });

  it("runs a reusable input preset with optional JSON overrides", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "Preset run",
        inputPresets: [
          {
            id: "scan-only",
            name: "Scan only",
            payload: {
              mode: "scan_only",
              max_work_items: 0,
              wiki_url: "https://example.test/wiki",
            },
          },
        ],
        steps: [
          {
            id: "echo",
            type: "bash",
            inputSchema: {
              type: "object",
              additionalProperties: false,
              properties: {
                mode: { type: "string" },
                max_work_items: { type: "integer" },
                wiki_url: { type: "string" },
              },
              required: ["mode", "max_work_items", "wiki_url"],
            },
            initialCommand: nodeCommand(
              "const input = JSON.parse(process.argv.at(-1)); __paseoWriteResult(input);",
            ),
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPresetId: "scan-only",
      inputPayload: '{"max_work_items":2}',
    });

    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      mode: "scan_only",
      max_work_items: 2,
      wiki_url: "https://example.test/wiki",
    });
  });

  it("preserves stdout, stderr, exit status, and the original failure", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "Command failure diagnostics",
        steps: [
          {
            id: "fail",
            type: "bash",
            initialCommand: nodeCommand(
              [
                'process.stdout.write("partial output\\n");',
                'process.stderr.write("root cause\\n");',
                "process.exit(7);",
              ].join("\n"),
            ),
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputPayload: "{}" });

    expect(run.status).toBe("failed");
    expect(run.error).toContain("exit code 7: root cause");
    expect(run.error).not.toContain("JSON");
    expect(run.nodeRuns[0]).toMatchObject({
      stdout: "partial output\n",
      stderr: "root cause\n",
      exitCode: 7,
      signal: null,
      errorCode: "TASK_FAILED",
    });
  });

  it("records why a zero-item loop was skipped", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "Empty loop",
        steps: [
          {
            id: "items",
            type: "for",
            mode: "array",
            items: "{{data.items}}",
            steps: [{ id: "never", type: "bash", initialCommand: "exit 99" }],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"items":[]}',
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(run.nodeRuns.map((node) => node.stepId)).toEqual(["items"]);
    expect(run.nodeRuns[0]).toMatchObject({
      output: "Skipped loop: 0 items",
      skippedReason: "No loop items were produced",
    });
  });

  it("creates, updates, lists, and deletes managed workflow scripts", async () => {
    const home = await createTempHome();
    const service = createService(home);
    await service.start();

    const created = await service.saveScript({
      script: {
        ...workflowV1,
        version: 1,
        name: "Visual workflow",
        steps: [{ id: "prepare", type: "bash", initialCommand: "echo prepare" }],
      },
    });
    expect(created.path).toBe(join(home, "workflows", "visual-workflow.json"));
    expect((await service.listScripts()).map((script) => script.name)).toEqual(["Visual workflow"]);

    const updated = await service.saveScript({
      scriptPath: created.path,
      script: {
        ...created.script,
        description: "Edited in the visual builder",
      },
    });
    expect(updated.script.description).toBe("Edited in the visual builder");

    await service.deleteScript(created.path);
    expect(await service.listScripts()).toEqual([]);
  });

  it("refuses to edit workflow files outside the managed workflow directory", async () => {
    const home = await createTempHome();
    const service = createService(home);
    await service.start();

    await expect(
      service.saveScript({
        scriptPath: join(home, "outside.json"),
        script: {
          ...workflowV1,
          version: 1,
          name: "Outside",
          steps: [{ id: "step", type: "bash", initialCommand: "echo blocked" }],
        },
      }),
    ).rejects.toThrow("can only be edited");
  });

  it("returns the most recent run for a workflow script", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "Latest run",
        steps: [
          {
            id: "complete",
            type: "bash",
            initialCommand: nodeCommand(['__paseoWriteResult({ control: "done" });'].join("\n")),
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();

    expect(await service.getLatestRunForScript(scriptPath)).toBeNull();
    const first = await service.runScriptAndWait({
      scriptPath,
      inputPayload: JSON.stringify({ control: "first", error: "" }),
    });
    const second = await service.runScriptAndWait({
      scriptPath,
      inputPayload: JSON.stringify({ control: "second", error: "" }),
    });

    expect((await service.getLatestRunForScript(scriptPath))?.id).toBe(second.id);
    expect(second.id).not.toBe(first.id);
  });

  it("starts a workflow directly from a JSON payload without an input file", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "JSON input",
        steps: [
          {
            id: "consume",
            type: "bash",
            initialCommand: nodeCommand(
              [
                "const input = JSON.parse(process.argv.at(-1));",
                "__paseoWriteResult({",
                '  ...input, control: "done", greeting: `Hello ${input.customer.name}`',
                "});",
              ].join("\n"),
            ),
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: JSON.stringify({
        control: "",
        error: "",
        customer: { name: "Alice" },
      }),
    });

    expect(run.status).toBe("succeeded");
    expect(run.inputFilePath).toBe("");
    expect(run.nodeRuns[0]?.inputFilePath).toBe("");
    expect(JSON.parse(run.outputPayload ?? "{}")).toMatchObject({
      control: "done",
      error: "",
      greeting: "Hello Alice",
    });
  });

  it("runs inline Python code and reads its structured result from file descriptor 3", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "Python node",
        steps: [
          {
            id: "transform",
            type: "python",
            code: [
              'payload = input["data"]',
              'print("diagnostic output")',
              "output = {",
              '    "data": {',
              "        **payload,",
              '        "control": "python-done",',
              '        "greeting": "Hello " + payload["customer"]["name"],',
              '        "stdinMatches": input["data"] == payload,',
              "    },",
              "}",
            ].join("\n"),
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: JSON.stringify({
        customer: { name: "Alice" },
      }),
    });

    expect(run.status).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toMatchObject({
      control: "python-done",
      greeting: "Hello Alice",
      stdinMatches: true,
    });
    expect(run.nodeRuns[0]).toMatchObject({
      stepType: "bash",
      executor: "python",
      outputControl: "",
    });
    expect(run.nodeRuns[0]?.output).toContain("diagnostic output");
  });

  it("renders payload and custom variables in Bash commands", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "Bash variables",
        steps: [
          {
            id: "render",
            type: "bash",
            initialCommand: nodeCommand(
              [
                "__paseoWriteResult({",
                '  control: "done", customer: process.argv[1], item: process.argv[2], role: process.argv[3]',
                "});",
              ].join("\n"),
              "{{data.customer.name}}",
              "{{data.items.0.id}}",
              "{{role}}",
            ),
            templateVariables: {
              role: "{{data.customer.name}}-reviewer",
            },
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: JSON.stringify({
        customer: { name: "Alice" },
        items: [{ id: 7 }],
      }),
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toMatchObject({
      customer: "Alice",
      item: "7",
      role: "Alice-reviewer",
    });
  });

  it("passes initial data through the node input envelope", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "Default input fields",
        steps: [
          {
            id: "copy",
            type: "bash",
            initialCommand: nodeCommand(
              "const input = JSON.parse(process.argv.at(-1)); __paseoWriteResult(input);",
            ),
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"customer":"Alice"}',
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(JSON.parse(run.inputPayload ?? "{}")).toEqual({
      customer: "Alice",
    });
    expect(JSON.parse(run.nodeRuns[0]?.inputPayload ?? "{}")).toEqual({
      data: { customer: "Alice" },
      origin_input: { customer: "Alice" },
      workflow: { var: {} },
      node: { var: {} },
    });
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      customer: "Alice",
    });
  });

  it("rejects scripts that still use the removed Workflow node type", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "legacy.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "Legacy nested workflow",
        steps: [
          {
            id: "child",
            type: "workflow",
            workflowPath: "/tmp/child.json",
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    await expect(service.runScript({ scriptPath, inputPayload: "{}" })).rejects.toThrow();
    expect(await service.listRuns()).toEqual([]);
  });

  it.each([
    ["invalid JSON", "not json", "valid JSON object"],
    ["a non-object value", "[]", "must be a JSON object"],
  ])(
    "rejects initial payloads with %s before creating a run",
    async (_label, inputPayload, error) => {
      const home = await createTempHome();
      const scriptPath = join(home, "workflow.json");
      await writeFile(
        scriptPath,
        JSON.stringify({
          ...workflowV1,
          version: 1,
          name: "Invalid JSON input",
          steps: [{ id: "noop", type: "bash", initialCommand: "echo noop" }],
        }),
      );

      const service = createService(home);
      await service.start();
      await expect(service.runScript({ scriptPath, inputPayload })).rejects.toThrow(error);
    },
  );

  it("always uses each node's configured command when upstream payloads contain file paths", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const nextInstructionPath = join(home, "next-command.sh");
    const finalPath = join(home, "final.txt");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "raw input");

    const finishCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const output = process.argv[1];",
        'fs.writeFileSync(output, "finished");',
        "__paseoWriteResult({",
        '  filePath: output, control: "done"',
        "});",
      ].join("\n"),
      finalPath,
    );
    const firstCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const next = process.argv[1];",
        'fs.writeFileSync(next, "exit 99");',
        "__paseoWriteResult({",
        '  filePath: next, control: "go"',
        "});",
      ].join("\n"),
      nextInstructionPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "bash chain",
        steps: [
          { id: "prepare", type: "bash", initialCommand: firstCommand },
          {
            id: "route",
            type: "switch",
            cases: [
              {
                equals: "go",
                steps: [
                  {
                    id: "finish",
                    type: "bash",
                    initialCommand: finishCommand,
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("succeeded");
    expect(run.outputFilePath).toBe(finalPath);
    expect(JSON.parse(run.outputPayload ?? "{}")).toMatchObject({ control: "done" });
    expect(await readFile(finalPath, "utf8")).toBe("finished");
    expect(run.nodeRuns.map((node) => node.stepId)).toEqual(["prepare", "route", "finish"]);
  });

  it("executes nodes by configured downstream links instead of list order", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    const appendStep = (step: string) =>
      nodeCommand(
        [
          "const input = JSON.parse(process.argv.at(-1));",
          `const visited = [...(input.visited ?? []), ${JSON.stringify(step)}];`,
          "__paseoWriteResult({ ...input, visited });",
        ].join("\n"),
      );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "Explicit downstream graph",
        steps: [
          {
            id: "first",
            type: "bash",
            initialCommand: appendStep("first"),
            nextStepId: "third",
          },
          {
            id: "skipped",
            type: "bash",
            initialCommand: appendStep("skipped"),
            nextStepId: null,
          },
          {
            id: "third",
            type: "bash",
            initialCommand: appendStep("third"),
            nextStepId: "finish",
          },
          {
            id: "finish",
            type: "bash",
            initialCommand: appendStep("finish"),
            nextStepId: null,
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputPayload: "{}" });

    expect(run.status).toBe("succeeded");
    expect(run.nodeRuns.map((node) => node.stepId)).toEqual(["first", "third", "finish"]);
    expect(JSON.parse(run.outputPayload ?? "{}")).toMatchObject({
      visited: ["first", "third", "finish"],
    });
  });

  it("rejects a workflow before creating a run when downstream links are invalid", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "Invalid downstream graph",
        steps: [
          {
            id: "first",
            type: "bash",
            initialCommand: nodeCommand('__paseoWriteResult({ control: "unexpected" });'),
            nextStepId: "missing",
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    await expect(service.runScript({ scriptPath, inputPayload: "{}" })).rejects.toThrow(
      "missing downstream step: missing",
    );
    expect(await service.listRuns()).toEqual([]);
  });

  it("stops immediately when a node exits with an error", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const markerPath = join(home, "should-not-exist");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");
    const failingCommand = nodeCommand(
      ['process.stderr.write("boom\\n");', "process.exit(9);"].join("\n"),
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "error",
        steps: [
          { id: "fail", type: "bash", initialCommand: failingCommand },
          {
            id: "never",
            type: "bash",
            initialCommand: nodeCommand(
              'require("fs").writeFileSync(process.argv[1], "unexpected")',
              markerPath,
            ),
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("failed");
    expect(run.error).toContain("exit code 9: boom");
    expect(run.nodeRuns).toHaveLength(1);
    await expect(readFile(markerPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("passes one JSON string between Bash nodes and preserves arbitrary fields", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");
    const prepareCommand = nodeCommand(
      [
        "const input = JSON.parse(process.argv.at(-1));",
        "__paseoWriteResult({",
        '  ...input, customer: { name: "Alice" }, count: 2, control: "next"',
        "});",
      ].join("\n"),
    );
    const consumeCommand = nodeCommand(
      [
        "const input = JSON.parse(process.argv.at(-1));",
        "__paseoWriteResult({",
        '  control: "done", greeting: `Hello ${input.customer.name}`,',
        "  doubled: input.count * 2",
        "});",
      ].join("\n"),
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "json payload",
        steps: [
          {
            id: "prepare",
            type: "bash",
            initialCommand: prepareCommand,
          },
          {
            id: "consume",
            type: "bash",
            initialCommand: consumeCommand,
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("succeeded");
    expect(run.outputFilePath).toBeNull();
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      control: "done",
      greeting: "Hello Alice",
      doubled: 4,
    });
    expect(JSON.parse(run.nodeRuns[1]?.inputPayload ?? "{}")).toEqual({
      data: {
        customer: { name: "Alice" },
        count: 2,
        control: "next",
        filePath: inputPath,
      },
      origin_input: {
        filePath: inputPath,
      },
      workflow: { var: {} },
      node: { var: {} },
    });
  });

  it("keeps stdout as logs and reads the structured result only from file descriptor 3", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    const result = JSON.stringify({
      data: { control: "true", source: "fd3" },
    });
    const command = [
      `printf '%s\\n' ${shellQuote('{"control":"ignored","source":"stdout-log"}')}`,
      `printf '%s\\n' ${shellQuote("diagnostic output")}`,
      `output=${shellQuote(result)}`,
    ].join("\n");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "result channel",
        steps: [
          {
            id: "stdout-control",
            type: "bash",
            initialCommand: command,
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: "{}",
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      control: "true",
      source: "fd3",
    });
    expect(run.nodeRuns[0]?.outputControl).toBe("");
    expect(run.nodeRuns[0]?.stdout).toContain('"source":"stdout-log"');
  });

  it("fails when the Bash output variable is empty", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "result file fallback",
        steps: [
          {
            id: "empty-stdout",
            type: "bash",
            initialCommand: "true",
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: "{}",
    });

    expect(run.status).toBe("failed");
    expect(run.error).toContain("Workflow Bash output variable output is empty");
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({});
  });

  it("fails when the result channel is not valid JSON", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    const command = [
      `printf '%s\\n' ${shellQuote("diagnostic output")}`,
      `output=${shellQuote("not-json")}`,
    ].join("\n");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "last stdout line",
        steps: [
          {
            id: "last-line",
            type: "bash",
            initialCommand: command,
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: "{}",
    });

    expect(run.status).toBe("failed");
    expect(run.error).toContain("Workflow node result is not valid JSON");
    expect(JSON.parse(run.nodeRuns[0]?.outputPayload ?? "{}")).toEqual({});
  });

  it("defaults optional fields in a Bash result envelope", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "invalid payload",
        steps: [
          {
            id: "normalize",
            type: "bash",
            initialCommand: `output=${shellQuote('{"data":{"message":"defaults applied"}}')}`,
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputPayload: "{}" });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({ message: "defaults applied" });
  });

  it.each([
    ["invalid JSON", "not json", "Workflow node result is not valid JSON"],
    [
      "a bare data object",
      '{"message":"missing envelope"}',
      "Workflow node result must use the envelope",
    ],
    [
      "the removed flow field",
      '{"data":{},"flow":{"control":"break"}}',
      "Workflow node result must use the envelope",
    ],
  ])(
    "returns a standard error payload for Bash output with %s",
    async (_label, output, message) => {
      const home = await createTempHome();
      const scriptPath = join(home, "workflow.json");
      await writeFile(
        scriptPath,
        JSON.stringify({
          ...workflowV1,
          version: 1,
          name: "invalid payload",
          steps: [
            {
              id: "invalid",
              type: "bash",
              initialCommand: `output=${shellQuote(output)}`,
            },
          ],
        }),
      );

      const service = createService(home);
      await service.start();
      const run = await service.runScriptAndWait({ scriptPath, inputPayload: "{}" });

      expect(run.status).toBe("failed");
      expect(run.error).toContain(message);
      expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({});
      expect(JSON.parse(run.nodeRuns[0]?.outputPayload ?? "{}")).toEqual({});
    },
  );

  it("retries failed tasks with attempt-level run history", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const attemptPath = join(home, "attempt.txt");
    const outputPath = join(home, "output.txt");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");
    const command = nodeCommand(
      [
        'const fs = require("fs");',
        "const attemptFile = process.argv[1];",
        "const outputFile = process.argv[2];",
        "const attempt = fs.existsSync(attemptFile) ? Number(fs.readFileSync(attemptFile, 'utf8')) + 1 : 1;",
        "fs.writeFileSync(attemptFile, String(attempt));",
        "if (attempt < 3) process.exit(7);",
        'fs.writeFileSync(outputFile, "done");',
        "__paseoWriteResult({",
        '  filePath: outputFile, control: "complete"',
        "});",
      ].join("\n"),
      attemptPath,
      outputPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "retry",
        taskDefaults: {
          retry: {
            maxAttempts: 1,
            initialDelayMs: 0,
            maxDelayMs: 10,
            backoffMultiplier: 2,
            jitter: false,
          },
        },
        steps: [
          {
            id: "unstable",
            type: "bash",
            initialCommand: command,
            retry: {
              maxAttempts: 3,
            },
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("succeeded");
    expect(run.nodeRuns.map((node) => [node.attempt, node.status])).toEqual([
      [1, "failed"],
      [2, "failed"],
      [3, "succeeded"],
    ]);
    expect(run.nodeRuns.every((node) => node.maxAttempts === 3)).toBe(true);
    expect(await readFile(outputPath, "utf8")).toBe("done");
  });

  it("enforces task timeouts and retries timed out attempts", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "timeout",
        steps: [
          {
            id: "slow",
            type: "bash",
            initialCommand: "while :; do :; done",
            timeoutMs: 25,
            retry: {
              maxAttempts: 2,
              initialDelayMs: 0,
              jitter: false,
            },
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("failed");
    expect(run.errorCode).toBe("TASK_TIMEOUT");
    expect(run.nodeRuns.map((node) => node.status)).toEqual(["timed_out", "timed_out"]);
  });

  it("cancels an active workflow and records a terminal cancellation state", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "cancel",
        steps: [
          {
            id: "wait",
            type: "bash",
            initialCommand: "while :; do :; done",
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const started = await service.runScript({ scriptPath, inputFilePath: inputPath });
    for (let index = 0; index < 100; index += 1) {
      const current = await service.getRun(started.id);
      if (current.nodeRuns.some((node) => node.status === "running")) {
        break;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
    }
    const run = await service.cancelRun(started.id);

    expect(run.status).toBe("cancelled");
    expect(run.errorCode).toBe("WORKFLOW_CANCELLED");
    expect(run.nodeRuns.at(-1)?.status).toBe("cancelled");
  });

  it("enforces the workflow-level deadline across running tasks", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "workflow deadline",
        timeoutMs: 25,
        steps: [
          {
            id: "wait",
            type: "bash",
            initialCommand: "while :; do :; done",
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("timed_out");
    expect(run.errorCode).toBe("WORKFLOW_TIMEOUT");
    expect(run.nodeRuns.at(-1)?.status).toBe("timed_out");
  });

  it("uses a JSON control array to drive for iterations", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const loopLogPath = join(home, "loop.log");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");

    const loopCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const log = process.argv[1];",
        "const input = JSON.parse(process.argv.at(-1));",
        "fs.appendFileSync(log, `${__paseoInputEnvelope.loop.var.item}\\n`);",
        "__paseoWriteResult({",
        "  filePath: input.filePath,",
        "  control: __paseoInputEnvelope.loop.var.item,",
        "});",
      ].join("\n"),
      loopLogPath,
    );
    const prepareCommand = nodeCommand(
      ["__paseoWriteResult({", '  items: ["alpha", "beta"]', "});"].join("\n"),
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "for",
        steps: [
          { id: "prepare", type: "bash", initialCommand: prepareCommand },
          {
            id: "items",
            type: "for",
            mode: "array",
            items: "{{data.items}}",
            steps: [{ id: "each", type: "bash", initialCommand: loopCommand }],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toMatchObject({ control: "beta" });
    expect(await readFile(loopLogPath, "utf8")).toBe("alpha\nbeta\n");
    expect(run.nodeRuns.filter((node) => node.stepId === "each")).toHaveLength(2);
  });

  it("counts down numbers, resets input.data, and carries state through loop variables", async () => {
    const home = await createTempHome();
    const loopLogPath = join(home, "number-loop.log");
    const scriptPath = join(home, "workflow.json");
    const loopCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const input = __paseoInputEnvelope;",
        "fs.appendFileSync(",
        "  process.argv[1],",
        "  `${input.data.seed}:${input.loop.var.item}:${input.loop.var.index}:${input.loop.var.count}:${input.loop.var.i}\\n`,",
        ");",
        "__paseoWriteEnvelope({",
        "  data: {",
        "    seed: `changed-${input.loop.var.index}`,",
        '    control: input.loop.var.item === 1 ? "break" : ""',
        "  },",
        "  modify: {",
        "    loop: { var: { i: String(Number(input.loop.var.i) + 1) } }",
        "  }",
        "});",
      ].join("\n"),
      loopLogPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "number for",
        steps: [
          {
            id: "countdown",
            type: "for",
            mode: "number",
            items: "{{data.remaining}}",
            forControl: "{{data.control}}",
            loopVariables: {
              i: { type: "int64", default: "0" },
            },
            steps: [{ id: "each", type: "bash", initialCommand: loopCommand }],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"remaining":3,"seed":"same"}',
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(await readFile(loopLogPath, "utf8")).toBe("same:3:0:3:0\nsame:2:1:3:1\nsame:1:2:3:2\n");
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      seed: "changed-2",
      control: "break",
    });
  });

  it("exposes only the innermost loop scope and restores the outer scope afterward", async () => {
    const home = await createTempHome();
    const loopLogPath = join(home, "nested-loop.log");
    const scriptPath = join(home, "workflow.json");
    const innerCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const input = __paseoInputEnvelope;",
        "fs.appendFileSync(",
        "  process.argv[1],",
        '  `inner:${Object.keys(input.loop.var).sort().join(",")}\\n`,',
        ");",
        "__paseoWriteEnvelope({",
        "  data: { ...input.data, innerDone: true },",
        '  modify: { loop: { var: { inner: "updated" } } }',
        "});",
      ].join("\n"),
      loopLogPath,
    );
    const outerCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const input = __paseoInputEnvelope;",
        "fs.appendFileSync(",
        "  process.argv[1],",
        '  `outer:${Object.keys(input.loop.var).sort().join(",")}\\n`,',
        ");",
        "__paseoWriteResult(input.data);",
      ].join("\n"),
      loopLogPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "nested for scopes",
        steps: [
          {
            id: "outer",
            type: "for",
            mode: "array",
            items: "{{data.outerItems}}",
            loopVariables: {
              outer: { type: "string", default: "outer" },
            },
            steps: [
              {
                id: "inner",
                type: "for",
                mode: "array",
                items: "{{data.innerItems}}",
                loopVariables: {
                  inner: { type: "string", default: "inner" },
                },
                steps: [{ id: "inner-body", type: "bash", initialCommand: innerCommand }],
              },
              { id: "outer-tail", type: "bash", initialCommand: outerCommand },
            ],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"outerItems":["a"],"innerItems":["b"]}',
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(await readFile(loopLogPath, "utf8")).toBe(
      "inner:count,index,inner,item\nouter:count,index,item,outer\n",
    );
  });

  it("runs for iterations with bounded concurrency and deterministic output ordering", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    const loopCommand = nodeCommand(
      [
        'const fs = require("fs");',
        'const path = require("path");',
        "const markerDirectory = process.argv[1];",
        "const input = JSON.parse(process.argv.at(-1));",
        "fs.writeFileSync(path.join(markerDirectory, `started-${__paseoInputEnvelope.loop.var.index}`), '');",
        "const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));",
        "(async () => {",
        "  const deadline = Date.now() + 2_000;",
        "  while (fs.readdirSync(markerDirectory).filter((name) => name.startsWith('started-')).length < 2) {",
        "    if (Date.now() >= deadline) throw new Error('Concurrent iteration did not start');",
        "    await delay(10);",
        "  }",
        "  if (__paseoInputEnvelope.loop.var.index === 0) await delay(100);",
        "  __paseoWriteResult({",
        "    ...input, control: __paseoInputEnvelope.loop.var.item, result: __paseoInputEnvelope.loop.var.item",
        "  });",
        "})().catch((error) => { console.error(error.message); process.exitCode = 1; });",
      ].join("\n"),
      home,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "concurrent for",
        steps: [
          {
            id: "items",
            type: "for",
            mode: "array",
            executionMode: "parallel",
            items: "{{data.items}}",
            concurrency: 2,
            steps: [{ id: "each", type: "bash", initialCommand: loopCommand }],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"items":["alpha","beta"]}',
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toMatchObject({
      control: "beta",
      result: "beta",
    });
    expect(run.nodeRuns.filter((node) => node.stepId === "each")).toHaveLength(2);
    expect(run.nodeRuns.find((node) => node.stepId === "items")?.output).toContain("concurrency 2");
  });

  it("exposes defined Loop variables as read-only input to parallel iterations", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    const loopCommand = nodeCommand(
      [
        "__paseoWriteResult({",
        "  item: __paseoInputEnvelope.loop.var.item,",
        "  cursor: __paseoInputEnvelope.loop.var.cursor",
        "});",
      ].join("\n"),
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "parallel read-only loop variables",
        steps: [
          {
            id: "items",
            type: "for",
            mode: "array",
            executionMode: "parallel",
            items: "{{data.items}}",
            concurrency: 2,
            loopVariables: {
              cursor: { type: "string", default: "start" },
            },
            steps: [{ id: "each", type: "bash", initialCommand: loopCommand }],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"items":["alpha","beta"]}',
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      item: "beta",
      cursor: "start",
    });
  });

  it("rejects Loop variable modifications from parallel For iterations", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    const loopCommand = nodeCommand(
      [
        "__paseoWriteEnvelope({",
        "  data: __paseoInputEnvelope.data,",
        '  modify: { loop: { var: { cursor: "next" } } }',
        "});",
      ].join("\n"),
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "parallel loop variables",
        steps: [
          {
            id: "items",
            type: "for",
            mode: "array",
            executionMode: "parallel",
            items: "{{data.items}}",
            concurrency: 2,
            loopVariables: {
              cursor: { type: "string", default: "start" },
            },
            steps: [{ id: "each", type: "bash", initialCommand: loopCommand }],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"items":["alpha","beta"]}',
    });

    expect(run.status).toBe("failed");
    expect(run.error).toContain("Cannot modify loop variables in parallel For execution");
  });

  it("lets a for body break early with the standard break control", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const loopLogPath = join(home, "loop.log");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");

    const prepareCommand = nodeCommand(
      ["__paseoWriteResult({", '  items: ["alpha", "beta", "gamma"], source: "test"', "});"].join(
        "\n",
      ),
    );
    const loopCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const input = JSON.parse(process.argv.at(-1));",
        "fs.appendFileSync(process.argv[1], `${__paseoInputEnvelope.loop.var.index}:${__paseoInputEnvelope.loop.var.item}\\n`);",
        "__paseoWriteResult({",
        '  ...input, control: __paseoInputEnvelope.loop.var.item === "beta" ? "break" : ""',
        "});",
      ].join("\n"),
      loopLogPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "for break",
        steps: [
          { id: "prepare", type: "bash", initialCommand: prepareCommand },
          {
            id: "items",
            type: "for",
            mode: "array",
            items: "{{data.items}}",
            forControl: "{{data.control}}",
            steps: [{ id: "each", type: "bash", initialCommand: loopCommand }],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toMatchObject({ control: "break" });
    expect(await readFile(loopLogPath, "utf8")).toBe("0:alpha\n1:beta\n");
    expect(run.nodeRuns.filter((node) => node.stepId === "each")).toHaveLength(2);
    expect(run.nodeRuns.find((node) => node.stepId === "items")?.output).toContain(
      "Stopped after 2 of 3",
    );
  });

  it("skips the remaining loop body when a node returns continue", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const firstLogPath = join(home, "first.log");
    const secondLogPath = join(home, "second.log");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");

    const prepareCommand = nodeCommand(
      ["__paseoWriteResult({", '  items: ["alpha", "beta", "gamma"]', "});"].join("\n"),
    );
    const firstCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const input = JSON.parse(process.argv.at(-1));",
        "fs.appendFileSync(process.argv[1], `${__paseoInputEnvelope.loop.var.item}\\n`);",
        "__paseoWriteResult({",
        '  ...input, control: __paseoInputEnvelope.loop.var.item === "beta" ? "continue" : ""',
        "});",
      ].join("\n"),
      firstLogPath,
    );
    const secondCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const input = JSON.parse(process.argv.at(-1));",
        "fs.appendFileSync(process.argv[1], `${__paseoInputEnvelope.loop.var.item}\\n`);",
        "__paseoWriteResult(input);",
      ].join("\n"),
      secondLogPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "for continue",
        steps: [
          { id: "prepare", type: "bash", initialCommand: prepareCommand },
          {
            id: "items",
            type: "for",
            mode: "array",
            items: "{{data.items}}",
            forControl: "{{data.control}}",
            steps: [
              { id: "first", type: "bash", initialCommand: firstCommand },
              { id: "second", type: "bash", initialCommand: secondCommand },
            ],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("succeeded");
    expect(await readFile(firstLogPath, "utf8")).toBe("alpha\nbeta\ngamma\n");
    expect(await readFile(secondLogPath, "utf8")).toBe("alpha\ngamma\n");
    expect(run.nodeRuns.filter((node) => node.stepId === "first")).toHaveLength(3);
    expect(run.nodeRuns.filter((node) => node.stepId === "second")).toHaveLength(2);
  });

  it("runs continuously with an empty separator until a node returns break", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const loopLogPath = join(home, "loop.log");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");
    const loopCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const input = JSON.parse(process.argv.at(-1));",
        "fs.appendFileSync(process.argv[1], `${__paseoInputEnvelope.loop.var.index}:${__paseoInputEnvelope.loop.var.item}:${__paseoInputEnvelope.loop.var.count}\\n`);",
        "__paseoWriteResult({",
        '  ...input, control: __paseoInputEnvelope.loop.var.index === 2 ? "break" : "continue"',
        "});",
      ].join("\n"),
      loopLogPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "continuous for",
        steps: [
          {
            id: "loop",
            type: "for",
            mode: "true",
            maxIterations: 0,
            forControl: "{{data.control}}",
            steps: [{ id: "each", type: "bash", initialCommand: loopCommand }],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("succeeded");
    expect(await readFile(loopLogPath, "utf8")).toBe("0:true:0\n1:true:0\n2:true:0\n");
    expect(run.nodeRuns.filter((node) => node.stepId === "each")).toHaveLength(3);
    expect(run.nodeRuns.find((node) => node.stepId === "loop")?.output).toContain(
      "Stopped after 3 iterations",
    );
  });

  it("uses 100 iterations by default for a continuous loop without break", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");
    const loopCommand = `output=${shellQuote(
      JSON.stringify({
        data: {},
      }),
    )}`;
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "default continuous limit",
        steps: [
          {
            id: "loop",
            type: "for",
            mode: "true",
            steps: [{ id: "each", type: "bash", initialCommand: loopCommand }],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("succeeded");
    expect(run.nodeRuns.filter((node) => node.stepId === "each")).toHaveLength(100);
    expect(run.nodeRuns.find((node) => node.stepId === "loop")?.output).toContain(
      "Completed 100 iterations",
    );
  });

  it("passes an upstream file path as data without replacing the configured command", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const upstreamPath = join(home, "upstream.txt");
    const finalPath = join(home, "final.txt");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "initial");

    const prepareCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "fs.writeFileSync(process.argv[1], process.argv[2]);",
        "__paseoWriteResult({",
        '  filePath: process.argv[1], control: "ready"',
        "});",
      ].join("\n"),
      upstreamPath,
      "upstream data that is not a shell command",
    );
    const consumeCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const inputPath = JSON.parse(process.argv.at(-1)).filePath;",
        'fs.writeFileSync(process.argv[1], fs.readFileSync(inputPath, "utf8"));',
        "__paseoWriteResult({",
        '  filePath: process.argv[1], control: "done"',
        "});",
      ].join("\n"),
      finalPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "configured command",
        steps: [
          { id: "prepare", type: "bash", initialCommand: prepareCommand },
          {
            id: "consume",
            type: "bash",
            initialCommand: consumeCommand,
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("succeeded");
    expect(run.outputFilePath).toBe(finalPath);
    expect(await readFile(finalPath, "utf8")).toBe("upstream data that is not a shell command");
  });

  it("renders Agent prompt variables from an upstream JSON payload", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const upstreamPath = join(home, "source.txt");
    const outputPath = join(home, "report.md");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "initial");
    await writeFile(upstreamPath, "source body");
    await writeFile(outputPath, "report");
    let capturedPrompt = "";
    let capturedSystemPrompt: string | undefined;

    const service = new WorkflowService({
      paseoHome: home,
      logger: pino({ enabled: false }),
      agentManager: {
        runAgent: async (_agentId, prompt) => {
          capturedPrompt = typeof prompt === "string" ? prompt : prompt.text;
          return {
            sessionId: "session",
            finalText: JSON.stringify({
              filePath: outputPath,
              control: "complete",
              error: "",
              reviewedCustomer: "Alice",
            }),
            timeline: [],
            canceled: false,
          };
        },
        waitForAgentEvent: async () => ({
          status: "idle",
          permission: null,
          lastMessage: null,
        }),
        cancelAgentRun: async () => ({ status: "settled" }),
      },
      createAgent: (async (input) => {
        capturedSystemPrompt = input.config?.systemPrompt;
        return {
          snapshot: { id: "11111111-1111-4111-8111-111111111111" },
          initialPromptError: null,
        };
      }) as BoundCreateAgentCommand,
      createDirectoryWorkspace: async ({ cwd }) =>
        ({
          workspaceId: "workspace",
          cwd,
        }) as never,
      createPaseoWorktreeWorkspace: async () => {
        throw new Error("Worktree creation is not expected in this test");
      },
      archiveWorkspace: async () => undefined,
      resolveAgentProjectVariables: async () => ({
        serviceName: "checkout",
        owner: "payments",
      }),
    });
    const prepareCommand = nodeCommand(
      [
        "__paseoWriteResult({",
        '  filePath: process.argv[1], control: "review",',
        '  customer: { name: "Alice" }, records: [{ id: 7 }, { id: 8 }]',
        "});",
      ].join("\n"),
      upstreamPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "agent variables",
        variables: {
          traceId: { type: "string", default: "trace-1" },
        },
        steps: [
          { id: "prepare", type: "bash", initialCommand: prepareCommand },
          {
            id: "analyze",
            name: "Analyze source",
            type: "agent",
            outputMode: "normal",
            initialPrompt:
              "Path={{data.filePath}}; project={{project.var.serviceName}}; owner={{project.var.owner}}; role={{node.var.role}}; trace={{workflow.var.traceId}}; control={{data.control}}; customer={{data.customer.name}}; first={{data.records.0.id}}; records={{data.records}}; envelope={{input}}",
            variables: {
              role: { type: "string", default: "reviewer" },
            },
            config: {
              provider: "codex",
              cwd: home,
              systemPrompt:
                "# Review {{data.customer.name}} for {{project.var.serviceName}} as {{node.var.role}}",
            },
          },
        ],
      }),
    );

    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(capturedPrompt).toContain(
      `Path=${upstreamPath}; project=checkout; owner=payments; role=reviewer; trace=trace-1; control=review; customer=Alice; first=7; records=[{"id":7},{"id":8}]; envelope=`,
    );
    expect(JSON.parse(capturedPrompt.split("; envelope=")[1] ?? "{}")).toEqual({
      data: {
        filePath: upstreamPath,
        control: "review",
        customer: { name: "Alice" },
        records: [{ id: 7 }, { id: 8 }],
      },
      origin_input: {
        filePath: inputPath,
      },
      workflow: { var: { traceId: "trace-1" } },
      project: { var: { serviceName: "checkout", owner: "payments" } },
      node: { var: { role: "reviewer" } },
    });
    expect(capturedPrompt).not.toContain("You are executing one node in a Paseo workflow.");
    expect(capturedPrompt).not.toContain("Input JSON payload:");
    expect(capturedPrompt).not.toContain("System prompt delivery:");
    expect(capturedPrompt).not.toContain("Your final response MUST");
    expect(capturedSystemPrompt).toBe("# Review Alice for checkout as reviewer");
    expect(JSON.parse(run.nodeRuns[1]?.inputPayload ?? "{}")).toMatchObject({
      project: { var: { serviceName: "checkout", owner: "payments" } },
    });
    expect(run.nodeRuns[1]?.agentPrompt).toBe(capturedPrompt);
    expect(run.nodeRuns[1]?.agentResponse).toBe(
      JSON.stringify({
        filePath: outputPath,
        control: "complete",
        error: "",
        reviewedCustomer: "Alice",
      }),
    );
    expect(run.nodeRuns[1]?.output).toBeNull();
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      answer: JSON.stringify({
        filePath: outputPath,
        control: "complete",
        error: "",
        reviewedCustomer: "Alice",
      }),
    });
  });

  it("converts an Answer Agent node response into the answer field", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "agent-defaults.json");
    const service = new WorkflowService({
      paseoHome: home,
      logger: pino({ enabled: false }),
      agentManager: {
        runAgent: async () => ({
          sessionId: "session",
          finalText: JSON.stringify({ message: "ok" }),
          timeline: [],
          canceled: false,
        }),
        waitForAgentEvent: async () => ({
          status: "idle",
          permission: null,
          lastMessage: null,
        }),
        cancelAgentRun: async () => ({ status: "settled" }),
      },
      createAgent: (async () => ({
        snapshot: { id: "11111111-1111-4111-8111-111111111111" },
        initialPromptError: null,
      })) as BoundCreateAgentCommand,
      createDirectoryWorkspace: async ({ cwd }) => ({ workspaceId: "workspace", cwd }) as never,
      createPaseoWorktreeWorkspace: async () => {
        throw new Error("Worktree creation is not expected in this test");
      },
      archiveWorkspace: async () => undefined,
    });
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "agent defaults",
        steps: [
          {
            id: "agent",
            type: "agent",
            outputMode: "normal",
            initialPrompt: "Return the result",
            config: { provider: "codex", cwd: home },
          },
        ],
      }),
    );

    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: "{}",
    });

    expect(run.status).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      answer: '{"message":"ok"}',
    });
  });

  it("reuses a For-lifecycle Agent until the loop exits, then archives it", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "for-agent-lifecycle.json");
    const createdAgentIds: string[] = [];
    const archivedWorkspaceIds: string[] = [];
    const prompts: string[] = [];
    const service = new WorkflowService({
      paseoHome: home,
      logger: pino({ enabled: false }),
      agentManager: {
        runAgent: async (agentId, prompt) => {
          const text = typeof prompt === "string" ? prompt : prompt.text;
          prompts.push(text);
          if (text === "after loop") {
            expect(archivedWorkspaceIds).toEqual(["workspace-1"]);
          }
          return {
            sessionId: agentId,
            finalText: "ok",
            timeline: [],
            canceled: false,
          };
        },
        waitForAgentEvent: async () => ({
          status: "idle",
          permission: null,
          lastMessage: null,
        }),
        cancelAgentRun: async () => ({ status: "settled" }),
      },
      createAgent: (async () => {
        const index = createdAgentIds.length + 1;
        const agentId = `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`;
        createdAgentIds.push(agentId);
        return {
          snapshot: { id: agentId },
          initialPromptError: null,
        };
      }) as BoundCreateAgentCommand,
      createDirectoryWorkspace: async ({ cwd }) =>
        ({
          workspaceId: `workspace-${createdAgentIds.length + 1}`,
          cwd,
        }) as never,
      createPaseoWorktreeWorkspace: async () => {
        throw new Error("Worktree creation is not expected in this test");
      },
      archiveWorkspace: async (workspaceId) => {
        archivedWorkspaceIds.push(workspaceId);
      },
      resolveAgentProjectVariables: async () => ({ serviceName: "checkout" }),
    });
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "For Agent lifecycle",
        steps: [
          {
            id: "loop",
            type: "for",
            items: "{{data.items}}",
            steps: [
              {
                id: "review",
                type: "agent",
                lifecycle: "for",
                subsequentPromptMode: "custom",
                subsequentPrompt: "continue {{loop.var.item}} for {{project.var.serviceName}}",
                initialPrompt: "review {{loop.var.item}} for {{project.var.serviceName}}",
                config: { provider: "codex", cwd: home },
              },
            ],
          },
          {
            id: "after",
            type: "agent",
            lifecycle: "single",
            initialPrompt: "after loop",
            config: { provider: "codex", cwd: home, archiveOnFinish: false },
          },
        ],
      }),
    );

    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"items":["alpha","beta"]}',
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(prompts).toEqual([
      "review alpha for checkout",
      "continue beta for checkout",
      "after loop",
    ]);
    expect(createdAgentIds).toHaveLength(2);
    expect(
      run.nodeRuns.filter((node) => node.stepId === "review").map((node) => node.agentId),
    ).toEqual([createdAgentIds[0], createdAgentIds[0]]);
    expect(archivedWorkspaceIds).toEqual(["workspace-1"]);
  });

  it("creates and archives a new Agent for every single-lifecycle execution", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "single-agent-lifecycle.json");
    let created = 0;
    const archivedWorkspaceIds: string[] = [];
    const service = new WorkflowService({
      paseoHome: home,
      logger: pino({ enabled: false }),
      agentManager: {
        runAgent: async (agentId) => ({
          sessionId: agentId,
          finalText: "ok",
          timeline: [],
          canceled: false,
        }),
        waitForAgentEvent: async () => ({
          status: "idle",
          permission: null,
          lastMessage: null,
        }),
        cancelAgentRun: async () => ({ status: "settled" }),
      },
      createAgent: (async () => {
        created += 1;
        return {
          snapshot: {
            id: `22222222-2222-4222-8222-${String(created).padStart(12, "0")}`,
          },
          initialPromptError: null,
        };
      }) as BoundCreateAgentCommand,
      createDirectoryWorkspace: async ({ cwd }) =>
        ({ workspaceId: `workspace-${created + 1}`, cwd }) as never,
      createPaseoWorktreeWorkspace: async () => {
        throw new Error("Worktree creation is not expected in this test");
      },
      archiveWorkspace: async (workspaceId) => {
        archivedWorkspaceIds.push(workspaceId);
      },
    });
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "Single Agent lifecycle",
        steps: [
          {
            id: "loop",
            type: "for",
            items: "{{data.items}}",
            steps: [
              {
                id: "review",
                type: "agent",
                lifecycle: "single",
                initialPrompt: "review {{loop.var.item}}",
                config: { provider: "codex", cwd: home },
              },
            ],
          },
        ],
      }),
    );

    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"items":["alpha","beta"]}',
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(created).toBe(2);
    expect(new Set(run.nodeRuns.map((node) => node.agentId).filter(Boolean)).size).toBe(2);
    expect(archivedWorkspaceIds).toEqual(["workspace-1", "workspace-2"]);
  });

  it("reuses a Workflow-lifecycle Agent across nested For invocations", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow-agent-lifecycle.json");
    let created = 0;
    let invocationCount = 0;
    const archivedWorkspaceIds: string[] = [];
    const service = new WorkflowService({
      paseoHome: home,
      logger: pino({ enabled: false }),
      agentManager: {
        runAgent: async (agentId) => {
          invocationCount += 1;
          expect(archivedWorkspaceIds).toEqual([]);
          return {
            sessionId: agentId,
            finalText: "ok",
            timeline: [],
            canceled: false,
          };
        },
        waitForAgentEvent: async () => ({
          status: "idle",
          permission: null,
          lastMessage: null,
        }),
        cancelAgentRun: async () => ({ status: "settled" }),
      },
      createAgent: (async () => {
        created += 1;
        return {
          snapshot: { id: "33333333-3333-4333-8333-333333333333" },
          initialPromptError: null,
        };
      }) as BoundCreateAgentCommand,
      createDirectoryWorkspace: async ({ cwd }) =>
        ({ workspaceId: "workflow-workspace", cwd }) as never,
      createPaseoWorktreeWorkspace: async () => {
        throw new Error("Worktree creation is not expected in this test");
      },
      archiveWorkspace: async (workspaceId) => {
        archivedWorkspaceIds.push(workspaceId);
      },
    });
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "Workflow Agent lifecycle",
        steps: [
          {
            id: "outer",
            type: "for",
            items: "{{data.outer}}",
            steps: [
              {
                id: "inner",
                type: "for",
                items: "{{data.inner}}",
                steps: [
                  {
                    id: "review",
                    type: "agent",
                    lifecycle: "workflow",
                    initialPrompt: "review",
                    config: { provider: "codex", cwd: home },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"outer":[1,2],"inner":["a","b"]}',
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(invocationCount).toBe(4);
    expect(created).toBe(1);
    expect(new Set(run.nodeRuns.map((node) => node.agentId).filter(Boolean))).toEqual(
      new Set(["33333333-3333-4333-8333-333333333333"]),
    );
    expect(archivedWorkspaceIds).toEqual(["workflow-workspace"]);
  });

  it("uses a custom Agent result envelope for flow-control data", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "control-agent-output.json");
    let capturedSystemPrompt: string | undefined;
    const service = new WorkflowService({
      paseoHome: home,
      logger: pino({ enabled: false }),
      agentManager: {
        runAgent: async () => ({
          sessionId: "session",
          finalText: JSON.stringify({
            data: { control: "是" },
          }),
          timeline: [],
          canceled: false,
        }),
        waitForAgentEvent: async () => ({
          status: "idle",
          permission: null,
          lastMessage: null,
        }),
        cancelAgentRun: async () => ({ status: "settled" }),
      },
      createAgent: (async (input) => {
        capturedSystemPrompt = input.config?.systemPrompt;
        return {
          snapshot: { id: "11111111-1111-4111-8111-111111111111" },
          initialPromptError: null,
        };
      }) as BoundCreateAgentCommand,
      createDirectoryWorkspace: async ({ cwd }) => ({ workspaceId: "workspace", cwd }) as never,
      createPaseoWorktreeWorkspace: async () => {
        throw new Error("Worktree creation is not expected in this test");
      },
      archiveWorkspace: async () => undefined,
    });
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "control agent output",
        steps: [
          {
            id: "agent",
            type: "agent",
            outputMode: "custom",
            initialPrompt: "Decide whether to continue",
            config: {
              provider: "codex",
              cwd: home,
              systemPrompt: "# 角色\n你的回答必须在下面几个选中中：是、否",
            },
          },
        ],
      }),
    );

    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: "{}",
    });

    expect(run.status).toBe("succeeded");
    expect(capturedSystemPrompt).toBe("# 角色\n你的回答必须在下面几个选中中：是、否");
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      control: "是",
    });
  });

  it("renders Control Agent system prompt variables from the node input", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "control-agent-system-prompt.json");
    let capturedSystemPrompt: string | undefined;
    const service = new WorkflowService({
      paseoHome: home,
      logger: pino({ enabled: false }),
      agentManager: {
        runAgent: async () => ({
          sessionId: "session",
          finalText: JSON.stringify({
            data: { control: "通过" },
          }),
          timeline: [],
          canceled: false,
        }),
        waitForAgentEvent: async () => ({
          status: "idle",
          permission: null,
          lastMessage: null,
        }),
        cancelAgentRun: async () => ({ status: "settled" }),
      },
      createAgent: (async (input) => {
        capturedSystemPrompt = input.config?.systemPrompt;
        return {
          snapshot: { id: "11111111-1111-4111-8111-111111111111" },
          initialPromptError: null,
        };
      }) as BoundCreateAgentCommand,
      createDirectoryWorkspace: async ({ cwd }) => ({ workspaceId: "workspace", cwd }) as never,
      createPaseoWorktreeWorkspace: async () => {
        throw new Error("Worktree creation is not expected in this test");
      },
      archiveWorkspace: async () => undefined,
    });
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "control agent system prompt variables",
        steps: [
          {
            id: "agent",
            name: "Route customer",
            type: "agent",
            outputMode: "custom",
            initialPrompt:
              "Choose a route for {{data.customer.name}} as {{node.var.role}} ({{data.customer.type}}).",
            variables: {
              role: { type: "string", default: "reviewer" },
            },
            config: {
              provider: "codex",
              cwd: home,
              systemPrompt:
                "# Role\nReview {{data.customer.name}} as {{node.var.role}}. Route={{data.control}}.",
            },
          },
        ],
      }),
    );

    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: JSON.stringify({
        control: "manual",
        customer: { name: "Alice", type: "VIP" },
      }),
    });

    expect(run.status).toBe("succeeded");
    expect(capturedSystemPrompt).toBe("# Role\nReview Alice as reviewer. Route=manual.");
  });

  it("applies an assistant preset to a workflow Agent node", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "assistant-workflow.json");
    const assistant = createAssistant(
      "assistant-reviewer",
      "Review assistant",
      "You are a careful reviewer.",
    );
    let capturedPrompt = "";
    let capturedLabels: Record<string, string> | undefined;
    const service = new WorkflowService({
      paseoHome: home,
      logger: pino({ enabled: false }),
      assistantStore: {
        get: (id) => (id === assistant.id ? assistant : null),
      },
      agentManager: {
        runAgent: async (_agentId, prompt) => {
          capturedPrompt = typeof prompt === "string" ? prompt : prompt.text;
          return {
            sessionId: "session",
            finalText: JSON.stringify({ control: "done", error: "" }),
            timeline: [],
            canceled: false,
          };
        },
        waitForAgentEvent: async () => ({
          status: "idle",
          permission: null,
          lastMessage: null,
        }),
        cancelAgentRun: async () => ({ status: "settled" }),
      },
      createAgent: (async (input) => {
        capturedLabels = input.kind === "mcp" ? input.labels : undefined;
        return {
          snapshot: { id: "11111111-1111-4111-8111-111111111111" },
          initialPromptError: null,
        };
      }) as BoundCreateAgentCommand,
      createDirectoryWorkspace: async ({ cwd }) => ({ workspaceId: "workspace", cwd }) as never,
      createPaseoWorktreeWorkspace: async () => {
        throw new Error("Worktree creation is not expected in this test");
      },
      archiveWorkspace: async () => undefined,
    });
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "assistant workflow",
        steps: [
          {
            id: "review",
            type: "agent",
            initialPrompt: "Review this payload",
            config: {
              provider: "codex",
              cwd: home,
              assistantId: assistant.id,
            },
          },
        ],
      }),
    );

    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: JSON.stringify({ control: "", error: "" }),
    });

    expect(run.status).toBe("succeeded");
    expect(capturedPrompt).toContain("You are a careful reviewer.");
    expect(capturedPrompt).toContain("Review this payload");
    expect(capturedLabels).toMatchObject({
      assistantId: assistant.id,
      assistantName: assistant.name,
      "paseo.workflow-step": "review",
    });
  });

  it("runs a selected workflow team through its leader context", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "team-workflow.json");
    const leader = createAssistant(
      "assistant-leader",
      "Lead reviewer",
      "Coordinate the review carefully.",
    );
    const teammate = createAssistant(
      "assistant-specialist",
      "Security specialist",
      "Inspect security risks.",
    );
    const assistants = new Map([
      [leader.id, leader],
      [teammate.id, teammate],
    ]);
    const team: Team = {
      id: "team-reviewers",
      userId: "local",
      name: "Review team",
      workspace: "",
      workspaceMode: "shared",
      leaderAssistantId: leader.id,
      assistantIds: [leader.id, teammate.id],
      assistants: [],
      createdAt: 1,
      updatedAt: 1,
    };
    let capturedPrompt = "";
    let capturedLabels: Record<string, string> | undefined;
    const service = new WorkflowService({
      paseoHome: home,
      logger: pino({ enabled: false }),
      assistantStore: {
        get: (id) => assistants.get(id) ?? null,
      },
      teamStore: {
        get: (id) => (id === team.id ? team : null),
      },
      agentManager: {
        runAgent: async (_agentId, prompt) => {
          capturedPrompt = typeof prompt === "string" ? prompt : prompt.text;
          return {
            sessionId: "session",
            finalText: JSON.stringify({ control: "done", error: "" }),
            timeline: [],
            canceled: false,
          };
        },
        waitForAgentEvent: async () => ({
          status: "idle",
          permission: null,
          lastMessage: null,
        }),
        cancelAgentRun: async () => ({ status: "settled" }),
      },
      createAgent: (async (input) => {
        capturedLabels = input.kind === "mcp" ? input.labels : undefined;
        return {
          snapshot: { id: "22222222-2222-4222-8222-222222222222" },
          initialPromptError: null,
        };
      }) as BoundCreateAgentCommand,
      createDirectoryWorkspace: async ({ cwd }) => ({ workspaceId: "workspace", cwd }) as never,
      createPaseoWorktreeWorkspace: async () => {
        throw new Error("Worktree creation is not expected in this test");
      },
      archiveWorkspace: async () => undefined,
    });
    await writeFile(
      scriptPath,
      JSON.stringify({
        ...workflowV1,
        version: 1,
        name: "team workflow",
        steps: [
          {
            id: "review",
            type: "agent",
            initialPrompt: "Review this payload",
            config: {
              provider: "codex",
              cwd: home,
              assistantId: leader.id,
              teamId: team.id,
            },
          },
        ],
      }),
    );

    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: JSON.stringify({ control: "", error: "" }),
    });

    expect(run.status).toBe("succeeded");
    expect(capturedPrompt).toContain('You are the leader of the "Review team" team.');
    expect(capturedPrompt).toContain(`Security specialist (assistantId: ${teammate.id})`);
    expect(capturedPrompt).toContain("Coordinate the review carefully.");
    expect(capturedPrompt).toContain("Review this payload");
    expect(capturedLabels).toMatchObject({
      assistantId: leader.id,
      assistantName: leader.name,
      "paseo.team-id": team.id,
      "paseo.team-role": "leader",
      "paseo.workflow-step": "review",
    });
  });
});
