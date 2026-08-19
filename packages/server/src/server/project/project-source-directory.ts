import path from "node:path";
import type { PersistedProjectRecord } from "../workspace-registry.js";
import { resolveManagedProjectStorageRoot } from "./project-storage-paths.js";

export type ProjectSourceDirectory =
  | { kind: "project"; path: string }
  | { kind: "managed"; path: string };

export function resolveManagedProjectSourceDirectory(paseoHome: string, projectId: string): string {
  return resolveManagedProjectStorageRoot(paseoHome, projectId);
}

/**
 * Resolve the cwd used to create a workspace for a Project.
 *
 * A single-directory Project uses its registered project directory. A
 * multi-directory Project uses its host-managed Project path as an isolated cwd;
 * configured code directories remain additional writable directories.
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
