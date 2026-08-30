import { describe, expect, it } from "vitest";
import {
  createWorkingDiffTarget,
  normalizeWorkingDiffRepositoryRoot,
  resolveWorkingDiffFilePath,
  resolveWorkingDiffRepositoryRoot,
} from "./working-diff-repository";

describe("working Diff repository routing", () => {
  it("normalizes repository roots without breaking filesystem roots", () => {
    expect(normalizeWorkingDiffRepositoryRoot(" /project/repos/service-a/ ")).toBe(
      "/project/repos/service-a",
    );
    expect(normalizeWorkingDiffRepositoryRoot("/")).toBe("/");
    expect(normalizeWorkingDiffRepositoryRoot("C:\\")).toBe("C:/");
  });

  it("uses the repository carried by a turn-level Diff target", () => {
    expect(
      resolveWorkingDiffRepositoryRoot({
        target: {
          kind: "working_diff",
          cwd: "/project/repos/ledger",
          focusPath: "domain/billing.go",
        },
        workspaceRoot: "/project",
      }),
    ).toBe("/project/repos/ledger");
  });

  it("keeps the workspace directory for the ordinary Changes view", () => {
    expect(
      resolveWorkingDiffRepositoryRoot({
        target: { kind: "changes_tree" },
        workspaceRoot: "/single-repository",
      }),
    ).toBe("/single-repository");
  });

  it("keeps repository identity when navigating between changed files", () => {
    expect(
      createWorkingDiffTarget({
        repositoryRoot: "/project/repos/service-a",
        path: "src/index.ts",
        focusRequestId: 42,
      }),
    ).toEqual({
      kind: "working_diff",
      cwd: "/project/repos/service-a",
      focusPath: "src/index.ts",
      focusRequestId: 42,
    });
  });

  it("opens files from nested repositories by absolute path", () => {
    expect(
      resolveWorkingDiffFilePath({
        repositoryRoot: "/project/repos/service-b",
        workspaceRoot: "/project",
        path: "src/index.ts",
      }),
    ).toBe("/project/repos/service-b/src/index.ts");
  });

  it("opens repository files by absolute path while workspace metadata is loading", () => {
    expect(
      resolveWorkingDiffFilePath({
        repositoryRoot: "/project/repos/service-a",
        workspaceRoot: null,
        path: "src/index.ts",
      }),
    ).toBe("/project/repos/service-a/src/index.ts");
  });

  it("routes identical relative paths to their own repositories", () => {
    const path = "src/index.ts";

    expect(
      ["/project/repos/service-a", "/project/repos/service-b"].map((repositoryRoot) =>
        resolveWorkingDiffFilePath({
          repositoryRoot,
          workspaceRoot: "/project",
          path,
        }),
      ),
    ).toEqual(["/project/repos/service-a/src/index.ts", "/project/repos/service-b/src/index.ts"]);
  });

  it("keeps single-repository file paths relative", () => {
    expect(
      resolveWorkingDiffFilePath({
        repositoryRoot: "/project",
        workspaceRoot: "/project/",
        path: "src/index.ts",
      }),
    ).toBe("src/index.ts");
  });
});
