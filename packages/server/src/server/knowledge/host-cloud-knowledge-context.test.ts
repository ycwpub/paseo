import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { CloudDocumentCacheService } from "./cloud-cache/service.js";
import { buildHostKnowledgePromptWithCloudCache } from "./host-cloud-knowledge-context.js";

describe("global cloud knowledge context", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("downloads a missing standard cache before building the Agent prompt", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-host-cloud-knowledge-"));
    roots.push(paseoHome);
    const source = "https://example.com/standards";
    const fetch = vi.fn(async () => ({
      content: "Always verify the targeted behavior.",
      etag: null,
      lastModified: null,
      notModified: false,
    }));
    const service = new CloudDocumentCacheService({
      paseoHome,
      logger: createTestLogger(),
      reader: { fetch },
    });

    const prompt = await buildHostKnowledgePromptWithCloudCache({
      paseoHome,
      knowledge: {
        standards: [{ type: "cloud-document", source }],
      },
      service,
      logger: createTestLogger(),
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(prompt).toContain("Always verify the targeted behavior.");
    expect(prompt).not.toContain("local cache unavailable");
    const status = await service.getStatus({ scope: "global", source });
    expect(status.localPath).not.toBeNull();
    expect(existsSync(status.localPath!)).toBe(true);
    expect(readFileSync(status.localPath!, "utf8")).toBe("Always verify the targeted behavior.");
  });
});
