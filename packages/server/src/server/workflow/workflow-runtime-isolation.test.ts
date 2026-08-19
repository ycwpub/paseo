import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import type { BoundCreateAgentCommand } from "../agent/create-agent/create.js";
import { WorkflowService } from "./service.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Workflow runtime isolation", () => {
  it("uses an isolated run directory by default and discovers framework artifacts", async () => {
    const home = await createTempDirectory("paseo-workflow-runtime-");
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        apiVersion: "paseo.sh/workflow/v1",
        kind: "Workflow",
        version: 1,
        name: "Runtime isolation",
        steps: [
          {
            id: "write",
            type: "python",
            code: [
              "import json",
              "import os",
              'with open(os.path.join(os.environ["PASEO_WORKFLOW_ARTIFACT_DIR"], "result.json"), "w") as artifact:',
              '    json.dump({"ok": True}, artifact)',
              "output = {",
              '    "data": {',
              '        "cwd": os.getcwd(),',
              '        "run_dir": os.environ["PASEO_WORKFLOW_RUN_DIR"],',
              '        "artifact_dir": os.environ["PASEO_WORKFLOW_ARTIFACT_DIR"],',
              "    }",
              "}",
            ].join("\n"),
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputPayload: "{}" });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(run.runDir).toBe(join(home, "workflow-run-data", run.id));
    expect(run.artifactDir).toBe(join(run.runDir!, "artifacts"));
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      cwd: await realpath(run.runDir!),
      run_dir: run.runDir,
      artifact_dir: run.artifactDir,
    });
    expect(run.artifacts).toEqual([
      expect.objectContaining({
        name: "result.json",
        mediaType: "application/json",
      }),
    ]);
    expect(JSON.parse(await readFile(join(run.artifactDir!, "result.json"), "utf8"))).toEqual({
      ok: true,
    });
    expect(dirname(scriptPath)).not.toBe(run.runDir);
  });

  it("invokes a declared Python module function from the configured cwd", async () => {
    const home = await createTempDirectory("paseo-workflow-module-");
    const project = await createTempDirectory("paseo-workflow-module-project-");
    await writeFile(
      join(project, "prepare_node.py"),
      [
        "import os",
        "",
        "def run_node(input):",
        "    return {",
        '        "data": {',
        '            "value": input["data"]["value"],',
        '            "env": os.environ["WORKFLOW_TEST_ENV"],',
        "        }",
        "    }",
      ].join("\n"),
    );
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        apiVersion: "paseo.sh/workflow/v1",
        kind: "Workflow",
        version: 1,
        name: "Module entrypoint",
        steps: [
          {
            id: "prepare",
            type: "python",
            cwd: project,
            module: "prepare_node",
            function: "run_node",
            env: { WORKFLOW_TEST_ENV: "module" },
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({
      scriptPath,
      inputPayload: '{"value":"ok"}',
    });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      value: "ok",
      env: "module",
    });
    expect(run.nodeRuns[0]?.cwd).toBe(project);
  });

  it("renders the workflow definition directory in Bash and Python cwd", async () => {
    const home = await createTempDirectory("paseo-workflow-template-cwd-");
    const pluginRoot = join(home, "plugin");
    const workflowsDirectory = join(pluginRoot, "workflows");
    const scriptsDirectory = join(pluginRoot, "scripts");
    await mkdir(workflowsDirectory, { recursive: true });
    await mkdir(scriptsDirectory, { recursive: true });
    await writeFile(
      join(scriptsDirectory, "bash_node.py"),
      [
        "import json",
        "import os",
        "import sys",
        "input = json.load(sys.stdin)",
        'print(json.dumps({"data": {"bash_cwd": os.getcwd()}}))',
      ].join("\n"),
    );
    await writeFile(
      join(scriptsDirectory, "finalize.py"),
      [
        "import os",
        "",
        "def run_node(input):",
        '    return {"data": {**input["data"], "python_cwd": os.getcwd()}}',
      ].join("\n"),
    );
    const scriptPath = join(workflowsDirectory, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        apiVersion: "paseo.sh/workflow/v1",
        kind: "Workflow",
        version: 1,
        name: "Templated cwd",
        steps: [
          {
            id: "bash",
            type: "bash",
            cwd: "{{workflow.cwd}}/..",
            initialCommand: 'output="$(python3 scripts/bash_node.py <<< "$input")"',
          },
          {
            id: "python",
            type: "python",
            cwd: "{{workflow.cwd}}/..",
            module: "scripts.finalize",
            function: "run_node",
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputPayload: "{}" });
    const expectedCwd = await realpath(pluginRoot);

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({
      bash_cwd: expectedCwd,
      python_cwd: expectedCwd,
    });
    expect(run.nodeRuns.map((node) => node.cwd)).toEqual([pluginRoot, pluginRoot]);
  });

  it("retains artifacts created by a failed node attempt", async () => {
    const home = await createTempDirectory("paseo-workflow-failed-artifact-");
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        apiVersion: "paseo.sh/workflow/v1",
        kind: "Workflow",
        version: 1,
        name: "Failed artifact",
        steps: [
          {
            id: "fail",
            type: "python",
            code: [
              "import os",
              "import sys",
              'with open(os.path.join(os.environ["PASEO_WORKFLOW_ARTIFACT_DIR"], "failure.log"), "w") as artifact:',
              '    artifact.write("diagnostic")',
              "sys.exit(7)",
            ].join("\n"),
          },
        ],
      }),
    );

    const service = createService(home);
    await service.start();
    const run = await service.runScriptAndWait({ scriptPath, inputPayload: "{}" });

    expect(run.status).toBe("failed");
    expect(run.artifacts).toEqual([
      expect.objectContaining({ name: "failure.log", mediaType: "text/plain" }),
    ]);
    expect(run.nodeRuns[0]?.artifacts).toEqual([
      expect.objectContaining({ name: "failure.log", mediaType: "text/plain" }),
    ]);
    expect(await readFile(join(run.artifactDir!, "failure.log"), "utf8")).toBe("diagnostic");
  });
});

async function createTempDirectory(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(path);
  return path;
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
      cancelAgentRun: async () => ({ status: "settled" }),
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
