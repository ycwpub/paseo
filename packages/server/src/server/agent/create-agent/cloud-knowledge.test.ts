import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AssistantSchema } from "@getpaseo/protocol/messages";
import { createTestLogger } from "../../../test-utils/test-logger.js";
import type { AgentSessionConfig } from "../agent-sdk-types.js";
import { CloudDocumentCacheService } from "../../knowledge/cloud-cache/service.js";
import { prepareAgentCloudKnowledge } from "./cloud-knowledge.js";

describe("prepareAgentCloudKnowledge", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("refreshes cloud knowledge for the selected Assistant", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-assistant-cloud-knowledge-"));
    roots.push(paseoHome);
    const fetch = vi.fn(async () => ({
      content: "# Assistant standard",
      etag: null,
      lastModified: null,
      notModified: false,
    }));
    const service = new CloudDocumentCacheService({
      paseoHome,
      logger: createTestLogger(),
      reader: { fetch },
    });
    const assistant = AssistantSchema.parse({
      id: "assistant-1",
      name: "Reviewer",
      prompt: "Review.",
      memoryEnabled: false,
      memory: "",
      knowledge: {
        standards: [
          {
            type: "cloud-document",
            source: "https://example.com/assistant-standard",
          },
        ],
      },
      createdAt: "2026-08-29T00:00:00.000Z",
      updatedAt: "2026-08-29T00:00:00.000Z",
    });

    const result = await prepareAgentCloudKnowledge({
      config: { cwd: paseoHome, provider: "mock" } as AgentSessionConfig,
      paseoHome,
      service,
      assistant,
      logger: createTestLogger(),
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.authorizationRequests).toEqual([]);
  });
});
