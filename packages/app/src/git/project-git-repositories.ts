import type { PaseoProjectConfig } from "@getpaseo/protocol/paseo-config-schema";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { resolveProjectResourceDirectories } from "@/utils/project-resource-directories";
import { normalizeWorkingDiffRepositoryRoot } from "@/git/working-diff-repository";

export interface ProjectGitRepositoryCandidate {
  root: string;
  label: string;
  pathLabel: string;
}

function uniquePaths(paths: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const normalized = normalizeWorkingDiffRepositoryRoot(path);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function basename(path: string): string {
  const normalized = normalizeWorkingDiffRepositoryRoot(path) ?? path;
  if (normalized === "/") return "/";
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
}

export function resolveProjectGitRepositoryCandidates(input: {
  workspace: WorkspaceDescriptor;
  projectConfig: PaseoProjectConfig | null | undefined;
  additionalRoots?: readonly (string | null | undefined)[];
}): ProjectGitRepositoryCandidate[] {
  const { workspace } = input;
  const projectRoot = normalizeWorkingDiffRepositoryRoot(workspace.projectRootPath) ?? "";
  const workspaceDirectory = normalizeWorkingDiffRepositoryRoot(workspace.workspaceDirectory) ?? "";
  const resourceDirectories = resolveProjectResourceDirectories({
    projectConfig: input.projectConfig,
    context: {
      projectId: workspace.projectId,
      projectName: workspace.projectDisplayName,
      projectRoot,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceDirectory,
    },
  });
  const roots = uniquePaths([
    ...(input.additionalRoots ?? []),
    ...resourceDirectories.project,
    workspaceDirectory,
  ]);
  const labelCounts = new Map<string, number>();
  for (const root of roots) {
    const label = basename(root);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  return roots.map((root) => {
    const baseLabel = basename(root);
    return {
      root,
      label: labelCounts.get(baseLabel) === 1 ? baseLabel : root,
      pathLabel: root,
    };
  });
}

export function resolveRepositoryFocusPath(input: {
  repositoryRoot: string;
  focusPath: string | null | undefined;
}): string | undefined {
  const focusPath = input.focusPath?.trim().replaceAll("\\", "/");
  if (!focusPath) return undefined;
  const repositoryRoot = normalizeWorkingDiffRepositoryRoot(input.repositoryRoot);
  if (!repositoryRoot) return focusPath;
  if (focusPath === repositoryRoot) return undefined;
  const prefix = repositoryRoot.endsWith("/") ? repositoryRoot : `${repositoryRoot}/`;
  return focusPath.startsWith(prefix) ? focusPath.slice(prefix.length) : focusPath;
}

export function selectRepositoryRootForFocus(input: {
  repositoryRoots: readonly string[];
  requestedRoot?: string | null;
  focusPath?: string | null;
}): string | null {
  const requestedRoot = normalizeWorkingDiffRepositoryRoot(input.requestedRoot);
  if (requestedRoot && input.repositoryRoots.includes(requestedRoot)) {
    return requestedRoot;
  }
  const focusPath = input.focusPath?.trim().replaceAll("\\", "/");
  if (focusPath) {
    const matchingRoot = [...input.repositoryRoots]
      .sort((left, right) => right.length - left.length)
      .find((root) => focusPath === root || focusPath.startsWith(`${root}/`));
    if (matchingRoot) return matchingRoot;
  }
  return input.repositoryRoots[0] ?? null;
}
