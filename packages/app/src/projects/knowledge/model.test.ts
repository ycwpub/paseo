import { describe, expect, it } from "vitest";
import {
  createProjectKnowledgeResourceDraft,
  projectKnowledgeDraftError,
  projectKnowledgeDraftToConfig,
  projectKnowledgeToDraft,
} from "./model";

describe("Project knowledge model", () => {
  it("migrates legacy directories and Lark links into general knowledge", () => {
    const draft = projectKnowledgeToDraft({
      directories: {
        knowledge: ["docs"],
        reference: [{ path: "../shared", enabled: false }],
      },
      larkDocumentLinks: ["https://example.feishu.cn/wiki/architecture"],
    });

    expect(draft.general.map(({ type, source, enabled }) => ({ type, source, enabled }))).toEqual([
      { type: "local-directory", source: "docs", enabled: true },
      { type: "local-directory", source: "../shared", enabled: false },
      {
        type: "cloud-document",
        source: "https://example.feishu.cn/wiki/architecture",
        enabled: true,
      },
    ]);
  });

  it("writes all three knowledge sections", () => {
    const config = projectKnowledgeDraftToConfig({
      general: [
        createProjectKnowledgeResourceDraft({
          type: "local-directory",
          source: " docs ",
        }),
      ],
      standards: [
        createProjectKnowledgeResourceDraft({
          type: "local-document",
          source: " rules.md ",
        }),
      ],
      projectSpecific: [
        createProjectKnowledgeResourceDraft({
          type: "cloud-document",
          source: " https://example.com/domain ",
        }),
      ],
    });

    expect(config).toEqual({
      general: [{ type: "local-directory", source: "docs", enabled: true }],
      standards: [{ type: "local-document", source: "rules.md", enabled: true }],
      projectSpecific: [
        { type: "cloud-document", source: "https://example.com/domain", enabled: true },
      ],
    });
  });

  it("reports the exact invalid section and row", () => {
    expect(
      projectKnowledgeDraftError({
        general: [],
        standards: [
          createProjectKnowledgeResourceDraft({
            type: "cloud-document",
            source: "not-a-url",
          }),
        ],
        projectSpecific: [],
      }),
    ).toBe("规范知识第 1 项不是有效的 HTTP/HTTPS 云文档链接");
  });
});
