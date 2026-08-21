import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
} from "node:fs";
import { rm, rmdir } from "node:fs/promises";
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
const RESERVED_PASEO_HOME_STORAGE_NAMES = new Set([
  "agents",
  "attachments",
  "cache",
  "clients",
  "config.json",
  "daemon.log",
  "extensions",
  "memory",
  "orchestration-preferences.json",
  "paseo.pid",
  "plugins",
  "projects",
  "schedules",
  "skills",
  "skills-materialized",
  "terminals",
  "workflow-runs",
  "workflows",
  "workspaces",
  "worktrees",
]);
const NO_RESERVED_STORAGE_NAMES = new Set<string>();
const MANAGED_PROJECT_METADATA_NAMES = new Set(["paseo.json"]);

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

export function resolveManagedProjectStorageRoot(paseoHome: string, projectId: string): string {
  const homeRoot = path.resolve(paseoHome);
  const resolved = path.resolve(
    homeRoot,
    storageDirectoryName(projectId, RESERVED_PASEO_HOME_STORAGE_NAMES),
  );
  if (path.dirname(resolved) !== homeRoot) {
    throw new Error("Invalid managed Project storage id");
  }
  return resolved;
}

export function resolveManagedWorkspacePath(
  paseoHome: string,
  projectId: string,
  workspaceId: string,
): string {
  return resolveManagedStoragePath(
    resolveManagedProjectStorageRoot(paseoHome, projectId),
    "workspaces",
    workspaceId,
    NO_RESERVED_STORAGE_NAMES,
  );
}

export function resolveProjectPath(input: {
  paseoHome: string;
  project: Pick<PersistedProjectRecord, "projectId" | "rootPath">;
}): string {
  return resolveManagedProjectStorageRoot(input.paseoHome, input.project.projectId);
}

function resolveLegacyManagedProjectPath(paseoHome: string, projectId: string): string {
  const projectKey = createHash("sha256").update(projectId).digest("hex");
  return path.join(paseoHome, "projects", "directories", projectKey);
}

function resolveLegacyProjectConfigDirectory(paseoHome: string, projectId: string): string {
  const projectKey = createHash("sha256").update(projectId).digest("hex");
  return path.join(paseoHome, "projects", "configs", projectKey);
}

function resolveLegacyManagedWorkspacePath(paseoHome: string, workspaceId: string): string {
  return resolveManagedStoragePath(paseoHome, "workspaces", workspaceId, NO_RESERVED_STORAGE_NAMES);
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

function mergeManagedStorageWithoutOverwrite(source: string, destination: string): void {
  if (!existsSync(destination)) {
    renameSync(source, destination);
    return;
  }
  if (!lstatSync(source).isDirectory() || !lstatSync(destination).isDirectory()) {
    return;
  }
  for (const entry of readdirSync(source)) {
    mergeManagedStorageWithoutOverwrite(path.join(source, entry), path.join(destination, entry));
  }
  try {
    rmdirSync(source);
  } catch {
    // Keep unresolved conflicts in the legacy location rather than deleting data.
  }
}

export function ensureManagedProjectStorageRoot(paseoHome: string, projectId: string): string {
  const metadataPath = ensureManagedProjectPath(paseoHome, projectId);
  const projectStorageRoot = resolveManagedProjectStorageRoot(paseoHome, projectId);
  mkdirSync(projectStorageRoot, { recursive: true });

  for (const entry of readdirSync(metadataPath)) {
    if (MANAGED_PROJECT_METADATA_NAMES.has(entry)) continue;
    mergeManagedStorageWithoutOverwrite(
      path.join(metadataPath, entry),
      path.join(projectStorageRoot, entry),
    );
  }

  const legacyCodeReposPath = path.join(projectStorageRoot, "code_repos");
  if (existsSync(legacyCodeReposPath) && lstatSync(legacyCodeReposPath).isDirectory()) {
    for (const entry of readdirSync(legacyCodeReposPath)) {
      mergeManagedStorageWithoutOverwrite(
        path.join(legacyCodeReposPath, entry),
        path.join(projectStorageRoot, entry),
      );
    }
    try {
      rmdirSync(legacyCodeReposPath);
    } catch {
      // Keep unresolved conflicts in code_repos rather than deleting data.
    }
  }
  return projectStorageRoot;
}

export function ensureManagedWorkspacePath(
  paseoHome: string,
  projectId: string,
  workspaceId: string,
): string {
  const workspacePath = resolveManagedWorkspacePath(paseoHome, projectId, workspaceId);
  const legacyPath = resolveLegacyManagedWorkspacePath(paseoHome, workspaceId);
  mkdirSync(path.dirname(workspacePath), { recursive: true });

  if (existsSync(legacyPath) && !existsSync(workspacePath)) {
    renameSync(legacyPath, workspacePath);
  } else {
    mkdirSync(workspacePath, { recursive: true });
    if (existsSync(legacyPath)) {
      cpSync(legacyPath, workspacePath, {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
      rmSync(legacyPath, { recursive: true, force: true });
    }
  }
  return workspacePath;
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
    rm(resolveManagedProjectStorageRoot(paseoHome, projectId), {
      recursive: true,
      force: true,
    }),
  ]);
}

export async function removeManagedWorkspaceStorage(
  paseoHome: string,
  projectId: string,
  workspaceId: string,
): Promise<void> {
  await Promise.all([
    rm(resolveManagedWorkspacePath(paseoHome, projectId, workspaceId), {
      recursive: true,
      force: true,
    }),
    rm(resolveLegacyManagedWorkspacePath(paseoHome, workspaceId), {
      recursive: true,
      force: true,
    }),
  ]);
  await rmdir(
    path.join(resolveManagedProjectStorageRoot(paseoHome, projectId), "workspaces"),
  ).catch(() => undefined);
}
