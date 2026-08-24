import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "../../../test-utils/test-logger.js";
import { CloudDocumentCacheService } from "./service.js";
import { CloudDocumentAuthenticationError, type CloudDocumentSourceReader } from "./source.js";

describe("CloudDocumentCacheService", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("stores global and Project caches in their scoped directories", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-cloud-cache-"));
    roots.push(paseoHome);
    const reader: CloudDocumentSourceReader = {
      fetch: vi.fn(async () => ({
        content: "# cached",
        etag: null,
        lastModified: null,
        notModified: false,
      })),
    };
    const service = new CloudDocumentCacheService({
      paseoHome,
      logger: createTestLogger(),
      reader,
    });

    const global = await service.resolve({
      scope: "global",
      source: "https://example.com/global",
    });
    const project = await service.resolve({
      scope: "project",
      projectId: "prj_test",
      source: "https://example.com/project",
    });

    expect(global.localPath).toContain(path.join("knowledge", "cloud-documents"));
    expect(project.localPath).toContain(path.join("prj_test", "knowledge", "cloud-documents"));
    expect(readFileSync(global.localPath!, "utf8")).toBe("# cached");
    expect(readFileSync(project.localPath!, "utf8")).toBe("# cached");
  });

  it("uses a fresh cache without downloading again", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-cloud-cache-fresh-"));
    roots.push(paseoHome);
    const fetch = vi.fn(async () => ({
      content: "cached once",
      etag: '"v1"',
      lastModified: null,
      notModified: false,
    }));
    const service = new CloudDocumentCacheService({
      paseoHome,
      logger: createTestLogger(),
      reader: { fetch },
    });
    const target = { scope: "global" as const, source: "https://example.com/fresh" };

    await service.resolve(target);
    await service.resolve(target);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("downloads a replacement when a status check finds the local cache missing", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-cloud-cache-missing-"));
    roots.push(paseoHome);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        content: "first copy",
        etag: '"v1"',
        lastModified: null,
        notModified: false,
      })
      .mockResolvedValueOnce({
        content: "replacement copy",
        etag: '"v2"',
        lastModified: null,
        notModified: false,
      });
    const service = new CloudDocumentCacheService({
      paseoHome,
      logger: createTestLogger(),
      reader: { fetch },
    });
    const target = { scope: "global" as const, source: "https://example.com/missing" };
    const initial = await service.resolve(target);
    unlinkSync(initial.localPath!);

    const status = await service.getStatus(target);

    expect(status).toMatchObject({
      cached: true,
      stale: false,
      error: null,
    });
    expect(readFileSync(status.localPath!, "utf8")).toBe("replacement copy");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("downloads a replacement when cached content fails its integrity check", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-cloud-cache-corrupt-"));
    roots.push(paseoHome);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        content: "valid copy",
        etag: '"v1"',
        lastModified: null,
        notModified: false,
      })
      .mockResolvedValueOnce({
        content: "replacement copy",
        etag: '"v2"',
        lastModified: null,
        notModified: false,
      });
    const service = new CloudDocumentCacheService({
      paseoHome,
      logger: createTestLogger(),
      reader: { fetch },
    });
    const target = { scope: "global" as const, source: "https://example.com/corrupt" };
    const initial = await service.resolve(target);
    writeFileSync(initial.localPath!, "damaged local content");

    const resolved = await service.resolve(target);

    expect(resolved).toMatchObject({
      cached: true,
      content: "replacement copy",
      stale: false,
      error: null,
    });
    expect(readFileSync(resolved.localPath!, "utf8")).toBe("replacement copy");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports a replacement download failure instead of leaving status pending", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-cloud-cache-repair-error-"));
    roots.push(paseoHome);
    const fetch = vi.fn(async () => {
      throw new Error("download failed");
    });
    const service = new CloudDocumentCacheService({
      paseoHome,
      logger: createTestLogger(),
      reader: { fetch },
    });

    const status = await service.getStatus({
      scope: "global",
      source: "https://example.com/unavailable",
    });

    expect(status).toMatchObject({
      cached: false,
      stale: true,
      error: "download failed",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps stale content and reports authentication when refresh needs login", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-cloud-cache-auth-"));
    roots.push(paseoHome);
    let now = new Date("2026-08-20T00:00:00.000Z");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        content: "last known content",
        etag: null,
        lastModified: null,
        notModified: false,
      })
      .mockRejectedValueOnce(
        new CloudDocumentAuthenticationError({
          kind: "authentication_required",
          source: "https://example.com/private",
          message: "login required",
          loginUrl: "https://example.com/login",
          authCommand: null,
        }),
      );
    const service = new CloudDocumentCacheService({
      paseoHome,
      logger: createTestLogger(),
      reader: { fetch },
      now: () => now,
    });
    const target = { scope: "global" as const, source: "https://example.com/private" };

    await service.resolve(target);
    now = new Date("2026-08-22T00:00:00.000Z");
    const resolved = await service.resolve(target);

    expect(resolved.content).toBe("last known content");
    expect(resolved.stale).toBe(true);
    expect(resolved.authIssue?.kind).toBe("authentication_required");
  });
});
