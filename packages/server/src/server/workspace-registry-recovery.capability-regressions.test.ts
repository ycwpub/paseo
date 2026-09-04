import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { createTestLogger } from "../test-utils/test-logger.js";
import { AgentStorage } from "./agent/agent-storage.js";
import { createNoopWorkspaceGitService } from "./test-utils/workspace-git-service-stub.js";
import { FileBackedProjectRegistry, FileBackedWorkspaceRegistry } from "./workspace-registry.js";
import { bootstrapWorkspaceRegistries } from "./workspace-registry-bootstrap.js";

describe("empty workspace registry recovery", () => {
  const roots: string[] = [];

  function createStorage(root: string) {
    const paseoHome = path.join(root, ".paseo");
    const logger = createTestLogger();
    return {
      paseoHome,
      logger,
      agentStorage: new AgentStorage(path.join(paseoHome, "agents"), logger),
      projectRegistry: new FileBackedProjectRegistry(
        path.join(paseoHome, "projects", "projects.json"),
        logger,
      ),
      workspaceRegistry: new FileBackedWorkspaceRegistry(
        path.join(paseoHome, "projects", "workspaces.json"),
        logger,
      ),
    };
  }

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rebuilds already-created empty registry files from active agents", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "workspace-registry-recovery-"));
    roots.push(root);
    const cwd = path.join(root, "checkout");
    mkdirSync(cwd, { recursive: true });
    const { paseoHome, logger, agentStorage, projectRegistry, workspaceRegistry } =
      createStorage(root);

    await Promise.all([
      agentStorage.initialize(),
      projectRegistry.initialize(),
      workspaceRegistry.initialize(),
    ]);
    await agentStorage.upsert({
      id: "agent-recover-project",
      provider: "codex",
      cwd,
      workspaceId: "wks_preserved",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
      lastActivityAt: "2026-09-02T00:00:00.000Z",
      lastUserMessageAt: null,
      title: "Recovered conversation",
      labels: {},
      lastStatus: "idle",
      lastModeId: null,
      config: null,
      runtimeInfo: { provider: "codex", sessionId: "thread-recover-project" },
      persistence: null,
      archivedAt: null,
    });

    await bootstrapWorkspaceRegistries({
      serverId: "srv_development",
      paseoHome,
      agentStorage,
      projectRegistry,
      workspaceRegistry,
      workspaceGitService: createNoopWorkspaceGitService(),
      logger,
    });

    expect(await projectRegistry.list()).toEqual([
      expect.objectContaining({
        rootPath: cwd,
        displayName: "checkout",
        archivedAt: null,
      }),
    ]);
    expect(await workspaceRegistry.list()).toEqual([
      expect.objectContaining({
        workspaceId: "wks_preserved",
        cwd,
        archivedAt: null,
      }),
    ]);
    expect(await agentStorage.get("agent-recover-project")).toMatchObject({
      workspaceId: "wks_preserved",
    });
  });

  test("does not recreate a deliberately removed project from archived agents", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "workspace-registry-no-resurrection-"));
    roots.push(root);
    const cwd = path.join(root, "deleted-checkout");
    mkdirSync(cwd, { recursive: true });
    const { paseoHome, logger, agentStorage, projectRegistry, workspaceRegistry } =
      createStorage(root);

    await Promise.all([
      agentStorage.initialize(),
      projectRegistry.initialize(),
      workspaceRegistry.initialize(),
    ]);
    await agentStorage.upsert({
      id: "agent-deleted-project",
      provider: "codex",
      cwd,
      workspaceId: "wks_deleted",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
      lastActivityAt: "2026-09-02T00:00:00.000Z",
      lastUserMessageAt: null,
      title: "Deleted project conversation",
      labels: {},
      lastStatus: "closed",
      lastModeId: null,
      config: null,
      runtimeInfo: { provider: "codex", sessionId: "thread-deleted-project" },
      persistence: null,
      archivedAt: "2026-09-03T00:00:00.000Z",
    });

    await bootstrapWorkspaceRegistries({
      serverId: "srv_development",
      paseoHome,
      agentStorage,
      projectRegistry,
      workspaceRegistry,
      workspaceGitService: createNoopWorkspaceGitService(),
      logger,
    });

    expect(await projectRegistry.list()).toEqual([]);
    expect(await workspaceRegistry.list()).toEqual([]);
  });
});
