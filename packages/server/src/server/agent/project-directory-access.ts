import path from "node:path";
import { homedir } from "node:os";

function normalizeDirectory(directory: string): string | null {
  const trimmed = directory.trim();
  if (!trimmed) return null;
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.resolve(homedir(), trimmed.slice(2));
  }
  if (path.isAbsolute(trimmed)) return path.normalize(trimmed);
  if (path.win32.isAbsolute(trimmed)) return path.win32.normalize(trimmed);
  return path.resolve(trimmed);
}

export function normalizeWritableProjectDirectories(
  directories: readonly string[] | undefined,
): string[] {
  return Array.from(
    new Set((directories ?? []).flatMap((directory) => normalizeDirectory(directory) ?? [])),
  );
}

export function resolveAdditionalWritableDirectories(input: {
  cwd: string;
  projectDirectories: readonly string[] | undefined;
  configuredDirectories?: readonly string[] | undefined;
}): string[] {
  const cwd = normalizeDirectory(input.cwd);
  return Array.from(
    new Set(
      [...(input.configuredDirectories ?? []), ...(input.projectDirectories ?? [])].flatMap(
        (directory) => {
          const normalized = normalizeDirectory(directory);
          return normalized && normalized !== cwd ? [normalized] : [];
        },
      ),
    ),
  );
}

export function inferWritableProjectDirectoriesFromSystemPrompt(
  systemPrompt: string | null | undefined,
): string[] {
  if (!systemPrompt) return [];
  const contextStart = systemPrompt.lastIndexOf("<paseo_project_context>");
  const contextEnd = systemPrompt.indexOf("</paseo_project_context>", contextStart);
  if (contextStart < 0 || contextEnd < 0) return [];
  const context = systemPrompt.slice(contextStart, contextEnd);
  const match =
    /Project directories \(read on demand; do not load everything unless needed\):\n([\s\S]*?)\n\nKnowledge directories/u.exec(
      context,
    );
  if (!match?.[1]) return [];
  return normalizeWritableProjectDirectories(
    match[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim())
      .filter((line) => line.length > 0 && line !== "None configured"),
  );
}
