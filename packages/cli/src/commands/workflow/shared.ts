import { homedir } from "node:os";
import { resolve } from "node:path";
import type { CommandError, CommandOptions } from "../../output/index.js";
import { buildDaemonConnectionCommandError, connectToDaemon } from "../../utils/client.js";

export interface WorkflowCommandOptions extends CommandOptions {
  background?: boolean;
  node?: string;
}

export async function connectWorkflowClient(host?: string) {
  try {
    return await connectToDaemon({ host });
  } catch (error) {
    throw buildDaemonConnectionCommandError({ host, error });
  }
}

export function resolveWorkflowCliPath(value: string): string {
  const trimmed = value.trim();
  let expanded = trimmed;
  if (trimmed === "~") {
    expanded = homedir();
  } else if (trimmed.startsWith("~/")) {
    expanded = resolve(homedir(), trimmed.slice(2));
  }
  return resolve(expanded);
}

export function toWorkflowCommandError(code: string, action: string, error: unknown): CommandError {
  if (error && typeof error === "object" && "code" in error) {
    return error as CommandError;
  }
  return {
    code,
    message: `Failed to ${action}: ${error instanceof Error ? error.message : String(error)}`,
  };
}
