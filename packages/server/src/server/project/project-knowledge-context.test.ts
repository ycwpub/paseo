import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildProjectKnowledgePrompt,
  resolveProjectKnowledge,
} from "./project-knowledge-context.js";

describe("Project knowledge context", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("injects standards and project-specific local documents but only lists general documents", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "paseo-project-knowledge-"));
    roots.push(root);
    writeFileSync(path.join(root, "general.md"), "general content");
    writeFileSync(path.join(root, "standards.md"), "must follow this rule");
    writeFileSync(path.join(root, "domain.md"), "domain architecture");

    const knowledge = resolveProjectKnowledge({
      projectConfig: {
        knowledge: {
          general: [
            { type: "local-document", source: "general.md" },
            { type: "cloud-document", source: "https://example.com/general" },
          ],
          standards: [
            { type: "local-document", source: "standards.md" },
            { type: "cloud-document", source: "https://example.com/standards" },
          ],
          projectSpecific: [{ type: "local-document", source: "domain.md" }],
        },
      },
      resolveLocalPath: (source) => path.join(root, source),
    });
    const prompt = buildProjectKnowledgePrompt({
      generalDirectories: [path.join(root, "docs")],
      knowledge,
    });

    expect(prompt).toContain(path.join(root, "general.md"));
    expect(prompt).not.toContain("general content");
    expect(prompt).toContain("must follow this rule");
    expect(prompt).toContain("domain architecture");
    expect(prompt).toContain("https://example.com/standards");
    expect(prompt).toContain("local cache unavailable");
    expect(prompt).toContain("At least one standard document is unavailable");
  });

  it("injects cached cloud standards and only points general knowledge to its cache", () => {
    const knowledge = resolveProjectKnowledge({
      projectConfig: {
        knowledge: {
          general: [{ type: "cloud-document", source: "https://example.com/general" }],
          standards: [{ type: "cloud-document", source: "https://example.com/standards" }],
        },
      },
      resolveLocalPath: (source) => source,
      resolveCloudDocument: (source) => ({
        source,
        cached: true,
        cachedAt: "2026-08-23T00:00:00.000Z",
        checkedAt: "2026-08-23T00:00:00.000Z",
        localPath: `/cache/${source.endsWith("general") ? "general" : "standards"}.md`,
        stale: false,
        content: source.endsWith("standards") ? "cached mandatory rule" : "background",
        error: null,
        authIssue: null,
      }),
    });
    const prompt = buildProjectKnowledgePrompt({ generalDirectories: [], knowledge });

    expect(prompt).toContain("/cache/general.md");
    expect(prompt).not.toContain("\nbackground\n");
    expect(prompt).toContain("cached mandatory rule");
    expect(prompt).not.toContain("At least one standard document is unavailable");
  });

  it("requires the agent to stop when a local standard cannot be read", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "paseo-project-knowledge-missing-"));
    roots.push(root);
    const knowledge = resolveProjectKnowledge({
      projectConfig: {
        knowledge: {
          standards: [{ type: "local-document", source: "missing.md" }],
        },
      },
      resolveLocalPath: (source) => path.join(root, source),
    });

    expect(
      buildProjectKnowledgePrompt({
        generalDirectories: [],
        knowledge,
      }),
    ).toContain("Stop before making changes");
  });
});
