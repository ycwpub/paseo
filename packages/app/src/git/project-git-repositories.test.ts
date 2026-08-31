import { describe, expect, it } from "vitest";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import {
  resolveProjectGitRepositoryCandidates,
  resolveRepositoryFocusPath,
  selectRepositoryRootForFocus,
} from "./project-git-repositories";

function workspace(overrides: Partial<WorkspaceDescriptor> = {}): WorkspaceDescriptor {
  return {
    id: "workspace-1",
    projectId: "project-1",
    projectDisplayName: "多仓库项目",
    projectRootPath: "/Users/test/.paseo/projects/project-1",
    workspaceDirectory: "/Users/test/.paseo/projects/project-1/workspaces/workspace-1",
    projectKind: "directory",
    workspaceKind: "directory",
    name: "默认 Workspace",
    status: "done",
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    scripts: [],
    ...overrides,
  };
}

describe("Project Git repositories", () => {
  it("uses all Project directories and keeps the workspace directory as a compatibility candidate", () => {
    expect(
      resolveProjectGitRepositoryCandidates({
        workspace: workspace(),
        projectConfig: {
          directoryMode: "multiple",
          directories: {
            project: ["/repo/ledger", "/repo/charge"],
          },
        },
      }).map((repository) => repository.root),
    ).toEqual([
      "/repo/ledger",
      "/repo/charge",
      "/Users/test/.paseo/projects/project-1/workspaces/workspace-1",
    ]);
  });

  it("deduplicates roots and disambiguates repositories with the same directory name", () => {
    const repositories = resolveProjectGitRepositoryCandidates({
      workspace: workspace({ workspaceDirectory: "/repo/a/service" }),
      projectConfig: {
        directoryMode: "multiple",
        directories: {
          project: ["/repo/a/service/", "/repo/b/service"],
        },
      },
    });
    expect(repositories).toEqual([
      { root: "/repo/a/service", label: "/repo/a/service", pathLabel: "/repo/a/service" },
      { root: "/repo/b/service", label: "/repo/b/service", pathLabel: "/repo/b/service" },
    ]);
  });

  it("includes Git repositories managed under the Project repos directory", () => {
    expect(
      resolveProjectGitRepositoryCandidates({
        workspace: workspace(),
        projectConfig: {
          directoryMode: "multiple",
          directories: {
            project: [],
          },
          knowledge: {
            general: [
              {
                type: "local-directory",
                source: "{{projectRoot}}/repos/ledger_platform",
              },
              {
                type: "git-repository",
                source: "git@example.com:team/settle_fee.git",
                branch: "main",
              },
              {
                type: "local-directory",
                source: "/Users/test/reference-docs",
              },
            ],
          },
        },
      }).map((repository) => repository.root),
    ).toEqual([
      "/Users/test/.paseo/projects/project-1/repos/ledger_platform",
      "/Users/test/.paseo/projects/project-1/repos/settle_fee",
      "/Users/test/.paseo/projects/project-1/workspaces/workspace-1",
    ]);
  });

  it("selects the requested repository, then the repository containing an absolute focus path", () => {
    const repositoryRoots = ["/repo/service-a", "/repo/service-b"];
    expect(
      selectRepositoryRootForFocus({
        repositoryRoots,
        requestedRoot: "/repo/service-b/",
        focusPath: "/repo/service-a/src/index.ts",
      }),
    ).toBe("/repo/service-b");
    expect(
      selectRepositoryRootForFocus({
        repositoryRoots,
        focusPath: "/repo/service-a/src/index.ts",
      }),
    ).toBe("/repo/service-a");
  });

  it("converts absolute focused files back to repository-relative Diff paths", () => {
    expect(
      resolveRepositoryFocusPath({
        repositoryRoot: "/repo/service-a",
        focusPath: "/repo/service-a/src/index.ts",
      }),
    ).toBe("src/index.ts");
  });
});
