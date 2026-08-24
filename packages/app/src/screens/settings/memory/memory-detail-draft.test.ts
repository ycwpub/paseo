import { describe, expect, test } from "vitest";
import type { PaseoMemoryDetail } from "@getpaseo/protocol/messages";
import { memoryDetailDraft, memoryDetailEdit } from "./memory-detail-draft";

function detail(scope: PaseoMemoryDetail["scope"]): PaseoMemoryDetail {
  return {
    id: "memory-1",
    title: "Project convention",
    category: "procedure",
    keywords: ["build"],
    path: "/tmp/memory-1.md",
    charCount: 20,
    content: "Run tests before committing.",
    confidence: 1,
    sourceAgentIds: [],
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    lastAccessedAt: null,
    status: "active",
    scope,
    importance: 0.8,
  };
}

describe("memory detail draft", () => {
  test("preserves the selected Project scope when saving edits", () => {
    const projectDetail = detail({ type: "project", id: "project-1" });
    const draft = {
      ...memoryDetailDraft(projectDetail),
      title: " Updated convention ",
      content: " Run all tests. ",
      keywords: "build, test",
    };

    expect(
      memoryDetailEdit({
        detail: projectDetail,
        draft,
        globalUserId: "user-1",
      }),
    ).toMatchObject({
      id: "memory-1",
      title: "Updated convention",
      content: "Run all tests.",
      keywords: ["build", "test"],
      scope: { type: "project", id: "project-1" },
    });
  });

  test("binds a global memory edit to the active memory user", () => {
    const globalDetail = detail({ type: "global", id: "old-user" });

    expect(
      memoryDetailEdit({
        detail: globalDetail,
        draft: memoryDetailDraft(globalDetail),
        globalUserId: "active-user",
      }).scope,
    ).toEqual({ type: "global", id: "active-user" });
  });

  test("preserves and edits multiple memory scopes", () => {
    const projectDetail = {
      ...detail({ type: "project", id: "project-1" }),
      scopes: [
        { type: "project" as const, id: "project-1" },
        { type: "assistant" as const, id: "assistant-1" },
      ],
    };
    const draft = memoryDetailDraft(projectDetail);
    expect(draft.additionalScopes).toBe("assistant:assistant-1");
    expect(
      memoryDetailEdit({
        detail: projectDetail,
        draft: { ...draft, additionalScopes: `${draft.additionalScopes}, global` },
        globalUserId: "user-1",
      }).scopes,
    ).toEqual([
      { type: "project", id: "project-1" },
      { type: "assistant", id: "assistant-1" },
      { type: "global", id: "user-1" },
    ]);
  });
});
