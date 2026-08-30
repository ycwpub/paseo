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
    activity: { type: "created", count: items.length },
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

function user(id: string, text: string): StreamItem {
  return {
    kind: "user_message",
    id,
    text,
    timestamp: new Date(1),
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
      {
        id: "document:/repo/src/app.ts",
        label: "src/app.ts",
        kind: "document",
        target: "/repo/src/app.ts",
      },
    ]);
  });

  it("uses the current user request as a running fallback todo", () => {
    const summary = buildTaskSummary(
      [
        user("request-1", "旧任务"),
        todo("todo-1", [{ text: "旧待办", completed: true }]),
        user("request-2", "修复任务摘要为空的问题"),
        tool("edit-1", "apply_patch", { type: "edit", filePath: "/repo/src/app.ts" }),
      ],
      { cwd: "/repo", isRunning: true },
    );

    expect(summary.todos).toEqual([
      {
        id: "inferred-todo:request-2:0",
        text: "修复任务摘要为空的问题",
        completed: false,
      },
    ]);
  });

  it("splits list-shaped user requests into inferred todos", () => {
    const summary = buildTaskSummary([user("request-1", "1. 修复待办\n2. 补充参考信息")], {
      isRunning: false,
    });

    expect(summary.todos).toEqual([
      { id: "inferred-todo:request-1:0", text: "修复待办", completed: true },
      { id: "inferred-todo:request-1:1", text: "补充参考信息", completed: true },
    ]);
  });

  it("collects links from the request and files consulted by search and shell tools", () => {
    const summary = buildTaskSummary(
      [
        user("request-1", "参考 https://example.com/design，完成实现"),
        tool("search-1", "Grep", {
          type: "search",
          query: "task summary",
          filePaths: ["/repo/src/model.ts"],
        }),
        tool("shell-1", "Shell", {
          type: "shell",
          command: "cd /repo && sed -n '1,90p' docs/design.md",
          cwd: "/repo",
        }),
      ],
      { cwd: "/repo", isRunning: true },
    );

    expect(summary.references).toEqual([
      {
        id: "link:https://example.com/design",
        label: "https://example.com/design",
        kind: "link",
        target: "https://example.com/design",
      },
      {
        id: "document:/repo/src/model.ts",
        label: "src/model.ts",
        kind: "document",
        target: "/repo/src/model.ts",
      },
      {
        id: "document:docs/design.md",
        label: "docs/design.md",
        kind: "document",
        target: "docs/design.md",
      },
    ]);
  });
});
