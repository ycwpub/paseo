import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));
import { usePanelStore } from "@/stores/panel-store";
import {
  collectAllTabs,
  findPaneById,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { openProjectPullRequest } from "@/workspace-tabs/pull-request-navigation";
const WORKSPACE_KEY = "server-1:workspace-1";
const CHECKOUT = { serverId: "server-1", cwd: "/tmp/repo", isGit: true };
beforeEach(() => {
  usePanelStore.setState({
    mobilePanel: { target: "agent", revision: 0 },
    explorerTab: "files",
    explorerTabByCheckout: {},
  });
  useWorkspaceLayoutStore.setState({
    layoutByWorkspace: {},
    explorerSidebarPaneIdByWorkspace: {},
    sidePaneIdByWorkspace: {},
    splitSizesByWorkspace: {},
  });
});
describe("openProjectPullRequest", () => {
  const input = {
    isCompact: false,
    supportsPaneSplits: true,
    workspaceKey: WORKSPACE_KEY,
    checkout: CHECKOUT,
  };
  it("opens PRs in the main panel when configured", () => {
    openProjectPullRequest({ ...input, destination: "main" });
    const state = useWorkspaceLayoutStore.getState();
    const layout = state.layoutByWorkspace[WORKSPACE_KEY];
    const mainPane = layout ? findPaneById(layout.root, layout.focusedPaneId) : null;
    const pullRequestTab = layout
      ? collectAllTabs(layout.root).find(
          (tab) => mainPane?.tabIds.includes(tab.tabId) && tab.target.kind === "pull_request",
        )
      : null;
    expect(mainPane?.tabIds).toContain(pullRequestTab?.tabId);
    expect(state.sidePaneIdByWorkspace[WORKSPACE_KEY]).toBeUndefined();
  });
  it("opens PRs in the side panel when configured", () => {
    openProjectPullRequest({ ...input, destination: "side" });
    const state = useWorkspaceLayoutStore.getState();
    const layout = state.layoutByWorkspace[WORKSPACE_KEY];
    const sidePaneId = state.sidePaneIdByWorkspace[WORKSPACE_KEY];
    const sidePane = layout && sidePaneId ? findPaneById(layout.root, sidePaneId) : null;
    const pullRequestTab = layout
      ? collectAllTabs(layout.root).find(
          (tab) => sidePane?.tabIds.includes(tab.tabId) && tab.target.kind === "pull_request",
        )
      : null;
    expect(sidePane?.tabIds).toContain(pullRequestTab?.tabId);
  });
});
