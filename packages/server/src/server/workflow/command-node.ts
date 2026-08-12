import { spawn, type ChildProcess } from "node:child_process";
import {
  WorkflowNodeResultSchema,
  type WorkflowNodeResult,
  type WorkflowPayload,
} from "@getpaseo/protocol/workflow/types";

const MAX_OUTPUT_CHARS = 200_000;

export interface WorkflowCommandOutput {
  stdout: string;
  stderr: string;
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
  inputJson: string;
  iterationPath: number[];
  cwd: string;
  shell: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  runId: string;
  stepId: string;
  attempt: number;
  onSpawn: (child: ChildProcess) => void;
  onClose: (child: ChildProcess) => void;
}): Promise<WorkflowCommandOutput> {
  return new Promise((resolvePromise, reject) => {
    const args =
      process.platform === "win32"
        ? ["/d", "/s", "/c", input.instruction]
        : ["-c", input.instruction, "paseo-workflow", input.inputJson];
    const child = spawn(input.shell, args, {
      cwd: input.cwd,
      env: {
        ...input.env,
        PASEO_WORKFLOW_ITERATION_PATH: JSON.stringify(input.iterationPath),
        PASEO_WORKFLOW_RUN_ID: input.runId,
        PASEO_WORKFLOW_STEP_ID: input.stepId,
        PASEO_WORKFLOW_ATTEMPT: String(input.attempt),
      },
      stdio: ["ignore", "pipe", "pipe"],
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
  });
}

export function parseCommandNodeResult(
  stdout: string,
  commandType: "Bash" | "Python",
): WorkflowNodeResult {
  const resultLine = getLastNonEmptyLine(stdout);
  if (resultLine === null) {
    return {
      control: "",
      error: `${commandType} workflow node produced no stdout result`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultLine);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      control: "",
      error: `Workflow node output is not valid JSON: ${message}`,
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      control: "",
      error: "Workflow node output must be a JSON object",
    };
  }
  const payload = parsed as Record<string, unknown>;
  for (const field of ["control", "error"] as const) {
    const value = payload[field];
    if (value !== undefined && typeof value !== "string") {
      return {
        control: "",
        error: `Workflow node output field "${field}" must be a string`,
      };
    }
  }
  return WorkflowNodeResultSchema.parse({
    ...payload,
    control: payload.control ?? "",
    error: payload.error ?? "",
  });
}

export function serializeWorkflowNodeInput(payload: WorkflowPayload): string {
  const { error: _frameworkError, ...nodeInput } = payload;
  return JSON.stringify(nodeInput);
}

export function formatLegacyProcessOutput(output: WorkflowCommandOutput): string | null {
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

function getLastNonEmptyLine(value: string): string | null {
  const lines = value.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (line) {
      return line;
    }
  }
  return null;
}
