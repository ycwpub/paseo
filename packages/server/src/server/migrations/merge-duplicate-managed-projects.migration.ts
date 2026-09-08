// COMPAT(duplicateManagedProjects): builds before 2026-09-08 could register a
// directoryless Project's host-managed source directory as a second Project.
import { existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmdirSync } from "node:fs";
import path from "node:path";

import type { Logger } from "pino";

import { getManagedProjectIdForSourceDirectory } from "../project/managed-project-source-identity.js";
import { resolveManagedProjectStorageRoot } from "../project/project-storage-paths.js";
import type {
  PersistedProjectRecord,
  ProjectRegistry,
  WorkspaceRegistry,
} from "../workspace-registry.js";

export interface MergeDuplicateManagedProjectsResult {
  projectsRemoved: number;
  projectsRestored: number;
  workspacesUpdated: number;
}

function mergeStorageWithoutOverwrite(source: string, destination: string): void {
  if (!existsSync(source)) return;
  mkdirSync(path.dirname(destination), { recursive: true });
  if (!existsSync(destination)) {
    renameSync(source, destination);
    return;
  }
  if (!lstatSync(source).isDirectory() || !lstatSync(destination).isDirectory()) {
    return;
  }

  for (const entry of readdirSync(source)) {
    mergeStorageWithoutOverwrite(path.join(source, entry), path.join(destination, entry));
  }
  try {
    rmdirSync(source);
  } catch {
    // Preserve conflicting files in the old location rather than overwriting data.
  }
}

function shouldRestoreOwner(
  owner: PersistedProjectRecord,
  duplicates: readonly PersistedProjectRecord[],
): boolean {
  return Boolean(owner.archivedAt && duplicates.some((duplicate) => !duplicate.archivedAt));
}

export async function mergeDuplicateManagedProjects(options: {
  paseoHome: string;
  projectRegistry: ProjectRegistry;
  workspaceRegistry: WorkspaceRegistry;
  logger: Logger;
}): Promise<MergeDuplicateManagedProjectsResult> {
  const projects = await options.projectRegistry.list();
  const projectsById = new Map(projects.map((project) => [project.projectId, project]));
  const duplicatesByOwnerId = new Map<string, PersistedProjectRecord[]>();

  for (const project of projects) {
    if (!project.rootPath) continue;
    const ownerId = getManagedProjectIdForSourceDirectory(options.paseoHome, project.rootPath);
    if (!ownerId || ownerId === project.projectId) continue;
    const owner = projectsById.get(ownerId);
    if (!owner || owner.rootPath !== null) continue;
    const duplicates = duplicatesByOwnerId.get(ownerId) ?? [];
    duplicates.push(project);
    duplicatesByOwnerId.set(ownerId, duplicates);
  }

  let projectsRemoved = 0;
  let projectsRestored = 0;
  let workspacesUpdated = 0;
  const workspaces = await options.workspaceRegistry.list();

  for (const [ownerId, duplicates] of duplicatesByOwnerId) {
    const owner = projectsById.get(ownerId);
    if (!owner) continue;
    const duplicateIds = new Set(duplicates.map((project) => project.projectId));

    if (shouldRestoreOwner(owner, duplicates)) {
      await options.projectRegistry.upsert({
        ...owner,
        archivedAt: null,
        updatedAt: new Date().toISOString(),
      });
      projectsRestored += 1;
    }

    for (const workspace of workspaces) {
      if (!duplicateIds.has(workspace.projectId)) continue;
      await options.workspaceRegistry.update(workspace.workspaceId, (record) => ({
        ...record,
        projectId: ownerId,
      }));
      workspacesUpdated += 1;
    }

    const ownerStorage = resolveManagedProjectStorageRoot(options.paseoHome, ownerId);
    for (const duplicate of duplicates) {
      mergeStorageWithoutOverwrite(
        resolveManagedProjectStorageRoot(options.paseoHome, duplicate.projectId),
        ownerStorage,
      );
      await options.projectRegistry.remove(duplicate.projectId);
      projectsRemoved += 1;
    }
  }

  const result = { projectsRemoved, projectsRestored, workspacesUpdated };
  if (projectsRemoved > 0) {
    options.logger.info(
      result,
      "Merged duplicate Projects created from managed source directories",
    );
  }
  return result;
}
