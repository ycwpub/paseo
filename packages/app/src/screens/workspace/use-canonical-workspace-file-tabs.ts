import { useEffect } from "react";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";
import { createWorkspaceFileTabTarget } from "@/workspace/file-open";
import { canonicalizeWorkspaceFileLocation } from "@/workspace/file-open/canonical-location";

export function useCanonicalWorkspaceFileTabs(input: {
  tabs: readonly WorkspaceTab[];
  workspaceKey: string | null;
  workspaceRoot: string | null;
  retargetTab: (workspaceKey: string, tabId: string, target: WorkspaceTabTarget) => string | null;
}): void {
  const { retargetTab, tabs, workspaceKey, workspaceRoot } = input;

  useEffect(() => {
    if (!workspaceKey || !workspaceRoot) {
      return;
    }

    for (const tab of tabs) {
      if (tab.target.kind !== "file") {
        continue;
      }
      const canonicalLocation = canonicalizeWorkspaceFileLocation({
        location: tab.target,
        workspaceRoot,
      });
      if (!canonicalLocation || canonicalLocation.path === tab.target.path) {
        continue;
      }
      retargetTab(workspaceKey, tab.tabId, createWorkspaceFileTabTarget(canonicalLocation));
    }
  }, [retargetTab, tabs, workspaceKey, workspaceRoot]);
}
