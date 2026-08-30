import { buildAbsoluteExplorerPath } from "@/utils/explorer-paths";
import type { WorkspaceWorkingDiffTabTarget } from "@/workspace-tabs/model";

export function normalizeWorkingDiffRepositoryRoot(path: string | null | undefined): string | null {
  const normalized = path?.trim().replaceAll("\\", "/");
  if (!normalized || normalized === "/") {
    return normalized || null;
  }
  if (/^[A-Za-z]:\/+$/.test(normalized)) {
    return `${normalized.slice(0, 2)}/`;
  }
  return normalized.replace(/\/+$/, "");
}

export function resolveWorkingDiffRepositoryRoot(input: {
  target: WorkspaceWorkingDiffTabTarget | { kind: "changes_tree" };
  workspaceRoot: string | null | undefined;
}): string | null {
  if (input.target.kind === "working_diff") {
    const repositoryRoot = normalizeWorkingDiffRepositoryRoot(input.target.cwd);
    if (repositoryRoot) {
      return repositoryRoot;
    }
  }
  return normalizeWorkingDiffRepositoryRoot(input.workspaceRoot);
}

export function createWorkingDiffTarget(input: {
  repositoryRoot: string;
  path?: string;
  focusRequestId?: number;
}): WorkspaceWorkingDiffTabTarget {
  const repositoryRoot = normalizeWorkingDiffRepositoryRoot(input.repositoryRoot);
  if (!repositoryRoot) {
    throw new Error("Working Diff requires a repository root");
  }
  const path = input.path?.trim().replaceAll("\\", "/");
  return {
    kind: "working_diff",
    cwd: repositoryRoot,
    ...(path ? { focusPath: path } : {}),
    ...(input.focusRequestId ? { focusRequestId: input.focusRequestId } : {}),
  };
}

export function resolveWorkingDiffFilePath(input: {
  repositoryRoot: string;
  workspaceRoot: string | null | undefined;
  path: string;
}): string {
  const repositoryRoot = normalizeWorkingDiffRepositoryRoot(input.repositoryRoot);
  const workspaceRoot = normalizeWorkingDiffRepositoryRoot(input.workspaceRoot);
  if (!repositoryRoot || repositoryRoot === workspaceRoot) {
    return input.path;
  }
  return buildAbsoluteExplorerPath({
    workspaceRoot: repositoryRoot,
    entryPath: input.path,
  });
}
