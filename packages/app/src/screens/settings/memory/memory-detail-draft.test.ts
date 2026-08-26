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
  test("preserves the selected Project or Workspace scope when saving edits", () => {
    const workspaceDetail = detail({ type: "workspace", id: "workspace-1" });
    const draft = {
      ...memoryDetailDraft(workspaceDetail),
      title: " Updated convention ",
      content: " Run all tests. ",
      keywords: "build, test",
    };

    expect(
      memoryDetailEdit({
        detail: workspaceDetail,
        draft,
        globalUserId: "user-1",
      }),
    ).toMatchObject({
      id: "memory-1",
      title: "Updated convention",
      content: "Run all tests.",
      keywords: ["build", "test"],
      scope: { type: "workspace", id: "workspace-1" },
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
});
