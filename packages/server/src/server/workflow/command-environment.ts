import { spawn } from "node:child_process";
import type { WorkflowEnvironment } from "@getpaseo/protocol/workflow/environment";

const ENVIRONMENT_MARKER = "__PASEO_WORKFLOW_ENVIRONMENT__";
const MAX_ENVIRONMENT_OUTPUT_CHARS = 2_000_000;

export interface ResolvedWorkflowCommandEnvironment {
  env: NodeJS.ProcessEnv;
  source: "daemon" | "login-shell";
  path: string | null;
}

interface ResolveWorkflowCommandEnvironmentOptions {
  baseEnvironment?: NodeJS.ProcessEnv;
  loadLoginShellEnvironment?: (
    shell: string,
    baseEnvironment: NodeJS.ProcessEnv,
  ) => Promise<NodeJS.ProcessEnv>;
}

const loginEnvironmentPromises = new Map<string, Promise<NodeJS.ProcessEnv>>();

export async function resolveWorkflowCommandEnvironment(
  environment: WorkflowEnvironment | undefined,
  options: ResolveWorkflowCommandEnvironmentOptions = {},
): Promise<ResolvedWorkflowCommandEnvironment> {
  const baseEnvironment = options.baseEnvironment ?? process.env;
  const source = environment?.inherit ?? "daemon";
  let inherited = baseEnvironment;
  if (source === "login-shell") {
    if (process.platform === "win32") {
      throw new Error("Login-shell workflow environment is not supported on Windows");
    }
    const shell = baseEnvironment.SHELL?.trim() || "/bin/bash";
    const loader = options.loadLoginShellEnvironment ?? loadLoginShellEnvironment;
    inherited = await loader(shell, baseEnvironment);
  }
  const env = {
    ...inherited,
    ...environment?.variables,
  };
  return {
    env,
    source,
    path: env.PATH?.trim() || null,
  };
}

function loadLoginShellEnvironment(
  shell: string,
  baseEnvironment: NodeJS.ProcessEnv,
): Promise<NodeJS.ProcessEnv> {
  const cached = loginEnvironmentPromises.get(shell);
  if (cached) {
    return cached;
  }
  const loaded = spawnLoginShellEnvironment(shell, baseEnvironment).catch((error) => {
    loginEnvironmentPromises.delete(shell);
    throw error;
  });
  loginEnvironmentPromises.set(shell, loaded);
  return loaded;
}

function spawnLoginShellEnvironment(
  shell: string,
  baseEnvironment: NodeJS.ProcessEnv,
): Promise<NodeJS.ProcessEnv> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(shell, ["-lic", `printf '${ENVIRONMENT_MARKER}\\0'; env -0`], {
      env: baseEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, String(chunk));
    });
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      if (exitCode !== 0) {
        reject(
          new Error(
            `Failed to load login-shell environment with ${
              exitCode === null ? `signal ${signal ?? "unknown"}` : `exit code ${exitCode}`
            }${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
          ),
        );
        return;
      }
      const markerIndex = stdout.indexOf(`${ENVIRONMENT_MARKER}\0`);
      if (markerIndex === -1) {
        reject(new Error("Login shell did not return a readable environment"));
        return;
      }
      const entries = stdout.slice(markerIndex + ENVIRONMENT_MARKER.length + 1).split("\0");
      const env: NodeJS.ProcessEnv = {};
      for (const entry of entries) {
        const separator = entry.indexOf("=");
        if (separator <= 0) {
          continue;
        }
        env[entry.slice(0, separator)] = entry.slice(separator + 1);
      }
      resolvePromise(env);
    });
  });
}

function appendBounded(current: string, chunk: string): string {
  const combined = current + chunk;
  return combined.length <= MAX_ENVIRONMENT_OUTPUT_CHARS
    ? combined
    : combined.slice(combined.length - MAX_ENVIRONMENT_OUTPUT_CHARS);
}
