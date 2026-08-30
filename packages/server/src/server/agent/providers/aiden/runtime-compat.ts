import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const AIDEN_MODEL_FALLBACK_PRELOAD_VERSION = 2;
const AIDEN_MODEL_FALLBACK_PRELOAD_FILE = `paseo-aiden-model-fallback-v${AIDEN_MODEL_FALLBACK_PRELOAD_VERSION}.cjs`;

export type AidenRuntimeTarget = "codex" | "claude";

export interface AidenRuntimeEnvOptions {
  providerId: string | undefined;
  target: AidenRuntimeTarget;
  baseEnv?: NodeJS.ProcessEnv;
  configDir?: string;
}

export interface AidenClaudeSpawnArgs {
  launcherArgs: string[];
  passthroughArgs: string[];
}

const AIDEN_MODEL_FALLBACK_PRELOAD_SOURCE = String.raw`'use strict';
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { syncBuiltinESMExports } = require('node:module');

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readSettingsFiles() {
  const directories = [];
  const configuredDirectory = process.env.PASEO_AIDEN_CONFIG_DIR;
  if (configuredDirectory) directories.push(configuredDirectory);
  directories.push(path.join(os.homedir(), '.aiden'));
  directories.push(path.join(process.cwd(), '.aiden'));

  const seen = new Set();
  const settings = [];
  for (const directory of directories) {
    const resolvedDirectory = path.resolve(directory);
    if (seen.has(resolvedDirectory)) continue;
    seen.add(resolvedDirectory);
    for (const filename of ['settings.json', 'settings.local.json']) {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(resolvedDirectory, filename), 'utf8'));
        if (isRecord(parsed)) settings.push(parsed);
      } catch {
        // Missing or invalid local settings must not affect normal Aiden startup.
      }
    }
  }
  return settings;
}

function isVisibleForTarget(config, target) {
  if (!isRecord(config)) return false;
  const visible = config.visible;
  if (visible === false) return false;
  if (isRecord(visible)) {
    if (target === 'codex' && visible.codex === false) return false;
    if (
      target === 'claudecode' &&
      (visible.claude_code ?? visible.claudeCode) === false
    ) {
      return false;
    }
  }
  if (target === 'codex') return true;
  const claudeCode = config.claude_code ?? config.claudeCode;
  if (!isRecord(claudeCode)) return false;
  return (
    typeof claudeCode.series === 'string' &&
    claudeCode.series.trim().length > 0 &&
    ['haiku', 'sonnet', 'opus'].includes(claudeCode.alias)
  );
}

function hasCompatibleLocalCustomModel() {
  const target = process.env.PASEO_AIDEN_RUNTIME_TARGET;
  if (target !== 'codex' && target !== 'claudecode') return false;
  for (const settings of readSettingsFiles()) {
    const customModels = settings.xCustomModels ?? settings.x_custom_models;
    if (!isRecord(customModels)) continue;
    for (const config of Object.values(customModels)) {
      if (isVisibleForTarget(config, target)) return true;
    }
  }
  return false;
}

function hasAidenCommandAuth() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  try {
    const source = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
    return /^[\t ]*\[[\t ]*model_providers\.aiden_aiproxy\.auth[\t ]*\][\t ]*(?:#.*)?$/mu.test(
      source,
    );
  } catch {
    return false;
  }
}

function isAidenEnvKeyOverride(value) {
  return (
    typeof value === 'string' &&
    /^[\t ]*model_providers\.aiden_aiproxy\.env_key[\t ]*=/u.test(value)
  );
}

function isAidenEnvKeyArgument(arg) {
  if (isAidenEnvKeyOverride(arg)) return true;
  if (typeof arg !== 'string' || (!arg.startsWith('-c=') && !arg.startsWith('--config='))) {
    return false;
  }
  return isAidenEnvKeyOverride(arg.slice(arg.indexOf('=') + 1));
}

function stripAidenEnvKeyOverrides(args) {
  const nextArgs = [];
  let changed = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if ((arg === '-c' || arg === '--config') && isAidenEnvKeyOverride(args[index + 1])) {
      index += 1;
      changed = true;
      continue;
    }
    if (isAidenEnvKeyArgument(arg)) {
      changed = true;
      continue;
    }
    nextArgs.push(arg);
  }
  return changed ? nextArgs : args;
}

function requestUrl(input) {
  try {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input && typeof input.url === 'string' ? input.url : '';
  } catch {
    return '';
  }
}

function isAidenModelsRequest(input) {
  const rawUrl = requestUrl(input);
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    const isAidenHost =
      url.hostname === 'aiden-aiproxy.bytedance.net' ||
      url.hostname.endsWith('.aiden-aiproxy.bytedance.net');
    return isAidenHost && /\/models\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

function fallbackResponse(sourceResponse) {
  const payload = {
    object: 'list',
    data: [
      {
        id: 'paseo-local-model-fallback',
        display_name: 'Paseo local model fallback',
        visible: false,
      },
    ],
  };
  return new Response(JSON.stringify(payload), {
    status: sourceResponse && sourceResponse.ok ? sourceResponse.status : 200,
    headers: { 'content-type': 'application/json' },
  });
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch === 'function') {
  globalThis.fetch = async function paseoAidenFetchFallback(input, init) {
    if (!isAidenModelsRequest(input) || !hasCompatibleLocalCustomModel()) {
      return originalFetch(input, init);
    }
    let response;
    try {
      response = await originalFetch(input, init);
    } catch {
      return fallbackResponse();
    }
    try {
      const payload = await response.clone().json();
      if (
        response.ok &&
        isRecord(payload) &&
        payload.object === 'list' &&
        Array.isArray(payload.data) &&
        payload.data.length === 0
      ) {
        return fallbackResponse(response);
      }
    } catch {
      // Preserve non-JSON and non-empty responses exactly as Aiden returned them.
    }
    return response;
  };
}

const originalSpawn = childProcess.spawn;
childProcess.spawn = function paseoAidenCodexAuthCompat(command, args, options) {
  if (Array.isArray(args) && /(^|[\\/])codex(?:\.exe)?$/i.test(String(command))) {
    const nextArgs = hasAidenCommandAuth() ? stripAidenEnvKeyOverrides(args) : args;
    const hasAidenEnvKey = nextArgs.some((arg) => isAidenEnvKeyArgument(arg));
    const hasAuthOverride = nextArgs.some(
      (arg) =>
        typeof arg === 'string' &&
        arg.includes('model_providers.aiden_aiproxy.requires_openai_auth='),
    );
    if (hasAidenEnvKey && !hasAuthOverride) {
      const compatibleArgs = [...nextArgs];
      let insertAt = compatibleArgs.findIndex(
        (arg) =>
          typeof arg === 'string' &&
          ['app-server', 'exec', 'resume', 'review'].includes(arg),
      );
      if (insertAt < 0) insertAt = compatibleArgs.length;
      compatibleArgs.splice(
        insertAt,
        0,
        '-c',
        'model_providers.aiden_aiproxy.requires_openai_auth=false',
      );
      return originalSpawn.call(this, command, compatibleArgs, options);
    }
    if (nextArgs !== args) {
      return originalSpawn.call(this, command, nextArgs, options);
    }
  }
  return originalSpawn.call(this, command, args, options);
};
syncBuiltinESMExports();
`;

export function isAidenRuntimeProvider(
  providerId: string | undefined,
  target: AidenRuntimeTarget,
): boolean {
  return providerId === `aiden-${target}`;
}

export function materializeAidenModelFallbackPreload(tempDir = os.tmpdir()): string {
  const preloadPath = path.join(tempDir, AIDEN_MODEL_FALLBACK_PRELOAD_FILE);
  let current: string | null = null;
  try {
    current = fs.readFileSync(preloadPath, "utf8");
  } catch {
    // The versioned preload has not been materialized yet.
  }
  if (current !== AIDEN_MODEL_FALLBACK_PRELOAD_SOURCE) {
    fs.writeFileSync(preloadPath, AIDEN_MODEL_FALLBACK_PRELOAD_SOURCE, {
      encoding: "utf8",
      mode: 0o600,
    });
  } else {
    fs.chmodSync(preloadPath, 0o600);
  }
  return preloadPath;
}

function quoteNodeOptionsPath(filePath: string): string {
  return `"${filePath.replace(/"/gu, '\\"')}"`;
}

export function mergeNodeRequireOption(
  existingNodeOptions: string | undefined,
  preloadPath: string,
): string {
  const requireOption = `--require=${quoteNodeOptionsPath(preloadPath)}`;
  const existing = existingNodeOptions?.trim();
  if (!existing) {
    return requireOption;
  }
  if (existing.includes(preloadPath)) {
    return existing;
  }
  return `${existing} ${requireOption}`;
}

export function patchAidenCodexConfigToml(source: string): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const commandAuthPattern =
    /^[\t ]*\[[\t ]*model_providers\.aiden_aiproxy\.auth[\t ]*\][\t ]*(?:#.*)?$/mu;
  const hasCommandAuth = commandAuthPattern.test(source);
  let patchedSource = source;
  if (hasCommandAuth) {
    const firstSectionIndex = /^[\t ]*\[/mu.exec(source)?.index ?? source.length;
    const preamble = source
      .slice(0, firstSectionIndex)
      .replace(/^[\t ]*model_providers\.aiden_aiproxy\.env_key[\t ]*=.*(?:\r?\n|$)/gmu, "");
    patchedSource = `${preamble}${source.slice(firstSectionIndex)}`;
  }
  const sectionPattern = /^\[model_providers\.aiden_aiproxy\][^\S\r\n]*(?:\r?\n|$)/mu;
  const sectionMatch = sectionPattern.exec(patchedSource);
  if (!sectionMatch) {
    const providerSection = `[model_providers.aiden_aiproxy]${newline}requires_openai_auth = false${newline}`;
    const commandAuthMatch = commandAuthPattern.exec(patchedSource);
    if (commandAuthMatch) {
      return `${patchedSource.slice(0, commandAuthMatch.index)}${providerSection}${newline}${patchedSource.slice(commandAuthMatch.index)}`;
    }
    const separator = patchedSource.length === 0 || patchedSource.endsWith(newline) ? "" : newline;
    return `${patchedSource}${separator}${patchedSource.length > 0 ? newline : ""}${providerSection}`;
  }

  const sectionStart = sectionMatch.index;
  const bodyStart = sectionStart + sectionMatch[0].length;
  const nextSectionMatch = /^\[/mu.exec(patchedSource.slice(bodyStart));
  const sectionEnd =
    nextSectionMatch === null ? patchedSource.length : bodyStart + nextSectionMatch.index;
  let sectionBody = patchedSource.slice(bodyStart, sectionEnd);
  if (hasCommandAuth) {
    sectionBody = sectionBody.replace(/^[\t ]*env_key[\t ]*=.*(?:\r?\n|$)/gmu, "");
  }
  const authPattern = /^requires_openai_auth[^\S\r\n]*=.*$/mu;
  if (authPattern.test(sectionBody)) {
    const patchedBody = sectionBody.replace(authPattern, "requires_openai_auth = false");
    return `${patchedSource.slice(0, bodyStart)}${patchedBody}${patchedSource.slice(sectionEnd)}`;
  }

  return `${patchedSource.slice(0, bodyStart)}requires_openai_auth = false${newline}${sectionBody}${patchedSource.slice(sectionEnd)}`;
}

export function ensureAidenCodexHomeConfig(codexHome: string): void {
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  const configPath = path.join(codexHome, "config.toml");
  let source = "";
  try {
    source = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  const patched = patchAidenCodexConfigToml(source);
  if (patched !== source) {
    fs.writeFileSync(configPath, patched, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}

export function resolveAidenCodexHome(
  baseEnv: NodeJS.ProcessEnv | undefined,
  homeDir = os.homedir(),
): string {
  const configuredHome = baseEnv?.CODEX_HOME?.trim();
  return configuredHome || path.join(homeDir, ".codex", "aiden-app-home");
}

export function createAidenRuntimeEnvOverlay(
  options: AidenRuntimeEnvOptions,
): Record<string, string> {
  if (!isAidenRuntimeProvider(options.providerId, options.target)) {
    return {};
  }
  const preloadPath = materializeAidenModelFallbackPreload();
  const codexHome = options.target === "codex" ? resolveAidenCodexHome(options.baseEnv) : undefined;
  if (codexHome) {
    ensureAidenCodexHomeConfig(codexHome);
  }
  return {
    NODE_OPTIONS: mergeNodeRequireOption(options.baseEnv?.NODE_OPTIONS, preloadPath),
    PASEO_AIDEN_RUNTIME_TARGET: options.target === "claude" ? "claudecode" : "codex",
    ...(codexHome ? { CODEX_HOME: codexHome } : {}),
    ...(options.configDir ? { PASEO_AIDEN_CONFIG_DIR: options.configDir } : {}),
  };
}

function readOptionValue(
  args: readonly string[],
  index: number,
): {
  value: string | undefined;
  nextIndex: number;
} {
  return {
    value: args[index + 1],
    nextIndex: index + 1,
  };
}

export function adaptAidenClaudeSpawnArgs(args: readonly string[]): AidenClaudeSpawnArgs {
  let model: string | undefined;
  const passthroughArgs: string[] = [];
  const mcpArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--model") {
      const option = readOptionValue(args, index);
      model = option.value;
      index = option.nextIndex;
      continue;
    }
    if (arg.startsWith("--model=")) {
      model = arg.slice("--model=".length);
      continue;
    }
    if (arg === "--settings" || arg === "--setting-sources" || arg === "--fallback-model") {
      index = readOptionValue(args, index).nextIndex;
      continue;
    }
    if (
      arg.startsWith("--settings=") ||
      arg.startsWith("--setting-sources=") ||
      arg.startsWith("--fallback-model=")
    ) {
      continue;
    }
    if (arg === "--mcp-config") {
      const option = readOptionValue(args, index);
      mcpArgs.push(arg);
      if (option.value !== undefined) {
        mcpArgs.push(option.value);
      }
      index = option.nextIndex;
      continue;
    }
    if (arg.startsWith("--mcp-config=") || arg === "--strict-mcp-config") {
      mcpArgs.push(arg);
      continue;
    }
    passthroughArgs.push(arg);
  }

  if (!model?.startsWith("[custom]")) {
    passthroughArgs.push(...mcpArgs);
  }
  return {
    launcherArgs: model ? ["--model", model] : [],
    passthroughArgs,
  };
}

function stripModelOption(args: readonly string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--model") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--model=")) {
      continue;
    }
    result.push(arg);
  }
  return result;
}

export function applyAidenLauncherModel(
  launcherArgs: readonly string[],
  model: string | null | undefined,
): string[] {
  const normalizedModel = model?.trim();
  if (!normalizedModel) {
    return [...launcherArgs];
  }
  return [...stripModelOption(launcherArgs), "--model", normalizedModel];
}
