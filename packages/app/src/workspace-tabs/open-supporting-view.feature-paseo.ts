import type { OpenInSidePanePreferences, PullRequestOpenLocation } from "@/hooks/use-settings";
import type { ExplorerCheckoutContext } from "@/stores/explorer-checkout-context";
import {
  isExplorerSidebarOpen,
  openExplorerSidebarView,
  usesCompactExplorerSidebar,
  type ExplorerSidebarView,
} from "@/workspace-tabs/explorer-sidebar";
import {
  collectAllTabs,
  DEFAULT_PANE_ID,
  findPaneById,
  selectExplorerSidebarPaneId,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { openPreferredWorkspaceTarget } from "@/workspace-tabs/open-beside";

interface WorkspaceViewInput {
  isCompact: boolean;
  workspaceKey: string | null;
  checkout: ExplorerCheckoutContext | null;
  supportsPaneSplits?: boolean;
}

interface OpenWorkspaceChangesInput extends WorkspaceViewInput {
  preferences: OpenInSidePanePreferences;
}

interface OpenWorkspacePullRequestInput extends WorkspaceViewInput {
  destination: PullRequestOpenLocation;
}

function openExplorerView(input: WorkspaceViewInput, view: ExplorerSidebarView): void {
  openExplorerSidebarView({ ...input, view });
}

/** Opens the workspace Changes view according to the current layout and diff preference. */
export function openWorkspaceChanges(input: OpenWorkspaceChangesInput): string | null {
  if (usesCompactExplorerSidebar(input)) {
    openExplorerView(input, "changes");
    return null;
  }
  return openPreferredWorkspaceTarget({
    isCompact: input.isCompact,
    workspaceKey: input.workspaceKey,
    target: { kind: "working_diff" },
    source: "diffs",
    preferences: input.preferences,
  });
}

/** Reveals Changes from the composer, then opens its diff on a subsequent desktop action. */
export function openComposerChanges(input: OpenWorkspaceChangesInput): string | null {
  if (usesCompactExplorerSidebar(input) || isExplorerSidebarOpen(input)) {
    return openWorkspaceChanges(input);
  }
  openExplorerView(input, "changes");
  return null;
}

/** Opens the workspace pull request at its semantic destination. */
export function openWorkspacePullRequest(input: OpenWorkspacePullRequestInput): string | null {
  if (usesCompactExplorerSidebar(input) || input.destination === "explorer") {
    openExplorerView(input, "pr");
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
