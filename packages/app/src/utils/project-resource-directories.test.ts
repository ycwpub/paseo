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
      reference: [],
      knowledge: [
        "/repo/worktrees/feature/.agents",
        "/repo/worktrees/feature/.agent",
        "/repo/worktrees/feature/.claude",
        "/repo/worktrees/feature/.codex",
        "/repo/worktrees/feature/.trae",
      ],
      indexSkill: [],
      workspaceData: ["~/.paseo/workspaces/wks_test"],
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
        },
      }),
    ).toEqual({
      project: ["/repo/paseo", "/repo/worktrees/feature"],
      reference: ["/repo/legacy", "/opt/company/examples"],
      knowledge: ["/repo/shared/docs"],
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
