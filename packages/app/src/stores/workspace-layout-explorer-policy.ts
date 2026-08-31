import type { WorkspaceTab } from "@/workspace-tabs/model";
import {
  collectAllPanes,
  collectAllTabs,
  convertDraftToAgentInLayout,
  createWorkspaceLayoutWithExplorerSidebar,
  DEFAULT_PANE_ID,
  EXPLORER_SIDEBAR_PANE_ID,
  findPaneById,
  moveTabToPaneInLayout,
  openTabInLayoutBackground,
  reconcileWorkspaceTabs,
  removeTabFromTree,
  reorderPaneTabsInLayout,
  restoreEmptyPanesInLayout,
  selectTabInPaneInLayout,
  setPaneHiddenInLayout,
  type WorkspaceLayout,
  type WorkspaceTabReconcileState,
  type WorkspaceTabSnapshot,
} from "@/stores/workspace-layout-actions";
import { DEFAULT_EXPLORER_TARGETS } from "@/stores/workspace-layout-explorer-targets";

export interface ExtendedWorkspaceTabSnapshot extends WorkspaceTabSnapshot {
  replaceableDraftTabId?: string | null;
}

function isDefaultWorkingDiffTab(tab: WorkspaceTab): boolean {
  return (
    tab.target.kind === "working_diff" &&
    !tab.target.cwd &&
    !tab.target.focusPath &&
    !tab.target.focusRequestId &&
    tab.state === undefined
  );
}

function removeDefaultWorkingDiffTabs(
  layout: WorkspaceLayout,
  matchingTabs: readonly WorkspaceTab[],
): WorkspaceLayout {
  let root = layout.root;
  for (const tab of matchingTabs) {
    if (isDefaultWorkingDiffTab(tab)) {
      root = removeTabFromTree(root, tab.tabId);
    }
  }
  return root === layout.root ? layout : { ...layout, root };
}

export function reorderExplorerSidebarDefaultTabs(
  layout: WorkspaceLayout,
  paneId: string,
): WorkspaceLayout {
  const explorerPane = findPaneById(layout.root, paneId);
  if (!explorerPane) {
    return layout;
  }

  const allTabs = collectAllTabs(layout.root);
  const requiredKinds = new Set<string>(DEFAULT_EXPLORER_TARGETS.map((target) => target.kind));
  const requiredTabIds = DEFAULT_EXPLORER_TARGETS.flatMap((target) => {
    const tab = explorerPane.tabIds
      .map((tabId) => allTabs.find((candidate) => candidate.tabId === tabId))
      .find((candidate) => candidate?.target.kind === target.kind);
    return tab ? [tab.tabId] : [];
  });
  const firstRequiredIndex = explorerPane.tabIds.findIndex((tabId) => {
    const tab = allTabs.find((candidate) => candidate.tabId === tabId);
    return tab ? requiredKinds.has(tab.target.kind) : false;
  });
  const insertionIndex = firstRequiredIndex < 0 ? explorerPane.tabIds.length : firstRequiredIndex;
  const otherTabIds = explorerPane.tabIds.filter((tabId) => !requiredTabIds.includes(tabId));
  const orderedTabIds = [
    ...otherTabIds.slice(0, insertionIndex),
    ...requiredTabIds,
    ...otherTabIds.slice(insertionIndex),
  ];

  return (
    reorderPaneTabsInLayout({
      layout,
      paneId,
      tabIds: orderedTabIds,
    }) ?? layout
  );
}

export function keepWorkspaceFocusOutOfExplorerSidebar(
  layout: WorkspaceLayout,
  explorerSidebarPaneId: string | null,
  preferredMainPaneId?: string | null,
): WorkspaceLayout {
  if (!explorerSidebarPaneId || layout.focusedPaneId !== explorerSidebarPaneId) {
    return layout;
  }
  const panes = collectAllPanes(layout.root);
  const preferredPane = panes.find(
    (pane) => pane.id === preferredMainPaneId && pane.id !== explorerSidebarPaneId,
  );
  const mainPane =
    preferredPane ??
    panes.find((pane) => pane.id === DEFAULT_PANE_ID && pane.id !== explorerSidebarPaneId) ??
    panes.find((pane) => pane.id !== explorerSidebarPaneId);
  return { ...layout, focusedPaneId: mainPane?.id ?? null };
}

export function ensureExplorerSidebarDefaultTabs(
  layout: WorkspaceLayout,
  paneId: string,
): WorkspaceLayout {
  const pane = findPaneById(layout.root, paneId);
  if (!pane) {
    return layout;
  }

  const originalFocusedPaneId = layout.focusedPaneId;
  const wasHidden = pane.hidden === true;
  let nextLayout =
    (wasHidden ? setPaneHiddenInLayout({ layout, paneId, hidden: false }) : null) ?? layout;

  for (const target of DEFAULT_EXPLORER_TARGETS) {
    const explorerPane = findPaneById(nextLayout.root, paneId);
    const matchingTabs = collectAllTabs(nextLayout.root).filter(
      (tab) => tab.target.kind === target.kind,
    );
    let existingTab = matchingTabs[0];
    if (target.kind === "working_diff") {
      const configuredTabs = matchingTabs.filter(
        (tab) =>
          tab.target.kind === "working_diff" &&
          Boolean(
            tab.target.cwd ||
            tab.target.focusPath ||
            tab.target.focusRequestId ||
            tab.state !== undefined,
          ),
      );
      existingTab = configuredTabs[0] ?? matchingTabs[0];
      if (configuredTabs.length > 0) {
        nextLayout = removeDefaultWorkingDiffTabs(nextLayout, matchingTabs);
      }
    }
    if (existingTab && explorerPane?.tabIds.includes(existingTab.tabId)) {
      continue;
    }

    if (existingTab) {
      nextLayout =
        moveTabToPaneInLayout({
          layout: nextLayout,
          tabId: existingTab.tabId,
          toPaneId: paneId,
          explorerSidebarPaneId: paneId,
        }) ?? nextLayout;
      continue;
    }

    nextLayout =
      openTabInLayoutBackground({
        layout: nextLayout,
        target,
        now: Date.now(),
        placement: { mode: "pane", paneId },
        explorerSidebarPaneId: paneId,
      })?.layout ?? nextLayout;
  }

  nextLayout = reorderExplorerSidebarDefaultTabs(nextLayout, paneId);
  if (wasHidden) {
    nextLayout = setPaneHiddenInLayout({ layout: nextLayout, paneId, hidden: true }) ?? nextLayout;
  }
  return keepWorkspaceFocusOutOfExplorerSidebar(nextLayout, paneId, originalFocusedPaneId);
}

export function createExtendedWorkspaceLayoutWithExplorerSidebar(): WorkspaceLayout {
  const layout = ensureExplorerSidebarDefaultTabs(
    createWorkspaceLayoutWithExplorerSidebar(),
    EXPLORER_SIDEBAR_PANE_ID,
  );
  const changesTab = collectAllTabs(layout.root).find((tab) => tab.target.kind === "changes_tree");
  if (!changesTab) {
    return layout;
  }
  return (
    selectTabInPaneInLayout({
      layout,
      paneId: EXPLORER_SIDEBAR_PANE_ID,
      tabId: changesTab.tabId,
    }) ?? layout
  );
}

export function restoreExtendedEmptyPanesInLayout(
  layout: WorkspaceLayout,
  explorerSidebarPaneId: string | null = null,
): WorkspaceLayout {
  const restored = restoreEmptyPanesInLayout(layout, explorerSidebarPaneId);
  return explorerSidebarPaneId
    ? ensureExplorerSidebarDefaultTabs(restored, explorerSidebarPaneId)
    : restored;
}

export function reconcileExtendedWorkspaceTabs(
  state: WorkspaceTabReconcileState,
  snapshot: ExtendedWorkspaceTabSnapshot,
): WorkspaceTabReconcileState {
  const replaceableDraftTabId = snapshot.replaceableDraftTabId;
  if (!replaceableDraftTabId) {
    return reconcileWorkspaceTabs(state, snapshot);
  }

  const representedAgentIds = new Set(
    collectAllTabs(state.layout.root).flatMap((tab) =>
      tab.target.kind === "agent" ? [tab.target.agentId] : [],
    ),
  );
  const knownAgentIds = new Set(snapshot.knownAgentIds);
  const nextAgentId = [...new Set(snapshot.autoOpenAgentIds)]
    .sort()
    .find(
      (agentId) =>
        !representedAgentIds.has(agentId) &&
        (!snapshot.hasActivePendingDraftCreate || knownAgentIds.has(agentId)),
    );
  if (!nextAgentId) {
    return reconcileWorkspaceTabs(state, snapshot);
  }

  const converted = convertDraftToAgentInLayout({
    layout: state.layout,
    tabId: replaceableDraftTabId,
    agentId: nextAgentId,
  });
  return reconcileWorkspaceTabs(
    converted ? { ...state, layout: converted.layout } : state,
    snapshot,
  );
}
