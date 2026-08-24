import path from "node:path";
import type { PaseoMemoryScope } from "@getpaseo/protocol/messages";
import {
  resolveManagedProjectStorageRoot,
  resolveManagedWorkspacePath,
} from "../project/project-storage-paths.js";
import { memoryScopeKey, normalizeMemoryScope } from "./memory-model.js";

function sanitizeMemoryId(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^\.+$/, "_");
  return sanitized || "default";
}

export interface MemoryScopePaths {
  scope: PaseoMemoryScope;
  rootPath: string;
  summaryPath: string;
  detailsPath: string;
}

export function resolveMemoryScopePaths(input: {
  paseoHome: string;
  scope: PaseoMemoryScope;
  workspaceProjectId?: string | null;
}): MemoryScopePaths {
  const scope = normalizeMemoryScope(input.scope);
  if (scope.type === "global") {
    const userId = sanitizeMemoryId(scope.id ?? "default");
    const rootPath = path.join(input.paseoHome, "memory", "users", userId);
    return {
      scope,
      rootPath,
      summaryPath: path.join(rootPath, "summary.md"),
      detailsPath: path.join(rootPath, "details"),
    };
  }

  if (!scope.id) {
    throw new Error(`${scope.type} memory scope requires an ID`);
  }

  if (scope.type === "project") {
    const rootPath = path.join(
      resolveManagedProjectStorageRoot(input.paseoHome, scope.id),
      "memory",
    );
    return {
      scope,
      rootPath,
      summaryPath: path.join(rootPath, "summary.md"),
      detailsPath: path.join(rootPath, "details"),
    };
  }

  if (scope.type === "workspace") {
    // COMPAT(memory-workspace-scope): Workspace memory was removed in favor of
    // Project memory. Keep this resolver only so the store can migrate legacy
    // detail files before deleting the old memory directory.
    const projectId = input.workspaceProjectId?.trim();
    if (!projectId) {
      throw new Error(`Workspace ${scope.id} memory requires its Project ID`);
    }
    const rootPath = path.join(
      resolveManagedWorkspacePath(input.paseoHome, projectId, scope.id),
      "memory",
    );
    return {
      scope,
      rootPath,
      summaryPath: path.join(rootPath, "summary.md"),
      detailsPath: path.join(rootPath, "details"),
    };
  }

  const rootPath = path.join(
    input.paseoHome,
    "assistants",
    sanitizeMemoryId(scope.id),
    "memory",
    "learned",
  );
  return {
    scope,
    rootPath,
    summaryPath: path.join(rootPath, "summary.md"),
    detailsPath: path.join(rootPath, "details"),
  };
}

export function memoryScopeDocumentKey(scope: PaseoMemoryScope): string {
  return memoryScopeKey(scope);
}
