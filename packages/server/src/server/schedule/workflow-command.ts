import { basename } from "node:path";
import type { WorkflowTargetInputMode } from "@getpaseo/protocol/workflow/types";

export interface ScheduledWorkflowCommand {
  scriptPath: string;
  inputPayload: string;
  targetNodeId?: string;
  targetInputMode?: WorkflowTargetInputMode;
  background: boolean;
}

export function parseScheduledWorkflowCommand(command: string): ScheduledWorkflowCommand | null {
  const tokens = tokenizeShellCommand(command);
  if (
    !tokens ||
    tokens.length < 5 ||
    !isPaseoExecutable(tokens[0] ?? "") ||
    tokens[1] !== "workflow" ||
    tokens[2] !== "run"
  ) {
    return null;
  }
  const args = tokens.slice(3);
  const options = parseScheduledWorkflowOptions(args);
  if (!options) {
    return null;
  }
  if (args.length !== 2 || args.some((value) => value.startsWith("--"))) {
    return null;
  }
  return {
    scriptPath: args[0] ?? "",
    inputPayload: args[1] ?? "",
    ...(options.targetNodeId ? { targetNodeId: options.targetNodeId } : {}),
    ...(options.targetInputMode ? { targetInputMode: options.targetInputMode } : {}),
    background: options.background,
  };
}

function parseScheduledWorkflowOptions(
  args: string[],
): Pick<ScheduledWorkflowCommand, "background" | "targetNodeId" | "targetInputMode"> | null {
  const background = consumeFlag(args, "--background");
  const targetNodeId = consumeOption(args, "--node");
  if (targetNodeId === null) {
    return null;
  }
  const inputType = consumeOption(args, "--input-type");
  if (inputType === null) {
    return null;
  }
  if (inputType !== undefined && !targetNodeId) {
    return null;
  }
  const targetInputMode = parseTargetInputMode(inputType);
  if (inputType !== undefined && !targetInputMode) {
    return null;
  }
  return {
    background,
    ...(targetNodeId ? { targetNodeId } : {}),
    ...(targetInputMode ? { targetInputMode } : {}),
  };
}

function consumeFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

function consumeOption(args: string[], name: string): string | null | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1]?.trim();
  if (!value || value.startsWith("--")) {
    return null;
  }
  args.splice(index, 2);
  return value;
}

function parseTargetInputMode(value: string | undefined): WorkflowTargetInputMode | undefined {
  if (value === "upstream-output") {
    return "upstream_output";
  }
  if (value === "node-input") {
    return "node_input";
  }
  return undefined;
}

function isPaseoExecutable(value: string): boolean {
  const name = basename(value).toLowerCase();
  return name === "paseo" || name === "paseo.cmd";
}

function tokenizeShellCommand(command: string): string[] | null {
  const tokens: string[] = [];
  let token = "";
  let hasToken = false;
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] ?? "";
    if (quote === "'") {
      if (character === "'") {
        quote = null;
      } else {
        token += character;
      }
      hasToken = true;
      continue;
    }
    if (quote === '"') {
      if (character === '"') {
        quote = null;
      } else if (character === "\\") {
        index += 1;
        if (index >= command.length) {
          return null;
        }
        token += command[index] ?? "";
      } else {
        token += character;
      }
      hasToken = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      hasToken = true;
      continue;
    }
    if (character === "\\") {
      index += 1;
      if (index >= command.length) {
        return null;
      }
      token += command[index] ?? "";
      hasToken = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (hasToken) {
        tokens.push(token);
        token = "";
        hasToken = false;
      }
      continue;
    }
    if (";&|<>`$".includes(character)) {
      return null;
    }
    token += character;
    hasToken = true;
  }
  if (quote) {
    return null;
  }
  if (hasToken) {
    tokens.push(token);
  }
  return tokens;
}
