import { describe, expect, it } from "vitest";
import { createProjectKnowledgeResourceDraft } from "@/projects/knowledge/model";
import {
  hostKnowledgeDraftError,
  hostKnowledgeDraftToConfig,
  hostKnowledgeToDraft,
} from "./host-knowledge-model";

describe("Host knowledge model", () => {
  it("round-trips general and standard knowledge without Project-only knowledge", () => {
    const draft = hostKnowledgeToDraft({
      general: [{ type: "local-directory", source: "shared" }],
      standards: [{ type: "cloud-document", source: "https://example.com/standard" }],
    });

    expect(hostKnowledgeDraftToConfig(draft)).toEqual({
      general: [{ type: "local-directory", source: "shared", enabled: true }],
      standards: [
        {
          type: "cloud-document",
          source: "https://example.com/standard",
          enabled: true,
        },
      ],
    });
    expect(draft.projectSpecific).toEqual([]);
  });

  it("validates Host knowledge with the same rules as Project knowledge", () => {
    expect(
      hostKnowledgeDraftError({
        general: [],
        standards: [
          createProjectKnowledgeResourceDraft({
            section: "standards",
            type: "cloud-document",
            source: "not-a-url",
          }),
        ],
        projectSpecific: [],
      }),
    ).toContain("不是有效的 HTTP/HTTPS");
  });
});
