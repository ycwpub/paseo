import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { PaseoMemoryState } from "@getpaseo/protocol/messages";
import { buildMemoryAgentSystemPrompt, MemoryAgentIndex } from "./memory-agent-index.js";

const state: PaseoMemoryState = {
  settings: {
    enabled: true,
    autoExtract: true,
    maxInjectedChars: 8_000,
    maxRetrievedDetails: 2,
  },
  activeUserId: "default",
  summary: "Prefer concise Chinese answers.",
  summaryPath: "/tmp/memory/users/default/summary.md",
  details: [
    {
      id: "build",
      title: "Build workflow",
      category: "procedure",
      keywords: ["build", "restart"],
      path: "/tmp/memory/details/build.md",
      charCount: 45,
      content: "Build, install, restart, test, then commit.",
      confidence: 1,
      sourceAgentIds: ["agent-1"],
      scope: { type: "project", id: "project-1" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastAccessedAt: null,
    },
    {
      id: "hidden",
      title: "Hidden workflow",
      category: "procedure",
      keywords: ["hidden"],
      path: "/tmp/memory/details/hidden.md",
      charCount: 20,
      content: "This belongs to another project.",
      confidence: 1,
      sourceAgentIds: ["agent-1"],
      scope: { type: "project", id: "project-2" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastAccessedAt: null,
    },
  ],
  stats: {
    detailCount: 2,
    pendingExtractions: 0,
    lastExtractedAt: null,
    lastExtractionError: null,
  },
};

describe("MemoryAgentIndex", () => {
  test("writes only visible memory metadata and file paths", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-memory-index-"));
    const index = new MemoryAgentIndex(paseoHome);
    const indexPath = index.write({
      agentId: "agent-1",
      state,
      enabled: true,
      scopes: [
        { type: "global", id: "default" },
        { type: "project", id: "project-1" },
      ],
    });

    expect(existsSync(indexPath)).toBe(true);
    const content = readFileSync(indexPath, "utf8");
    expect(content).toContain(state.summaryPath);
    expect(content).toContain("/tmp/memory/details/build.md");
    expect(content).not.toContain("/tmp/memory/details/hidden.md");
    expect(content).not.toContain("Prefer concise Chinese answers.");
    expect(content).not.toContain("Build, install, restart, test, then commit.");
  });

  test("puts only the index path and usage guidance in the system prompt", () => {
    const prompt = buildMemoryAgentSystemPrompt("/tmp/memory/agent-indexes/agent-1.md");
    expect(prompt).toContain("Memory index path: /tmp/memory/agent-indexes/agent-1.md");
    expect(prompt).toContain("Do not read memory by default");
    expect(prompt).not.toContain("Build workflow");
  });
});
