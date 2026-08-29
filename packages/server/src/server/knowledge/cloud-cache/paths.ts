import { createHash } from "node:crypto";
import path from "node:path";
import { resolveManagedProjectStorageRoot } from "../../project/project-storage-paths.js";
import type { CloudDocumentCacheTarget } from "./types.js";

function requireSafeDirectoryId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || /[/\\]/u.test(trimmed)) {
    throw new Error(`${label} is invalid`);
  }
  return trimmed;
}

export function cloudDocumentCacheKey(source: string): string {
  return createHash("sha256").update(source.trim()).digest("hex");
}

export function resolveCloudDocumentCacheDirectory(
  paseoHome: string,
  target: Pick<CloudDocumentCacheTarget, "scope" | "projectId" | "assistantId">,
): string {
  if (target.scope === "global") {
    return path.join(paseoHome, "knowledge", "cloud-documents");
  }
  if (target.scope === "assistant") {
    if (!target.assistantId) {
      throw new Error("assistantId is required for Assistant cloud document caching");
    }
    return path.join(
      paseoHome,
      "assistants",
      requireSafeDirectoryId(target.assistantId, "assistantId"),
      "knowledge",
      "cloud-documents",
    );
  }
  if (!target.projectId) {
    throw new Error("projectId is required for Project cloud document caching");
  }
  return path.join(
    resolveManagedProjectStorageRoot(paseoHome, target.projectId),
    "knowledge",
    "cloud-documents",
  );
}

export function resolveCloudDocumentCachePaths(
  paseoHome: string,
  target: CloudDocumentCacheTarget,
): { contentPath: string; metadataPath: string } {
  const directory = resolveCloudDocumentCacheDirectory(paseoHome, target);
  const key = cloudDocumentCacheKey(target.source);
  return {
    contentPath: path.join(directory, `${key}.md`),
    metadataPath: path.join(directory, `${key}.json`),
  };
}
