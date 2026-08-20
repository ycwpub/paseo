import { createHash } from "node:crypto";
import path from "node:path";
import type { PersistedProjectRecord } from "../workspace-registry.js";
import {
  readProjectConfigForProject,
  resolveProjectConfigDirectories,
} from "./project-config-storage.js";

export type ProjectSourceDirectory =
  | { kind: "project"; path: string }
  | { kind: "managed"; path: string };

const MANAGED_PROJECT_DIRECTORY = path.join("projects", "directories");

export function resolveManagedProjectSourceDirectory(paseoHome: string, projectId: string): string {
  const projectKey = createHash("sha256").update(projectId).digest("hex");
  return path.join(paseoHome, MANAGED_PROJECT_DIRECTORY, projectKey);
}

/**
 * Resolve the cwd used to create a workspace for a Project.
 *
 * Multi-directory Projects use their first configured writable Project
 * directory. A Project with no configured directory still receives a
 * host-local managed cwd so conversations can start before source directories
 * are attached.
 */
export function resolveProjectSourceDirectory(input: {
  paseoHome: string;
  project: PersistedProjectRecord;
}): ProjectSourceDirectory {
  const configResult = readProjectConfigForProject(input);
  if (configResult.ok) {
    const configuredDirectory = resolveProjectConfigDirectories({
      project: input.project,
      config: configResult.config,
    })[0];
    if (configuredDirectory) {
      return { kind: "project", path: configuredDirectory };
    }
  }

  const projectRoot = input.project.rootPath?.trim();
  if (projectRoot) {
    return { kind: "project", path: path.resolve(projectRoot) };
  }

  return {
    kind: "managed",
    path: resolveManagedProjectSourceDirectory(input.paseoHome, input.project.projectId),
  };
}
