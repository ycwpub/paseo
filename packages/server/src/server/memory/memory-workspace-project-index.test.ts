import { describe, expect, test } from "vitest";
import type {
  PersistedWorkspaceRecord,
  WorkspaceMutation,
  WorkspaceRegistry,
} from "../workspace-registry.js";
import { createMemoryWorkspaceProjectIndex } from "./memory-workspace-project-index.js";

function workspace(workspaceId: string, projectId: string): PersistedWorkspaceRecord {
  return {
    workspaceId,
    projectId,
    cwd: `/tmp/${workspaceId}`,
    kind: "local_checkout",
    worktreeRoot: null,
    branch: null,
    baseBranch: null,
    isPaseoOwnedWorktree: false,
    mainRepoRoot: null,
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    archivedAt: null,
    autoArchivedChangeRequestUrl: null,
    pinnedAt: null,
  };
}

describe("createMemoryWorkspaceProjectIndex", () => {
  test("tracks existing, updated, and removed Workspace ownership", async () => {
    let listener: ((mutation: WorkspaceMutation) => void | Promise<void>) | null = null;
    let disposed = false;
    const registry = {
      list: async () => [workspace("workspace-1", "project-1")],
      subscribeToMutations: (nextListener) => {
        listener = nextListener;
        return () => {
          disposed = true;
        };
      },
    } as WorkspaceRegistry;

    const index = await createMemoryWorkspaceProjectIndex(registry);
    expect(index.resolve("workspace-1")).toBe("project-1");

    await listener?.({
      kind: "upsert",
      workspaceId: "workspace-1",
      workspace: workspace("workspace-1", "project-2"),
    });
    expect(index.resolve("workspace-1")).toBe("project-2");

    await listener?.({
      kind: "remove",
      workspaceId: "workspace-1",
      workspace: null,
    });
    expect(index.resolve("workspace-1")).toBeNull();

    index.dispose();
    expect(disposed).toBe(true);
  });
});
