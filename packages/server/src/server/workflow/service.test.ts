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
  return [shellQuote(process.execPath), "-e", shellQuote(source), ...args.map(shellQuote)].join(
    " ",
  );
}

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
  it("creates, updates, lists, and deletes managed workflow scripts", async () => {
    const home = await createTempHome();
    const service = createService(home);
    await service.start();

    const created = await service.saveScript({
      script: {
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
        version: 1,
        name: "Latest run",
        steps: [
          {
            id: "complete",
            type: "bash",
            initialCommand: nodeCommand(
              [
                'const fs = require("fs");',
                "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE,",
                '  JSON.stringify({ control: "done", error: "" }));',
              ].join("\n"),
            ),
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
        version: 1,
        name: "JSON input",
        steps: [
          {
            id: "consume",
            type: "bash",
            initialCommand: nodeCommand(
              [
                'const fs = require("fs");',
                "const input = JSON.parse(process.env.PASEO_WORKFLOW_INPUT_JSON);",
                "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
                '  ...input, control: "done", error: "", greeting: `Hello ${input.customer.name}`',
                "}));",
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

  it("renders payload and custom variables in Bash commands", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        version: 1,
        name: "Bash variables",
        steps: [
          {
            id: "render",
            type: "bash",
            initialCommand: nodeCommand(
              [
                'const fs = require("fs");',
                "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
                '  control: "done", error: "", customer: process.argv[1], item: process.argv[2], role: process.argv[3]',
                "}));",
              ].join("\n"),
              "{{customer.name}}",
              "{{items.0.id}}",
              "{{role}}",
            ),
            variables: {
              role: "{{customer.name}}-reviewer",
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
        control: "",
        error: "",
        customer: { name: "Alice" },
        items: [{ id: 7 }],
      }),
    });

    expect(run.status).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toMatchObject({
      customer: "Alice",
      item: "7",
      role: "Alice-reviewer",
    });
  });

  it("defaults missing control and error fields in initial JSON payloads", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        version: 1,
        name: "Default input fields",
        steps: [
          {
            id: "copy",
            type: "bash",
            initialCommand:
              'printf \'%s\\n\' "$PASEO_WORKFLOW_INPUT_JSON" > "$PASEO_WORKFLOW_RESULT_FILE"',
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

    expect(run.status).toBe("succeeded");
    expect(JSON.parse(run.inputPayload ?? "{}")).toEqual({
      control: "",
      error: "",
      customer: "Alice",
    });
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      control: "",
      error: "",
      customer: "Alice",
    });
  });

  it.each([
    ["invalid JSON", "not json", "valid JSON object"],
    ["a non-object value", "[]", "must be a JSON object"],
    [
      "a non-string control field",
      '{"control":[]}',
      'fields "control" and "error" must be strings',
    ],
  ])(
    "rejects initial payloads with %s before creating a run",
    async (_label, inputPayload, error) => {
      const home = await createTempHome();
      const scriptPath = join(home, "workflow.json");
      await writeFile(
        scriptPath,
        JSON.stringify({
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
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  filePath: output, control: "done", error: ""',
        "}));",
      ].join("\n"),
      finalPath,
    );
    const firstCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const next = process.argv[1];",
        'fs.writeFileSync(next, "exit 99");',
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  filePath: next, control: "go", error: ""',
        "}));",
      ].join("\n"),
      nextInstructionPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
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
    expect(run.control).toBe("done");
    expect(await readFile(finalPath, "utf8")).toBe("finished");
    expect(run.nodeRuns.map((node) => node.stepId)).toEqual(["prepare", "route", "finish"]);
  });

  it("stops immediately when a node returns a non-empty error", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const markerPath = join(home, "should-not-exist");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");
    const failingCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  filePath: process.env.PASEO_WORKFLOW_INPUT_FILE, control: "stop", error: "boom"',
        "}));",
      ].join("\n"),
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
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
    expect(run.error).toBe("boom");
    expect(run.nodeRuns).toHaveLength(1);
    await expect(readFile(markerPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("passes one JSON string between Bash nodes and preserves arbitrary fields", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");
    const prepareCommand = [
      'test "$1" = "$PASEO_WORKFLOW_INPUT_JSON"',
      nodeCommand(
        [
          'const fs = require("fs");',
          "const input = JSON.parse(process.env.PASEO_WORKFLOW_INPUT_JSON);",
          "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
          '  ...input, customer: { name: "Alice" }, count: 2, control: "next", error: ""',
          "}));",
        ].join("\n"),
      ),
    ].join(" && ");
    const consumeCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const input = JSON.parse(process.env.PASEO_WORKFLOW_INPUT_JSON);",
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  control: "done", error: "", greeting: `Hello ${input.customer.name}`,',
        "  doubled: input.count * 2",
        "}));",
      ].join("\n"),
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
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
      error: "",
      greeting: "Hello Alice",
      doubled: 4,
    });
    expect(JSON.parse(run.nodeRuns[1]?.inputPayload ?? "{}")).toMatchObject({
      customer: { name: "Alice" },
      count: 2,
      control: "next",
      error: "",
    });
  });

  it.each([
    [
      "control",
      '{"error":"","message":"missing control"}',
      { control: "", error: "", message: "missing control" },
    ],
    [
      "error",
      '{"control":"next","message":"missing error"}',
      { control: "next", error: "", message: "missing error" },
    ],
    [
      "control and error",
      '{"message":"missing both"}',
      { control: "", error: "", message: "missing both" },
    ],
  ])("defaults missing %s fields in Bash node JSON", async (_label, output, expected) => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");
    await writeFile(
      scriptPath,
      JSON.stringify({
        version: 1,
        name: "invalid payload",
        steps: [
          {
            id: "normalize",
            type: "bash",
            initialCommand: `printf '%s\\n' ${shellQuote(output)} > "$PASEO_WORKFLOW_RESULT_FILE"`,
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual(expected);
  });

  it.each([
    ["invalid JSON", "not json", "Workflow node output is not valid JSON"],
    [
      "a non-string control field",
      '{"control":[],"error":""}',
      'Workflow node output field "control" must be a string',
    ],
    [
      "a non-string error field",
      '{"control":"","error":false}',
      'Workflow node output field "error" must be a string',
    ],
  ])(
    "returns a standard error payload for Bash output with %s",
    async (_label, output, message) => {
      const home = await createTempHome();
      const inputPath = join(home, "input.txt");
      const scriptPath = join(home, "workflow.json");
      await writeFile(inputPath, "input");
      await writeFile(
        scriptPath,
        JSON.stringify({
          version: 1,
          name: "invalid payload",
          steps: [
            {
              id: "invalid",
              type: "bash",
              initialCommand: `printf '%s\\n' ${shellQuote(output)} > "$PASEO_WORKFLOW_RESULT_FILE"`,
            },
          ],
        }),
      );

      const service = createService(home);
      await service.start();
      const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

      expect(run.status).toBe("failed");
      expect(run.error).toContain(message);
      expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
        control: "",
        error: expect.stringContaining(message),
      });
      expect(JSON.parse(run.nodeRuns[0]?.outputPayload ?? "{}")).toEqual({
        control: "",
        error: expect.stringContaining(message),
      });
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
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  filePath: outputFile, control: "complete", error: ""',
        "}));",
      ].join("\n"),
      attemptPath,
      outputPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
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
        version: 1,
        name: "timeout",
        steps: [
          {
            id: "slow",
            type: "bash",
            initialCommand: nodeCommand("setTimeout(() => {}, 5_000)"),
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
        version: 1,
        name: "cancel",
        steps: [
          {
            id: "wait",
            type: "bash",
            initialCommand: nodeCommand("setTimeout(() => {}, 30_000)"),
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
        version: 1,
        name: "workflow deadline",
        timeoutMs: 25,
        steps: [
          {
            id: "wait",
            type: "bash",
            initialCommand: nodeCommand("setTimeout(() => {}, 30_000)"),
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
        "fs.appendFileSync(log, `${process.env.PASEO_WORKFLOW_CONTROL}\\n`);",
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        "  filePath: process.env.PASEO_WORKFLOW_INPUT_FILE,",
        "  control: process.env.PASEO_WORKFLOW_CONTROL,",
        '  error: ""',
        "}));",
      ].join("\n"),
      loopLogPath,
    );
    const prepareCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  control: \'["alpha","beta"]\', error: ""',
        "}));",
      ].join("\n"),
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        version: 1,
        name: "for",
        steps: [
          { id: "prepare", type: "bash", initialCommand: prepareCommand },
          {
            id: "items",
            type: "for",
            separator: ",",
            steps: [{ id: "each", type: "bash", initialCommand: loopCommand }],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("succeeded");
    expect(run.control).toBe("beta");
    expect(await readFile(loopLogPath, "utf8")).toBe("alpha\nbeta\n");
    expect(run.nodeRuns.filter((node) => node.stepId === "each")).toHaveLength(2);
  });

  it("lets a for body break early with the standard break control", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const loopLogPath = join(home, "loop.log");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");

    const prepareCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  control: \'["alpha","beta","gamma"]\', error: "", source: "test"',
        "}));",
      ].join("\n"),
    );
    const loopCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const input = JSON.parse(process.env.PASEO_WORKFLOW_INPUT_JSON);",
        "fs.appendFileSync(process.argv[1], `${input.loop.index}:${input.loop.item}\\n`);",
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  ...input, control: input.loop.item === "beta" ? "break" : input.control, error: ""',
        "}));",
      ].join("\n"),
      loopLogPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        version: 1,
        name: "for break",
        steps: [
          { id: "prepare", type: "bash", initialCommand: prepareCommand },
          {
            id: "items",
            type: "for",
            separator: ",",
            steps: [{ id: "each", type: "bash", initialCommand: loopCommand }],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("succeeded");
    expect(run.control).toBe("break");
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
      [
        'const fs = require("fs");',
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  control: "alpha,beta,gamma", error: ""',
        "}));",
      ].join("\n"),
    );
    const firstCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const input = JSON.parse(process.env.PASEO_WORKFLOW_INPUT_JSON);",
        "fs.appendFileSync(process.argv[1], `${input.loop.item}\\n`);",
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  ...input, control: input.loop.item === "beta" ? "continue" : input.control, error: ""',
        "}));",
      ].join("\n"),
      firstLogPath,
    );
    const secondCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const input = JSON.parse(process.env.PASEO_WORKFLOW_INPUT_JSON);",
        "fs.appendFileSync(process.argv[1], `${input.loop.item}\\n`);",
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify(input));",
      ].join("\n"),
      secondLogPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        version: 1,
        name: "for continue",
        steps: [
          { id: "prepare", type: "bash", initialCommand: prepareCommand },
          {
            id: "items",
            type: "for",
            separator: ",",
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
        "const input = JSON.parse(process.env.PASEO_WORKFLOW_INPUT_JSON);",
        "fs.appendFileSync(process.argv[1], `${input.loop.index}:${input.loop.item}:${input.loop.count}\\n`);",
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  ...input, control: input.loop.index === 2 ? "break" : "continue", error: ""',
        "}));",
      ].join("\n"),
      loopLogPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        version: 1,
        name: "continuous for",
        steps: [
          {
            id: "loop",
            type: "for",
            steps: [{ id: "each", type: "bash", initialCommand: loopCommand }],
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("succeeded");
    expect(await readFile(loopLogPath, "utf8")).toBe("0:null:100\n1:null:100\n2:null:100\n");
    expect(run.nodeRuns.filter((node) => node.stepId === "each")).toHaveLength(3);
    expect(run.nodeRuns.find((node) => node.stepId === "loop")?.output).toContain(
      "Stopped after 3 of 100",
    );
  });

  it("uses 100 iterations by default for a continuous loop without break", async () => {
    const home = await createTempHome();
    const inputPath = join(home, "input.txt");
    const scriptPath = join(home, "workflow.json");
    await writeFile(inputPath, "input");
    const loopCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const input = JSON.parse(process.env.PASEO_WORKFLOW_INPUT_JSON);",
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  ...input, control: "", error: ""',
        "}));",
      ].join("\n"),
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        version: 1,
        name: "default continuous limit",
        steps: [
          {
            id: "loop",
            type: "for",
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
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  filePath: process.argv[1], control: "ready", error: ""',
        "}));",
      ].join("\n"),
      upstreamPath,
      "upstream data that is not a shell command",
    );
    const consumeCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "const inputPath = process.env.PASEO_WORKFLOW_INPUT_FILE;",
        'fs.writeFileSync(process.argv[1], fs.readFileSync(inputPath, "utf8"));',
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  filePath: process.argv[1], control: "done", error: ""',
        "}));",
      ].join("\n"),
      finalPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
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
    });
    const prepareCommand = nodeCommand(
      [
        'const fs = require("fs");',
        "fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify({",
        '  filePath: process.argv[1], control: "review", error: "",',
        '  customer: { name: "Alice" }, records: [{ id: 7 }, { id: 8 }]',
        "}));",
      ].join("\n"),
      upstreamPath,
    );
    await writeFile(
      scriptPath,
      JSON.stringify({
        version: 1,
        name: "agent variables",
        steps: [
          { id: "prepare", type: "bash", initialCommand: prepareCommand },
          {
            id: "analyze",
            name: "Analyze source",
            type: "agent",
            initialPrompt:
              "Read {{inputFilePath}} as {{role}}. Name={{inputFileName}}; control={{control}}; body={{inputFileContent}}; customer={{customer.name}}; first={{records.0.id}}; records={{records}}",
            promptVariables: {
              role: "reviewer",
            },
            config: {
              provider: "codex",
              cwd: home,
              systemPrompt: "# Role\nYou are a careful data reviewer.",
            },
          },
        ],
      }),
    );

    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputFilePath: inputPath });

    expect(run.status).toBe("succeeded");
    expect(capturedPrompt).toContain(`Read ${upstreamPath} as reviewer.`);
    expect(capturedPrompt).toContain("Name=source.txt; control=review; body=source body");
    expect(capturedPrompt).toContain('customer=Alice; first=7; records=[{"id":7},{"id":8}]');
    expect(capturedPrompt).toContain('"customer":{"name":"Alice"}');
    expect(capturedPrompt).toContain(
      "System prompt delivery: configured separately through the provider's system-instruction",
    );
    expect(capturedPrompt).not.toContain("You are a careful data reviewer.");
    expect(capturedPrompt).not.toContain("Input mode:");
    expect(capturedSystemPrompt).toBe("# Role\nYou are a careful data reviewer.");
    expect(JSON.parse(run.outputPayload ?? "{}")).toMatchObject({
      control: "complete",
      error: "",
      reviewedCustomer: "Alice",
    });
  });

  it("defaults missing control and error fields in Agent node JSON", async () => {
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
        version: 1,
        name: "agent defaults",
        steps: [
          {
            id: "agent",
            type: "agent",
            initialPrompt: "Return the result",
            config: { provider: "codex", cwd: home },
          },
        ],
      }),
    );

    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"control":"","error":""}',
    });

    expect(run.status).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      control: "",
      error: "",
      message: "ok",
    });
  });

  it("returns a standard error payload for invalid Agent node JSON", async () => {
    const home = await createTempHome();
    const scriptPath = join(home, "invalid-agent-output.json");
    const service = new WorkflowService({
      paseoHome: home,
      logger: pino({ enabled: false }),
      agentManager: {
        runAgent: async () => ({
          sessionId: "session",
          finalText: "not json",
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
        version: 1,
        name: "invalid agent output",
        steps: [
          {
            id: "agent",
            type: "agent",
            initialPrompt: "Return the result",
            config: { provider: "codex", cwd: home },
          },
        ],
      }),
    );

    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"control":"","error":""}',
    });

    const message = "Workflow node output is not valid JSON";
    expect(run.status).toBe("failed");
    expect(run.error).toContain(message);
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      control: "",
      error: expect.stringContaining(message),
    });
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
