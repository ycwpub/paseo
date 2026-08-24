import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createTestLogger } from "../../test-utils/test-logger.js";
import { AgentStorage } from "../agent/agent-storage.js";
import {
  FileBackedProjectRegistry,
  FileBackedWorkspaceRegistry,
  createPersistedProjectRecord,
  createPersistedWorkspaceRecord,
} from "../workspace-registry.js";
import { WorkspaceReconciliationService } from "../workspace-reconciliation-service.js";
import { createNoopWorkspaceGitService } from "../test-utils/workspace-git-service-stub.js";
import { migrateManagedProjectStorage } from "./migrate-managed-project-storage.migration.js";

describe("migrateManagedProjectStorage", () => {
  let root: string;
  let paseoHome: string;
  let agentStorage: AgentStorage;
  let projectRegistry: FileBackedProjectRegistry;
  let workspaceRegistry: FileBackedWorkspaceRegistry;

  beforeEach(async () => {
    root = mkdtempSync(path.join(os.tmpdir(), "managed-project-storage-migration-"));
    paseoHome = path.join(root, ".paseo");
    const logger = createTestLogger();
    agentStorage = new AgentStorage(path.join(paseoHome, "agents"), logger);
    projectRegistry = new FileBackedProjectRegistry(
      path.join(paseoHome, "projects", "projects.json"),
      logger,
    );
    workspaceRegistry = new FileBackedWorkspaceRegistry(
      path.join(paseoHome, "projects", "workspaces.json"),
      logger,
    );
    await Promise.all([
      agentStorage.initialize(),
      projectRegistry.initialize(),
      workspaceRegistry.initialize(),
    ]);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("moves managed data and rewrites Project, Workspace, and Agent paths", async () => {
    const projectId = "prj_migrate_references";
    const workspaceId = "wks_migrate_references";
    const legacyRoot = path.join(paseoHome, projectId);
    const legacyRepo = path.join(legacyRoot, "repos", "checkout");
    const managedRoot = path.join(paseoHome, "projects", projectId);
    const managedRepo = path.join(managedRoot, "repos", "checkout");
    mkdirSync(legacyRepo, { recursive: true });
    writeFileSync(path.join(legacyRepo, "README.md"), "preserved");

    await projectRegistry.upsert(
      createPersistedProjectRecord({
        projectId,
        rootPath: legacyRoot,
        kind: "git",
        displayName: "Migrated Project",
        projectKey: `host:test:${legacyRoot}`,
        createdAt: "2026-08-25T00:00:00.000Z",
        updatedAt: "2026-08-25T00:00:00.000Z",
      }),
    );
    await workspaceRegistry.upsert(
      createPersistedWorkspaceRecord({
        workspaceId,
        projectId,
        cwd: legacyRepo,
        kind: "directory",
        displayName: "checkout",
        worktreeRoot: legacyRepo,
        mainRepoRoot: legacyRoot,
        createdAt: "2026-08-25T00:00:00.000Z",
        updatedAt: "2026-08-25T00:00:00.000Z",
      }),
    );
    await agentStorage.upsert({
      id: "agent-migrate-references",
      provider: "codex",
      cwd: legacyRepo,
      workspaceId,
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
      lastActivityAt: "2026-08-25T00:00:00.000Z",
      lastUserMessageAt: null,
      title: null,
      labels: {},
      lastStatus: "closed",
      lastModeId: null,
      config: {
        writableProjectDirectories: [legacyRepo],
        readOnlyProjectDirectories: [path.join(legacyRoot, "knowledge")],
      },
      runtimeInfo: { provider: "codex", sessionId: null },
      persistence: null,
      archivedAt: null,
    });

    const result = await migrateManagedProjectStorage({
      paseoHome,
      agentStorage,
      projectRegistry,
      workspaceRegistry,
      logger: createTestLogger(),
    });

    expect(result).toEqual({
      projectsUpdated: 1,
      workspacesUpdated: 1,
      agentsUpdated: 1,
    });
    expect(await projectRegistry.get(projectId)).toMatchObject({
      rootPath: null,
      kind: "non_git",
      projectKey: null,
    });
    expect(await workspaceRegistry.get(workspaceId)).toMatchObject({
      cwd: managedRepo,
      worktreeRoot: managedRepo,
      mainRepoRoot: managedRoot,
      archivedAt: null,
    });
    expect(await agentStorage.get("agent-migrate-references")).toMatchObject({
      cwd: managedRepo,
      config: {
        writableProjectDirectories: [managedRepo],
        readOnlyProjectDirectories: [path.join(managedRoot, "knowledge")],
      },
    });
    const reloadedAgentStorage = new AgentStorage(
      path.join(paseoHome, "agents"),
      createTestLogger(),
    );
    await reloadedAgentStorage.initialize();
    expect(await reloadedAgentStorage.get("agent-migrate-references")).toMatchObject({
      cwd: managedRepo,
      workspaceId,
    });
    expect(existsSync(path.join(managedRepo, "README.md"))).toBe(true);
    expect(existsSync(legacyRoot)).toBe(false);

    const reconciliation = new WorkspaceReconciliationService({
      projectRegistry,
      workspaceRegistry,
      workspaceGitService: createNoopWorkspaceGitService(),
      logger: createTestLogger(),
    });
    await reconciliation.runOnce();
    expect(await workspaceRegistry.get(workspaceId)).toMatchObject({
      cwd: managedRepo,
      archivedAt: null,
    });
  });

  test("is idempotent, preserves archive state, and leaves external directories unchanged", async () => {
    const managedProjectId = "prj_managed";
    const workspaceId = "wks_archived";
    const legacyRoot = path.join(paseoHome, managedProjectId);
    const managedRoot = path.join(paseoHome, "projects", managedProjectId);
    const externalRoot = path.join(root, "external-repo");
    mkdirSync(legacyRoot, { recursive: true });
    mkdirSync(externalRoot, { recursive: true });

    await projectRegistry.upsert(
      createPersistedProjectRecord({
        projectId: managedProjectId,
        rootPath: legacyRoot,
        kind: "non_git",
        displayName: "Managed",
        createdAt: "2026-08-25T00:00:00.000Z",
        updatedAt: "2026-08-25T00:00:00.000Z",
      }),
    );
    await projectRegistry.upsert(
      createPersistedProjectRecord({
        projectId: "prj_external",
        rootPath: externalRoot,
        kind: "git",
        displayName: "External",
        projectKey: "remote:example/external",
        createdAt: "2026-08-25T00:00:00.000Z",
        updatedAt: "2026-08-25T00:00:00.000Z",
      }),
    );
    await workspaceRegistry.upsert(
      createPersistedWorkspaceRecord({
        workspaceId,
        projectId: managedProjectId,
        cwd: legacyRoot,
        kind: "directory",
        displayName: "Archived",
        createdAt: "2026-08-25T00:00:00.000Z",
        updatedAt: "2026-08-25T19:29:56.213Z",
        archivedAt: "2026-08-25T19:29:56.213Z",
      }),
    );

    await migrateManagedProjectStorage({
      paseoHome,
      agentStorage,
      projectRegistry,
      workspaceRegistry,
      logger: createTestLogger(),
    });
    const second = await migrateManagedProjectStorage({
      paseoHome,
      agentStorage,
      projectRegistry,
      workspaceRegistry,
      logger: createTestLogger(),
    });

    expect(await workspaceRegistry.get(workspaceId)).toMatchObject({
      cwd: managedRoot,
      archivedAt: "2026-08-25T19:29:56.213Z",
    });
    expect(await projectRegistry.get("prj_external")).toMatchObject({
      rootPath: externalRoot,
      kind: "git",
      projectKey: "remote:example/external",
    });
    expect(second).toEqual({
      projectsUpdated: 0,
      workspacesUpdated: 0,
      agentsUpdated: 0,
    });
  });
});
