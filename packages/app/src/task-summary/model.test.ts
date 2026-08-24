import { describe, expect, it } from "vitest";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import type { StreamItem } from "@/types/stream";
import { buildTaskSummary } from "./model";

function todo(id: string, items: Array<{ text: string; completed: boolean }>): StreamItem {
  return {
    kind: "todo_list",
    id,
    provider: "codex",
    timestamp: new Date(1),
    items,
  };
}

function tool(id: string, name: string, detail: ToolCallDetail): StreamItem {
  return {
    kind: "tool_call",
    id,
    timestamp: new Date(1),
    payload: {
      source: "agent",
      data: {
        provider: "codex",
        callId: id,
        name,
        status: "completed",
        error: null,
        detail,
      },
    },
  };
}

describe("buildTaskSummary", () => {
  it("uses the latest todo snapshot", () => {
    const summary = buildTaskSummary([
      todo("todo-1", [{ text: "旧任务", completed: false }]),
      todo("todo-2", [
        { text: "设计", completed: true },
        { text: "实现", completed: false },
      ]),
    ]);

    expect(summary.todos).toEqual([
      { id: "todo:设计:1", text: "设计", completed: true },
      { id: "todo:实现:1", text: "实现", completed: false },
    ]);
  });

  it("collects and deduplicates edited and written files", () => {
    const summary = buildTaskSummary(
      [
        tool("edit-1", "apply_patch", { type: "edit", filePath: "/repo/src/app.ts" }),
        tool("write-1", "write", { type: "write", filePath: "/repo/src/new.ts" }),
        tool("edit-2", "apply_patch", { type: "edit", filePath: "/repo/src/app.ts" }),
      ],
      { cwd: "/repo" },
    );

    expect(summary.outputs).toEqual([
      {
        id: "file:/repo/src/app.ts",
        path: "/repo/src/app.ts",
        label: "src/app.ts",
        kind: "file",
      },
      {
        id: "file:/repo/src/new.ts",
        path: "/repo/src/new.ts",
        label: "src/new.ts",
        kind: "file",
      },
    ]);
  });

  it("collects skills, fetched links, search results, and reference documents", () => {
    const summary = buildTaskSummary(
      [
        tool("skill-1", "Skill", {
          type: "plain_text",
          label: "skill-creator",
          icon: "sparkles",
        }),
        tool("fetch-1", "WebFetch", {
          type: "fetch",
          url: "https://example.com/spec",
        }),
        tool("search-1", "WebSearch", {
          type: "search",
          query: "workflow",
          webResults: [
            { title: "Workflow guide", url: "https://example.com/guide" },
            { title: "Workflow guide duplicate", url: "https://example.com/guide" },
          ],
        }),
        tool("read-1", "Read", {
          type: "read",
          filePath: "/repo/docs/design.md",
        }),
        tool("read-2", "Read", {
          type: "read",
          filePath: "/repo/src/app.ts",
        }),
      ],
      { cwd: "/repo" },
    );

    expect(summary.references).toEqual([
      { id: "skill:skill-creator", label: "skill-creator", kind: "skill" },
      {
        id: "link:https://example.com/spec",
        label: "https://example.com/spec",
        kind: "link",
        target: "https://example.com/spec",
      },
      {
        id: "link:https://example.com/guide",
        label: "Workflow guide",
        kind: "link",
        target: "https://example.com/guide",
      },
      {
        id: "document:/repo/docs/design.md",
        label: "docs/design.md",
        kind: "document",
        target: "/repo/docs/design.md",
      },
    ]);
  });
});
