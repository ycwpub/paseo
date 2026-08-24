import { describe, expect, it } from "vitest";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import { canUndoTurnChanges, collectTurnChangeUndoPaths } from "./turn-change-undo";

function file(path: string, oldPath?: string): ParsedDiffFile {
  return {
    path,
    ...(oldPath ? { oldPath } : {}),
    isNew: false,
    isDeleted: false,
    additions: 1,
    deletions: 1,
    hunks: [],
  };
}

describe("turn change undo", () => {
  it("allows undo for editable turn files that are still uncommitted", () => {
    expect(
      canUndoTurnChanges({
        readOnly: false,
        files: [file("src/a.ts"), file("src/b.ts")],
        uncommittedPaths: new Set(["src/a.ts", "src/b.ts"]),
      }),
    ).toBe(true);
  });

  it("does not offer a partial undo when a displayed file is no longer uncommitted", () => {
    expect(
      canUndoTurnChanges({
        readOnly: false,
        files: [file("src/a.ts"), file("src/b.ts")],
        uncommittedPaths: new Set(["src/a.ts"]),
      }),
    ).toBe(false);
  });

  it("includes both sides of renamed files in the discard request", () => {
    expect(
      collectTurnChangeUndoPaths([file("src/new.ts", "src/old.ts"), file("src/a.ts")]),
    ).toEqual(["src/new.ts", "src/old.ts", "src/a.ts"]);
  });
});
