import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildHostKnowledgePrompt, resolveHostKnowledge } from "./host-knowledge-context.js";

describe("global knowledge context", () => {
  it("resolves general resources and injects mandatory standards", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-host-knowledge-"));
    writeFileSync(path.join(paseoHome, "standard.md"), "Always run targeted tests.", "utf8");

    const knowledge = resolveHostKnowledge({
      paseoHome,
      knowledge: {
        general: [
          { type: "local-directory", source: "shared" },
          { type: "local-document", source: "overview.md" },
          { type: "cloud-document", source: "https://example.com/background" },
        ],
        standards: [
          { type: "local-document", source: "standard.md" },
          { type: "cloud-document", source: "https://example.com/standards" },
        ],
      },
    });
    const prompt = buildHostKnowledgePrompt(knowledge);

    expect(knowledge.general.directories).toEqual([path.join(paseoHome, "shared")]);
    expect(prompt).toContain("Always run targeted tests.");
    expect(prompt).toContain("https://example.com/standards");
    expect(prompt).toContain("mandatory for every Agent");
    expect(prompt).toContain("<paseo_global_knowledge>");
  });

  it("omits the global knowledge prompt when nothing is configured", () => {
    expect(
      buildHostKnowledgePrompt(
        resolveHostKnowledge({
          paseoHome: "/tmp/paseo",
          knowledge: undefined,
        }),
      ),
    ).toBeUndefined();
  });
});
