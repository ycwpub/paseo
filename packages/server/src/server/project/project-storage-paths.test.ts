import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureManagedProjectCodeReposPath,
  ensureManagedProjectPath,
  ensureManagedWorkspacePath,
  removeManagedProjectStorage,
  removeManagedWorkspaceStorage,
  resolveManagedProjectCodeReposPath,
  resolveManagedProjectPath,
  resolveManagedProjectStorageRoot,
  resolveManagedWorkspacePath,
  resolveProjectPath,
} from "./project-storage-paths.js";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "paseo-project-storage-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("project storage paths", () => {
  it("uses the directory root for a single-directory Project", () => {
    expect(
      resolveProjectPath({
        paseoHome: "/home/paseo",
        project: { projectId: "prj_single", rootPath: "/repo/app" },
      }),
    ).toBe(path.resolve("/repo/app"));
  });

  it("uses a readable isolated path for a multiple-directory Project", () => {
    const paseoHome = makeRoot();

    expect(
      resolveProjectPath({
        paseoHome,
        project: { projectId: "prj_multiple", rootPath: null },
      }),
    ).toBe(path.join(paseoHome, "prj_multiple", "code_repos"));
  });

  it("contains legacy path-shaped IDs inside the managed storage root", () => {
    const paseoHome = makeRoot();
    const projectPath = resolveManagedProjectPath(paseoHome, "../../legacy/project");
    const projectStorageRoot = resolveManagedProjectStorageRoot(paseoHome, "../../legacy/project");
    const codeReposPath = resolveManagedProjectCodeReposPath(paseoHome, "../../legacy/project");
    const workspacePath = resolveManagedWorkspacePath(
      paseoHome,
      "../../legacy/project",
      "../workspace",
    );

    expect(path.dirname(projectPath)).toBe(path.join(paseoHome, "projects"));
    expect(path.basename(projectPath)).toMatch(/^legacy-[a-f0-9]{64}$/u);
    expect(path.dirname(projectStorageRoot)).toBe(paseoHome);
    expect(path.basename(projectStorageRoot)).toMatch(/^legacy-[a-f0-9]{64}$/u);
    expect(codeReposPath).toBe(path.join(projectStorageRoot, "code_repos"));
    expect(path.dirname(workspacePath)).toBe(path.join(projectStorageRoot, "workspaces"));
    expect(path.basename(workspacePath)).toMatch(/^legacy-[a-f0-9]{64}$/u);
  });

  it("does not let a Project ID collide with registry storage", () => {
    const paseoHome = makeRoot();
    const projectPath = resolveManagedProjectPath(paseoHome, "projects.json");

    expect(path.dirname(projectPath)).toBe(path.join(paseoHome, "projects"));
    expect(path.basename(projectPath)).toMatch(/^legacy-[a-f0-9]{64}$/u);
  });

  it("migrates files from the legacy managed Project directory", () => {
    const paseoHome = makeRoot();
    const projectId = "prj_migrate";
    const legacyKey = createHash("sha256").update(projectId).digest("hex");
    const legacyPath = path.join(paseoHome, "projects", "directories", legacyKey);
    mkdirSync(legacyPath, { recursive: true });
    writeFileSync(path.join(legacyPath, "notes.md"), "project notes");

    const projectPath = ensureManagedProjectPath(paseoHome, projectId);

    expect(projectPath).toBe(path.join(paseoHome, "projects", projectId));
    expect(existsSync(path.join(projectPath, "notes.md"))).toBe(true);
    expect(existsSync(legacyPath)).toBe(false);
  });

  it("moves Project-owned code from the metadata directory into code_repos", () => {
    const paseoHome = makeRoot();
    const projectId = "prj_code_repos_migrate";
    const projectPath = ensureManagedProjectPath(paseoHome, projectId);
    mkdirSync(path.join(projectPath, "checkout", "src"), { recursive: true });
    writeFileSync(path.join(projectPath, "paseo.json"), '{"project":{}}');
    writeFileSync(path.join(projectPath, "checkout", "src", "index.ts"), "export {};");

    const codeReposPath = ensureManagedProjectCodeReposPath(paseoHome, projectId);

    expect(codeReposPath).toBe(path.join(paseoHome, projectId, "code_repos"));
    expect(readFileSync(path.join(projectPath, "paseo.json"), "utf8")).toBe('{"project":{}}');
    expect(existsSync(path.join(projectPath, "checkout"))).toBe(false);
    expect(readFileSync(path.join(codeReposPath, "checkout", "src", "index.ts"), "utf8")).toBe(
      "export {};",
    );
  });

  it("does not overwrite newer files while migrating Project-owned code", () => {
    const paseoHome = makeRoot();
    const projectId = "prj_code_repos_merge";
    const projectPath = ensureManagedProjectPath(paseoHome, projectId);
    const codeReposPath = resolveManagedProjectCodeReposPath(paseoHome, projectId);
    mkdirSync(path.join(projectPath, "checkout"), { recursive: true });
    mkdirSync(path.join(codeReposPath, "checkout"), { recursive: true });
    writeFileSync(path.join(projectPath, "checkout", "shared.txt"), "legacy");
    writeFileSync(path.join(projectPath, "checkout", "legacy-only.txt"), "legacy only");
    writeFileSync(path.join(codeReposPath, "checkout", "shared.txt"), "project scoped");

    ensureManagedProjectCodeReposPath(paseoHome, projectId);

    expect(readFileSync(path.join(codeReposPath, "checkout", "shared.txt"), "utf8")).toBe(
      "project scoped",
    );
    expect(readFileSync(path.join(codeReposPath, "checkout", "legacy-only.txt"), "utf8")).toBe(
      "legacy only",
    );
    expect(readFileSync(path.join(projectPath, "checkout", "shared.txt"), "utf8")).toBe("legacy");
  });

  it("migrates Workspace data from the legacy global directory", () => {
    const paseoHome = makeRoot();
    const projectId = "prj_workspace_migrate";
    const workspaceId = "wks_migrate";
    const legacyPath = path.join(paseoHome, "workspaces", workspaceId);
    mkdirSync(legacyPath, { recursive: true });
    writeFileSync(path.join(legacyPath, "notes.md"), "workspace notes");

    const workspacePath = ensureManagedWorkspacePath(paseoHome, projectId, workspaceId);

    expect(workspacePath).toBe(path.join(paseoHome, projectId, "workspaces", workspaceId));
    expect(existsSync(path.join(workspacePath, "notes.md"))).toBe(true);
    expect(existsSync(legacyPath)).toBe(false);
  });

  it("merges legacy Workspace data without overwriting newer Project-scoped files", () => {
    const paseoHome = makeRoot();
    const projectId = "prj_workspace_merge";
    const workspaceId = "wks_merge";
    const legacyPath = path.join(paseoHome, "workspaces", workspaceId);
    const workspacePath = resolveManagedWorkspacePath(paseoHome, projectId, workspaceId);
    mkdirSync(legacyPath, { recursive: true });
    mkdirSync(workspacePath, { recursive: true });
    writeFileSync(path.join(legacyPath, "shared.md"), "legacy");
    writeFileSync(path.join(legacyPath, "legacy-only.md"), "legacy only");
    writeFileSync(path.join(workspacePath, "shared.md"), "project scoped");

    ensureManagedWorkspacePath(paseoHome, projectId, workspaceId);

    expect(readFileSync(path.join(workspacePath, "shared.md"), "utf8")).toBe("project scoped");
    expect(readFileSync(path.join(workspacePath, "legacy-only.md"), "utf8")).toBe("legacy only");
    expect(existsSync(legacyPath)).toBe(false);
  });

  it("removes only the requested Project and Workspace managed storage", async () => {
    const paseoHome = makeRoot();
    const projectPath = resolveManagedProjectPath(paseoHome, "prj_remove");
    const otherProjectPath = resolveManagedProjectPath(paseoHome, "prj_keep");
    const projectOwnedCodePath = path.join(
      resolveManagedProjectCodeReposPath(paseoHome, "prj_remove"),
      "checkout",
    );
    const otherProjectOwnedCodePath = path.join(
      resolveManagedProjectCodeReposPath(paseoHome, "prj_keep"),
      "checkout",
    );
    const workspacePath = resolveManagedWorkspacePath(
      paseoHome,
      "prj_workspace_remove",
      "wks_remove",
    );
    const otherWorkspacePath = resolveManagedWorkspacePath(
      paseoHome,
      "prj_workspace_keep",
      "wks_keep",
    );
    const legacyWorkspacePath = path.join(paseoHome, "workspaces", "wks_remove");
    const sharedCodePath = path.join(paseoHome, "shared-code", "checkout");
    for (const directory of [
      projectOwnedCodePath,
      otherProjectOwnedCodePath,
      sharedCodePath,
      otherProjectPath,
      workspacePath,
      otherWorkspacePath,
      legacyWorkspacePath,
    ]) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, "temporary.txt"), "temporary");
    }

    await removeManagedProjectStorage(paseoHome, "prj_remove");
    await removeManagedWorkspaceStorage(paseoHome, "prj_workspace_remove", "wks_remove");

    expect(existsSync(projectPath)).toBe(false);
    expect(existsSync(projectOwnedCodePath)).toBe(false);
    expect(existsSync(sharedCodePath)).toBe(true);
    expect(existsSync(workspacePath)).toBe(false);
    expect(existsSync(legacyWorkspacePath)).toBe(false);
    expect(existsSync(otherProjectPath)).toBe(true);
    expect(existsSync(otherProjectOwnedCodePath)).toBe(true);
    expect(existsSync(otherWorkspacePath)).toBe(true);
  });
});
