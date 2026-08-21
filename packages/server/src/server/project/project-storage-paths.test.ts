import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureManagedProjectPath,
  removeManagedProjectStorage,
  removeManagedWorkspaceStorage,
  resolveManagedProjectPath,
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
    ).toBe(path.join(paseoHome, "projects", "prj_multiple"));
  });

  it("contains legacy path-shaped IDs inside the managed storage root", () => {
    const paseoHome = makeRoot();
    const projectPath = resolveManagedProjectPath(paseoHome, "../../legacy/project");
    const workspacePath = resolveManagedWorkspacePath(paseoHome, "../workspace");

    expect(path.dirname(projectPath)).toBe(path.join(paseoHome, "projects"));
    expect(path.basename(projectPath)).toMatch(/^legacy-[a-f0-9]{64}$/u);
    expect(path.dirname(workspacePath)).toBe(path.join(paseoHome, "workspaces"));
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

  it("removes only the requested Project and Workspace managed storage", async () => {
    const paseoHome = makeRoot();
    const projectPath = resolveManagedProjectPath(paseoHome, "prj_remove");
    const otherProjectPath = resolveManagedProjectPath(paseoHome, "prj_keep");
    const workspacePath = resolveManagedWorkspacePath(paseoHome, "wks_remove");
    const otherWorkspacePath = resolveManagedWorkspacePath(paseoHome, "wks_keep");
    const projectOwnedCodePath = path.join(projectPath, "code", "checkout");
    const sharedCodePath = path.join(paseoHome, "shared-code", "checkout");
    for (const directory of [
      projectOwnedCodePath,
      sharedCodePath,
      otherProjectPath,
      workspacePath,
      otherWorkspacePath,
    ]) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, "temporary.txt"), "temporary");
    }

    await removeManagedProjectStorage(paseoHome, "prj_remove");
    await removeManagedWorkspaceStorage(paseoHome, "wks_remove");

    expect(existsSync(projectPath)).toBe(false);
    expect(existsSync(projectOwnedCodePath)).toBe(false);
    expect(existsSync(sharedCodePath)).toBe(true);
    expect(existsSync(workspacePath)).toBe(false);
    expect(existsSync(otherProjectPath)).toBe(true);
    expect(existsSync(otherWorkspacePath)).toBe(true);
  });
});
