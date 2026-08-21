import path from "node:path";
import type { PersistedProjectRecord } from "../workspace-registry.js";
import { resolveManagedProjectCodeReposPath } from "./project-storage-paths.js";

export type ProjectSourceDirectory =
  | { kind: "project"; path: string }
  | { kind: "managed"; path: string };

export function resolveManagedProjectSourceDirectory(paseoHome: string, projectId: string): string {
  return resolveManagedProjectCodeReposPath(paseoHome, projectId);
}

/**
 * Resolve the cwd used to create a workspace for a Project.
 *
 * Multi-directory Projects use their host-local code_repos directory.
 * Configured code directories remain additional writable directories in the
 * Agent context, while code_repos gives each Project an isolated cwd.
 */
export function resolveProjectSourceDirectory(input: {
  paseoHome: string;
  project: PersistedProjectRecord;
}): ProjectSourceDirectory {
  const projectRoot = input.project.rootPath?.trim();
  if (projectRoot) {
    return { kind: "project", path: path.resolve(projectRoot) };
  }

  return {
    kind: "managed",
    path: resolveManagedProjectSourceDirectory(input.paseoHome, input.project.projectId),
  };
}
