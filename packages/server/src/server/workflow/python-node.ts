import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { WorkflowCommandExecutionError, trimWorkflowOutput } from "./command-node.js";

export interface PythonNodeProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export interface RunPythonNodeInput {
  code: string;
  pythonPath: string;
  inputJson: string;
  iterationPath: number[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  runId: string;
  stepId: string;
  attempt: number;
  onSpawn: (child: ChildProcess) => void;
  onClose: (child: ChildProcess) => void;
}

export async function runPythonNode(input: RunPythonNodeInput): Promise<PythonNodeProcessOutput> {
  const tempDirectory = await mkdtemp(join(tmpdir(), "paseo-workflow-python-"));
  const scriptPath = join(tempDirectory, "node.py");
  try {
    await writeFile(scriptPath, input.code, "utf8");
    return await executePythonFile(input, scriptPath);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
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
        PASEO_WORKFLOW_STEP_ID: input.stepId,
        PASEO_WORKFLOW_ATTEMPT: String(input.attempt),
        PYTHONPATH: [input.cwd, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    input.onSpawn(child);
    let stdout = "";
    let stderr = "";
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
      const output = { stdout, stderr, exitCode, signal };
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
