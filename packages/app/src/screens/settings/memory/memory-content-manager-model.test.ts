import { describe, expect, test } from "vitest";
import type { PaseoMemoryDetail } from "@getpaseo/protocol/messages";
import {
  buildMemoryContentTargetOptions,
  memoryDetailMatchesScope,
} from "./memory-content-manager-model";

function detail(id: string, scope: PaseoMemoryDetail["scope"], title = id): PaseoMemoryDetail {
  return {
    id,
    title,
    category: "other",
    keywords: [],
    path: `/tmp/${id}.md`,
    charCount: 4,
    content: "test",
    confidence: 1,
    sourceAgentIds: [],
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    lastAccessedAt: null,
    status: "active",
    scope,
  };
}

describe("memory content manager model", () => {
  test("combines current entities with scope IDs that only exist in stored memories", () => {
    const details = [
      detail("project-memory", { type: "project", id: "project-1" }),
      detail("removed-project-memory", { type: "project", id: "project-removed" }),
      detail("workspace-memory", { type: "workspace", id: "workspace-1" }),
    ];

    expect(
      buildMemoryContentTargetOptions({
        projects: [{ id: "project-1", label: "Paseo" }],
        workspaces: [{ id: "workspace-1", label: "feature/memory" }],
        assistants: [{ id: "assistant-1", label: "开发助手" }],
        details,
      }),
    ).toEqual({
      project: [
        {
          id: "project-1",
          label: "Paseo",
          scope: { type: "project", id: "project-1" },
          memoryCount: 1,
        },
        {
          id: "project-removed",
          label: "project-removed",
          scope: { type: "project", id: "project-removed" },
          memoryCount: 1,
        },
      ],
      workspace: [
        {
          id: "workspace-1",
          label: "feature/memory",
          scope: { type: "workspace", id: "workspace-1" },
          memoryCount: 1,
        },
      ],
      assistant: [
        {
          id: "assistant-1",
          label: "开发助手",
          scope: { type: "assistant", id: "assistant-1" },
          memoryCount: 0,
        },
      ],
    });
  });

  test("matches both scope type and scope id", () => {
    expect(
      memoryDetailMatchesScope(detail("one", { type: "project", id: "project-1" }), {
        type: "project",
        id: "project-1",
      }),
    ).toBe(true);
    expect(
      memoryDetailMatchesScope(detail("two", { type: "project", id: "project-2" }), {
        type: "project",
        id: "project-1",
      }),
    ).toBe(false);
    expect(
      memoryDetailMatchesScope(detail("global", { type: "global", id: "user-1" }), {
        type: "global",
        id: "user-1",
      }),
    ).toBe(true);
  });
});
