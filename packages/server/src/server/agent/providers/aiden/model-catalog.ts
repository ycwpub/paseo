import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { Logger } from "pino";

const AIDEN_CUSTOM_MODEL_NAME_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
export const AIDEN_CUSTOM_MODEL_PREFIX = "[custom]";

export type AidenModelTarget = "codex" | "claude";

export interface AidenModelReasoningEffort {
  reasoningEffort: string;
  description?: string;
}

export interface AidenModelRecord {
  id: string;
  label?: string;
  description?: string;
  series?: string;
  alias?: string;
  contextWindowMaxTokens?: number;
  isDefault?: boolean;
  defaultReasoningEffort?: string;
  supportedReasoningEfforts?: AidenModelReasoningEffort[];
}

export interface AidenLocalModelCatalog {
  selectedModel: string | null;
  models: AidenModelRecord[];
}

export interface ReadAidenLocalModelCatalogOptions {
  logger: Logger;
  cwd: string;
  target: AidenModelTarget;
  configDir?: string;
}

export async function readAidenLocalModelCatalog(
  options: ReadAidenLocalModelCatalogOptions,
): Promise<AidenLocalModelCatalog> {
  const settings = await readAidenSettings(options);
  const cachedModels = await readAidenCachedModels(options);
  return {
    selectedModel: settings.selectedModel,
    models: mergeAidenModelRecords(cachedModels, settings.customModels),
  };
}

export function mergeAidenModelRecords(
  ...groups: readonly (readonly AidenModelRecord[])[]
): AidenModelRecord[] {
  const merged = new Map<string, AidenModelRecord>();
  for (const group of groups) {
    for (const model of group) {
      const existing = merged.get(model.id);
      // Earlier sources have higher priority, while later sources may fill
      // metadata omitted by a live response.
      const combined = existing
        ? { ...compactModelRecord(model), ...compactModelRecord(existing) }
        : compactModelRecord(model);
      merged.set(model.id, combined);
    }
  }
  return [...merged.values()];
}

function compactModelRecord(model: AidenModelRecord): AidenModelRecord {
  return Object.fromEntries(
    Object.entries(model).filter(([, value]) => value !== undefined),
  ) as unknown as AidenModelRecord;
}

export function normalizeAidenSelectedModel(
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

export async function readAidenCachedModels(
  options: ReadAidenLocalModelCatalogOptions,
): Promise<AidenModelRecord[]> {
  const cacheDir = path.join(resolveAidenConfigDir(options.configDir), "x", "models-cache");
  let filenames: string[];
  try {
    filenames = (await fs.readdir(cacheDir))
      .filter((filename) => filename.endsWith(".json"))
      .sort(
        (left, right) =>
          cacheFilePriority(options.target, left) - cacheFilePriority(options.target, right),
      );
  } catch (error) {
    options.logger.debug({ err: error, cacheDir }, "Failed to list Aiden model cache");
    return [];
  }

  const exact: AidenModelRecord[][] = [];
  const compatibleFallback: AidenModelRecord[][] = [];
  for (const filename of filenames) {
    const cachePath = path.join(cacheDir, filename);
    const parsed = await readJsonObject(options.logger, cachePath, "Aiden model cache");
    if (!parsed || !Array.isArray(parsed.sections)) {
      continue;
    }
    for (const rawSection of parsed.sections) {
      if (!isRecord(rawSection) || !Array.isArray(rawSection.entries)) {
        continue;
      }
      const cliType = readTrimmedString(rawSection.cliType ?? rawSection.cli_type);
      if (!cliType) {
        continue;
      }
      if (isTargetCliType(options.target, cliType)) {
        exact.push(parseCacheEntries(rawSection.entries, options.target, false));
        continue;
      }
      // Aiden may only have a stale Claude cache on disk. Built-in entries in
      // that cache still carry Codex model metadata and are safe to use as a
      // last-resort Codex catalog. Custom models are read from settings instead,
      // where target visibility can be checked explicitly.
      if (options.target === "codex" && isTargetCliType("claude", cliType)) {
        compatibleFallback.push(parseCacheEntries(rawSection.entries, "codex", true));
      }
    }
  }
  return mergeAidenModelRecords(...exact, ...compatibleFallback);
}

function cacheFilePriority(target: AidenModelTarget, filename: string): number {
  const normalized = filename.toLowerCase();
  if (target === "codex" && normalized === "codex.json") return 0;
  if (target === "claude" && normalized === "claudecode.json") return 0;
  if (normalized.includes(target === "codex" ? "codex" : "claude")) return 1;
  return 2;
}

function parseCacheEntries(
  entries: unknown[],
  target: AidenModelTarget,
  inferredCrossTarget: boolean,
): AidenModelRecord[] {
  return entries.flatMap((entry) => {
    const model = parseCacheEntry(entry, target, inferredCrossTarget);
    return model ? [model] : [];
  });
}

// Cache entries intentionally accept multiple Aiden schema generations and aliases.
// eslint-disable-next-line complexity
function parseCacheEntry(
  rawEntry: unknown,
  target: AidenModelTarget,
  inferredCrossTarget: boolean,
): AidenModelRecord | null {
  if (!isRecord(rawEntry)) {
    return null;
  }
  const id = readTrimmedString(rawEntry.modelName ?? rawEntry.model_name ?? rawEntry.id);
  if (!id || id.length > 256) {
    return null;
  }
  const config = isRecord(rawEntry.config) ? rawEntry.config : null;
  if (!isVisible(config?.visible ?? rawEntry.visible, target)) {
    return null;
  }
  const modelMetadata = isRecord(rawEntry.modelMetadata ?? rawEntry.model_metadata)
    ? ((rawEntry.modelMetadata ?? rawEntry.model_metadata) as Record<string, unknown>)
    : null;
  if (inferredCrossTarget && (!modelMetadata || id.startsWith(AIDEN_CUSTOM_MODEL_PREFIX))) {
    return null;
  }
  const claudeCode = isRecord(rawEntry.claudeCode ?? rawEntry.claude_code)
    ? ((rawEntry.claudeCode ?? rawEntry.claude_code) as Record<string, unknown>)
    : null;
  const supportedReasoningEfforts = parseReasoningEfforts(
    modelMetadata?.supported_reasoning_levels ?? modelMetadata?.supportedReasoningLevels,
  );

  return {
    id,
    label:
      readTrimmedString(
        rawEntry.displayName ??
          rawEntry.display_name ??
          modelMetadata?.display_name ??
          modelMetadata?.displayName,
      ) ?? undefined,
    description:
      readTrimmedString(
        config?.description ?? modelMetadata?.description ?? rawEntry.description,
      ) ?? undefined,
    series:
      readTrimmedString(rawEntry.series ?? claudeCode?.series ?? config?.description) ?? undefined,
    alias: readTrimmedString(claudeCode?.alias) ?? undefined,
    contextWindowMaxTokens: readPositiveInteger(
      config?.context_length ??
        config?.contextLength ??
        modelMetadata?.max_context_window ??
        modelMetadata?.maxContextWindow ??
        modelMetadata?.context_window ??
        modelMetadata?.contextWindow,
    ),
    defaultReasoningEffort:
      readTrimmedString(
        modelMetadata?.default_reasoning_level ?? modelMetadata?.defaultReasoningLevel,
      ) ?? undefined,
    supportedReasoningEfforts:
      supportedReasoningEfforts.length > 0 ? supportedReasoningEfforts : undefined,
  };
}

function parseReasoningEfforts(value: unknown): AidenModelReasoningEffort[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const results = new Map<string, AidenModelReasoningEffort>();
  for (const rawEffort of value) {
    if (!isRecord(rawEffort)) {
      continue;
    }
    const reasoningEffort = readTrimmedString(
      rawEffort.effort ?? rawEffort.reasoningEffort ?? rawEffort.reasoning_effort,
    );
    if (!reasoningEffort) {
      continue;
    }
    results.set(reasoningEffort, {
      reasoningEffort,
      description: readTrimmedString(rawEffort.description) ?? undefined,
    });
  }
  return [...results.values()];
}

async function readAidenSettings(options: ReadAidenLocalModelCatalogOptions): Promise<{
  selectedModel: string | null;
  customModels: AidenModelRecord[];
}> {
  const settingsPaths = [
    path.join(resolveAidenConfigDir(options.configDir), "settings.json"),
    path.join(options.cwd, ".aiden", "settings.json"),
    path.join(options.cwd, ".aiden", "settings.local.json"),
  ];
  const customModels = new Map<string, unknown>();
  let selectedLauncherModel: string | null = null;
  let configuredModel: string | null = null;

  for (const settingsPath of new Set(settingsPaths)) {
    const parsed = await readJsonObject(options.logger, settingsPath, "Aiden settings models");
    if (!parsed) {
      continue;
    }
    const configuredModels = parsed.xCustomModels ?? parsed.x_custom_models;
    if (isRecord(configuredModels)) {
      for (const [name, config] of Object.entries(configuredModels)) {
        customModels.set(name, config);
      }
    }
    selectedLauncherModel =
      readAidenLauncherSelection(parsed, options.target) ?? selectedLauncherModel;
    configuredModel = readTrimmedString(parsed.model) ?? configuredModel;
  }

  return {
    selectedModel: selectedLauncherModel ?? configuredModel,
    customModels: [...customModels.entries()].flatMap(([name, rawConfig]) => {
      const model = parseCustomModel(name, rawConfig, options.target);
      return model ? [model] : [];
    }),
  };
}

function parseCustomModel(
  name: string,
  rawConfig: unknown,
  target: AidenModelTarget,
): AidenModelRecord | null {
  if (!AIDEN_CUSTOM_MODEL_NAME_PATTERN.test(name) || !isRecord(rawConfig)) {
    return null;
  }
  if (!isVisible(rawConfig.visible, target)) {
    return null;
  }
  const claudeCode = isRecord(rawConfig.claude_code ?? rawConfig.claudeCode)
    ? ((rawConfig.claude_code ?? rawConfig.claudeCode) as Record<string, unknown>)
    : null;
  if (
    target === "claude" &&
    (!claudeCode ||
      !readTrimmedString(claudeCode.series) ||
      !["haiku", "sonnet", "opus"].includes(readTrimmedString(claudeCode.alias) ?? ""))
  ) {
    return null;
  }
  return {
    id: `${AIDEN_CUSTOM_MODEL_PREFIX}${name}`,
    description: readTrimmedString(rawConfig.description) ?? `Custom model ${name} from Aiden`,
    series: readTrimmedString(claudeCode?.series) ?? undefined,
    alias: readTrimmedString(claudeCode?.alias) ?? undefined,
    contextWindowMaxTokens: readPositiveInteger(
      rawConfig.context_length ?? rawConfig.contextLength,
    ),
  };
}

function readAidenLauncherSelection(
  settings: Record<string, unknown>,
  target: AidenModelTarget,
): string | null {
  const selections = settings.xLauncherSelections ?? settings.x_launcher_selections;
  if (!isRecord(selections)) {
    return null;
  }
  const keys = target === "codex" ? ["codex"] : ["claude", "claude_code", "claudeCode"];
  for (const key of keys) {
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

function isVisible(value: unknown, target: AidenModelTarget): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (!isRecord(value)) {
    return false;
  }
  if (target === "codex") {
    return value.codex !== false;
  }
  return (value.claude_code ?? value.claudeCode ?? value.claude) !== false;
}

function isTargetCliType(target: AidenModelTarget, cliType: string): boolean {
  if (target === "codex") {
    return cliType === "codex";
  }
  return cliType === "claude" || cliType === "claude_code" || cliType === "claudecode";
}

function resolveAidenConfigDir(configDir?: string): string {
  return configDir ?? path.join(os.homedir(), ".aiden");
}

async function readJsonObject(
  logger: Logger,
  filePath: string,
  source: string,
): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (isRecord(parsed)) {
      return parsed;
    }
    logger.debug({ filePath }, `${source} is not an object`);
  } catch (error) {
    logger.debug({ err: error, filePath }, `Failed to read ${source}`);
  }
  return null;
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
