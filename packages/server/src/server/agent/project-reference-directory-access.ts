import path from "node:path";
import { normalizeWritableProjectDirectories } from "./project-directory-access.js";

export function normalizeReadOnlyProjectDirectories(
  directories: readonly string[] | undefined,
): string[] {
  return normalizeWritableProjectDirectories(directories);
}

function pathsOverlap(left: string, right: string): boolean {
  const relative = path.relative(left, right);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

export function findProjectDirectoryAccessConflict(input: {
  writableDirectories: readonly string[] | undefined;
  readOnlyDirectories: readonly string[] | undefined;
}): { writableDirectory: string; readOnlyDirectory: string } | null {
  const writableDirectories = normalizeWritableProjectDirectories(input.writableDirectories);
  const readOnlyDirectories = normalizeReadOnlyProjectDirectories(input.readOnlyDirectories);
  for (const writableDirectory of writableDirectories) {
    for (const readOnlyDirectory of readOnlyDirectories) {
      if (
        pathsOverlap(writableDirectory, readOnlyDirectory) ||
        pathsOverlap(readOnlyDirectory, writableDirectory)
      ) {
        return { writableDirectory, readOnlyDirectory };
      }
    }
  }
  return null;
}

export function inferReadOnlyProjectDirectoriesFromSystemPrompt(
  systemPrompt: string | null | undefined,
): string[] {
  if (!systemPrompt) return [];
  const contextStart = systemPrompt.lastIndexOf("<paseo_project_context>");
  const contextEnd = systemPrompt.indexOf("</paseo_project_context>", contextStart);
  if (contextStart < 0 || contextEnd < 0) return [];
  const context = systemPrompt.slice(contextStart, contextEnd);
  const match =
    /Reference directories \(read-only; read on demand\):\n([\s\S]*?)\n\nKnowledge directories/u.exec(
      context,
    );
  if (!match?.[1]) return [];
  return normalizeReadOnlyProjectDirectories(
    match[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim())
      .filter((line) => line.length > 0 && line !== "None configured"),
  );
}
