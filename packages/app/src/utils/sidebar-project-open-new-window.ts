import { buildNewWorkspaceRoute } from "@/utils/host-routes";

export interface SidebarProjectWindowTarget {
  serverId: string;
  projectId: string;
}

export interface SidebarProjectOpenNewWindowOptions {
  pendingOpenProjectPath?: string;
  initialRoute?: string;
}

export function resolveSidebarProjectOpenNewWindowOptions(input: {
  projectPath: string;
  displayName: string;
  target: SidebarProjectWindowTarget | null;
}): SidebarProjectOpenNewWindowOptions | null {
  const projectPath = input.projectPath.trim();
  if (projectPath) {
    return { pendingOpenProjectPath: projectPath };
  }
  if (!input.target?.serverId.trim() || !input.target.projectId.trim()) {
    return null;
  }
  return {
    initialRoute: buildNewWorkspaceRoute({
      serverId: input.target.serverId,
      projectId: input.target.projectId,
      displayName: input.displayName,
    }),
  };
}
