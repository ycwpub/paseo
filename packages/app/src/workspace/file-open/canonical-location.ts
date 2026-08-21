import {
  normalizeWorkspaceFileLocation,
  resolveWorkspaceFilePaths,
  type WorkspaceFileLocation,
} from ".";

export function canonicalizeWorkspaceFileLocation(input: {
  location: WorkspaceFileLocation | null | undefined;
  workspaceRoot: string | null | undefined;
}): WorkspaceFileLocation | null {
  const normalized = normalizeWorkspaceFileLocation(input.location);
  if (!normalized) {
    return null;
  }

  const workspaceRoot = input.workspaceRoot?.trim();
  if (!workspaceRoot) {
    return normalized;
  }

  const resolved = resolveWorkspaceFilePaths({
    path: normalized.path,
    workspaceRoot,
  });
  if (!resolved) {
    return normalized;
  }

  return {
    ...normalized,
    path: resolved.relativePath ?? resolved.absolutePath,
  };
}
