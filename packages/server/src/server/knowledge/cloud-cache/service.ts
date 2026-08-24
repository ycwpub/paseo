import type { Logger } from "pino";
import { hashCloudDocumentContent } from "./content-integrity.js";
import { CloudDocumentCacheStore } from "./store.js";
import {
  CloudDocumentAuthenticationError,
  DefaultCloudDocumentSourceReader,
  type CloudDocumentSourceReader,
} from "./source.js";
import type {
  CloudDocumentCacheStatus,
  CloudDocumentCacheTarget,
  ResolvedCloudDocument,
} from "./types.js";

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isStale(checkedAt: string, nowMs: number, maxAgeMs: number): boolean {
  const checkedAtMs = Date.parse(checkedAt);
  return !Number.isFinite(checkedAtMs) || nowMs - checkedAtMs >= maxAgeMs;
}

export class CloudDocumentCacheService {
  private readonly store: CloudDocumentCacheStore;
  private readonly reader: CloudDocumentSourceReader;
  private readonly logger: Pick<Logger, "warn" | "info">;
  private readonly now: () => Date;
  private readonly maxAgeMs: number;
  private readonly inFlight = new Map<string, Promise<ResolvedCloudDocument>>();

  constructor(options: {
    paseoHome: string;
    logger: Pick<Logger, "warn" | "info">;
    reader?: CloudDocumentSourceReader;
    now?: () => Date;
    maxAgeMs?: number;
  }) {
    this.store = new CloudDocumentCacheStore(options.paseoHome);
    this.reader = options.reader ?? new DefaultCloudDocumentSourceReader();
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  }

  async getStatus(target: CloudDocumentCacheTarget): Promise<CloudDocumentCacheStatus> {
    const resolved = await this.resolve(target);
    const { content: _content, ...status } = resolved;
    return status;
  }

  async resolve(
    target: CloudDocumentCacheTarget,
    options?: { force?: boolean },
  ): Promise<ResolvedCloudDocument> {
    const normalized = this.normalizeTarget(target);
    const key = `${normalized.scope}:${normalized.projectId ?? ""}:${normalized.source}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const operation = this.resolveUnlocked(normalized, options?.force === true).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, operation);
    return operation;
  }

  private async resolveUnlocked(
    target: CloudDocumentCacheTarget,
    force: boolean,
  ): Promise<ResolvedCloudDocument> {
    const cached = await this.store.read(target);
    const now = this.now();
    const stale = cached ? isStale(cached.metadata.checkedAt, now.getTime(), this.maxAgeMs) : true;
    if (cached && !force && !stale) {
      return this.store.toResolved(cached, target, false);
    }

    try {
      const fetched = await this.reader.fetch({
        source: target.source,
        etag: cached?.metadata.etag,
        lastModified: cached?.metadata.lastModified,
      });
      const checkedAt = now.toISOString();
      if (fetched.notModified && cached) {
        const metadata = await this.store.touchCheckedAt({
          target,
          metadata: cached.metadata,
          checkedAt,
        });
        return {
          ...this.store.toResolved({ metadata, content: cached.content }, target, false),
        };
      }
      const contentHash = hashCloudDocumentContent(fetched.content);
      const unchanged = cached?.metadata.contentHash === contentHash;
      const metadata = await this.store.write({
        target,
        content: fetched.content,
        contentHash,
        checkedAt,
        cachedAt: unchanged && cached ? cached.metadata.cachedAt : checkedAt,
        etag: fetched.etag,
        lastModified: fetched.lastModified,
      });
      return this.store.toResolved({ metadata, content: fetched.content }, target, false);
    } catch (error) {
      const authIssue = error instanceof CloudDocumentAuthenticationError ? error.issue : null;
      const message = error instanceof Error ? error.message : String(error);
      if (cached && !force) {
        this.logger.warn(
          { err: error, source: target.source, scope: target.scope, projectId: target.projectId },
          "Failed to refresh cloud knowledge; using stale cache",
        );
        return {
          ...this.store.toResolved(cached, target, true),
          error: message,
          authIssue,
        };
      }
      return {
        source: target.source,
        cached: false,
        cachedAt: null,
        checkedAt: null,
        localPath: this.store.toResolved(null, target, true).localPath,
        stale: true,
        content: null,
        error: message,
        authIssue,
      };
    }
  }

  private normalizeTarget(target: CloudDocumentCacheTarget): CloudDocumentCacheTarget {
    const source = target.source.trim();
    if (!source) throw new Error("云文档链接不能为空");
    return {
      scope: target.scope,
      ...(target.projectId ? { projectId: target.projectId } : {}),
      source,
    };
  }
}
