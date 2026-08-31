import type { OpenInSidePanePreferences } from "@/hooks/use-settings";
import {
  collectAllTabs,
  findPaneById,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

interface OpenWorkingDiffInExplorerInput {
  isCompact: boolean;
  workspaceKey: string;
  target: WorkspaceTabTarget;
  source: keyof OpenInSidePanePreferences;
  explorerSidebarPaneId?: string | null;
  parentTabId?: string | null;
}

/**
 * Routes a Changes selection to the Explorer's canonical Diff tab.
 *
 * Older layouts may contain both a configured Diff in a main pane and the default
 * Explorer Diff tab. Keep the Explorer instance and remove stale duplicates before
 * applying the newly selected file.
 */
export function openWorkingDiffInExplorer(
  input: OpenWorkingDiffInExplorerInput,
): string | null | undefined {
  if (input.isCompact || input.source !== "diffs" || input.target.kind !== "working_diff") {
    return undefined;
  }

  const store = useWorkspaceLayoutStore.getState();
  const explorerSidebarPaneId =
    store.showExplorerSidebar(input.workspaceKey) ?? input.explorerSidebarPaneId ?? null;
  const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[input.workspaceKey];
  const explorerPane = layout ? findPaneById(layout.root, explorerSidebarPaneId) : null;
  if (!layout || !explorerPane) {
    return undefined;
  }

  const workingDiffTabs = collectAllTabs(layout.root).filter(
    (tab) => tab.target.kind === "working_diff",
  );
  const retainedDiffTab =
    workingDiffTabs.find((tab) => explorerPane.tabIds.includes(tab.tabId)) ?? workingDiffTabs[0];
  for (const tab of workingDiffTabs) {
    if (tab.tabId !== retainedDiffTab?.tabId) {
      store.closeTab(input.workspaceKey, tab.tabId);
    }
  }

  return store.openTab({
    workspaceKey: input.workspaceKey,
    target: input.target,
    intent: "reveal",
    placement: { mode: "pane", paneId: explorerPane.id },
    parentTabId: input.parentTabId ?? undefined,
  });
}
