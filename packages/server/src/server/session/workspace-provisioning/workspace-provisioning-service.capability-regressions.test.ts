import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createTestLogger } from "../../../test-utils/test-logger.js";
import {
  createNoGitWorkspaceRuntimeSnapshot,
  createNoopWorkspaceGitService,
} from "../../test-utils/workspace-git-service-stub.js";
import {
  FileBackedProjectRegistry,
  FileBackedWorkspaceRegistry,
} from "../../workspace-registry.js";
import {
  createWorkspaceProvisioningService,
  type WorkspaceProvisioningService,
} from "./workspace-provisioning-service.js";
// Real file-backed registries + a fake git-service port (the only dependency that
// shells out to git in production). No module mocks — the service is exercised
// through the same interface its callers in session.ts use.
const logger = createTestLogger();
let tmpDir: string;
let gitRoots: Set<string>;
let gitBranches: Map<string, string | null>;
let checkoutFailure: Error | null;
let restoredMergedChangeRequestUrl: string | null;
let workspaceRegistry: FileBackedWorkspaceRegistry;
let projectRegistry: FileBackedProjectRegistry;
let provisioning: WorkspaceProvisioningService;
function gitService() {
  return createNoopWorkspaceGitService({
    peekSnapshot: () => null,
    getSnapshot: async (cwd: string) => {
      const snapshot = createNoGitWorkspaceRuntimeSnapshot(cwd);
      if (!restoredMergedChangeRequestUrl) return snapshot;
      return {
        ...snapshot,
        forge: {
          ...snapshot.forge,
          featuresEnabled: true,
          pullRequest: {
            url: restoredMergedChangeRequestUrl,
            title: "Merged change request",
            state: "merged",
            baseRefName: "main",
            headRefName: "workspace-archive-latch",
            isMerged: true,
          },
        },
      };
    },
    getCheckout: async (cwd: string) => {
      if (checkoutFailure) throw checkoutFailure;
      let worktreeRoot: string | null = null;
      for (const root of gitRoots) {
        if (
          (cwd === root || cwd.startsWith(`${root}${path.sep}`)) &&
          root.length > (worktreeRoot?.length ?? -1)
        ) {
          worktreeRoot = root;
        }
      }
      return {
        cwd,
        isGit: worktreeRoot !== null,
        currentBranch: worktreeRoot ? (gitBranches.get(worktreeRoot) ?? "main") : null,
        remoteUrl: null,
        worktreeRoot,
        isPaseoOwnedWorktree: false,
        mainRepoRoot: null,
      };
    },
  });
}
beforeEach(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "workspace-provisioning-"));
  gitRoots = new Set();
  gitBranches = new Map();
  checkoutFailure = null;
  restoredMergedChangeRequestUrl = null;
  workspaceRegistry = new FileBackedWorkspaceRegistry(
    path.join(tmpDir, "projects", "workspaces.json"),
    logger,
  );
  projectRegistry = new FileBackedProjectRegistry(
    path.join(tmpDir, "projects", "projects.json"),
    logger,
  );
  await workspaceRegistry.initialize();
  await projectRegistry.initialize();
  provisioning = createWorkspaceProvisioningService({
    workspaceRegistry,
    projectRegistry,
    workspaceGitService: gitService(),
    logger,
  });
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
test("createProjectForDirectory allocates a new project for an already registered root", async () => {
  const repo = path.join(tmpDir, "repo");
  gitRoots.add(repo);
  const first = await provisioning.createProjectForDirectory(repo);
  const second = await provisioning.createProjectForDirectory(repo);
  expect(first.rootPath).toBe(repo);
  expect(second.rootPath).toBe(repo);
  expect(second.projectId).not.toBe(first.projectId);
  expect(await projectRegistry.list()).toHaveLength(2);
});
