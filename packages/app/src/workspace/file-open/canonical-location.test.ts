import { describe, expect, it } from "vitest";
import { canonicalizeWorkspaceFileLocation } from "./canonical-location";

describe("canonicalizeWorkspaceFileLocation", () => {
  it.each(["src/app.ts", "/Users/me/repo/src/app.ts", "./src/app.ts", "src/../src/app.ts"])(
    "uses one workspace-relative identity for %s",
    (path) => {
      expect(
        canonicalizeWorkspaceFileLocation({
          location: { path, lineStart: 12, lineEnd: 16 },
          workspaceRoot: "/Users/me/repo",
        }),
      ).toEqual({
        path: "src/app.ts",
        lineStart: 12,
        lineEnd: 16,
      });
    },
  );

  it("keeps a normalized absolute identity for files outside the workspace", () => {
    expect(
      canonicalizeWorkspaceFileLocation({
        location: { path: "/tmp/notes/../result.md" },
        workspaceRoot: "/Users/me/repo",
      }),
    ).toEqual({
      path: "/tmp/result.md",
    });
  });

  it("falls back to basic normalization when no workspace root is available", () => {
    expect(
      canonicalizeWorkspaceFileLocation({
        location: { path: " ./src/app.ts " },
        workspaceRoot: null,
      }),
    ).toEqual({
      path: "./src/app.ts",
    });
  });
});
