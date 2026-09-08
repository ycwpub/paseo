/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { usePluginSidebarVisibilityStore } from "./visibility-store";

describe("plugin sidebar visibility", () => {
  beforeEach(() => {
    usePluginSidebarVisibilityStore.setState({ collapsed: false, hidden: false });
  });

  it("collapses and expands the plugin grid", () => {
    usePluginSidebarVisibilityStore.getState().toggleCollapsed();
    expect(usePluginSidebarVisibilityStore.getState()).toMatchObject({
      collapsed: true,
      hidden: false,
    });

    usePluginSidebarVisibilityStore.getState().toggleCollapsed();
    expect(usePluginSidebarVisibilityStore.getState().collapsed).toBe(false);
  });

  it("hides the complete section and restores it in collapsed form", () => {
    usePluginSidebarVisibilityStore.getState().hide();
    expect(usePluginSidebarVisibilityStore.getState()).toMatchObject({
      collapsed: true,
      hidden: true,
    });

    usePluginSidebarVisibilityStore.getState().show();
    expect(usePluginSidebarVisibilityStore.getState()).toMatchObject({
      collapsed: true,
      hidden: false,
    });
  });
});
