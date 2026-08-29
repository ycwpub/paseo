import { describe, expect, test } from "vitest";
import type { PaseoMemoryDetail } from "@getpaseo/protocol/messages";
import { memoryStoragePaths } from "./memory-storage-paths";

function detail(input: Partial<PaseoMemoryDetail> = {}): PaseoMemoryDetail {
  return {
    id: "memory-1",
    title: "常用命令",
    category: "procedure",
    keywords: [],
    path: "/tmp/global/memory-1.md",
    charCount: 4,
    content: "内容",
    confidence: 1,
    sourceAgentIds: [],
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    lastAccessedAt: null,
    ...input,
  };
}

describe("memoryStoragePaths", () => {
  test("returns every unique file path used by a multi-scope memory", () => {
    expect(
      memoryStoragePaths(
        detail({
          scopeDocuments: [
            { scope: { type: "global", id: "default" }, path: "/tmp/global/memory-1.md" },
            { scope: { type: "project", id: "prj_1" }, path: "/tmp/project/memory-1.md" },
            { scope: { type: "assistant", id: "assistant-1" }, path: "  " },
          ],
        }),
      ),
    ).toEqual(["/tmp/global/memory-1.md", "/tmp/project/memory-1.md"]);
  });
});
