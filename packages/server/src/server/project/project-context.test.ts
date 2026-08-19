import path from "node:path";
import os from "node:os";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { buildProjectContextPrompt, resolveProjectDirectories } from "./project-context.js";

describe("resolveProjectDirectories", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses existing cross-agent knowledge defaults and a workspace-scoped data default", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "paseo-project-context-"));
    roots.push(root);
    const workspaceDirectory = path.join(root, "worktree");
    mkdirSync(path.join(workspaceDirectory, ".claude"), { recursive: true });
    mkdirSync(path.join(workspaceDirectory, ".codex"));

    expect(
      resolveProjectDirectories({
        projectRoot: root,
        workspaceId: "wks_default",
        workspaceDirectory,
        projectConfig: undefined,
      }),
    ).toEqual({
      project: [workspaceDirectory],
      knowledge: [
        path.join(workspaceDirectory, ".claude"),
        path.join(workspaceDirectory, ".codex"),
      ],
      indexSkill: [],
      workspaceData: [path.join(os.homedir(), ".paseo/workspaces/wks_default")],
    });
  });

  it("resolves relative paths and uses the project root when project directories are empty", () => {
    const root = path.resolve("/repo/app");
    expect(
      resolveProjectDirectories({
        projectRoot: root,
        workspaceId: "wks_1",
        workspaceDirectory: path.join(root, "worktree"),
        projectConfig: {
          directories: {
            knowledge: ["docs/rules"],
            indexSkill: [".paseo/index"],
            workspaceData: [".paseo/workspaces"],
          },
        },
      }),
    ).toEqual({
      project: [path.join(root, "worktree")],
      knowledge: [path.join(root, "docs/rules")],
      indexSkill: [path.join(root, ".paseo/index")],
      workspaceData: [path.join(root, ".paseo/workspaces", "wks_1")],
    });
  });

  it("supports workspace and project variables in configured paths", () => {
    const root = path.resolve("/repo/app");
    const resolved = resolveProjectDirectories({
      projectRoot: root,
      workspaceId: "wks_2",
      workspaceDirectory: path.join(root, "feature"),
      variables: { team: "payments" },
      projectConfig: {
        directories: {
          project: ["packages/{{team}}"],
          workspaceData: [".paseo/{{workspaceId}}"],
        },
      },
    });

    expect(resolved.project).toEqual([path.join(root, "packages/payments")]);
    expect(resolved.workspaceData).toEqual([path.join(root, ".paseo/wks_2")]);
  });

  it("does not auto-add AI knowledge directories in multiple-directory mode", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "paseo-project-context-multi-"));
    roots.push(root);
    const source = path.join(root, "source");
    mkdirSync(path.join(source, ".claude"), { recursive: true });

    expect(
      resolveProjectDirectories({
        projectRoot: root,
        workspaceId: "wks_multi",
        workspaceDirectory: source,
        projectConfig: {
          directoryMode: "multiple",
          directories: {
            project: ["source"],
            knowledge: [],
          },
        },
      }).knowledge,
    ).toEqual([]);
  });
});

describe("buildProjectContextPrompt", () => {
  it("marks knowledge directories as mandatory and index skills as preferred", () => {
    const prompt = buildProjectContextPrompt({
      projectId: "prj_1",
      projectName: "Payments",
      workspaceId: "wks_1",
      workspaceDirectory: "/repo/worktree",
      directories: {
        project: ["/repo"],
        knowledge: ["/repo/docs/rules"],
        indexSkill: ["/repo/.paseo/index"],
        workspaceData: ["/repo/.paseo/workspaces/wks_1"],
      },
    });

    expect(prompt).toContain("Project ID: prj_1");
    expect(prompt).toContain("Primary working directory: /repo/worktree");
    expect(prompt).toContain("All Project directories listed below are writable repositories");
    expect(prompt).toContain("do not assume the primary working directory is the only writable");
    expect(prompt).toContain("MUST inspect and obey");
    expect(prompt).toContain("read the applicable SKILL.md");
    expect(prompt).toContain("Record durable progress");
  });
});
