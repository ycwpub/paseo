import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectAgentContext } from "./project-context.js";
import { resolveGlobalProjectConfigPath } from "./project-config-storage.js";
import { resolveManagedProjectStorageRoot } from "./project-storage-paths.js";

const roots: string[] = [];

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
  });
}

function createRemoteRepository(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "paseo-project-context-git-"));
  roots.push(root);
  const source = path.join(root, "source");
  const remote = path.join(root, "remote.git");
  git(root, "init", "-b", "main", source);
  git(source, "config", "user.name", "Paseo Test");
  git(source, "config", "user.email", "paseo@example.com");
  writeFileSync(path.join(source, "README.md"), "main\n");
  git(source, "add", "README.md");
  git(source, "commit", "-m", "main");
  git(source, "checkout", "-b", "feature/context");
  writeFileSync(path.join(source, "README.md"), "feature\n");
  git(source, "commit", "-am", "feature");
  git(root, "clone", "--bare", source, remote);
  return remote;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Project context Git resources", () => {
  it("downloads configured Project and knowledge repositories before exposing Agent context", async () => {
    const paseoHome = mkdtempSync(path.join(os.tmpdir(), "paseo-project-context-home-"));
    const workspaceDirectory = mkdtempSync(
      path.join(os.tmpdir(), "paseo-project-context-workspace-"),
    );
    roots.push(paseoHome, workspaceDirectory);
    const remote = createRemoteRepository();
    const project = {
      projectId: "prj_git_context",
      rootPath: null,
      kind: "non_git" as const,
      displayName: "Git context",
      customName: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      archivedAt: null,
    };
    const workspace = {
      workspaceId: "wks_git_context",
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
          directories: {
            project: [
              {
                type: "git-repository",
                repository: remote,
                branch: "feature/context",
                directory: "source-code",
              },
            ],
          },
          knowledge: {
            general: [
              {
                type: "git-repository",
                source: remote,
                branch: "main",
                directory: "reference-docs",
              },
            ],
          },
        },
      }),
    );

    const context = await loadProjectAgentContext({
      workspaceId: workspace.workspaceId,
      paseoHome,
      projectRegistry: { get: async () => project } as never,
      workspaceRegistry: { get: async () => workspace } as never,
    });
    const projectRoot = resolveManagedProjectStorageRoot(paseoHome, project.projectId);
    const sourceCode = path.join(projectRoot, "repos", "source-code");
    const referenceDocs = path.join(projectRoot, "repos", "reference-docs");

    expect(context?.directories.project).toEqual([projectRoot, sourceCode]);
    expect(context?.directories.knowledge).toContain(referenceDocs);
    expect(readFileSync(path.join(sourceCode, "README.md"), "utf8")).toBe("feature\n");
    expect(readFileSync(path.join(referenceDocs, "README.md"), "utf8")).toBe("main\n");
  }, 20_000);
});
