import type { WorkspaceRegistry } from "../workspace-registry.js";

export interface MemoryWorkspaceProjectIndex {
  resolve(workspaceId: string): string | null;
  dispose(): void;
}

export async function createMemoryWorkspaceProjectIndex(
  workspaceRegistry: WorkspaceRegistry,
): Promise<MemoryWorkspaceProjectIndex> {
  const projectIds = new Map(
    (await workspaceRegistry.list()).map((workspace) => [
      workspace.workspaceId,
      workspace.projectId,
    ]),
  );
  const unsubscribe =
    workspaceRegistry.subscribeToMutations?.((mutation) => {
      if (mutation.workspace) {
        projectIds.set(mutation.workspaceId, mutation.workspace.projectId);
        return;
      }
      projectIds.delete(mutation.workspaceId);
    }) ?? (() => undefined);

  return {
    resolve: (workspaceId) => projectIds.get(workspaceId) ?? null,
    dispose: unsubscribe,
  };
}
