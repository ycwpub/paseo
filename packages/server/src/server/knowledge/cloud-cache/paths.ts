import { createHash } from "node:crypto";
import path from "node:path";
import { resolveManagedProjectStorageRoot } from "../../project/project-storage-paths.js";
import type { CloudDocumentCacheTarget } from "./types.js";

export function cloudDocumentCacheKey(source: string): string {
  return createHash("sha256").update(source.trim()).digest("hex");
}

export function resolveCloudDocumentCacheDirectory(
  paseoHome: string,
  target: Pick<CloudDocumentCacheTarget, "scope" | "projectId">,
): string {
  if (target.scope === "global") {
    return path.join(paseoHome, "knowledge", "cloud-documents");
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
