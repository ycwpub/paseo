import { useCallback } from "react";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { resolveWorkspaceMapKeyByIdentity } from "@/utils/workspace-identity";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { useWorkspaceRemove } from "@/workspace/use-workspace-remove";

export function useSidebarWorkspaceRemove(input: {
  serverId?: string;
  workspaceId?: string;
  archivePending: boolean;
}) {
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const workspace = useSessionStore((state) => {
    if (!input.serverId || !input.workspaceId) return undefined;
    const workspaces = state.sessions[input.serverId]?.workspaces;
    const workspaceKey = resolveWorkspaceMapKeyByIdentity({
      workspaces,
      workspaceId: input.workspaceId,
    });
    return workspaceKey ? workspaces?.get(workspaceKey) : undefined;
  });
  const selected =
    activeWorkspaceSelection?.serverId === input.serverId &&
    activeWorkspaceSelection?.workspaceId === input.workspaceId;
  const handleRemoveStarted = useCallback(() => {
    if (!input.serverId || !input.workspaceId) return;
    redirectIfArchivingActiveWorkspace({
      serverId: input.serverId,
      workspaceId: input.workspaceId,
      activeWorkspaceSelection: selected
        ? { serverId: input.serverId, workspaceId: input.workspaceId }
        : null,
    });
  }, [input.serverId, input.workspaceId, selected]);

  return useWorkspaceRemove({
    serverId: input.serverId ?? "",
    projectId: workspace?.projectId ?? "",
    workspaceId: input.workspaceId ?? "",
    workspaceName: workspace?.name ?? input.workspaceId ?? "",
    disabled:
      !input.serverId || !input.workspaceId || !workspace?.projectId || input.archivePending,
    onRemoveStarted: handleRemoveStarted,
  });
}
