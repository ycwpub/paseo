export interface WorkspaceRemoveTarget {
  serverId: string;
  workspaceId: string;
}

interface WorkspaceRemoveClient {
  removeWorkspace: (workspaceId: string) => Promise<void>;
}

export interface WorkspaceRemoveFailure extends WorkspaceRemoveTarget {
  error: unknown;
}

export async function removeWorkspaces(input: {
  getClient: (serverId: string) => WorkspaceRemoveClient | null;
  workspaces: WorkspaceRemoveTarget[];
}): Promise<WorkspaceRemoveFailure[]> {
  const results = await Promise.allSettled(
    input.workspaces.map(async (workspace) => {
      const client = input.getClient(workspace.serverId);
      if (!client) {
        return {
          ...workspace,
          error: new Error("Host disconnected"),
        } satisfies WorkspaceRemoveFailure;
      }

      try {
        await client.removeWorkspace(workspace.workspaceId);
        return null;
      } catch (error) {
        return {
          ...workspace,
          error,
        } satisfies WorkspaceRemoveFailure;
      }
    }),
  );

  return results.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
}
