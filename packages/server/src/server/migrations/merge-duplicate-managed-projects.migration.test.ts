import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createTestLogger } from "../../test-utils/test-logger.js";
import {
  createPersistedProjectRecord,
  createPersistedWorkspaceRecord,
  FileBackedProjectRegistry,
  FileBackedWorkspaceRegistry,
} from "../workspace-registry.js";
import { resolveManagedProjectStorageRoot } from "../project/project-storage-paths.js";
import { mergeDuplicateManagedProjects } from "./merge-duplicate-managed-projects.migration.js";

describe("mergeDuplicateManagedProjects", () => {
  const logger = createTestLogger();
  let paseoHome: string;
  let projectRegistry: FileBackedProjectRegistry;
  let workspaceRegistry: FileBackedWorkspaceRegistry;

  beforeEach(async () => {
    paseoHome = mkdtempSync(path.join(os.tmpdir(), "managed-project-duplicates-"));
    projectRegistry = new FileBackedProjectRegistry(
      path.join(paseoHome, "projects", "projects.json"),
      logger,
    );
    workspaceRegistry = new FileBackedWorkspaceRegistry(
      path.join(paseoHome, "projects", "workspaces.json"),
      logger,
    );
    await Promise.all([projectRegistry.initialize(), workspaceRegistry.initialize()]);
  });

  afterEach(() => {
    rmSync(paseoHome, { recursive: true, force: true });
  });

  test("moves workspaces and storage back to the named directoryless Project", async () => {
    const ownerId = "prj_0123456789abcdef";
    const duplicateId = "prj_fedcba9876543210";
    const timestamp = "2026-09-08T00:00:00.000Z";
    await projectRegistry.upsert(
      createPersistedProjectRecord({
        projectId: ownerId,
        rootPath: null,
        kind: "non_git",
        displayName: "替身模式测试",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    await projectRegistry.upsert(
      createPersistedProjectRecord({
        projectId: duplicateId,
        rootPath: resolveManagedProjectStorageRoot(paseoHome, ownerId),
        kind: "non_git",
        displayName: ownerId,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    await workspaceRegistry.upsert(
      createPersistedWorkspaceRecord({
        workspaceId: "wks_duplicate",
        projectId: duplicateId,
        cwd: resolveManagedProjectStorageRoot(paseoHome, ownerId),
        kind: "directory",
        displayName: ownerId,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    const duplicateStorage = resolveManagedProjectStorageRoot(paseoHome, duplicateId);
    mkdirSync(path.join(duplicateStorage, "workspaces", "wks_duplicate"), { recursive: true });
    writeFileSync(path.join(duplicateStorage, "workspaces", "wks_duplicate", "notes.md"), "kept");

    await expect(
      mergeDuplicateManagedProjects({
        paseoHome,
        projectRegistry,
        workspaceRegistry,
        logger,
      }),
    ).resolves.toEqual({
      projectsRemoved: 1,
      projectsRestored: 0,
      workspacesUpdated: 1,
    });

    expect(await projectRegistry.get(duplicateId)).toBeNull();
    expect(await projectRegistry.get(ownerId)).toMatchObject({
      displayName: "替身模式测试",
      rootPath: null,
    });
    expect(await workspaceRegistry.get("wks_duplicate")).toMatchObject({
      projectId: ownerId,
    });
    const migratedNote = path.join(
      resolveManagedProjectStorageRoot(paseoHome, ownerId),
      "workspaces",
      "wks_duplicate",
      "notes.md",
    );
    expect(existsSync(migratedNote)).toBe(true);
    expect(readFileSync(migratedNote, "utf8")).toBe("kept");
  });

  test("ignores ordinary rooted Projects", async () => {
    const timestamp = "2026-09-08T00:00:00.000Z";
    await projectRegistry.upsert(
      createPersistedProjectRecord({
        projectId: "prj_0123456789abcdef",
        rootPath: path.join(paseoHome, "code"),
        kind: "non_git",
        displayName: "code",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );

    await expect(
      mergeDuplicateManagedProjects({
        paseoHome,
        projectRegistry,
        workspaceRegistry,
        logger,
      }),
    ).resolves.toEqual({
      projectsRemoved: 0,
      projectsRestored: 0,
      workspacesUpdated: 0,
    });
  });
});
