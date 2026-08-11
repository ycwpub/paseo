import { basename } from "node:path";

export interface ScheduledWorkflowCommand {
  scriptPath: string;
  inputPayload: string;
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
  const backgroundIndex = args.indexOf("--background");
  const background = backgroundIndex !== -1;
  if (background) {
    args.splice(backgroundIndex, 1);
  }
  if (args.length !== 2 || args.some((value) => value.startsWith("--"))) {
    return null;
  }
  return {
    scriptPath: args[0] ?? "",
    inputPayload: args[1] ?? "",
    background,
  };
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
