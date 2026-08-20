import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { Logger } from "pino";

import type { AgentModelDefinition } from "../../agent-sdk-types.js";

const AIDEN_MODEL_COMMAND_TIMEOUT_MS = 20_000;
const AIDEN_MODEL_COMMAND_MAX_BUFFER_BYTES = 2 * 1024 * 1024;
const AIDEN_CUSTOM_MODEL_NAME_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const AIDEN_CUSTOM_MODEL_PREFIX = "[custom]";

export interface AidenModelCommandResult {
  stdout: string;
  stderr: string;
}

export type AidenModelCommandRunner = (
  file: string,
  args: readonly string[],
  options: {
    cwd: string;
    timeoutMs: number;
    maxBufferBytes: number;
  },
) => Promise<AidenModelCommandResult>;

export interface AidenClaudeModelDiscoveryOptions {
  logger: Logger;
  cwd: string;
  configDir?: string;
  command?: string;
  force?: boolean;
  runCommand?: AidenModelCommandRunner;
}

interface AidenModelRecord {
  id: string;
  label?: string;
  description?: string;
  series?: string;
  alias?: string;
  contextWindowMaxTokens?: number;
  isDefault?: boolean;
}

export async function getAidenClaudeModels(
  options: AidenClaudeModelDiscoveryOptions,
): Promise<AgentModelDefinition[]> {
  const settings = await readAidenSettings(options.logger, options.cwd, options.configDir);
  const runCommand = options.runCommand ?? runAidenModelCommand;
  const command = options.command ?? process.env.AIDEN_BIN ?? "aiden";

  let discovered: AidenModelRecord[] = [];
  try {
    const { stdout } = await runCommand(
      command,
      [
        "x",
        "models",
        "--json",
        "--claude",
        ...(options.force ? ["--no-cache"] : []),
        "--timeout",
        "15000",
      ],
      {
        cwd: options.cwd,
        timeoutMs: AIDEN_MODEL_COMMAND_TIMEOUT_MS,
        maxBufferBytes: AIDEN_MODEL_COMMAND_MAX_BUFFER_BYTES,
      },
    );
    discovered = parseAidenClaudeModelResponse(stdout);
  } catch (error) {
    options.logger.debug(
      { err: error, command, cwd: options.cwd },
      "Failed to load Aiden Claude models from Aiden",
    );
  }

  if (discovered.length === 0) {
    discovered = settings.customModels;
  }

  const selectedModel = normalizeSelectedModel(settings.selectedModel, discovered);
  return discovered.map((model) => {
    const definition: AgentModelDefinition = {
      provider: "claude",
      id: model.id,
      label: model.label ?? model.id,
      description: model.description ?? describeAidenModel(model),
    };
    if (model.contextWindowMaxTokens !== undefined) {
      definition.contextWindowMaxTokens = model.contextWindowMaxTokens;
    }
    if (selectedModel ? model.id === selectedModel : model.isDefault) {
      definition.isDefault = true;
    }
    return definition;
  });
}

export const runAidenModelCommand: AidenModelCommandRunner = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        maxBuffer: options.maxBufferBytes,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });

function parseAidenClaudeModelResponse(stdout: string): AidenModelRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.models)) {
    return [];
  }

  const models = new Map<string, AidenModelRecord>();
  for (const rawModel of parsed.models) {
    const model = parseAidenClaudeModel(rawModel);
    if (!model) {
      continue;
    }
    models.set(model.id, model);
  }
  return [...models.values()];
}

function parseAidenClaudeModel(rawModel: unknown): AidenModelRecord | null {
  if (!isRecord(rawModel)) {
    return null;
  }
  const id = readTrimmedString(rawModel.id);
  if (!id || id.length > 256) {
    return null;
  }
  const cliType = readTrimmedString(rawModel.cli_type ?? rawModel.cliType);
  if (cliType && !isAidenClaudeCliType(cliType)) {
    return null;
  }
  return {
    id,
    label:
      readTrimmedString(rawModel.display_name ?? rawModel.displayName ?? rawModel.label) ??
      undefined,
    description: readTrimmedString(rawModel.description) ?? undefined,
    series: readTrimmedString(rawModel.series) ?? undefined,
    alias: readTrimmedString(rawModel.alias) ?? undefined,
    contextWindowMaxTokens: readPositiveInteger(rawModel.context_length ?? rawModel.contextLength),
    isDefault: rawModel.default === true || rawModel.is_default === true,
  };
}

function isAidenClaudeCliType(cliType: string): boolean {
  return cliType === "claude" || cliType === "claude_code" || cliType === "claudecode";
}

async function readAidenSettings(
  logger: Logger,
  cwd: string,
  configDir?: string,
): Promise<{
  selectedModel: string | null;
  customModels: AidenModelRecord[];
}> {
  const settingsPaths = [
    path.join(configDir ?? path.join(os.homedir(), ".aiden"), "settings.json"),
    path.join(cwd, ".aiden", "settings.json"),
    path.join(cwd, ".aiden", "settings.local.json"),
  ];
  const customModels = new Map<string, unknown>();
  let selectedLauncherModel: string | null = null;
  let configuredModel: string | null = null;

  for (const settingsPath of settingsPaths) {
    const parsed = await readJsonObject(logger, settingsPath);
    if (!parsed) {
      continue;
    }
    const configuredModels = parsed.xCustomModels ?? parsed.x_custom_models;
    if (isRecord(configuredModels)) {
      for (const [name, config] of Object.entries(configuredModels)) {
        customModels.set(name, config);
      }
    }

    selectedLauncherModel = readAidenClaudeLauncherSelection(parsed) ?? selectedLauncherModel;
    configuredModel = readTrimmedString(parsed.model) ?? configuredModel;
  }

  return {
    selectedModel: selectedLauncherModel ?? configuredModel,
    customModels: [...customModels.entries()].flatMap(([name, config]) => {
      const claudeCode = isRecord(config) ? (config.claude_code ?? config.claudeCode) : undefined;
      if (
        !AIDEN_CUSTOM_MODEL_NAME_PATTERN.test(name) ||
        !isRecord(config) ||
        !isAidenCustomModelVisibleInClaude(config) ||
        !isValidAidenClaudeCodeConfig(claudeCode)
      ) {
        return [];
      }
      const id = `${AIDEN_CUSTOM_MODEL_PREFIX}${name}`;
      return [
        {
          id,
          description: readTrimmedString(config.description) ?? `Custom model ${name} from Aiden`,
          series: readTrimmedString(claudeCode.series) ?? undefined,
          alias: readTrimmedString(claudeCode.alias) ?? undefined,
        },
      ];
    }),
  };
}

function readAidenClaudeLauncherSelection(settings: Record<string, unknown>): string | null {
  const selections = settings.xLauncherSelections ?? settings.x_launcher_selections;
  if (!isRecord(selections)) {
    return null;
  }
  for (const key of ["claude", "claude_code", "claudeCode"]) {
    const selection = selections[key];
    if (typeof selection === "string") {
      return readTrimmedString(selection);
    }
    if (isRecord(selection)) {
      const model = readTrimmedString(selection.model);
      if (model) {
        return model;
      }
    }
  }
  return null;
}

async function readJsonObject(
  logger: Logger,
  settingsPath: string,
): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    if (isRecord(parsed)) {
      return parsed;
    }
    logger.debug({ settingsPath }, "Aiden settings.json is not an object");
  } catch (error) {
    logger.debug({ err: error, settingsPath }, "Failed to read Aiden settings models");
  }
  return null;
}

function normalizeSelectedModel(
  selectedModel: string | null,
  models: readonly AidenModelRecord[],
): string | null {
  if (!selectedModel) {
    return null;
  }
  const candidates = new Set([
    selectedModel,
    selectedModel.startsWith(AIDEN_CUSTOM_MODEL_PREFIX)
      ? selectedModel.slice(AIDEN_CUSTOM_MODEL_PREFIX.length)
      : `${AIDEN_CUSTOM_MODEL_PREFIX}${selectedModel}`,
  ]);
  return models.find((model) => candidates.has(model.id))?.id ?? null;
}

function describeAidenModel(model: AidenModelRecord): string {
  const details = [model.series, model.alias].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return details.length > 0 ? `${details.join(" · ")} · From Aiden` : "From Aiden";
}

function isAidenCustomModelVisibleInClaude(config: Record<string, unknown>): boolean {
  const visible = config.visible;
  if (visible === undefined || visible === null) {
    return true;
  }
  if (typeof visible === "boolean") {
    return visible;
  }
  if (!isRecord(visible)) {
    return false;
  }
  return (visible.claude_code ?? visible.claudeCode) !== false;
}

function isValidAidenClaudeCodeConfig(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.series === "string" &&
    value.series.trim().length > 0 &&
    (value.alias === "haiku" || value.alias === "sonnet" || value.alias === "opus")
  );
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
