import { describe, expect, test } from "vitest";
import { createTestLogger } from "../test-utils/test-logger.js";
import { WorkspaceDirectory } from "./workspace-directory.js";
import type { PersistedProjectRecord, PersistedWorkspaceRecord } from "./workspace-registry.js";
const NOW = "2026-03-01T12:00:00.000Z";
describe("WorkspaceDirectory empty projects", () => {
  function makeDirectory(input: {
    projects: PersistedProjectRecord[];
    workspaces: PersistedWorkspaceRecord[];
  }): WorkspaceDirectory {
    return new WorkspaceDirectory({
      logger: createTestLogger(),
      projectRegistry: { list: async () => input.projects },
      workspaceRegistry: { list: async () => input.workspaces },
      listAgentPayloads: async () => [],
      listProviderSubagentActivity: async () => [],
      listTerminalActivityContributions: async () => [],
      isProviderVisibleToClient: () => true,
      buildWorkspaceDescriptor: async ({ workspace }) => ({
        id: workspace.workspaceId,
        projectId: workspace.projectId,
        projectDisplayName: "project",
        projectCustomName: null,
        projectRootPath: "/workspace/project",
        workspaceDirectory: workspace.cwd,
        projectKind: "non_git",
        workspaceKind: workspace.kind,
        name: workspace.displayName,
        archivingAt: null,
        status: "done",
        activityAt: null,
        diffStat: null,
        gitRuntime: null,
        githubRuntime: null,
      }),
    });
  }
  function project(
    input: Partial<PersistedProjectRecord> & {
      projectId: string;
    },
  ) {
    return {
      rootPath: `/workspace/${input.projectId}`,
      kind: "non_git",
      displayName: input.projectId,
      customName: null,
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      pinnedAt: null,
      ...input,
    } satisfies PersistedProjectRecord;
  }
  test("surfaces a directoryless project without inventing a filesystem path", async () => {
    const directory = makeDirectory({
      projects: [project({ projectId: "planning", rootPath: null, customName: "Planning" })],
      workspaces: [],
    });
    const result = await directory.listFetchEntries({
      type: "fetch_workspaces_request",
      requestId: "r-directoryless",
    });
    expect(result.emptyProjects).toEqual([
      expect.objectContaining({
        projectId: "planning",
        projectDisplayName: "Planning",
        projectRootPath: "",
        projectDirectoryless: true,
      }),
    ]);
  });
});
