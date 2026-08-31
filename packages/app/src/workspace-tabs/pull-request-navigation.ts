import type { PullRequestOpenLocation } from "@/hooks/use-settings";
import type { ExplorerCheckoutContext } from "@/stores/explorer-checkout-context";
import {
  collectAllTabs,
  DEFAULT_PANE_ID,
  findPaneById,
  selectExplorerSidebarPaneId,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import {
  openExplorerSidebarView,
  usesCompactExplorerSidebar,
} from "@/workspace-tabs/explorer-sidebar";

export interface OpenProjectPullRequestInput {
  isCompact: boolean;
  workspaceKey: string | null;
  checkout: ExplorerCheckoutContext | null;
  supportsPaneSplits?: boolean;
  destination: PullRequestOpenLocation;
}

export function openProjectPullRequest(input: OpenProjectPullRequestInput): string | null {
  if (usesCompactExplorerSidebar(input) || input.destination === "explorer") {
    openExplorerSidebarView({ ...input, view: "pr" });
    return null;
  }
  if (!input.workspaceKey) {
    return null;
  }

  const store = useWorkspaceLayoutStore.getState();
  const initialLayout = store.layoutByWorkspace[input.workspaceKey];
  const explorerPaneId = initialLayout
    ? selectExplorerSidebarPaneId(store, input.workspaceKey)
    : null;
  const paneId =
    input.destination === "side"
      ? store.ensureSidePane(input.workspaceKey)
      : ((initialLayout?.focusedPaneId === explorerPaneId
          ? DEFAULT_PANE_ID
          : initialLayout?.focusedPaneId) ?? DEFAULT_PANE_ID);
  if (!paneId) {
    return null;
  }

  const layout = store.layoutByWorkspace[input.workspaceKey];
  const pane = layout ? findPaneById(layout.root, paneId) : null;
  const existingTab = layout
    ? collectAllTabs(layout.root).find(
        (tab) => pane?.tabIds.includes(tab.tabId) && tab.target.kind === "pull_request",
      )
    : null;
  if (existingTab) {
    store.focusTab(input.workspaceKey, existingTab.tabId);
    return existingTab.tabId;
  }

  return store.openTab({
    workspaceKey: input.workspaceKey,
    target: { kind: "pull_request" },
    intent: "new",
    placement: { mode: "pane", paneId },
  });
}
