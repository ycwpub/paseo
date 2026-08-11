import { homedir } from "node:os";
import { resolve } from "node:path";
import type { WorkflowTargetInputMode } from "@getpaseo/protocol/workflow/types";
import type { CommandError, CommandOptions } from "../../output/index.js";
import { buildDaemonConnectionCommandError, connectToDaemon } from "../../utils/client.js";

export interface WorkflowCommandOptions extends CommandOptions {
  background?: boolean;
  inputType?: string;
  node?: string;
  preset?: string;
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

export function resolveWorkflowTargetInputMode(
  value: string | undefined,
  targetNodeId: string | undefined,
): WorkflowTargetInputMode | undefined {
  if (!value) {
    return undefined;
  }
  if (!targetNodeId) {
    throw new Error("--input-type requires --node");
  }
  if (value === "upstream-output") {
    return "upstream_output";
  }
  if (value === "node-input") {
    return "node_input";
  }
  throw new Error("--input-type must be upstream-output or node-input");
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
