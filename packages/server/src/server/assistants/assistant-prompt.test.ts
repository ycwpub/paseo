import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AssistantSchema } from "@getpaseo/protocol/messages";
import { buildAssistantInitialPrompt } from "./assistant-prompt.js";

describe("buildAssistantInitialPrompt", () => {
  test("injects only the assistant memory overview path, not memory content", () => {
    const assistant = AssistantSchema.parse({
      id: "assistant-1",
      name: "Reviewer",
      description: "Reviews code",
      prompt: "Review carefully.",
      memoryEnabled: true,
      memory: "FULL_DETAIL_SECRET: prefer the internal migration plan.",
      memorySummary:
        "# Assistant memory summary\n\nDetail file index:\n1. detail-001 — Migration plan\n   Path: /tmp/assistant-memory/detail-001.md",
      memoryFiles: {
        summaryPath: "/tmp/assistant-memory/summary.md",
        detailFiles: [
          {
            id: "detail-001",
            title: "Migration plan",
            path: "/tmp/assistant-memory/detail-001.md",
            charCount: 52,
          },
        ],
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const prompt = buildAssistantInitialPrompt(assistant, "Please review this diff.");

    expect(prompt).toContain("Review carefully.");
    expect(prompt).toContain("Assistant memory overview path");
    expect(prompt).toContain("/tmp/assistant-memory/summary.md");
    expect(prompt).not.toContain("/tmp/assistant-memory/detail-001.md");
    expect(prompt).not.toContain("Migration plan");
    expect(prompt).toContain("Please review this diff.");
    expect(prompt).not.toContain("FULL_DETAIL_SECRET");
  });

  test("adds Assistant general and standard knowledge only for the selected Assistant", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-assistant-knowledge-"));
    const standardPath = path.join(paseoHome, "standard.md");
    writeFileSync(standardPath, "# Must follow");
    const assistant = AssistantSchema.parse({
      id: "assistant-knowledge",
      name: "Reviewer",
      prompt: "Review carefully.",
      memoryEnabled: false,
      memory: "",
      knowledge: {
        general: [{ type: "local-directory", source: "references" }],
        standards: [{ type: "local-document", source: standardPath }],
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const prompt = buildAssistantInitialPrompt(assistant, "Review this change.", { paseoHome });

    expect(prompt).toContain("## Assistant knowledge");
    expect(prompt).toContain(path.join(paseoHome, "assistants", assistant.id, "references"));
    expect(prompt).toContain(standardPath);
    expect(prompt).toContain("mandatory");
  });
});
