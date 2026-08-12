export type HostRuntimeWorkspaceDirectoryStatus =
  | "idle"
  | "initial_loading"
  | "revalidating"
  | "ready"
  | "error_before_first_success"
  | "error_after_ready";

export interface WorkspaceDirectoryStatusFields {
  workspaceDirectoryStatus: HostRuntimeWorkspaceDirectoryStatus;
  workspaceDirectoryError: string | null;
  hasEverLoadedWorkspaceDirectory: boolean;
}

export interface WorkspaceDirectoryConnection {
  status: "idle" | "connecting" | "online" | "offline" | "error";
  error: string | null;
}

export const INITIAL_WORKSPACE_DIRECTORY_STATUS: WorkspaceDirectoryStatusFields = {
  workspaceDirectoryStatus: "idle",
  workspaceDirectoryError: null,
  hasEverLoadedWorkspaceDirectory: false,
};

export function startWorkspaceDirectoryRefresh(
  state: WorkspaceDirectoryStatusFields,
): WorkspaceDirectoryStatusFields {
  return {
    workspaceDirectoryStatus: state.hasEverLoadedWorkspaceDirectory
      ? "revalidating"
      : "initial_loading",
    workspaceDirectoryError: null,
    hasEverLoadedWorkspaceDirectory: state.hasEverLoadedWorkspaceDirectory,
  };
}

export function completeWorkspaceDirectoryRefresh(): WorkspaceDirectoryStatusFields {
  return {
    workspaceDirectoryStatus: "ready",
    workspaceDirectoryError: null,
    hasEverLoadedWorkspaceDirectory: true,
  };
}

export function failWorkspaceDirectoryRefresh(
  state: WorkspaceDirectoryStatusFields,
  error: string,
): WorkspaceDirectoryStatusFields {
  return {
    workspaceDirectoryStatus: state.hasEverLoadedWorkspaceDirectory
      ? "error_after_ready"
      : "error_before_first_success",
    workspaceDirectoryError: error,
    hasEverLoadedWorkspaceDirectory: state.hasEverLoadedWorkspaceDirectory,
  };
}

export function workspaceDirectoryConnectionPatch(
  state: WorkspaceDirectoryStatusFields,
  connection: WorkspaceDirectoryConnection,
): Partial<WorkspaceDirectoryStatusFields> {
  if (state.hasEverLoadedWorkspaceDirectory) return {};
  if (connection.status === "connecting" || connection.status === "online") {
    return {
      workspaceDirectoryStatus: "initial_loading",
      workspaceDirectoryError: null,
    };
  }
  if (connection.status === "error") {
    return {
      workspaceDirectoryStatus: "error_before_first_success",
      workspaceDirectoryError: connection.error,
    };
  }
  return {
    workspaceDirectoryStatus: "idle",
    workspaceDirectoryError: null,
  };
}

export function isWorkspaceDirectoryLoading(
  state:
    | (WorkspaceDirectoryStatusFields & {
        connectionStatus: WorkspaceDirectoryConnection["status"];
      })
    | null,
): boolean {
  if (!state) return true;
  if (
    state.workspaceDirectoryStatus === "initial_loading" ||
    state.workspaceDirectoryStatus === "revalidating"
  ) {
    return true;
  }
  if (state.workspaceDirectoryStatus === "error_before_first_success") {
    return false;
  }
  const canLoad = state.connectionStatus === "connecting" || state.connectionStatus === "online";
  return !state.hasEverLoadedWorkspaceDirectory && canLoad;
}
