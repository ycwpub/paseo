import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPythonNode } from "./python-node.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("runPythonNode", () => {
  it("provides the input JSON through stdin", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "paseo-python-node-test-"));
    tempDirectories.push(cwd);
    const spawned: unknown[] = [];
    const output = await runPythonNode({
      code: [
        "import os",
        'print("diagnostic")',
        "response = {",
        '    "data": {',
        '        "customer": request["data"]["customer"],',
        '        "attempt": os.environ["PASEO_WORKFLOW_ATTEMPT"],',
        "    }",
        "}",
      ].join("\n"),
      inputVariable: "request",
      outputVariable: "response",
      pythonPath: "python3",
      inputJson:
        '{"data":{"customer":"Alice"},"origin_input":{"customer":"Alice"},"workflow":{"var":{}},"node":{"var":{}}}',
      iterationPath: [2],
      cwd,
      timeoutMs: 10_000,
      runId: "run-1",
      runDir: cwd,
      artifactDir: join(cwd, "artifacts"),
      stepId: "python-1",
      attempt: 3,
      onSpawn: (child) => spawned.push(child),
      onClose: (child) => spawned.splice(spawned.indexOf(child), 1),
    });

    expect(output.stderr).toBe("");
    expect(output.stdout).toBe("diagnostic\n");
    expect(JSON.parse(output.resultJson)).toEqual({
      data: {
        customer: "Alice",
        attempt: "3",
      },
    });
    expect(output.resultExceededLimit).toBe(false);
    expect(spawned).toEqual([]);
  });

  it("invokes a declared module function with the parsed node input", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "paseo-python-module-test-"));
    tempDirectories.push(cwd);
    await writeFile(
      join(cwd, "workflow_node.py"),
      [
        "def run_node(request):",
        "    return {",
        '        "data": {',
        '            "customer": request["data"]["customer"],',
        '            "mode": "module",',
        "        }",
        "    }",
      ].join("\n"),
    );

    const output = await runPythonNode({
      module: "workflow_node",
      function: "run_node",
      inputVariable: "request",
      outputVariable: "response",
      pythonPath: "python3",
      inputJson:
        '{"data":{"customer":"Alice"},"origin_input":{"customer":"Alice"},"workflow":{"var":{}},"node":{"var":{}}}',
      iterationPath: [],
      cwd,
      timeoutMs: 10_000,
      runId: "run-module",
      runDir: cwd,
      artifactDir: join(cwd, "artifacts"),
      stepId: "python-module",
      attempt: 1,
      onSpawn: () => undefined,
      onClose: () => undefined,
    });

    expect(JSON.parse(output.resultJson)).toEqual({
      data: { customer: "Alice", mode: "module" },
    });
  });

  it("reports Python failures with stderr", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "paseo-python-node-test-"));
    tempDirectories.push(cwd);

    await expect(
      runPythonNode({
        code: 'raise RuntimeError("broken node")',
        inputVariable: "input",
        outputVariable: "output",
        pythonPath: "python3",
        inputJson: '{"data":{},"origin_input":{},"workflow":{"var":{}},"node":{"var":{}}}',
        iterationPath: [],
        cwd,
        timeoutMs: 10_000,
        runId: "run-2",
        runDir: cwd,
        artifactDir: join(cwd, "artifacts"),
        stepId: "python-2",
        attempt: 1,
        onSpawn: () => undefined,
        onClose: () => undefined,
      }),
    ).rejects.toThrow(/Python workflow node failed with exit code 1:.*broken node/s);
  });
});
