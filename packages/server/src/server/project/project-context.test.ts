import path from "node:path";
import os from "node:os";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildProjectContextPrompt,
  loadProjectAgentContext,
  resolveProjectDirectories,
} from "./project-context.js";
import { resolveGlobalProjectConfigPath } from "./project-config-storage.js";
import { resolveManagedProjectStorageRoot } from "./project-storage-paths.js";

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
        projectId: "prj_default",
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
      workspaceData: [
        path.join(os.homedir(), ".paseo/projects/prj_default/workspaces/wks_default"),
      ],
    });
  });

  it("resolves relative paths and uses the project root when project directories are empty", () => {
    const root = path.resolve("/repo/app");
    expect(
      resolveProjectDirectories({
        projectId: "prj_1",
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
    const root = path.resolve("/managed/prj_2");
    const projectDirectory = path.resolve("/repo/app");
    const resolved = resolveProjectDirectories({
      projectId: "prj_2",
      projectRoot: root,
      projectDirectory,
      workspaceId: "wks_2",
      workspaceDirectory: path.join(projectDirectory, "feature"),
      variables: { team: "payments" },
      projectConfig: {
        directories: {
          project: ["packages/{{team}}"],
          reference: ["../{{team}}-legacy"],
          workspaceData: [".paseo/{{workspaceId}}"],
        },
      },
    });

    expect(resolved.project).toEqual([path.join(projectDirectory, "packages/payments")]);
    expect(resolved.knowledge).toEqual([path.resolve(projectDirectory, "../payments-legacy")]);
    expect(resolved.workspaceData).toEqual([path.join(projectDirectory, ".paseo/wks_2")]);
  });

  it("does not auto-add AI knowledge directories in multiple-directory mode", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "paseo-project-context-multi-"));
    roots.push(root);
    const source = path.join(root, "source");
    mkdirSync(path.join(source, ".claude"), { recursive: true });

    expect(
      resolveProjectDirectories({
        projectId: "prj_multi",
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
  it("marks general knowledge directories as optional and index skills as preferred", () => {
    const prompt = buildProjectContextPrompt({
      projectId: "prj_1",
      projectName: "Payments",
      projectRoot: "/managed/projects/prj_1",
      workspaceId: "wks_1",
      workspaceDirectory: "/repo/worktree",
      directories: {
        project: ["/repo"],
        knowledge: ["/repo/docs/rules", "/reference/legacy", "/reference/examples"],
        indexSkill: ["/repo/.paseo/index"],
        workspaceData: ["/repo/.paseo/workspaces/wks_1"],
      },
    });

    expect(prompt).toContain("Project ID: prj_1");
    expect(prompt).toContain("Primary working directory: /repo/worktree");
    expect(prompt).toContain("Project directories are writable source directories");
    expect(prompt).toContain("includes its private Project path");
    expect(prompt).not.toContain("Reference directories");
    expect(prompt).toContain("General knowledge directories");
    expect(prompt).toContain("read on demand");
    expect(prompt).toContain("MUST NOT create, modify, rename, move, or delete");
    expect(prompt).toContain("writable Project directory classification takes precedence");
    expect(prompt).toContain("only when the user explicitly asks to update Project knowledge");
    expect(prompt).toContain("decide whether their guidance applies");
    expect(prompt).toContain("read the applicable SKILL.md");
    expect(prompt).toContain("Record durable progress");
    expect(prompt).toContain("/managed/projects/prj_1/repos");
    expect(prompt).toContain("project.directories.project");
  });
});

describe("loadProjectAgentContext", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("loads a multiple-directory Project config from PASEO_HOME", async () => {
    const paseoHome = mkdtempSync(path.join(os.tmpdir(), "paseo-project-home-"));
    const workspaceDirectory = mkdtempSync(path.join(os.tmpdir(), "paseo-project-workspace-"));
    const sourceDirectory = mkdtempSync(path.join(os.tmpdir(), "paseo-project-source-"));
    roots.push(paseoHome, workspaceDirectory, sourceDirectory);
    const project = {
      projectId: "prj_multiple",
      rootPath: null,
      kind: "non_git" as const,
      displayName: "Multiple",
      customName: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      archivedAt: null,
    };
    const workspace = {
      workspaceId: "wks_multiple",
      projectId: project.projectId,
      cwd: workspaceDirectory,
      kind: "directory" as const,
      displayName: "Workspace",
      title: null,
      branch: null,
      worktreeRoot: null,
      baseBranch: null,
      isPaseoOwnedWorktree: false,
      mainRepoRoot: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      archivedAt: null,
      autoArchivedChangeRequestUrl: null,
      pinnedAt: null,
    };
    const configPath = resolveGlobalProjectConfigPath(paseoHome, project.projectId);
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        project: {
          directoryMode: "multiple",
          directories: { project: [sourceDirectory], reference: [path.join(paseoHome, "docs")] },
          variables: { owner: "payments" },
        },
      }),
    );

    const context = await loadProjectAgentContext({
      workspaceId: workspace.workspaceId,
      paseoHome,
      projectRegistry: { get: async () => project } as never,
      workspaceRegistry: { get: async () => workspace } as never,
      readPluginProjectContext: (projectId) =>
        projectId === project.projectId
          ? [
              "<paseo_plugin_project>",
              "Plugin-project knowledge: settlement rules",
              "Use get_plugin_project and update_plugin_project.",
              "</paseo_plugin_project>",
            ].join("\n")
          : null,
      readSubstituteProjectContext: (projectId) =>
        projectId === project.projectId
          ? [
              "<paseo_lark_substitute_project>",
              "Project capability: lark-substitute-reply",
              "</paseo_lark_substitute_project>",
            ].join("\n")
          : null,
    });

    expect(context?.directories.project).toEqual([
      resolveManagedProjectStorageRoot(paseoHome, project.projectId),
      sourceDirectory,
    ]);
    expect(context?.directories.knowledge).toEqual([path.join(paseoHome, "docs")]);
    expect(context?.variables.owner).toBe("payments");
    expect(context?.prompt).toContain("Plugin-project knowledge: settlement rules");
    expect(context?.prompt).toContain("get_plugin_project");
    expect(context?.prompt).toContain("update_plugin_project");
    expect(context?.prompt).toContain("Project capability: lark-substitute-reply");
  });

  it("classifies unregistered managed repositories as general knowledge", async () => {
    const paseoHome = mkdtempSync(path.join(os.tmpdir(), "paseo-project-repository-home-"));
    const workspaceDirectory = mkdtempSync(
      path.join(os.tmpdir(), "paseo-project-repository-workspace-"),
    );
    roots.push(paseoHome, workspaceDirectory);
    const project = {
      projectId: "prj_repository",
      rootPath: null,
      kind: "non_git" as const,
      displayName: "Repository",
      customName: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      archivedAt: null,
    };
    const workspace = {
      workspaceId: "wks_repository",
      projectId: project.projectId,
      cwd: workspaceDirectory,
      kind: "directory" as const,
      displayName: "Workspace",
      title: null,
      branch: null,
      worktreeRoot: null,
      baseBranch: null,
      isPaseoOwnedWorktree: false,
      mainRepoRoot: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      archivedAt: null,
      autoArchivedChangeRequestUrl: null,
      pinnedAt: null,
    };
    const projectRoot = resolveManagedProjectStorageRoot(paseoHome, project.projectId);
    const repository = path.join(projectRoot, "repos/reference-service");
    mkdirSync(repository, { recursive: true });

    const context = await loadProjectAgentContext({
      workspaceId: workspace.workspaceId,
      paseoHome,
      projectRegistry: { get: async () => project } as never,
      workspaceRegistry: { get: async () => workspace } as never,
    });

    expect(context?.directories.knowledge).toEqual([repository]);
    expect(context?.prompt).toContain(repository);
    expect(
      JSON.parse(
        readFileSync(resolveGlobalProjectConfigPath(paseoHome, project.projectId), "utf8"),
      ),
    ).toMatchObject({
      project: {
        knowledge: {
          general: [
            {
              type: "local-directory",
              source: "{{projectRoot}}/repos/reference-service",
            },
          ],
        },
      },
    });
  });

  it("inherits parent Project knowledge without inheriting parent writable directories", async () => {
    const paseoHome = mkdtempSync(path.join(os.tmpdir(), "paseo-project-parent-home-"));
    const workspaceDirectory = mkdtempSync(
      path.join(os.tmpdir(), "paseo-project-child-workspace-"),
    );
    roots.push(paseoHome, workspaceDirectory);
    const parent = {
      projectId: "prj_parent",
      parentProjectId: null,
      rootPath: null,
      kind: "non_git" as const,
      displayName: "Parent",
      customName: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      archivedAt: null,
    };
    const child = {
      ...parent,
      projectId: "prj_child",
      parentProjectId: parent.projectId,
      displayName: "Child",
    };
    const workspace = {
      workspaceId: "wks_child",
      projectId: child.projectId,
      cwd: workspaceDirectory,
      kind: "directory" as const,
      displayName: "Workspace",
      title: null,
      branch: null,
      worktreeRoot: null,
      baseBranch: null,
      isPaseoOwnedWorktree: false,
      mainRepoRoot: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      archivedAt: null,
      autoArchivedChangeRequestUrl: null,
      pinnedAt: null,
    };
    const parentRoot = resolveManagedProjectStorageRoot(paseoHome, parent.projectId);
    const parentStandard = path.join(parentRoot, "parent-standard.md");
    mkdirSync(parentRoot, { recursive: true });
    writeFileSync(parentStandard, "Always preserve the parent contract.");
    writeFileSync(
      resolveGlobalProjectConfigPath(paseoHome, parent.projectId),
      JSON.stringify({
        project: {
          directoryMode: "multiple",
          knowledge: {
            standards: [{ type: "local-document", source: "parent-standard.md" }],
          },
        },
      }),
    );

    const projects = new Map([
      [parent.projectId, parent],
      [child.projectId, child],
    ]);
    const context = await loadProjectAgentContext({
      workspaceId: workspace.workspaceId,
      paseoHome,
      projectRegistry: {
        get: async (projectId: string) => projects.get(projectId) ?? null,
      } as never,
      workspaceRegistry: { get: async () => workspace } as never,
    });

    expect(context?.directories.project).toEqual([
      resolveManagedProjectStorageRoot(paseoHome, child.projectId),
    ]);
    expect(context?.knowledge.standards.localDocuments).toEqual([
      {
        source: "parent-standard.md",
        resolvedSource: parentStandard,
        content: "Always preserve the parent contract.",
      },
    ]);
    expect(context?.prompt).toContain("Always preserve the parent contract.");
  });
});
