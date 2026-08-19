import { describe, expect, it } from "vitest";
import {
  formatProjectResourceDirectoryPath,
  resolveProjectResourceDirectories,
} from "./project-resource-directories";

const context = {
  projectId: "prj_test",
  projectName: "Paseo",
  projectRoot: "/repo/paseo",
  workspaceId: "wks_test",
  workspaceName: "feature",
  workspaceDirectory: "/repo/worktrees/feature",
};

describe("resolveProjectResourceDirectories", () => {
  it("provides AI knowledge and workspace-data defaults", () => {
    expect(resolveProjectResourceDirectories({ projectConfig: undefined, context })).toEqual({
      project: ["/repo/worktrees/feature"],
      knowledge: [
        "/repo/worktrees/feature/.agents",
        "/repo/worktrees/feature/.agent",
        "/repo/worktrees/feature/.claude",
        "/repo/worktrees/feature/.codex",
        "/repo/worktrees/feature/.trae",
      ],
      indexSkill: [],
      workspaceData: ["~/.paseo/prj_test/workspaces/wks_test"],
    });
  });

  it("resolves multiple configured roots and project variables", () => {
    expect(
      resolveProjectResourceDirectories({
        context,
        projectConfig: {
          directoryMode: "multiple",
          variables: { docs: "../shared/docs" },
          directories: {
            project: [".", "{{workspaceDirectory}}"],
            reference: ["../legacy", "/opt/company/examples"],
            knowledge: ["{{docs}}"],
            indexSkill: [".paseo/index"],
            workspaceData: ["/tmp/paseo"],
          },
          knowledge: {
            general: [
              { type: "local-directory", source: "{{docs}}/background" },
              { type: "local-document", source: "README.md" },
            ],
          },
        },
      }),
    ).toEqual({
      project: ["/repo/paseo", "/repo/worktrees/feature"],
      knowledge: [
        "/repo/shared/docs",
        "/repo/legacy",
        "/opt/company/examples",
        "/repo/shared/docs/background",
      ],
      indexSkill: ["/repo/paseo/.paseo/index"],
      workspaceData: ["/tmp/paseo/wks_test"],
    });
  });
});

describe("formatProjectResourceDirectoryPath", () => {
  it("adds wrap opportunities after path separators", () => {
    expect(formatProjectResourceDirectoryPath("/repo/very-long/folder")).toBe(
      "/\u200Brepo/\u200Bvery-long/\u200Bfolder",
    );
    expect(formatProjectResourceDirectoryPath("C:\\repo\\folder")).toBe(
      "C:\\\u200Brepo\\\u200Bfolder",
    );
  });
});
