import type { PersistedProjectRecord } from "../workspace-registry.js";

export type DirectoryBackedProjectRecord = PersistedProjectRecord & { rootPath: string };

export function hasProjectDirectory(
  project: PersistedProjectRecord,
): project is DirectoryBackedProjectRecord {
  return typeof project.rootPath === "string" && project.rootPath.trim().length > 0;
}

export function requireProjectDirectory(
  project: PersistedProjectRecord,
  operation: string,
): string {
  if (hasProjectDirectory(project)) {
    return project.rootPath;
  }
  throw new Error(`${operation} requires a project directory`);
}

export function projectRootPathForWire(project: PersistedProjectRecord): string {
  return hasProjectDirectory(project) ? project.rootPath : "";
}
