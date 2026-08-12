import { describe, expect, it } from "vitest";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import type { StreamItem } from "@/types/stream";
import { collectTurnChangedPaths, selectTurnChangedFiles } from "./turn-changes-model";

const at = new Date("2026-08-12T08:00:00.000Z");

function edit(id: string, filePath: string): StreamItem {
  return {
    kind: "tool_call",
    id,
    timestamp: at,
    payload: {
      source: "agent",
      data: {
        provider: "codex",
        callId: id,
        name: "apply_patch",
        status: "completed",
        error: null,
        detail: { type: "edit", filePath },
      },
    },
  };
}

function shell(id: string): StreamItem {
  return {
    kind: "tool_call",
    id,
    timestamp: at,
    payload: {
      source: "agent",
      data: {
        provider: "codex",
        callId: id,
        name: "exec_command",
        status: "completed",
        error: null,
        detail: { type: "shell", command: "apply_patch" },
      },
    },
  };
}

function file(path: string): ParsedDiffFile {
  return {
    path,
    isNew: false,
    isDeleted: false,
    additions: 1,
    deletions: 1,
    hunks: [],
  };
}

describe("turn changes", () => {
  it("normalizes absolute edit paths to workspace-relative paths", () => {
    expect(
      collectTurnChangedPaths(
        [edit("1", "/Users/bytedance/paseo/paseo/CLAUDE.md")],
        "/Users/bytedance/paseo/paseo",
      ),
    ).toEqual(new Set(["CLAUDE.md"]));
  });

  it("filters the current diff to files explicitly edited in the turn", () => {
    const selected = selectTurnChangedFiles({
      items: [edit("1", "/workspace/src/a.ts")],
      files: [file("src/a.ts"), file("src/b.ts")],
      cwd: "/workspace",
    });

    expect(selected.map((entry) => entry.path)).toEqual(["src/a.ts"]);
  });

  it("uses the current diff when an opaque shell call may have changed files", () => {
    const files = [file("src/a.ts"), file("src/b.ts")];
    expect(selectTurnChangedFiles({ items: [shell("1")], files, cwd: "/workspace" })).toBe(files);
  });

  it("does not attach unrelated workspace changes to a turn without mutation calls", () => {
    expect(
      selectTurnChangedFiles({
        items: [],
        files: [file("src/a.ts")],
        cwd: "/workspace",
      }),
    ).toEqual([]);
  });
});
