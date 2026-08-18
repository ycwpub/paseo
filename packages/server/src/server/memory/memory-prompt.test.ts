import { describe, expect, test } from "vitest";
import type { PaseoMemoryState } from "@getpaseo/protocol/messages";
import { composePromptWithMemory } from "./memory-prompt.js";

const state: PaseoMemoryState = {
  settings: {
    enabled: true,
    autoExtract: true,
    maxInjectedChars: 8_000,
    maxRetrievedDetails: 2,
  },
  summary: "# Paseo memory\n\nPrefer concise Chinese answers.",
  summaryPath: "/tmp/memory/summary.md",
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
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastAccessedAt: null,
    },
  ],
  stats: {
    detailCount: 1,
    pendingExtractions: 0,
    lastExtractedAt: null,
    lastExtractionError: null,
  },
};

describe("composePromptWithMemory", () => {
  test("injects the summary and only relevant detail content", () => {
    const result = composePromptWithMemory("Please build and restart Paseo.", state);
    expect(result).toContain("<paseo-memory>");
    expect(result).toContain("Prefer concise Chinese answers.");
    expect(result).toContain("Build, install, restart, test, then commit.");
    expect(result).toContain("Please build and restart Paseo.");
  });

  test("does not alter prompts when memory is disabled", () => {
    expect(
      composePromptWithMemory("hello", {
        ...state,
        settings: { ...state.settings, enabled: false },
      }),
    ).toBe("hello");
  });
});
