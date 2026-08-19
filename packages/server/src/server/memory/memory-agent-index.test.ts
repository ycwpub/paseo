import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { PaseoMemoryState } from "@getpaseo/protocol/messages";
import { buildMemoryAgentSystemPrompt, MemoryAgentIndex } from "./memory-agent-index.js";

function createState(paseoHome: string): PaseoMemoryState {
  const memoryRoot = path.join(paseoHome, "memory");
  return {
    settings: {
      enabled: true,
      autoExtract: true,
      maxInjectedChars: 8_000,
      maxRetrievedDetails: 2,
    },
    activeUserId: "default",
    summary: "Prefer concise Chinese answers.",
    summaryPath: path.join(memoryRoot, "users", "default", "summary.md"),
    details: [
      {
        id: "build",
        title: "Build workflow",
        category: "procedure",
        keywords: ["build", "restart"],
        path: path.join(memoryRoot, "details", "build.md"),
        charCount: 260,
        content:
          "Build, install, restart, test, then commit. Verify the packaged application and daemon behavior before recording the final result. Keep diagnostic logs when a step fails so the next run can identify the root cause without repeating the entire investigation.",
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
        path: path.join(memoryRoot, "details", "hidden.md"),
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
}

describe("MemoryAgentIndex", () => {
  test("writes only visible memory summaries and relative paths", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-memory-index-"));
    const index = new MemoryAgentIndex(paseoHome);
    const state = createState(paseoHome);
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
    expect(content).toContain('"../users/default/summary.md"');
    expect(content).toContain('"../details/build.md"');
    expect(content).not.toContain("hidden.md");
    expect(content).not.toContain(state.summaryPath);
    expect(content).not.toContain(state.details[0]!.path);
    expect(content).toContain("Build, install, restart, test, then commit.");
    expect(content).not.toContain("Prefer concise Chinese answers.");
    expect(content).not.toContain("repeating the entire investigation.");
  });

  test("puts only the total memory path and usage guidance in the system prompt", () => {
    const prompt = buildMemoryAgentSystemPrompt("/tmp/memory/agent-indexes/agent-1.md");
    expect(prompt).toContain("Total memory document path: /tmp/memory/agent-indexes/agent-1.md");
    expect(prompt).toContain("read the total memory document first");
    expect(prompt).not.toContain("Build workflow");
  });
});
