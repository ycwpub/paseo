import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { Readable } from "node:stream";
import { WorkflowCommandExecutionError, trimWorkflowOutput } from "./command-node.js";
import { MAX_WORKFLOW_RESULT_CHARS, WORKFLOW_RESULT_FILE_DESCRIPTOR } from "./command-result.js";

export interface PythonNodeProcessOutput {
  stdout: string;
  stderr: string;
  resultJson: string;
  resultExceededLimit: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export interface RunPythonNodeInput {
  code?: string;
  module?: string;
  function?: string;
  inputVariable: string;
  outputVariable: string;
  pythonPath: string;
  inputJson: string;
  iterationPath: number[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  runId: string;
  runDir: string;
  artifactDir: string;
  stepId: string;
  attempt: number;
  onSpawn: (child: ChildProcess) => void;
  onClose: (child: ChildProcess) => void;
}

export async function runPythonNode(input: RunPythonNodeInput): Promise<PythonNodeProcessOutput> {
  const tempDirectory = await mkdtemp(join(tmpdir(), "paseo-workflow-python-"));
  const scriptPath = join(tempDirectory, "node.py");
  try {
    await writeFile(scriptPath, buildPythonWrapper(input), "utf8");
    return await executePythonFile(input, scriptPath);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

function buildPythonWrapper(input: RunPythonNodeInput): string {
  const prelude = [
    "import asyncio",
    "import importlib",
    "import inspect",
    "import json",
    "import os",
    "import sys",
    `${input.inputVariable} = json.load(sys.stdin)`,
    `${input.outputVariable} = None`,
  ];
  const invocation = input.code
    ? [
        `exec(compile(${JSON.stringify(input.code)}, "<paseo-workflow-node>", "exec"), globals(), globals())`,
      ]
    : buildModuleInvocation(input);
  return [
    ...prelude,
    ...invocation,
    `if ${input.outputVariable} is None:`,
    `    raise RuntimeError("Workflow Python output variable ${input.outputVariable} was not assigned")`,
    'with os.fdopen(3, "w") as __paseo_result:',
    `    json.dump(${input.outputVariable}, __paseo_result, ensure_ascii=False)`,
  ].join("\n");
}

function buildModuleInvocation(input: RunPythonNodeInput): string[] {
  if (!input.module || !input.function) {
    throw new Error("Python workflow node requires code or module and function");
  }
  return [
    `__paseo_target = importlib.import_module(${JSON.stringify(input.module)})`,
    `for __paseo_segment in ${JSON.stringify(input.function.split("."))}:`,
    "    __paseo_target = getattr(__paseo_target, __paseo_segment)",
    `__paseo_value = __paseo_target(${input.inputVariable})`,
    "if inspect.isawaitable(__paseo_value):",
    "    __paseo_value = asyncio.run(__paseo_value)",
    `${input.outputVariable} = __paseo_value`,
  ];
}

function executePythonFile(
  input: RunPythonNodeInput,
  scriptPath: string,
): Promise<PythonNodeProcessOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.pythonPath, [scriptPath], {
      cwd: input.cwd,
      env: {
        ...(input.env ?? process.env),
        PASEO_WORKFLOW_ITERATION_PATH: JSON.stringify(input.iterationPath),
        PASEO_WORKFLOW_RUN_ID: input.runId,
        PASEO_WORKFLOW_RUN_DIR: input.runDir,
        PASEO_WORKFLOW_ARTIFACT_DIR: input.artifactDir,
        PASEO_WORKFLOW_STEP_ID: input.stepId,
        PASEO_WORKFLOW_ATTEMPT: String(input.attempt),
        PYTHONPATH: [input.cwd, input.env?.PYTHONPATH ?? process.env.PYTHONPATH]
          .filter(Boolean)
          .join(delimiter),
      },
      stdio: ["pipe", "pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const resultStream = child.stdio[WORKFLOW_RESULT_FILE_DESCRIPTOR];
    if (!(resultStream instanceof Readable) || !child.stdin || !child.stdout || !child.stderr) {
      child.kill();
      reject(new Error("Python workflow process did not expose the required stdio streams"));
      return;
    }
    input.onSpawn(child);
    let stdout = "";
    let stderr = "";
    let resultJson = "";
    let resultExceededLimit = false;
    let timedOut = false;
    let closed = false;
    const close = () => {
      if (closed) {
        return;
      }
      closed = true;
      input.onClose(child);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutMs);
    timer.unref?.();

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = trimWorkflowOutput(stdout + String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr = trimWorkflowOutput(stderr + String(chunk));
    });
    resultStream.setEncoding("utf8");
    resultStream.on("data", (chunk) => {
      const next = resultJson + String(chunk);
      if (next.length > MAX_WORKFLOW_RESULT_CHARS) {
        resultExceededLimit = true;
        resultJson = next.slice(0, MAX_WORKFLOW_RESULT_CHARS);
        return;
      }
      resultJson = next;
    });
    child.stdin.on("error", () => {
      // Process exit handling below reports the actionable interpreter error.
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      close();
      reject(error);
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      close();
      const output = {
        stdout,
        stderr,
        resultJson,
        resultExceededLimit,
        exitCode,
        signal,
      };
      if (timedOut) {
        reject(
          new WorkflowCommandExecutionError(
            `Python workflow node timed out after ${input.timeoutMs}ms`,
            output,
            true,
          ),
        );
      } else if (exitCode !== 0) {
        reject(
          new WorkflowCommandExecutionError(
            `Python workflow node failed with ${
              exitCode === null ? `signal ${signal ?? "unknown"}` : `exit code ${exitCode}`
            }${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
            output,
            false,
          ),
        );
      } else {
        resolve(output);
      }
    });
    child.stdin.end(input.inputJson);
  });
}
