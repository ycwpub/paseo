import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, test } from "vitest";
import { createTestLogger } from "../test-utils/test-logger.js";
import { FileBackedProjectRegistry, FileBackedWorkspaceRegistry } from "./workspace-registry.js";
describe("workspace registries", () => {
  let tmpDir: string;
  let projectRegistry: FileBackedProjectRegistry;
  let _workspaceRegistry: FileBackedWorkspaceRegistry;
  const logger = createTestLogger();
  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "workspace-registry-"));
    projectRegistry = new FileBackedProjectRegistry(
      path.join(tmpDir, "projects", "projects.json"),
      logger,
    );
    _workspaceRegistry = new FileBackedWorkspaceRegistry(
      path.join(tmpDir, "projects", "workspaces.json"),
      logger,
    );
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
  test("creates and persists a project without a directory", async () => {
    await projectRegistry.initialize();
    const project = await projectRegistry.createDirectoryless({
      displayName: "Planning",
      timestamp: "2026-08-19T00:00:00.000Z",
    });
    expect(project).toMatchObject({
      rootPath: null,
      kind: "non_git",
      displayName: "Planning",
      customName: null,
    });
    expect(await projectRegistry.get(project.projectId)).toEqual(project);
  });
  test("explicit project creation allows the same root to have distinct identities", async () => {
    await projectRegistry.initialize();
    const rootPath = path.join(tmpDir, "same-root");
    const input = {
      rootPath,
      kind: "non_git" as const,
      displayName: "same-root",
      timestamp: "2026-03-01T00:00:00.000Z",
    };
    const first = await projectRegistry.createForRoot(input);
    const second = await projectRegistry.createForRoot(input);
    expect(first.rootPath).toBe(second.rootPath);
    expect(first.projectId).not.toBe(second.projectId);
    expect(first.projectId).toMatch(/^prj_[0-9a-f]{16}$/);
    expect(second.projectId).toMatch(/^prj_[0-9a-f]{16}$/);
    expect(await projectRegistry.list()).toHaveLength(2);
  });
});
