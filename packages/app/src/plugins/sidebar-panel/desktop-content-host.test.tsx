/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopPluginContentHost } from "./desktop-content-host";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const panelState = vi.hoisted(() => ({
  selection: null as { pluginId: string } | null,
  close: vi.fn(),
}));
const routeState = vi.hoisted(() => ({ pathname: "/h/server/workspace/one" }));

vi.mock("expo-router", () => ({
  usePathname: () => routeState.pathname,
}));

vi.mock("react-native", () => ({
  View: ({
    children,
    style,
    testID,
  }: {
    children?: React.ReactNode;
    style?: React.CSSProperties | Array<React.CSSProperties | false | null>;
    testID?: string;
  }) => {
    let display = Array.isArray(style) ? undefined : style?.display;
    if (Array.isArray(style)) {
      for (const candidate of style) {
        if (candidate && candidate.display !== undefined) display = candidate.display;
      }
    }
    return (
      <div data-display={display} data-testid={testID}>
        {children}
      </div>
    );
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (styles: unknown) => styles,
  },
}));

vi.mock("@/plugins/sidebar-panel/selection-store", () => ({
  usePluginAppPanelStore: (selector: (state: typeof panelState) => unknown) => selector(panelState),
}));

vi.mock("@/plugins/sidebar-panel/panel-host", () => ({
  PluginAppPanelHost: () => <div data-testid="plugin-app-side-panel">插件页面</div>,
}));

describe("DesktopPluginContentHost", () => {
  beforeEach(() => {
    panelState.selection = null;
    panelState.close.mockReset();
    routeState.pathname = "/h/server/workspace/one";
  });

  afterEach(cleanup);

  it("shows the current route when no plugin is open", () => {
    render(
      <DesktopPluginContentHost>
        <div data-testid="current-route">当前页面</div>
      </DesktopPluginContentHost>,
    );

    expect(screen.getByTestId("desktop-route-content")).toBeTruthy();
    expect(screen.getByTestId("desktop-route-content").getAttribute("data-display")).toBeNull();
    expect(screen.getByTestId("current-route")).toBeTruthy();
    expect(screen.queryByTestId("plugin-app-side-panel")).toBeNull();
  });

  it("hides the current route and gives the content area to the plugin page", () => {
    panelState.selection = { pluginId: "byte-development" };

    render(
      <DesktopPluginContentHost>
        <div data-testid="current-route">当前页面</div>
      </DesktopPluginContentHost>,
    );

    expect(screen.getByTestId("desktop-route-content").getAttribute("data-display")).toBe("none");
    expect(screen.getByTestId("current-route")).toBeTruthy();
    expect(screen.getByTestId("plugin-app-side-panel")).toBeTruthy();
  });

  it("closes the plugin page when the current route changes", async () => {
    panelState.selection = { pluginId: "byte-development" };
    const view = render(
      <DesktopPluginContentHost>
        <div data-testid="current-route">当前页面</div>
      </DesktopPluginContentHost>,
    );

    expect(panelState.close).not.toHaveBeenCalled();

    routeState.pathname = "/sessions";
    view.rerender(
      <DesktopPluginContentHost>
        <div data-testid="current-route">当前页面</div>
      </DesktopPluginContentHost>,
    );

    await waitFor(() => expect(panelState.close).toHaveBeenCalledTimes(1));
  });

  it("keeps the plugin page open when only its content rerenders", async () => {
    panelState.selection = { pluginId: "byte-development" };
    const view = render(
      <DesktopPluginContentHost>
        <div data-testid="current-route">当前页面</div>
      </DesktopPluginContentHost>,
    );

    view.rerender(
      <DesktopPluginContentHost>
        <div data-testid="current-route">更新后的当前页面</div>
      </DesktopPluginContentHost>,
    );

    await waitFor(() => expect(panelState.close).not.toHaveBeenCalled());
  });
});
