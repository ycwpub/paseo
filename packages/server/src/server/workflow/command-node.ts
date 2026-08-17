import { spawn, type ChildProcess } from "node:child_process";
import { Readable } from "node:stream";
import type { WorkflowNodeInputEnvelope } from "@getpaseo/protocol/workflow/data-contract";
import { MAX_WORKFLOW_RESULT_CHARS, WORKFLOW_RESULT_FILE_DESCRIPTOR } from "./command-result.js";

const MAX_OUTPUT_CHARS = 200_000;

export interface WorkflowCommandOutput {
  stdout: string;
  stderr: string;
  resultJson: string;
  resultExceededLimit: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export class WorkflowCommandExecutionError extends Error {
  constructor(
    message: string,
    readonly output: WorkflowCommandOutput,
    readonly timedOut: boolean,
  ) {
    super(message);
    this.name = "WorkflowCommandExecutionError";
  }
}

export function runBashWorkflowNode(input: {
  instruction: string;
  inputVariable: string;
  outputVariable: string;
  inputJson: string;
  iterationPath: number[];
  cwd: string;
  shell: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  runId: string;
  runDir: string;
  artifactDir: string;
  stepId: string;
  attempt: number;
  onSpawn: (child: ChildProcess) => void;
  onClose: (child: ChildProcess) => void;
}): Promise<WorkflowCommandOutput> {
  return new Promise((resolvePromise, reject) => {
    const wrappedInstruction = buildBashWrapper(
      input.instruction,
      input.inputVariable,
      input.outputVariable,
    );
    const args =
      process.platform === "win32"
        ? ["/d", "/s", "/c", wrappedInstruction]
        : ["-c", wrappedInstruction, "paseo-workflow"];
    const child = spawn(input.shell, args, {
      cwd: input.cwd,
      env: {
        ...input.env,
        PASEO_WORKFLOW_ITERATION_PATH: JSON.stringify(input.iterationPath),
        PASEO_WORKFLOW_RUN_ID: input.runId,
        PASEO_WORKFLOW_RUN_DIR: input.runDir,
        PASEO_WORKFLOW_ARTIFACT_DIR: input.artifactDir,
        PASEO_WORKFLOW_STEP_ID: input.stepId,
        PASEO_WORKFLOW_ATTEMPT: String(input.attempt),
      },
      stdio: ["pipe", "pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const resultStream = child.stdio[WORKFLOW_RESULT_FILE_DESCRIPTOR];
    if (!(resultStream instanceof Readable) || !child.stdin || !child.stdout || !child.stderr) {
      child.kill();
      reject(new Error("Workflow command process did not expose the required stdio streams"));
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
      // Process exit handling below reports the actionable shell error.
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
            `Bash workflow node timed out after ${input.timeoutMs}ms`,
            output,
            true,
          ),
        );
        return;
      }
      if (exitCode !== 0) {
        reject(
          new WorkflowCommandExecutionError(
            `Bash workflow node failed with ${
              exitCode === null ? `signal ${signal ?? "unknown"}` : `exit code ${exitCode}`
            }${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
            output,
            false,
          ),
        );
        return;
      }
      resolvePromise(output);
    });
    child.stdin.end(input.inputJson);
  });
}

export function serializeWorkflowNodeInput(input: WorkflowNodeInputEnvelope): string {
  return JSON.stringify(input);
}

export function formatCommandProcessOutput(output: WorkflowCommandOutput): string | null {
  const sections = [];
  if (output.stdout.trim()) {
    sections.push(`stdout:\n${output.stdout.trimEnd()}`);
  }
  if (output.stderr.trim()) {
    sections.push(`stderr:\n${output.stderr.trimEnd()}`);
  }
  return sections.length > 0 ? sections.join("\n\n") : null;
}

export function trimWorkflowOutput(value: string): string {
  return value.length <= MAX_OUTPUT_CHARS ? value : value.slice(value.length - MAX_OUTPUT_CHARS);
}

function buildBashWrapper(
  instruction: string,
  inputVariable: string,
  outputVariable: string,
): string {
  if (process.platform === "win32") {
    throw new Error("Workflow Bash input/output variables are not supported on Windows");
  }
  return [
    `${inputVariable}="$(cat)"`,
    `${outputVariable}=""`,
    instruction,
    `if [ -z "\${${outputVariable}}" ]; then`,
    `  echo 'Workflow Bash output variable ${outputVariable} is empty' >&2`,
    "  exit 1",
    "fi",
    `printf '%s' "\${${outputVariable}}" >&3`,
  ].join("\n");
}
