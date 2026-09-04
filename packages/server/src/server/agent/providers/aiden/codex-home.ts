import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RECOVERABLE_CODEX_HOME_ERROR_CODES = new Set([
  "EACCES",
  "EISDIR",
  "ELOOP",
  "ENOENT",
  "ENOSPC",
  "ENOTDIR",
  "EPERM",
  "EROFS",
]);

export interface AidenCodexHomeFallback {
  configuredHome: string;
  resolvedHome: string;
  errorCode?: string;
}

export interface PrepareAidenCodexHomeOptions {
  baseEnv?: NodeJS.ProcessEnv;
  homeDir?: string;
  onFallback?: (fallback: AidenCodexHomeFallback) => void;
}

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error) || typeof error.code !== "string") {
    return undefined;
  }
  return error.code;
}

function isRecoverableCodexHomeError(error: unknown): boolean {
  const code = errorCode(error);
  return code !== undefined && RECOVERABLE_CODEX_HOME_ERROR_CODES.has(code);
}

function expandHomeDirectory(input: string, homeDir: string): string {
  if (input === "~") return homeDir;
  if (input.startsWith("~/")) return path.join(homeDir, input.slice(2));
  return input;
}

function resolveDirectory(input: string, homeDir: string): string {
  return path.resolve(expandHomeDirectory(input, homeDir));
}

function addCandidate(candidates: string[], seen: Set<string>, candidate: string): void {
  const resolved = path.resolve(candidate);
  if (seen.has(resolved)) return;
  seen.add(resolved);
  candidates.push(resolved);
}

function codexHomeCandidates(baseEnv: NodeJS.ProcessEnv | undefined, homeDir: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const configuredHome = baseEnv?.CODEX_HOME?.trim();
  if (configuredHome) {
    addCandidate(candidates, seen, resolveDirectory(configuredHome, homeDir));
  }

  addCandidate(candidates, seen, path.join(homeDir, ".codex", "aiden-app-home"));

  const paseoHome = resolveDirectory(baseEnv?.PASEO_HOME?.trim() || "~/.paseo", homeDir);
  addCandidate(candidates, seen, path.join(paseoHome, "provider-homes", "aiden-codex"));
  return candidates;
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
  } else {
    fs.accessSync(configPath, fs.constants.R_OK | fs.constants.W_OK);
  }
}

export function resolveAidenCodexHome(
  baseEnv: NodeJS.ProcessEnv | undefined,
  homeDir = os.homedir(),
): string {
  return codexHomeCandidates(baseEnv, homeDir)[0]!;
}

export function prepareAidenCodexHome(options: PrepareAidenCodexHomeOptions = {}): string {
  const homeDir = options.homeDir ?? os.homedir();
  const candidates = codexHomeCandidates(options.baseEnv, homeDir);
  const configuredHome = candidates[0]!;
  const failures: unknown[] = [];

  for (const candidate of candidates) {
    try {
      ensureAidenCodexHomeConfig(candidate);
      if (candidate !== configuredHome) {
        const firstFailure = failures[0];
        options.onFallback?.({
          configuredHome,
          resolvedHome: candidate,
          ...(errorCode(firstFailure) ? { errorCode: errorCode(firstFailure) } : {}),
        });
      }
      return candidate;
    } catch (error) {
      if (!isRecoverableCodexHomeError(error)) throw error;
      failures.push(error);
    }
  }

  throw new AggregateError(
    failures,
    `No writable Aiden Codex home is available (tried: ${candidates.join(", ")})`,
  );
}
