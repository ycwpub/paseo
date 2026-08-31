import { useEffect, useMemo } from "react";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import type { WorkspaceTab } from "@/workspace-tabs/model";

export function selectOpenAgentTabIds(tabs: readonly WorkspaceTab[]): string[] {
  return [
    ...new Set(tabs.flatMap((tab) => (tab.target.kind === "agent" ? [tab.target.agentId] : []))),
  ].sort();
}

export function usePreloadOpenAgentTimelines(input: {
  serverId: string;
  tabs: readonly WorkspaceTab[];
  enabled: boolean;
}): void {
  const agentIdsKey = useMemo(() => selectOpenAgentTabIds(input.tabs).join("\u0000"), [input.tabs]);

  useEffect(() => {
    if (!input.enabled || !input.serverId || !agentIdsKey) return;
    for (const agentId of agentIdsKey.split("\u0000")) {
      void getHostRuntimeStore()
        .prepareAgentTimeline(input.serverId, agentId)
        .catch(() => undefined);
    }
  }, [agentIdsKey, input.enabled, input.serverId]);
}
