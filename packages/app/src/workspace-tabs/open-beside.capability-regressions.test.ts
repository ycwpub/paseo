import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

import { DEFAULT_APP_SETTINGS } from "@/hooks/use-settings";
import {
  collectAllTabs,
  findPaneById,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import {
  openPreferredWorkspacePreview,
  openPreferredWorkspaceTarget,
} from "@/workspace-tabs/open-beside";
import { openComposerChanges } from "@/workspace-tabs/open-supporting-view";

const SERVER_ID = "server-1";
const WORKSPACE_ID = "workspace-1";
const WORKSPACE_KEY = `${SERVER_ID}:${WORKSPACE_ID}`;
const CHECKOUT = { serverId: SERVER_ID, cwd: "/project", isGit: true };

beforeEach(() => {
  useWorkspaceLayoutStore.setState({
    layoutByWorkspace: {},
    explorerSidebarPaneIdByWorkspace: {},
    sidePaneIdByWorkspace: {},
    splitSizesByWorkspace: {},
  });
});

describe("workspace Diff preview placement", () => {
  it("routes the review action to the right Explorer Diff tab", () => {
    openPreferredWorkspaceTarget({
      isCompact: false,
      workspaceKey: WORKSPACE_KEY,
      target: {
        kind: "working_diff",
        cwd: "/project/repository",
        focusPath: "src/index.ts",
        focusRequestId: 1,
      },
      source: "diffs",
      preferences: {
        ...DEFAULT_APP_SETTINGS.openInSidePane,
        diffs: true,
      },
    });

    const state = useWorkspaceLayoutStore.getState();
    const layout = state.layoutByWorkspace[WORKSPACE_KEY];
    const explorerSidebarPaneId = state.explorerSidebarPaneIdByWorkspace[WORKSPACE_KEY];
    const explorerPane =
      layout && explorerSidebarPaneId ? findPaneById(layout.root, explorerSidebarPaneId) : null;
    const workingDiffTabs = layout
      ? collectAllTabs(layout.root).filter((tab) => tab.target.kind === "working_diff")
      : [];

    expect(workingDiffTabs).toHaveLength(1);
    expect(explorerPane?.hidden).not.toBe(true);
    expect(explorerPane?.tabIds).toContain(workingDiffTabs[0]?.tabId);
    expect(workingDiffTabs[0]?.target).toMatchObject({
      kind: "working_diff",
      cwd: "/project/repository",
      focusPath: "src/index.ts",
    });
    expect(state.sidePaneIdByWorkspace[WORKSPACE_KEY]).toBeUndefined();
  });

  it("reuses the right Explorer Diff tab instead of creating a middle pane", () => {
    openComposerChanges({
      isCompact: false,
      supportsPaneSplits: true,
      workspaceKey: WORKSPACE_KEY,
      checkout: CHECKOUT,
      preferences: DEFAULT_APP_SETTINGS.openInSidePane,
    });

    const initialState = useWorkspaceLayoutStore.getState();
    const explorerSidebarPaneId =
      initialState.explorerSidebarPaneIdByWorkspace[WORKSPACE_KEY] ?? null;
    expect(explorerSidebarPaneId).not.toBeNull();
    initialState.openTab({
      workspaceKey: WORKSPACE_KEY,
      target: {
        kind: "working_diff",
        cwd: "/project/old-repository",
        focusPath: "src/old.ts",
        focusRequestId: 0,
      },
      intent: "reveal",
      placement: { mode: "pane", paneId: "main" },
    });
    expect(
      collectAllTabs(
        useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY].root,
      ).filter((tab) => tab.target.kind === "working_diff"),
    ).toHaveLength(2);

    openPreferredWorkspacePreview({
      isCompact: false,
      workspaceKey: WORKSPACE_KEY,
      serverId: SERVER_ID,
      workspaceId: WORKSPACE_ID,
      explorerSidebarPaneId,
      lastMainPaneId: "main",
      target: {
        kind: "working_diff",
        cwd: "/project/repository",
        focusPath: "src/index.ts",
        focusRequestId: 1,
      },
      source: "diffs",
      preferences: {
        ...DEFAULT_APP_SETTINGS.openInSidePane,
        diffs: true,
      },
    });

    const state = useWorkspaceLayoutStore.getState();
    const layout = state.layoutByWorkspace[WORKSPACE_KEY];
    const explorerPane =
      layout && explorerSidebarPaneId ? findPaneById(layout.root, explorerSidebarPaneId) : null;
    const workingDiffTabs = layout
      ? collectAllTabs(layout.root).filter((tab) => tab.target.kind === "working_diff")
      : [];
    const explorerTabIds = new Set(explorerPane?.tabIds ?? []);
    const mainPaneDiffs = workingDiffTabs.filter((tab) => !explorerTabIds.has(tab.tabId));

    expect(workingDiffTabs).toHaveLength(1);
    expect(explorerPane?.tabIds).toContain(workingDiffTabs[0]?.tabId);
    expect(workingDiffTabs[0]?.target).toEqual({
      kind: "working_diff",
      cwd: "/project/repository",
      focusPath: "src/index.ts",
      focusRequestId: 1,
    });
    expect(mainPaneDiffs).toHaveLength(0);
    expect(state.sidePaneIdByWorkspace[WORKSPACE_KEY]).toBeUndefined();
  });
});
