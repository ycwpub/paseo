// COMPAT(opaqueProjectIds): one-time migration for project registries created
// before project IDs became independent random identifiers.
import type { Logger } from "pino";

import { generateProjectId, isGeneratedProjectId } from "../workspace-registry-model.js";
import type { ProjectRegistry, WorkspaceRegistry } from "../workspace-registry.js";

export async function migrateLegacyProjectIds(options: {
  projectRegistry: ProjectRegistry;
  workspaceRegistry: WorkspaceRegistry;
  logger: Logger;
  projectIdFactory?: () => string;
}): Promise<Map<string, string>> {
  const projects = await options.projectRegistry.list();
  const legacyProjects = projects.filter((project) => !isGeneratedProjectId(project.projectId));
  if (legacyProjects.length === 0) {
    return new Map();
  }

  const projectIdFactory = options.projectIdFactory ?? generateProjectId;
  const allocatedIds = new Set(projects.map((project) => project.projectId));
  const replacements = new Map<string, string>();

  for (const project of legacyProjects) {
    let nextProjectId: string;
    do {
      nextProjectId = projectIdFactory();
      if (!isGeneratedProjectId(nextProjectId)) {
        throw new Error(`Project ID factory returned an invalid ID: ${nextProjectId}`);
      }
    } while (allocatedIds.has(nextProjectId));

    allocatedIds.add(nextProjectId);
    replacements.set(project.projectId, nextProjectId);
    await options.projectRegistry.upsert({
      ...project,
      projectId: nextProjectId,
    });
  }

  for (const workspace of await options.workspaceRegistry.list()) {
    const nextProjectId = replacements.get(workspace.projectId);
    if (!nextProjectId) {
      continue;
    }
    await options.workspaceRegistry.update(workspace.workspaceId, (record) => ({
      ...record,
      projectId: nextProjectId,
    }));
  }

  for (const legacyProjectId of replacements.keys()) {
    await options.projectRegistry.remove(legacyProjectId);
  }

  options.logger.info(
    { migrated: replacements.size },
    "Migrated legacy path-derived project IDs to opaque IDs",
  );
  return replacements;
}
