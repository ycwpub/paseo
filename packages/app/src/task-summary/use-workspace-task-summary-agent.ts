import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "@/stores/session-store";
import {
  collectAllTabs,
  findPaneById,
  type WorkspaceLayout,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

export interface WorkspaceTaskSummaryAgent {
  agentId: string;
  cwd: string | null;
}

export function resolveWorkspaceTaskSummaryAgentId(layout: WorkspaceLayout | null): string | null {
  if (!layout) {
    return null;
  }
  const pane = findPaneById(layout.root, layout.focusedPaneId);
  const focusedTabId = pane?.focusedTabId;
  if (!focusedTabId) {
    return null;
  }
  const focusedTab = collectAllTabs(layout.root).find((tab) => tab.tabId === focusedTabId);
  return focusedTab?.target.kind === "agent" ? focusedTab.target.agentId : null;
}

export function useWorkspaceTaskSummaryAgent(
  serverId: string,
  workspaceId?: string | null,
): WorkspaceTaskSummaryAgent | null {
  const workspaceKey = workspaceId
    ? buildWorkspaceTabPersistenceKey({ serverId, workspaceId })
    : null;
  const layout = useWorkspaceLayoutStore((state) =>
    workspaceKey ? (state.layoutByWorkspace[workspaceKey] ?? null) : null,
  );
  const focusedAgentId = useMemo(() => resolveWorkspaceTaskSummaryAgentId(layout), [layout]);
  const [retainedAgent, setRetainedAgent] = useState<{
    workspaceKey: string | null;
    agentId: string | null;
  }>({
    workspaceKey,
    agentId: focusedAgentId,
  });
  useEffect(() => {
    setRetainedAgent((current) => {
      if (current.workspaceKey !== workspaceKey) {
        return { workspaceKey, agentId: focusedAgentId };
      }
      if (focusedAgentId && current.agentId !== focusedAgentId) {
        return { workspaceKey, agentId: focusedAgentId };
      }
      return current;
    });
  }, [focusedAgentId, workspaceKey]);
  const agentId =
    focusedAgentId ?? (retainedAgent.workspaceKey === workspaceKey ? retainedAgent.agentId : null);
  const cwd = useSessionStore((state) => {
    if (!agentId) {
      return null;
    }
    const session = state.sessions[serverId];
    return session?.agents?.get(agentId)?.cwd ?? session?.agentDetails?.get(agentId)?.cwd ?? null;
  });

  return agentId ? { agentId, cwd } : null;
}
