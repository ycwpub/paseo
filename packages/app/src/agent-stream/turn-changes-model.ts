import type { ParsedDiffFile } from "@/git/use-diff-query";
import type { StreamItem } from "@/types/stream";

export const DEFAULT_VISIBLE_TURN_CHANGE_COUNT = 3;

function normalizePath(path: string, cwd: string): string {
  const normalizedPath = path.trim().replaceAll("\\", "/");
  const normalizedCwd = cwd.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  const relativePath = normalizedPath.startsWith(`${normalizedCwd}/`)
    ? normalizedPath.slice(normalizedCwd.length + 1)
    : normalizedPath;
  return relativePath.replace(/^\.\/+/, "");
}

export function collectTurnChangedPaths(items: StreamItem[], cwd: string): Set<string> {
  const paths = new Set<string>();

  for (const item of items) {
    if (item.kind !== "tool_call" || item.payload.source !== "agent") {
      continue;
    }
    const detail = item.payload.data.detail;
    if (detail.type !== "edit" && detail.type !== "write") {
      continue;
    }
    const path = normalizePath(detail.filePath, cwd);
    if (path) {
      paths.add(path);
    }
  }

  return paths;
}

export function selectTurnChangedFiles(input: {
  items: StreamItem[];
  files: ParsedDiffFile[];
  cwd: string;
}): ParsedDiffFile[] {
  const changedPaths = collectTurnChangedPaths(input.items, input.cwd);
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
