import { promises as fs, readFileSync } from "node:fs";
import { writeFileAtomic, writeJsonFileAtomic } from "../../atomic-file.js";
import { isCloudDocumentContentValid } from "./content-integrity.js";
import { resolveCloudDocumentCachePaths } from "./paths.js";
import type {
  CloudDocumentCacheMetadata,
  CloudDocumentCacheTarget,
  ResolvedCloudDocument,
} from "./types.js";

function isMetadata(value: unknown): value is CloudDocumentCacheMetadata {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    typeof candidate.source === "string" &&
    typeof candidate.cachedAt === "string" &&
    typeof candidate.checkedAt === "string" &&
    typeof candidate.contentHash === "string" &&
    (candidate.etag === null || typeof candidate.etag === "string") &&
    (candidate.lastModified === null || typeof candidate.lastModified === "string") &&
    typeof candidate.contentPath === "string"
  );
}

export class CloudDocumentCacheStore {
  constructor(private readonly paseoHome: string) {}

  async read(
    target: CloudDocumentCacheTarget,
  ): Promise<{ metadata: CloudDocumentCacheMetadata; content: string } | null> {
    const paths = resolveCloudDocumentCachePaths(this.paseoHome, target);
    try {
      const [rawMetadata, content] = await Promise.all([
        fs.readFile(paths.metadataPath, "utf8"),
        fs.readFile(paths.contentPath, "utf8"),
      ]);
      const metadata: unknown = JSON.parse(rawMetadata);
      if (!isMetadata(metadata) || metadata.source !== target.source.trim()) {
        return null;
      }
      if (!isCloudDocumentContentValid(content, metadata.contentHash)) {
        return null;
      }
      return {
        metadata: { ...metadata, contentPath: paths.contentPath },
        content,
      };
    } catch {
      return null;
    }
  }

  readSync(
    target: CloudDocumentCacheTarget,
  ): { metadata: CloudDocumentCacheMetadata; content: string } | null {
    const paths = resolveCloudDocumentCachePaths(this.paseoHome, target);
    try {
      const metadata: unknown = JSON.parse(readFileSync(paths.metadataPath, "utf8"));
      if (!isMetadata(metadata) || metadata.source !== target.source.trim()) {
        return null;
      }
      const content = readFileSync(paths.contentPath, "utf8");
      if (!isCloudDocumentContentValid(content, metadata.contentHash)) {
        return null;
      }
      return {
        metadata: { ...metadata, contentPath: paths.contentPath },
        content,
      };
    } catch {
      return null;
    }
  }

  async write(input: {
    target: CloudDocumentCacheTarget;
    content: string;
    contentHash: string;
    checkedAt: string;
    cachedAt: string;
    etag: string | null;
    lastModified: string | null;
  }): Promise<CloudDocumentCacheMetadata> {
    const paths = resolveCloudDocumentCachePaths(this.paseoHome, input.target);
    const metadata: CloudDocumentCacheMetadata = {
      version: 1,
      source: input.target.source.trim(),
      cachedAt: input.cachedAt,
      checkedAt: input.checkedAt,
      contentHash: input.contentHash,
      etag: input.etag,
      lastModified: input.lastModified,
      contentPath: paths.contentPath,
    };
    await writeFileAtomic(paths.contentPath, input.content);
    await writeJsonFileAtomic(paths.metadataPath, metadata);
    return metadata;
  }

  async touchCheckedAt(input: {
    target: CloudDocumentCacheTarget;
    metadata: CloudDocumentCacheMetadata;
    checkedAt: string;
  }): Promise<CloudDocumentCacheMetadata> {
    const paths = resolveCloudDocumentCachePaths(this.paseoHome, input.target);
    const metadata = {
      ...input.metadata,
      checkedAt: input.checkedAt,
      contentPath: paths.contentPath,
    };
    await writeJsonFileAtomic(paths.metadataPath, metadata);
    return metadata;
  }

  toResolved(
    cached: { metadata: CloudDocumentCacheMetadata; content: string } | null,
    target: CloudDocumentCacheTarget,
    stale: boolean,
  ): ResolvedCloudDocument {
    const paths = resolveCloudDocumentCachePaths(this.paseoHome, target);
    return {
      source: target.source,
      cached: cached !== null,
      cachedAt: cached?.metadata.cachedAt ?? null,
      checkedAt: cached?.metadata.checkedAt ?? null,
      localPath: cached?.metadata.contentPath ?? paths.contentPath,
      stale,
      content: cached?.content ?? null,
      error: null,
      authIssue: null,
    };
  }
}
