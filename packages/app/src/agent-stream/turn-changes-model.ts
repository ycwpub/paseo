import type { ParsedDiffFile } from "@/git/use-diff-query";
import type { StreamItem } from "@/types/stream";
import type { AgentTurnChangeFile } from "@getpaseo/protocol/agent-types";

export const DEFAULT_VISIBLE_TURN_CHANGE_COUNT = 3;

export function convertTurnChangeSnapshotFiles(
  files: readonly AgentTurnChangeFile[],
): ParsedDiffFile[] {
  return files.map((file) => ({
    ...file,
    hunks: [],
  }));
}

function normalizeAbsolutePath(path: string): string {
  const normalized = path.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized || "/";
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:\//.test(path);
}

function resolvePath(path: string, cwd: string): string {
  const normalizedPath = path.trim().replaceAll("\\", "/");
  if (isAbsolutePath(normalizedPath)) {
    return normalizeAbsolutePath(normalizedPath);
  }
  return normalizeAbsolutePath(`${normalizeAbsolutePath(cwd)}/${normalizedPath}`);
}

function dirname(path: string): string {
  const normalized = normalizeAbsolutePath(path);
  const separator = normalized.lastIndexOf("/");
  if (separator <= 0) {
    return normalized;
  }
  return normalized.slice(0, separator);
}

function normalizePath(path: string, cwd: string): string {
  const normalizedPath = path.trim().replaceAll("\\", "/");
  const normalizedCwd = cwd.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  const relativePath = normalizedPath.startsWith(`${normalizedCwd}/`)
    ? normalizedPath.slice(normalizedCwd.length + 1)
    : normalizedPath;
  return relativePath.replace(/^\.\/+/, "");
}

export function collectTurnChangedPaths(
  items: StreamItem[],
  cwd: string,
  sourceCwd = cwd,
): Set<string> {
  const paths = new Set<string>();

  for (const item of items) {
    if (item.kind !== "tool_call" || item.payload.source !== "agent") {
      continue;
    }
    const detail = item.payload.data.detail;
    if (detail.type !== "edit" && detail.type !== "write") {
      continue;
    }
    const resolvedPath = resolvePath(detail.filePath, sourceCwd);
    const repositoryRelativePath = normalizePath(resolvedPath, cwd);
    if (repositoryRelativePath) {
      paths.add(repositoryRelativePath);
    }
    if (!isAbsolutePath(detail.filePath)) {
      const providerRelativePath = normalizePath(detail.filePath, cwd);
      if (providerRelativePath) {
        paths.add(providerRelativePath);
      }
    }
  }

  return paths;
}

/**
 * Resolve the directories that may own Git changes made during a turn.
 *
 * Multi-directory Projects run the Agent from the Project storage root while
 * individual commands execute inside nested repositories. The shell cwd is
 * therefore a stronger signal than the Agent cwd. Explicit file edits are used
 * as a fallback for providers that do not emit shell calls.
 */
export function collectTurnChangeCwds(items: StreamItem[], cwd: string): string[] {
  const defaultCwd = normalizeAbsolutePath(cwd);
  const candidateCwds = new Set<string>();

  for (const item of items) {
    if (item.kind !== "tool_call" || item.payload.source !== "agent") {
      continue;
    }
    const detail = item.payload.data.detail;
    if (detail.type === "shell" && detail.cwd?.trim()) {
      candidateCwds.add(resolvePath(detail.cwd, defaultCwd));
    }
  }

  for (const item of items) {
    if (item.kind !== "tool_call" || item.payload.source !== "agent") {
      continue;
    }
    const detail = item.payload.data.detail;
    if (detail.type !== "edit" && detail.type !== "write") {
      continue;
    }
    const absolutePath = resolvePath(detail.filePath, defaultCwd);
    const relativePath = normalizePath(absolutePath, defaultCwd);
    const segments = relativePath.split("/").filter(Boolean);
    if (segments[0] === "repos" && segments[1]) {
      candidateCwds.add(`${defaultCwd}/repos/${segments[1]}`);
      continue;
    }
    candidateCwds.add(isAbsolutePath(detail.filePath) ? dirname(absolutePath) : defaultCwd);
  }

  return candidateCwds.size > 0 ? [...candidateCwds] : [defaultCwd];
}

export function resolveTurnChangeFilePath(path: string, cwd: string): string {
  return resolvePath(path, cwd);
}

export function selectTurnChangedFiles(input: {
  items: StreamItem[];
  files: ParsedDiffFile[];
  cwd: string;
  sourceCwd?: string;
}): ParsedDiffFile[] {
  const changedPaths = collectTurnChangedPaths(input.items, input.cwd, input.sourceCwd);
  if (changedPaths.size === 0) {
    const hasOpaqueMutationCall = input.items.some((item) => {
      if (item.kind !== "tool_call") {
        return false;
      }
      if (item.payload.source === "orchestrator") {
        return true;
      }
      const detailType = item.payload.data.detail.type;
      return detailType === "shell" || detailType === "unknown";
    });
    return hasOpaqueMutationCall ? input.files : [];
  }

  return input.files.filter((file) => {
    const path = normalizePath(file.path, input.cwd);
    const oldPath = file.oldPath ? normalizePath(file.oldPath, input.cwd) : null;
    return changedPaths.has(path) || (oldPath ? changedPaths.has(oldPath) : false);
  });
}

export function summarizeTurnChangedFiles(files: readonly ParsedDiffFile[]): {
  fileCount: number;
  additions: number;
  deletions: number;
} {
  return files.reduce(
    (summary, file) => ({
      fileCount: summary.fileCount + 1,
      additions: summary.additions + file.additions,
      deletions: summary.deletions + file.deletions,
    }),
    { fileCount: 0, additions: 0, deletions: 0 },
  );
}

export function selectVisibleTurnChangedFiles(
  files: readonly ParsedDiffFile[],
  expanded: boolean,
  collapsedCount = DEFAULT_VISIBLE_TURN_CHANGE_COUNT,
): ParsedDiffFile[] {
  return expanded ? [...files] : files.slice(0, Math.max(0, collapsedCount));
}
