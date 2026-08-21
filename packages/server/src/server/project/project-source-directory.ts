import path from "node:path";
import type { PersistedProjectRecord } from "../workspace-registry.js";
import { resolveManagedProjectPath } from "./project-storage-paths.js";

export type ProjectSourceDirectory =
  | { kind: "project"; path: string }
  | { kind: "managed"; path: string };

export function resolveManagedProjectSourceDirectory(paseoHome: string, projectId: string): string {
  return resolveManagedProjectPath(paseoHome, projectId);
}

/**
 * Resolve the cwd used to create a workspace for a Project.
 *
 * Multi-directory Projects use their host-local Project path. Configured code
 * directories remain additional writable directories in the Agent context,
 * while the private Project path gives each Project an isolated cwd.
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
