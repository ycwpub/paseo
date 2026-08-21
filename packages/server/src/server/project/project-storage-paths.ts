import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { PersistedProjectRecord } from "../workspace-registry.js";

const SAFE_STORAGE_ID = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/u;
const RESERVED_PROJECT_STORAGE_NAMES = new Set([
  "configs",
  "directories",
  "icons",
  "projects.json",
  "workspaces.json",
]);
const NO_RESERVED_STORAGE_NAMES = new Set<string>();

function storageDirectoryName(id: string, reservedNames: ReadonlySet<string>): string {
  if (
    SAFE_STORAGE_ID.test(id) &&
    id !== "." &&
    id !== ".." &&
    !reservedNames.has(id.toLowerCase())
  ) {
    return id;
  }
  return `legacy-${createHash("sha256").update(id).digest("hex")}`;
}

function resolveManagedStoragePath(
  paseoHome: string,
  collection: string,
  id: string,
  reservedNames: ReadonlySet<string>,
): string {
  const collectionRoot = path.resolve(paseoHome, collection);
  const resolved = path.resolve(collectionRoot, storageDirectoryName(id, reservedNames));
  if (path.dirname(resolved) !== collectionRoot) {
    throw new Error(`Invalid managed ${collection} storage id`);
  }
  return resolved;
}

export function resolveManagedProjectPath(paseoHome: string, projectId: string): string {
  return resolveManagedStoragePath(
    paseoHome,
    "projects",
    projectId,
    RESERVED_PROJECT_STORAGE_NAMES,
  );
}

export function resolveManagedWorkspacePath(paseoHome: string, workspaceId: string): string {
  return resolveManagedStoragePath(paseoHome, "workspaces", workspaceId, NO_RESERVED_STORAGE_NAMES);
}

export function resolveProjectPath(input: {
  paseoHome: string;
  project: Pick<PersistedProjectRecord, "projectId" | "rootPath">;
}): string {
  const rootPath = input.project.rootPath?.trim();
  return rootPath
    ? path.resolve(rootPath)
    : resolveManagedProjectPath(input.paseoHome, input.project.projectId);
}

function resolveLegacyManagedProjectPath(paseoHome: string, projectId: string): string {
  const projectKey = createHash("sha256").update(projectId).digest("hex");
  return path.join(paseoHome, "projects", "directories", projectKey);
}

function resolveLegacyProjectConfigDirectory(paseoHome: string, projectId: string): string {
  const projectKey = createHash("sha256").update(projectId).digest("hex");
  return path.join(paseoHome, "projects", "configs", projectKey);
}

export function ensureManagedProjectPath(paseoHome: string, projectId: string): string {
  const projectPath = resolveManagedProjectPath(paseoHome, projectId);
  const legacyPath = resolveLegacyManagedProjectPath(paseoHome, projectId);
  mkdirSync(path.dirname(projectPath), { recursive: true });

  if (existsSync(legacyPath) && !existsSync(projectPath)) {
    renameSync(legacyPath, projectPath);
  } else {
    mkdirSync(projectPath, { recursive: true });
    if (existsSync(legacyPath)) {
      cpSync(legacyPath, projectPath, {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
    }
  }
  return projectPath;
}

export async function removeManagedProjectStorage(
  paseoHome: string,
  projectId: string,
): Promise<void> {
  await Promise.all([
    rm(resolveManagedProjectPath(paseoHome, projectId), { recursive: true, force: true }),
    rm(resolveLegacyManagedProjectPath(paseoHome, projectId), { recursive: true, force: true }),
    rm(resolveLegacyProjectConfigDirectory(paseoHome, projectId), {
      recursive: true,
      force: true,
    }),
  ]);
}

export async function removeManagedWorkspaceStorage(
  paseoHome: string,
  workspaceId: string,
): Promise<void> {
  await rm(resolveManagedWorkspacePath(paseoHome, workspaceId), {
    recursive: true,
    force: true,
  });
}
