import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const MAX_OUTPUT_CHARS = 200_000;

export interface PythonNodeProcessOutput {
  stdout: string;
  stderr: string;
}

export interface RunPythonNodeInput {
  code: string;
  pythonPath: string;
  inputJson: string;
  iterationPath: number[];
  cwd: string;
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
        ...process.env,
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
      stdout = trimOutput(stdout + String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr = trimOutput(stderr + String(chunk));
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
      if (timedOut) {
        reject(new Error(`Python workflow node timed out after ${input.timeoutMs}ms`));
      } else if (exitCode !== 0) {
        reject(
          new Error(
            `Python workflow node failed with ${
              exitCode === null ? `signal ${signal ?? "unknown"}` : `exit code ${exitCode}`
            }${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
          ),
        );
      } else {
        resolve({ stdout, stderr });
      }
    });
    child.stdin.end(input.inputJson);
  });
}

function trimOutput(value: string): string {
  return value.length <= MAX_OUTPUT_CHARS ? value : value.slice(value.length - MAX_OUTPUT_CHARS);
}
