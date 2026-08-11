import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { Logger } from "pino";

import type { AgentModelDefinition } from "../../agent-sdk-types.js";
import {
  getClaudeCustomModelThinkingOptions,
  getClaudeManifestModels,
  normalizeClaudeManifestModelId,
  normalizeClaudeRuntimeModelId as normalizeClaudeManifestRuntimeModelId,
} from "./model-manifest.js";

const CLAUDE_SETTINGS_MODEL_ENV_KEYS = [
  "ANTHROPIC_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
] as const;

const AIDEN_CUSTOM_MODEL_NAME_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const AIDEN_CUSTOM_MODEL_PREFIX = "[custom]";

interface AidenClaudeModelDiscoveryOptions {
  cwd: string;
  configDir?: string;
}

export function getClaudeModels(): AgentModelDefinition[] {
  return getClaudeManifestModels();
}

export function findClaudeModel(
  modelId: string | null | undefined,
): AgentModelDefinition | undefined {
  const normalizedModelId = normalizeClaudeRuntimeModelId(modelId);
  if (!normalizedModelId) {
    return undefined;
  }
  return getClaudeModels().find((model) => model.id === normalizedModelId);
}

export async function getClaudeModelsWithSettings(
  logger: Logger,
  configDir?: string,
  aiden?: AidenClaudeModelDiscoveryOptions,
): Promise<AgentModelDefinition[]> {
  const hardcodedModels = getClaudeModels();
  const [settingsModels, aidenModels] = await Promise.all([
    readClaudeSettingsModels(logger, configDir),
    aiden ? readAidenClaudeCustomModels(logger, aiden) : Promise.resolve([]),
  ]);
  const discoveredModels = [...settingsModels, ...aidenModels];
  if (discoveredModels.length === 0) {
    return hardcodedModels;
  }

  const models = [...hardcodedModels];

  for (const model of discoveredModels) {
    if (seenModelIds.has(model.id)) {
      continue;
    }
    models.push(model);
  }

  return models;
}

async function readAidenClaudeCustomModels(
  logger: Logger,
  options: AidenClaudeModelDiscoveryOptions,
): Promise<AgentModelDefinition[]> {
  const settingsPaths = [
    path.join(options.configDir ?? path.join(os.homedir(), ".aiden"), "settings.json"),
    path.join(options.cwd, ".aiden", "settings.json"),
    path.join(options.cwd, ".aiden", "settings.local.json"),
  ];
  const customModels = new Map<string, unknown>();

  for (const settingsPath of settingsPaths) {
    const parsed = await readJsonObject(logger, settingsPath, "Aiden");
    if (!parsed) {
      continue;
    }
    const configuredModels = parsed.xCustomModels ?? parsed.x_custom_models;
    if (!isRecord(configuredModels)) {
      continue;
    }
    for (const [name, config] of Object.entries(configuredModels)) {
      customModels.set(name, config);
    }
  }

  const models: AgentModelDefinition[] = [];
  for (const [name, config] of customModels) {
    if (
      !AIDEN_CUSTOM_MODEL_NAME_PATTERN.test(name) ||
      !isRecord(config) ||
      !isAidenCustomModelVisibleInClaude(config) ||
      !isValidAidenClaudeCodeConfig(config.claude_code ?? config.claudeCode)
    ) {
      continue;
    }

    const id = `${AIDEN_CUSTOM_MODEL_PREFIX}${name}`;
    models.push({
      provider: "claude",
      id,
      label: id,
      description:
        typeof config.description === "string" && config.description.trim().length > 0
          ? config.description.trim()
          : `Custom model ${name} from Aiden`,
    });
  }
  return models;
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

function isValidAidenClaudeCodeConfig(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.series === "string" &&
    value.series.trim().length > 0 &&
    (value.alias === "haiku" || value.alias === "sonnet" || value.alias === "opus")
  );
}

async function readClaudeSettingsModels(
  logger: Logger,
  configDir?: string,
): Promise<AgentModelDefinition[]> {
  const settingsPath = path.join(resolveClaudeConfigDir(configDir), "settings.json");
  const parsed = await readJsonObject(logger, settingsPath, "Claude");
  if (!parsed) {
    return [];
  }

  const models: AgentModelDefinition[] = [];
  addSettingsModel(models, parsed.model, "model");

  const env = parsed.env;
  if (env === undefined) {
    return models;
  }
  if (!isRecord(env)) {
    logger.debug({ settingsPath }, "Claude settings.json env is not an object");
    return models;
  }

  for (const envKey of CLAUDE_SETTINGS_MODEL_ENV_KEYS) {
    addSettingsModel(models, env[envKey], `env.${envKey}`);
  }

  return models;
}

async function readJsonObject(
  logger: Logger,
  settingsPath: string,
  source: "Aiden" | "Claude",
): Promise<Record<string, unknown> | null> {
  let parsed: unknown;
  try {
    const rawSettings = await fs.readFile(settingsPath, "utf8");
    parsed = JSON.parse(rawSettings);
  } catch (error) {
    logger.debug({ err: error, settingsPath }, `Failed to read ${source} settings models`);
    return null;
  }

  if (!isRecord(parsed)) {
    logger.debug({ settingsPath }, `${source} settings.json is not an object`);
    return null;
  }
  return parsed;
}

function resolveClaudeConfigDir(configDir?: string): string {
  return configDir ?? process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
}

function addSettingsModel(
  models: AgentModelDefinition[],
  value: unknown,
  settingsKey: string,
): void {
  if (typeof value !== "string") {
    return;
  }

  const id = value.trim();
  if (id.length === 0 || models.some((model) => model.id === id)) {
    return;
  }

  models.push({
    provider: "claude",
    id,
    label: id,
    description: `From Claude settings.json ${settingsKey}`,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalize a runtime model string (from SDK init message) to a known model ID.
 * Handles the `[1m]` suffix that the SDK appends for 1M context sessions.
 */
export function normalizeClaudeRuntimeModelId(value: string | null | undefined): string | null {
  return normalizeClaudeManifestRuntimeModelId(value);
}

/**
 * Placeholder model values Claude Code writes on frames with no real inference behind them.
 * These are not models and must never be displayed.
 */
const CLAUDE_PLACEHOLDER_MODEL_IDS = new Set(["<synthetic>"]);

/**
 * Resolve a model id observed on a Claude assistant frame, for display.
 *
 * Prefers the manifest-normalized id so equivalent spellings collapse (a dated alias and a
 * gateway prefix are the same model), but falls back to the raw string when the manifest does
 * not know it. The fallback matters: Claude Code is an Anthropic-compatible client, so subagents
 * routinely report models that are not Anthropic's — Z.AI GLM ids via `ANTHROPIC_BASE_URL`
 * (docs/custom-providers.md) among them. Manifest-only resolution would blank the model for
 * exactly those users.
 *
 * A `[1m]` suffix is preserved where it names its own manifest entry. Models such as Fable 5
 * that only have a 1M entry normalize the retired suffixed spelling to the canonical ID.
 *
 * Returns null for placeholders and empty values, meaning "not observed".
 */
export function resolveObservedClaudeModelId(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || CLAUDE_PLACEHOLDER_MODEL_IDS.has(trimmed)) {
    return null;
  }
  return normalizeClaudeManifestRuntimeModelId(trimmed) ?? trimmed;
}
