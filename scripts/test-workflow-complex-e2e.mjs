import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerEntry = join(repoRoot, "packages/server/dist/server/server/daemon-worker.js");
const cliEntry = join(repoRoot, "packages/cli/dist/index.js");
const keepArtifacts = process.env.PASEO_KEEP_WORKFLOW_E2E === "1";

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function nodeCommand(source, ...args) {
  const wrappedSource = [
    'const __paseoFs = require("fs");',
    'process.argv.push(__paseoFs.readFileSync(0, "utf8"));',
    "const __paseoWriteResult = (value) =>",
    "  __paseoFs.writeSync(3, JSON.stringify(value));",
    source,
  ].join("\n");
  return [
    shellQuote(process.execPath),
    "-e",
    shellQuote(wrappedSource),
    ...args.map(shellQuote),
  ].join(" ");
}

async function reservePort() {
  const server = createServer();
  server.unref();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolvePromise, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise();
    });
  });
  return port;
}

async function waitForHealth(host, worker, readWorkerOutput) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) {
      throw new Error(
        `Isolated daemon exited before becoming healthy (code ${worker.exitCode})\n${readWorkerOutput()}`,
      );
    }
    try {
      const response = await fetch(`http://${host}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Daemon is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error(`Timed out waiting for isolated daemon at ${host}\n${readWorkerOutput()}`);
}

async function stopWorker(worker) {
  if (worker.exitCode !== null || worker.signalCode !== null) {
    return;
  }
  worker.kill("SIGTERM");
  const timeout = setTimeout(() => worker.kill("SIGKILL"), 12_000);
  timeout.unref();
  await once(worker, "exit");
  clearTimeout(timeout);
}

async function runCli(host, paseoHome, home, args) {
  const child = spawn(process.execPath, [cliEntry, ...args, "--host", host, "--json"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      PASEO_HOME: paseoHome,
      PASEO_HOST: host,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const [exitCode] = await once(child, "exit");
  if (exitCode !== 0) {
    throw new Error(
      `CLI failed: paseo ${args.join(" ")}\nexit=${exitCode}\nstdout=${stdout}\nstderr=${stderr}`,
    );
  }
  return JSON.parse(stdout);
}

function createComplexWorkflow(paths) {
  const finalCommand = nodeCommand(
    [
      'const fs = require("fs");',
      "const reportPath = process.argv[1];",
      "const initialPath = process.argv[2];",
      "const agentOutputPath = process.argv[3];",
      "const loopLogPath = process.argv[4];",
      "const branchLogPath = process.argv[5];",
      "const report = {",
      '  initial: JSON.parse(fs.readFileSync(initialPath, "utf8")),',
      '  agentOutput: fs.readFileSync(agentOutputPath, "utf8"),',
      '  iterations: fs.readFileSync(loopLogPath, "utf8").trim().split("\\n"),',
      '  branches: fs.readFileSync(branchLogPath, "utf8").trim().split("\\n")',
      "};",
      "fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));",
      "__paseoWriteResult({",
      '  filePath: reportPath, control: "success"',
      "});",
    ].join("\n"),
    paths.finalReport,
    paths.input,
    paths.agentOutput,
    paths.loopLog,
    paths.branchLog,
  );

  const prepareDataCommand = nodeCommand(
    [
      'const fs = require("fs");',
      "const inputPath = process.argv[1];",
      "const agentInputPath = process.argv[2];",
      "const agentOutputPath = process.argv[3];",
      'const initial = JSON.parse(fs.readFileSync(inputPath, "utf8"));',
      "fs.writeFileSync(agentInputPath, JSON.stringify({",
      '  task: initial.task, records: initial.records, preparedBy: "configured-bash"',
      "}, null, 2));",
      'fs.writeFileSync(agentOutputPath, "synthetic agent analysis ready");',
      "__paseoWriteResult({",
      '  filePath: agentInputPath, control: "agent"',
      "});",
    ].join("\n"),
    paths.input,
    paths.agentInput,
    paths.agentOutput,
  );

  const seedCommand = nodeCommand(
    [
      'const fs = require("fs");',
      "fs.writeFileSync(process.argv[1], process.argv[2]);",
      "__paseoWriteResult({",
      '  filePath: process.argv[1], control: "prepare"',
      "});",
    ].join("\n"),
    paths.prepareInstruction,
    prepareDataCommand,
  );

  const recordIterationCommand = nodeCommand(
    [
      'const fs = require("fs");',
      'const path = require("path");',
      "const input = JSON.parse(process.argv.at(-1));",
      "const inputPath = input.filePath;",
      "const control = input.control;",
      "fs.appendFileSync(process.argv[1], `${control}|${path.basename(inputPath)}\\n`);",
      "__paseoWriteResult({",
      "  filePath: inputPath, control",
      "});",
    ].join("\n"),
    paths.loopLog,
  );

  const prepareLoopCommand = nodeCommand(
    [
      "__paseoWriteResult({",
      `  filePath: ${JSON.stringify(paths.agentOutput)},`,
      '  control: \'["red","green","blue"]\'',
      "});",
    ].join("\n"),
  );

  const branchCommand = (branch, instructionPath, instruction, control) =>
    nodeCommand(
      [
        'const fs = require("fs");',
        "fs.appendFileSync(process.argv[1], `${process.argv[2]}\\n`);",
        "fs.writeFileSync(process.argv[3], process.argv[4]);",
        "__paseoWriteResult({",
        "  filePath: process.argv[3], control: process.argv[5]",
        "});",
      ].join("\n"),
      paths.branchLog,
      branch,
      instructionPath,
      instruction,
      control,
    );

  const failCommand = (message) =>
    nodeCommand(
      ["process.stderr.write(process.argv[1] + '\\n');", "process.exit(1);"].join("\n"),
      message,
    );

  return {
    version: 1,
    name: "complex end-to-end workflow",
    description:
      "Exercises JSON payloads, Agent variables, nested switch, for, CLI RPC, and persistence.",
    steps: [
      {
        id: "seed-instruction",
        name: "Seed prepare payload",
        type: "bash",
        initialCommand: seedCommand,
      },
      {
        id: "prepare-route",
        type: "switch",
        caseSensitive: true,
        cases: [
          {
            equals: "prepare",
            steps: [
              {
                id: "prepare-data",
                type: "bash",
                initialCommand: prepareDataCommand,
              },
            ],
          },
        ],
        defaultSteps: [
          {
            id: "unexpected-prepare-control",
            type: "bash",
            initialCommand: failCommand("prepare switch did not match"),
          },
        ],
      },
      {
        id: "agent-analysis",
        name: "Mock Agent with prompt variables",
        type: "agent",
        initialPrompt: [
          "Analyze {{inputFilePath}} as {{role}}.",
          "The file is {{inputFileName}} and the current control is {{control}}.",
          "Prepared payload: {{inputFileContent}}",
          `MOCK_WORKFLOW_RESULT: ${JSON.stringify({
            filePath: paths.agentOutput,
            control: '["red","green","blue"]',
          })}`,
        ].join("\n"),
        promptVariables: {
          role: "complex workflow verifier",
        },
        config: {
          provider: "mock",
          model: "ten-second-stream",
          modeId: "load-test",
          cwd: paths.workspace,
          archiveOnFinish: true,
        },
      },
      {
        id: "prepare-loop",
        name: "Prepare loop control",
        type: "bash",
        initialCommand: prepareLoopCommand,
      },
      {
        id: "iterate-colors",
        type: "for",
        separator: ",",
        maxIterations: 10,
        steps: [
          {
            id: "record-iteration",
            type: "bash",
            initialCommand: recordIterationCommand,
          },
          {
            id: "item-route",
            type: "switch",
            cases: [
              {
                equals: "red",
                steps: [
                  {
                    id: "red-branch",
                    type: "bash",
                    initialCommand: branchCommand(
                      "red",
                      paths.redInstruction,
                      "unused red instruction",
                      "red-recorded",
                    ),
                  },
                ],
              },
              {
                equals: "green",
                steps: [
                  {
                    id: "green-branch",
                    type: "bash",
                    initialCommand: branchCommand(
                      "green",
                      paths.greenInstruction,
                      "unused green instruction",
                      "green-recorded",
                    ),
                  },
                ],
              },
            ],
            defaultSteps: [
              {
                id: "blue-branch",
                type: "bash",
                initialCommand: branchCommand(
                  "blue",
                  paths.finalInstruction,
                  finalCommand,
                  "finalize",
                ),
              },
            ],
          },
        ],
      },
      {
        id: "final-route",
        type: "switch",
        cases: [
          {
            equals: "finalize",
            steps: [
              {
                id: "finalize-report",
                type: "bash",
                initialCommand: finalCommand,
              },
            ],
          },
        ],
        defaultSteps: [
          {
            id: "unexpected-final-control",
            type: "bash",
            initialCommand: failCommand("final switch did not match"),
          },
        ],
      },
    ],
  };
}

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), "paseo-complex-workflow-e2e-"));
  const paseoHome = join(tempRoot, "paseo-home");
  const home = join(tempRoot, "user-home");
  const workspace = join(tempRoot, "workspace");
  const workflowsDir = join(paseoHome, "workflows");
  await Promise.all([
    mkdir(paseoHome, { recursive: true }),
    mkdir(home, { recursive: true }),
    mkdir(workspace, { recursive: true }),
    mkdir(workflowsDir, { recursive: true }),
  ]);

  const paths = {
    workspace,
    input: join(workspace, "input.json"),
    prepareInstruction: join(workspace, "prepare-command.sh"),
    agentInput: join(workspace, "agent-input.json"),
    agentOutput: join(workspace, "agent-output.txt"),
    loopLog: join(workspace, "loop.log"),
    branchLog: join(workspace, "branches.log"),
    redInstruction: join(workspace, "red-next.sh"),
    greenInstruction: join(workspace, "green-next.sh"),
    finalInstruction: join(workspace, "final-command.sh"),
    finalReport: join(workspace, "final-report.json"),
    workflow: join(workflowsDir, "complex-e2e.json"),
  };
  await writeFile(
    paths.input,
    JSON.stringify(
      {
        task: "validate complex workflow",
        records: [
          { id: 1, value: "alpha" },
          { id: 2, value: "beta" },
        ],
      },
      null,
      2,
    ),
  );
  await writeFile(paths.workflow, JSON.stringify(createComplexWorkflow(paths), null, 2));

  const port = await reservePort();
  const host = `127.0.0.1:${port}`;
  const worker = spawn(
    process.execPath,
    [workerEntry, "--no-relay", "--no-mcp", "--no-inject-mcp", "--no-web-ui"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: home,
        PASEO_HOME: paseoHome,
        PASEO_LISTEN: host,
        PASEO_NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let workerOutput = "";
  const appendWorkerOutput = (chunk) => {
    workerOutput = (workerOutput + String(chunk)).slice(-100_000);
  };
  worker.stdout.on("data", appendWorkerOutput);
  worker.stderr.on("data", appendWorkerOutput);

  try {
    await waitForHealth(host, worker, () => workerOutput);

    const inspected = await runCli(host, paseoHome, home, ["workflow", "inspect", paths.workflow]);
    assert.equal(inspected.path, paths.workflow);
    assert.equal(inspected.script.name, "complex end-to-end workflow");

    const listed = await runCli(host, paseoHome, home, ["workflow", "ls"]);
    assert(
      listed.some((workflow) => workflow.path === paths.workflow),
      "workflow/list did not discover the complex script",
    );

    const run = await runCli(host, paseoHome, home, [
      "workflow",
      "run",
      paths.workflow,
      JSON.stringify({
        control: "",
        filePath: paths.input,
      }),
    ]);
    assert.equal(run.status, "succeeded", JSON.stringify(run, null, 2));
    assert.equal(run.outputFilePath, paths.finalReport);
    assert.equal(run.control, "success");
    assert.equal(run.error, null);
    assert.equal(JSON.parse(run.outputPayload).control, "success");
    assert(run.nodeRuns.every((node) => typeof node.inputPayload === "string"));
    assert(
      run.nodeRuns.every((node) => !Object.hasOwn(JSON.parse(node.inputPayload), "error")),
      "framework error leaked into a node input payload",
    );
    assert(run.nodeRuns.every((node) => typeof node.outputPayload === "string"));
    assert.equal(run.nodeRuns.length, 17);
    assert.deepEqual(
      run.nodeRuns
        .filter((node) => node.stepId === "record-iteration")
        .map((node) => node.inputControl),
      ["red", "green", "blue"],
    );
    assert.deepEqual(
      run.nodeRuns.filter((node) => node.stepId === "item-route").map((node) => node.outputControl),
      ["red-recorded", "green-recorded", "finalize"],
    );

    const report = JSON.parse(await readFile(paths.finalReport, "utf8"));
    assert.equal(report.initial.task, "validate complex workflow");
    assert.equal(report.agentOutput, "synthetic agent analysis ready");
    assert.deepEqual(report.iterations, [
      "red|agent-output.txt",
      "green|red-next.sh",
      "blue|green-next.sh",
    ]);
    assert.deepEqual(report.branches, ["red", "green", "blue"]);

    const persistedRunPath = join(paseoHome, "workflow-runs", `${run.id}.json`);
    const persistedRun = JSON.parse(await readFile(persistedRunPath, "utf8"));
    assert.deepEqual(persistedRun, run);
    const reportStats = await stat(paths.finalReport);
    assert(reportStats.isFile());

    process.stdout.write(
      `${JSON.stringify(
        {
          status: "passed",
          host,
          tempRoot,
          workflowPath: paths.workflow,
          inputPath: paths.input,
          outputPath: paths.finalReport,
          runId: run.id,
          nodeRunCount: run.nodeRuns.length,
          persistedRunPath,
          report,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await stopWorker(worker);
    if (!keepArtifacts) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

await main();
