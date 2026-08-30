import { describe, expect, it } from "vitest";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import {
  resolveFilesPanelDirectoryScopes,
  resolveFilesPanelPath,
} from "./files-panel-directory-scopes";

function workspace(overrides: Partial<WorkspaceDescriptor> = {}): WorkspaceDescriptor {
  return {
    id: "wks_test",
    projectId: "prj_test",
    projectDisplayName: "Paseo",
    projectCustomName: null,
    projectRootPath: "/Users/test/.paseo/projects/prj_test",
    workspaceDirectory: "/Users/test/code/paseo",
    projectKind: "directory",
    workspaceKind: "directory",
    name: "main",
    status: "done",
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    scripts: [],
    ...overrides,
  };
}

describe("resolveFilesPanelDirectoryScopes", () => {
  it("splits the explorer into the five Project-aware directory scopes", () => {
    expect(
      resolveFilesPanelDirectoryScopes({
        workspace: workspace(),
        projectConfig: {
          directoryMode: "multiple",
          directories: {
            project: ["/Users/test/code/api", "/Users/test/code/web"],
            knowledge: ["/Users/test/docs"],
            indexSkill: ["/Users/test/indexes"],
          },
          knowledge: {
            general: [
              { type: "local-directory", source: "/Users/test/shared-knowledge" },
              { type: "cloud-document", source: "https://example.com/doc" },
            ],
          },
        },
      }),
    ).toEqual([
      {
        id: "project",
        label: "Project 目录",
        roots: ["/Users/test/.paseo/projects/prj_test"],
      },
      {
        id: "workspace",
        label: "Workspace 目录",
        roots: ["/Users/test/.paseo/projects/prj_test/workspaces/wks_test"],
      },
      {
        id: "projectDirectories",
        label: "项目目录",
        roots: ["/Users/test/code/api", "/Users/test/code/web"],
      },
      {
        id: "projectKnowledge",
        label: "Project 知识",
        roots: [
          "/Users/test/.paseo/projects/prj_test/knowledge",
          "/Users/test/docs",
          "/Users/test/shared-knowledge",
        ],
      },
      {
        id: "agentKnowledge",
        label: "Agent 知识",
        roots: [
          "/Users/test/indexes",
          "/Users/test/.paseo/projects/prj_test/.agents",
          "/Users/test/.paseo/projects/prj_test/.agent",
          "/Users/test/.paseo/projects/prj_test/.claude",
          "/Users/test/.paseo/projects/prj_test/.codex",
          "/Users/test/.paseo/projects/prj_test/.trae",
        ],
      },
    ]);
  });

  it("uses the absolute managed Workspace path for the default directory", () => {
    const scopes = resolveFilesPanelDirectoryScopes({
      workspace: workspace(),
      projectConfig: {
        directories: {
          workspaceData: [
            "~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}",
            "~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}",
          ],
        },
      },
    });

    expect(scopes.find((scope) => scope.id === "workspace")?.roots).toEqual([
      "/Users/test/.paseo/projects/prj_test/workspaces/wks_test",
    ]);
  });
});

describe("resolveFilesPanelPath", () => {
  const buildAbsolutePath = ({
    workspaceRoot,
    entryPath,
  }: {
    workspaceRoot: string;
    entryPath: string;
  }) => `${workspaceRoot}/${entryPath}`;

  it("keeps workspace-relative paths for the active project directory", () => {
    expect(
      resolveFilesPanelPath({
        root: "/repo/app",
        workspaceDirectory: "/repo/app",
        entryPath: "src/index.ts",
        buildAbsolutePath,
      }),
    ).toBe("src/index.ts");
  });

  it("uses absolute paths for files outside the active project directory", () => {
    expect(
      resolveFilesPanelPath({
        root: "/repo/docs",
        workspaceDirectory: "/repo/app",
        entryPath: "README.md",
        buildAbsolutePath,
      }),
    ).toBe("/repo/docs/README.md");
  });
});
