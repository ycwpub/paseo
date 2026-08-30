import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => {
  const storage = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        storage.delete(key);
      }),
    },
  };
});
import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { type ChangesState } from "@/panels/changes/state";
import {
  collectAllPanes,
  collectAllTabs,
  createWorkspaceLayoutStore,
  createDefaultLayout,
  createWorkspaceLayoutWithExplorerSidebar,
  findPaneById,
  findPaneContainingTab,
  stripEphemeralTabsFromLayout,
  type SplitNode,
} from "@/stores/workspace-layout-store";
const SERVER_ID = "server-1";
const WORKSPACE_ID = "ws-main";
function createDeterministicWorkspaceLayoutIds() {
  let values: string[] = [];
  let fallbackIndex = 0;
  function nextValue(): string {
    const value = values.shift();
    if (value) {
      return value;
    }
    fallbackIndex += 1;
    return `generated-${fallbackIndex}`;
  }
  return {
    useValues: (nextValues: string[]) => {
      values = nextValues.slice();
      fallbackIndex = 0;
    },
    reset: () => {
      values = [];
      fallbackIndex = 0;
    },
    createNodeId: (prefix: "pane" | "group") => `${prefix}_${nextValue()}`,
    createFocusRestorationToken: () => `workspace-focus-${nextValue()}`,
  };
}
const workspaceLayoutIds = createDeterministicWorkspaceLayoutIds();
const workspaceLayoutStore = createWorkspaceLayoutStore(workspaceLayoutIds);
function useWorkspaceLayoutIds(...values: string[]) {
  workspaceLayoutIds.useValues(values);
}
function createWorkspaceKey(): string {
  const key = buildWorkspaceTabPersistenceKey({
    serverId: SERVER_ID,
    workspaceId: WORKSPACE_ID,
  });
  expect(key).toBeTruthy();
  return key as string;
}
function collectTabIds(root: SplitNode): string[] {
  return collectAllTabs(root).map((tab) => tab.tabId);
}
function expectGroup(node: SplitNode): Extract<
  SplitNode,
  {
    kind: "group";
  }
> {
  expect(node.kind).toBe("group");
  return node as Extract<
    SplitNode,
    {
      kind: "group";
    }
  >;
}
describe("workspace-layout-store helpers", () => {
  it("seeds all five default views in the Explorer sidebar", () => {
    const layout = createWorkspaceLayoutWithExplorerSidebar();
    const tabs = collectAllTabs(layout.root);
    expect(tabs.map((tab) => tab.target)).toEqual([
      { kind: "new_tab" },
      { kind: "files" },
      { kind: "changes_tree" },
      { kind: "working_diff" },
      { kind: "task_summary" },
      { kind: "pull_request" },
    ]);
    expect(findPaneById(layout.root, "explorer")?.focusedTabId).toBe(
      tabs.find((tab) => tab.target.kind === "changes_tree")?.tabId,
    );
  });
  it("discards persisted New tabs and restores each empty pane with a fresh identity", async () => {
    const persisted = createWorkspaceLayoutWithExplorerSidebar();
    const persistedIds = new Set(collectAllTabs(persisted.root).map((tab) => tab.tabId));
    await AsyncStorage.setItem(
      "workspace-layout-state",
      JSON.stringify({
        state: {
          layoutByWorkspace: { workspace: persisted },
          splitSizesByWorkspace: {},
          explorerPaneIdByWorkspace: { workspace: "explorer" },
        },
        version: 1,
      }),
    );
    const restored = createWorkspaceLayoutStore(createDeterministicWorkspaceLayoutIds());
    await restored.persist.rehydrate();
    const restoredTabs = collectAllTabs(restored.getState().layoutByWorkspace.workspace.root);
    expect(restoredTabs.map((tab) => tab.target)).toEqual([
      { kind: "new_tab" },
      { kind: "files" },
      { kind: "changes_tree" },
      { kind: "working_diff" },
      { kind: "task_summary" },
      { kind: "pull_request" },
    ]);
    const restoredNewTab = restoredTabs.find((tab) => tab.target.kind === "new_tab");
    expect(restoredNewTab).toBeTruthy();
    expect(persistedIds.has(restoredNewTab?.tabId ?? "")).toBe(false);
  });
});
describe("workspace-layout-store actions", () => {
  it("creates duplicate Pull request instances alongside the Explorer view", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const first = store.openTab({ workspaceKey, target: { kind: "pull_request" }, intent: "new" });
    const second = store.openTab({ workspaceKey, target: { kind: "pull_request" }, intent: "new" });
    expect(first).not.toBe(second);
    expect(
      collectAllTabs(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root).filter(
        (tab) => tab.target.kind === "pull_request",
      ),
    ).toHaveLength(3);
  });
  beforeEach(() => {
    workspaceLayoutIds.reset();
    workspaceLayoutStore.setState({
      layoutByWorkspace: {},
      splitSizesByWorkspace: {},
      pinnedAgentIdsByWorkspace: {},
      hiddenAgentIdsByWorkspace: {},
      focusRestorationByWorkspace: {},
      explorerSidebarPaneIdByWorkspace: {},
    });
  });
  it("migrates legacy layouts to include the hidden registered explorer pane", async () => {
    const legacyLayout = createDefaultLayout();
    await AsyncStorage.setItem(
      "workspace-layout-state",
      JSON.stringify({
        state: { layoutByWorkspace: { legacy: legacyLayout } },
        version: 1,
      }),
    );
    const restored = createWorkspaceLayoutStore(createDeterministicWorkspaceLayoutIds());
    await restored.persist.rehydrate();
    const state = restored.getState();
    const layout = state.layoutByWorkspace.legacy;
    const explorerSidebarPaneId = state.explorerSidebarPaneIdByWorkspace.legacy;
    expect(findPaneById(layout.root, "main")).toBeTruthy();
    expect(explorerSidebarPaneId).toBeTruthy();
    const explorerPane = findPaneById(layout.root, explorerSidebarPaneId);
    expect(explorerPane?.hidden).toBe(true);
    const tabsById = new Map(collectAllTabs(layout.root).map((tab) => [tab.tabId, tab]));
    expect(explorerPane?.tabIds.map((tabId) => tabsById.get(tabId)?.target)).toEqual([
      { kind: "files" },
      { kind: "changes_tree" },
      { kind: "working_diff" },
      { kind: "task_summary" },
      { kind: "pull_request" },
    ]);
    expect(restored.getState().splitSizesByWorkspace).toEqual({});
    await expect(AsyncStorage.getItem("workspace-layout-state")).resolves.not.toBeNull();
  });
  it("persists first-class pane targets, visibility, and focus", async () => {
    await AsyncStorage.removeItem("workspace-layout-state");
    const workspaceKey = createWorkspaceKey();
    const source = createWorkspaceLayoutStore(createDeterministicWorkspaceLayoutIds());
    await source.persist.rehydrate();
    source.getState().openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });
    const focusedAgentTabId = source.getState().openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-2" },
      intent: "reveal",
    });
    const explorerSidebarPaneId = source.getState().showExplorerSidebar(workspaceKey);
    expect(explorerSidebarPaneId).toBeTruthy();
    source
      .getState()
      .openTab({ workspaceKey: workspaceKey, target: { kind: "files" }, intent: "reveal" });
    source.getState().openTab({
      workspaceKey: workspaceKey,
      target: { kind: "pull_request" },
      intent: "background",
      placement: { mode: "prefer", paneId: explorerSidebarPaneId as string },
    });
    source.getState().hideExplorerSidebar(workspaceKey);
    await vi.waitFor(async () => {
      expect(await AsyncStorage.getItem("workspace-layout-state")).not.toBeNull();
    });
    const restored = createWorkspaceLayoutStore(createDeterministicWorkspaceLayoutIds());
    await restored.persist.rehydrate();
    const state = restored.getState();
    const layout = state.layoutByWorkspace[workspaceKey];
    expect(layout.focusedPaneId).toBe("main");
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe(focusedAgentTabId);
    expect(findPaneById(layout.root, explorerSidebarPaneId)?.hidden).toBe(true);
    expect(collectAllTabs(layout.root).map((tab) => tab.target.kind)).toEqual([
      "agent",
      "agent",
      "files",
      "changes_tree",
      "working_diff",
      "task_summary",
      "pull_request",
    ]);
    expect(state.explorerSidebarPaneIdByWorkspace[workspaceKey]).toBe(explorerSidebarPaneId);
  });
  it("persists and rehydrates independent Changes state through validated storage", async () => {
    await AsyncStorage.removeItem("workspace-layout-state");
    const workspaceKey = createWorkspaceKey();
    const source = createWorkspaceLayoutStore(createDeterministicWorkspaceLayoutIds());
    await source.persist.rehydrate();
    const first = source
      .getState()
      .openTab({ workspaceKey: workspaceKey, target: { kind: "working_diff" }, intent: "new" })!;
    const second = source
      .getState()
      .openTab({ workspaceKey: workspaceKey, target: { kind: "working_diff" }, intent: "new" })!;
    const firstState: ChangesState = {
      treeVisible: true,
      treeWidth: 320,
      collapsedFilePaths: ["src/a.ts"],
      collapsedFolderPaths: ["src"],
      commitsCollapsed: false,
    };
    const secondState: ChangesState = {
      treeVisible: false,
      collapsedFilePaths: ["README.md"],
      collapsedFolderPaths: ["docs"],
      commitsCollapsed: true,
    };
    source.getState().setTabState(workspaceKey, first, firstState);
    source.getState().setTabState(workspaceKey, second, secondState);
    await vi.waitFor(async () => {
      const persisted = await AsyncStorage.getItem("workspace-layout-state");
      expect(persisted).not.toBeNull();
      const root = JSON.parse(persisted ?? "{}").state.layoutByWorkspace[workspaceKey].root;
      expect(collectTabIds(root)).toEqual([
        first,
        second,
        "files",
        "changes_tree",
        "working_diff",
        "task_summary",
        "pull_request",
      ]);
    });
    const restored = createWorkspaceLayoutStore(createDeterministicWorkspaceLayoutIds());
    await restored.persist.rehydrate();
    const tabs = collectAllTabs(restored.getState().layoutByWorkspace[workspaceKey].root);
    expect(tabs.find((tab) => tab.tabId === first)?.state).toEqual(firstState);
    expect(tabs.find((tab) => tab.tabId === second)?.state).toEqual(secondState);
  });
  it("hides and shows Explorer without changing its default tabs or split sizes", () => {
    useWorkspaceLayoutIds("88888888-8888-8888-8888-888888888888");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "draft", draftId: "main-tab" },
      intent: "reveal",
    });
    const paneId = store.showExplorerSidebar(workspaceKey)!;
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "working_diff" },
      intent: "reveal",
    });
    const sizes = expectGroup(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root)
      .group.sizes;
    store.hideExplorerSidebar(workspaceKey);
    let layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneById(layout.root, paneId)).toMatchObject({
      hidden: true,
      tabIds: ["files", "changes_tree", "working_diff", "task_summary", "pull_request"],
    });
    expect(expectGroup(layout.root).group.sizes).toEqual(sizes);
    expect(layout.focusedPaneId).toBe("main");
    store.showExplorerSidebar(workspaceKey);
    layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneById(layout.root, paneId)).toMatchObject({
      tabIds: ["files", "changes_tree", "working_diff", "task_summary", "pull_request"],
    });
    expect(findPaneById(layout.root, paneId)?.hidden).toBeUndefined();
    expect(expectGroup(layout.root).group.sizes).toEqual(sizes);
  });
  it("focusTab reveals an Explorer tab without moving workspace focus", () => {
    useWorkspaceLayoutIds("89898989-8989-8989-8989-898989898989");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/worktree/a.ts" },
      intent: "reveal",
    });
    const targetTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "terminal",
        terminalId: "term-hidden",
      },
      intent: "reveal",
    })!;
    const paneId = store.showExplorerSidebar(workspaceKey)!;
    store.moveTabToPane(workspaceKey, targetTabId, paneId);
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "working_diff" },
      intent: "reveal",
    });
    store.focusPane(workspaceKey, "main");
    const group = expectGroup(
      workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root,
    ).group;
    store.resizeSplit(workspaceKey, group.id, [0.7, 0.3]);
    store.hideExplorerSidebar(workspaceKey);
    const splitSizes = workspaceLayoutStore.getState().splitSizesByWorkspace[workspaceKey];
    store.focusTab(workspaceKey, targetTabId);
    const state = workspaceLayoutStore.getState();
    const layout = state.layoutByWorkspace[workspaceKey];
    expect(layout.focusedPaneId).toBe("main");
    expect(findPaneById(layout.root, paneId)).toMatchObject({
      focusedTabId: targetTabId,
      tabIds: [
        "files",
        "changes_tree",
        "working_diff",
        "task_summary",
        "pull_request",
        targetTabId,
      ],
    });
    expect(findPaneById(layout.root, paneId)?.hidden).toBeUndefined();
    expect(expectGroup(layout.root).group.sizes).toEqual(group.sizes);
    expect(state.splitSizesByWorkspace[workspaceKey]).toBe(splitSizes);
  });
  it("does not move Explorer-only default tabs into main", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const fileTabId = store.openTab({
      workspaceKey,
      target: { kind: "file", path: "/repo/worktree/a.ts" },
      intent: "reveal",
    }) as string;
    const explorerSidebarPaneId = store.showExplorerSidebar(workspaceKey) as string;
    const before = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const changesTabId = findPaneById(before.root, explorerSidebarPaneId)?.focusedTabId as string;
    store.moveTabToPane(workspaceKey, changesTabId, "main");
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneById(layout.root, explorerSidebarPaneId)?.hidden).toBeUndefined();
    expect(findPaneById(layout.root, "main")?.tabIds).toEqual([fileTabId]);
    expect(findPaneById(layout.root, explorerSidebarPaneId)?.tabIds).toEqual([
      "files",
      "changes_tree",
      "working_diff",
      "task_summary",
      "pull_request",
    ]);
  });
  it("persists working diff tabs while stripping commit diff tabs", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "working_diff",
        focusPath: "src/a.ts",
      },
      intent: "reveal",
    });
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "commit_diff", sha: "abc123" },
      intent: "reveal",
    });
    const partialize = workspaceLayoutStore.persist.getOptions().partialize;
    expect(partialize).toBeTypeOf("function");
    if (!partialize) {
      throw new Error("Workspace layout partialize function is missing");
    }
    const currentState = workspaceLayoutStore.getState();
    const layout = stripEphemeralTabsFromLayout(currentState.layoutByWorkspace[workspaceKey]);
    const persisted = partialize(currentState);
    expect(persisted).toEqual({
      layoutByWorkspace: { [workspaceKey]: layout },
      splitSizesByWorkspace: currentState.splitSizesByWorkspace,
      explorerSidebarWidthByWorkspace: currentState.explorerSidebarWidthByWorkspace,
      explorerPaneIdByWorkspace: {},
      sidePaneIdByWorkspace: currentState.sidePaneIdByWorkspace,
    });
    expect(layout && collectAllTabs(layout.root).map((tab) => tab.target)).toEqual([
      { kind: "files" },
      { kind: "changes_tree" },
      {
        kind: "working_diff",
        focusPath: "src/a.ts",
      },
      { kind: "task_summary" },
      { kind: "pull_request" },
    ]);
  });
  it("keeps an explicitly pinned archived Agent tab while reconciling active agents", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTabFocused(workspaceKey, { kind: "agent", agentId: "archived-agent" });
    store.pinAgent(workspaceKey, "archived-agent");
    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: [],
      autoOpenAgentIds: [],
      knownAgentIds: ["archived-agent"],
      standaloneTerminalIds: [],
    });
    expect(
      workspaceLayoutStore
        .getState()
        .getWorkspaceTabs(workspaceKey)
        .map((tab) => tab.tabId),
    ).toEqual([
      "agent_archived-agent",
      "files",
      "changes_tree",
      "working_diff",
      "task_summary",
      "pull_request",
    ]);
  });
  it("reconcileTabs replaces the focused empty draft with an externally created Agent", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const draftTabId = store.openTabFocused(workspaceKey, {
      kind: "draft",
      draftId: "draft-default",
    });
    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["workflow-agent"],
      autoOpenAgentIds: ["workflow-agent"],
      knownAgentIds: ["workflow-agent"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
      replaceableDraftTabId: draftTabId,
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(collectAllTabs(layout.root)).toEqual([
      {
        tabId: "agent_workflow-agent",
        target: { kind: "agent", agentId: "workflow-agent" },
        createdAt: expect.any(Number),
      },
      {
        tabId: "files",
        target: { kind: "files" },
        createdAt: expect.any(Number),
      },
      {
        tabId: "changes_tree",
        target: { kind: "changes_tree" },
        createdAt: expect.any(Number),
      },
      {
        tabId: "working_diff",
        target: { kind: "working_diff" },
        createdAt: expect.any(Number),
      },
      {
        tabId: "task_summary",
        target: { kind: "task_summary" },
        createdAt: expect.any(Number),
      },
      {
        tabId: "pull_request",
        target: { kind: "pull_request" },
        createdAt: expect.any(Number),
      },
    ]);
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe("agent_workflow-agent");
  });
  it("reconcileTabs keeps a draft when it is not marked replaceable", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTabFocused(workspaceKey, {
      kind: "draft",
      draftId: "draft-with-input",
    });
    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["workflow-agent"],
      autoOpenAgentIds: ["workflow-agent"],
      knownAgentIds: ["workflow-agent"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
      replaceableDraftTabId: null,
    });
    const tabs = collectAllTabs(
      workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root,
    );
    expect(tabs.map((tab) => tab.tabId)).toEqual([
      "draft-with-input",
      "agent_workflow-agent",
      "files",
      "changes_tree",
      "working_diff",
      "task_summary",
      "pull_request",
    ]);
  });
  it("closing Files leaves Changes available in Explorer", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "kept" },
      intent: "reveal",
    });
    const paneId = store.showExplorerSidebar(workspaceKey) as string;
    const filesTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "files" },
      intent: "reveal",
      placement: { mode: "pane", paneId },
    }) as string;
    store.closeTab(workspaceKey, filesTabId);
    let layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const hiddenPane = findPaneById(layout.root, paneId);
    expect(hiddenPane?.hidden).toBeUndefined();
    expect(hiddenPane?.tabIds).toHaveLength(4);
    expect(
      collectAllTabs(layout.root).find((tab) => tab.tabId === hiddenPane?.focusedTabId)?.target,
    ).toEqual({ kind: "changes_tree" });
    expect(collectAllPanes(layout.root).map((pane) => pane.id)).toEqual(["main", paneId]);
    expect(store.showExplorerSidebar(workspaceKey)).toBe(paneId);
    layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneById(layout.root, paneId)?.tabIds).toEqual(hiddenPane?.tabIds);
    expect(findPaneById(layout.root, paneId)?.hidden).toBeUndefined();
  });
  it("closing one of several Explorer tabs leaves the sidebar visible", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "kept" },
      intent: "reveal",
    });
    const paneId = store.showExplorerSidebar(workspaceKey) as string;
    const filesTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "files" },
      intent: "reveal",
      placement: { mode: "pane", paneId },
    }) as string;
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "working_diff" },
      intent: "reveal",
      placement: { mode: "pane", paneId },
    });
    store.closeTab(workspaceKey, filesTabId);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneById(layout.root, paneId)?.hidden).toBeUndefined();
    expect(findPaneById(layout.root, paneId)?.tabIds).toEqual([
      "changes_tree",
      "working_diff",
      "task_summary",
      "pull_request",
    ]);
  });
  it("closing Files keeps Changes on screen without removing the final ordinary pane", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "only" },
      intent: "reveal",
    });
    const paneId = store.showExplorerSidebar(workspaceKey) as string;
    const filesTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "files" },
      intent: "reveal",
      placement: { mode: "pane", paneId },
    }) as string;
    store.closePane(workspaceKey, "main");
    store.closeTab(workspaceKey, filesTabId);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(collectAllPanes(layout.root).map((pane) => pane.id)).toEqual(["main", paneId]);
    expect(findPaneById(layout.root, "main")?.tabIds).toHaveLength(1);
    const finalPane = findPaneById(layout.root, paneId);
    expect(finalPane?.tabIds).toHaveLength(4);
    expect(
      collectAllTabs(layout.root).find((tab) => tab.tabId === finalPane?.focusedTabId)?.target,
    ).toEqual({ kind: "changes_tree" });
    expect(findPaneById(layout.root, paneId)?.hidden).toBeUndefined();
  });
  it("leaves the default tabs in Explorer when content is claimed by main", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });
    const paneId = store.showExplorerSidebar(workspaceKey) as string;
    const changesTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "working_diff" },
      intent: "reveal",
      placement: { mode: "pane", paneId },
    }) as string;
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "working_diff" },
      intent: "reveal",
      placement: { mode: "pane", paneId: "main" },
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneContainingTab(layout.root, changesTabId)?.id).toBe("main");
    const sidePane = findPaneById(layout.root, paneId);
    const tabsById = new Map(collectAllTabs(layout.root).map((tab) => [tab.tabId, tab]));
    expect(sidePane?.tabIds.map((tabId) => tabsById.get(tabId)?.target.kind)).toEqual([
      "files",
      "changes_tree",
      "working_diff",
      "task_summary",
      "pull_request",
    ]);
    expect(findPaneById(layout.root, paneId)?.hidden).toBeUndefined();
  });
});
