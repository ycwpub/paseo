import { describe, expect, it } from "vitest";
import { EMPTY_PROJECT_KNOWLEDGE } from "./project-knowledge-context.js";
import { mergeProjectKnowledge } from "./project-knowledge-inheritance.js";

describe("mergeProjectKnowledge", () => {
  it("keeps parent knowledge before child knowledge and removes duplicates", () => {
    const parent = {
      ...EMPTY_PROJECT_KNOWLEDGE,
      general: { localDocuments: ["/parent/general.md"], cloudDocuments: [] },
      standards: {
        localDocuments: [
          { source: "standard.md", resolvedSource: "/parent/standard.md", content: "parent" },
        ],
        cloudDocuments: [],
      },
    };
    const child = {
      ...EMPTY_PROJECT_KNOWLEDGE,
      general: {
        localDocuments: ["/parent/general.md", "/child/general.md"],
        cloudDocuments: [],
      },
      standards: {
        localDocuments: [
          { source: "standard.md", resolvedSource: "/parent/standard.md", content: "parent" },
          { source: "child.md", resolvedSource: "/child/child.md", content: "child" },
        ],
        cloudDocuments: [],
      },
    };

    const merged = mergeProjectKnowledge([parent, child]);
    expect(merged.general.localDocuments).toEqual(["/parent/general.md", "/child/general.md"]);
    expect(merged.standards.localDocuments.map((document) => document.content)).toEqual([
      "parent",
      "child",
    ]);
  });
});
