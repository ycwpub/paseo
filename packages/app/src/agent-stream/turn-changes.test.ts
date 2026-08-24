import { describe, expect, it } from "vitest";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import type { StreamItem } from "@/types/stream";
import {
  collectTurnChangeCwds,
  collectTurnChangedPaths,
  selectTurnChangedFiles,
  selectVisibleTurnChangedFiles,
  summarizeTurnChangedFiles,
} from "./turn-changes-model";

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

function shell(id: string, cwd?: string): StreamItem {
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
        detail: { type: "shell", command: "apply_patch", ...(cwd ? { cwd } : {}) },
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

  it("uses nested shell working directories to discover repositories in a multi-directory project", () => {
    expect(
      collectTurnChangeCwds(
        [shell("1", "repos/ledger_platform")],
        "/Users/bytedance/.paseo/projects/project-1",
      ),
    ).toEqual(["/Users/bytedance/.paseo/projects/project-1/repos/ledger_platform"]);
  });

  it("discovers repositories from explicit edits under the project repos directory", () => {
    expect(
      collectTurnChangeCwds(
        [edit("1", "repos/ledger_platform/src/index.ts")],
        "/Users/bytedance/.paseo/projects/project-1",
      ),
    ).toEqual(["/Users/bytedance/.paseo/projects/project-1/repos/ledger_platform"]);
  });

  it("keeps repository candidates from both shell commands and explicit edits", () => {
    expect(
      collectTurnChangeCwds(
        [shell("1", "repos/service-a"), edit("2", "repos/service-b/src/index.ts")],
        "/Users/bytedance/.paseo/projects/project-1",
      ),
    ).toEqual([
      "/Users/bytedance/.paseo/projects/project-1/repos/service-a",
      "/Users/bytedance/.paseo/projects/project-1/repos/service-b",
    ]);
  });

  it("filters the current diff to files explicitly edited in the turn", () => {
    const selected = selectTurnChangedFiles({
      items: [edit("1", "/workspace/src/a.ts")],
      files: [file("src/a.ts"), file("src/b.ts")],
      cwd: "/workspace",
    });

    expect(selected.map((entry) => entry.path)).toEqual(["src/a.ts"]);
  });

  it("maps project-relative edit paths into a nested repository diff", () => {
    const selected = selectTurnChangedFiles({
      items: [edit("1", "repos/ledger_platform/src/a.ts")],
      files: [file("src/a.ts"), file("src/b.ts")],
      cwd: "/workspace/repos/ledger_platform",
      sourceCwd: "/workspace",
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

  it("summarizes all changed files for the turn-level review card", () => {
    expect(
      summarizeTurnChangedFiles([
        { ...file("src/a.ts"), additions: 12, deletions: 2 },
        { ...file("src/b.ts"), additions: 4, deletions: 7 },
      ]),
    ).toEqual({
      fileCount: 2,
      additions: 16,
      deletions: 9,
    });
  });

  it("shows a compact file preview until the user expands the review card", () => {
    const files = ["a", "b", "c", "d", "e"].map((path) => file(`${path}.ts`));

    expect(selectVisibleTurnChangedFiles(files, false).map((entry) => entry.path)).toEqual([
      "a.ts",
      "b.ts",
      "c.ts",
    ]);
    expect(selectVisibleTurnChangedFiles(files, true)).toEqual(files);
  });
});
