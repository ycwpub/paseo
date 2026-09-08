/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginSummary } from "@getpaseo/protocol/messages";
import { HiddenPluginSidebarRestoreButton } from "./hidden-section-restore-button";
import { InstalledPluginSidebarSection } from "./sidebar-section";
import { usePluginSidebarVisibilityStore } from "./visibility-store";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const plugin: PluginSummary = {
  id: "installed:bamboo",
  pluginId: "bamboo",
  name: "bamboo",
  displayName: "Bamboo 对账自动排查",
  version: "1.0.0",
  description: "",
  keywords: [],
  sourceType: "local",
  installed: true,
  enabled: true,
  installable: false,
  updateAvailable: false,
  skills: [],
  mcpServers: [],
  httpServices: [],
  apps: [],
  unsupportedComponents: [],
  warnings: [],
};

vi.mock("expo-router", () => ({ usePathname: () => "/" }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: () => "插件" }),
}));
vi.mock("react-native", () => ({
  Pressable: ({
    accessibilityLabel,
    children,
    onPress,
    testID,
  }: {
    accessibilityLabel?: string;
    children?: ReactNode | ((state: { hovered: boolean; pressed: boolean }) => ReactNode);
    onPress?: () => void;
    testID?: string;
  }) => (
    <button type="button" aria-label={accessibilityLabel} data-testid={testID} onClick={onPress}>
      {typeof children === "function" ? children({ hovered: false, pressed: false }) : children}
    </button>
  ),
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children, testID }: { children?: ReactNode; testID?: string }) => (
    <div data-testid={testID}>{children}</div>
  ),
}));
vi.mock("lucide-react-native", () => ({
  Blocks: () => <span />,
  ChevronDown: () => <span />,
  ChevronRight: () => <span />,
  EyeOff: () => <span />,
  GripVertical: () => <span />,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function"
        ? (factory as (theme: Record<string, unknown>) => Record<string, unknown>)({
            spacing: { 0.5: 2, 1: 4, 2: 8 },
            borderRadius: { md: 6, lg: 8 },
            borderWidth: { 1: 1 },
            fontSize: { sm: 12, base: 14 },
            fontWeight: { normal: "400" },
            colors: {
              accent: "#080",
              accentForeground: "#fff",
              border: "#ccc",
              foreground: "#111",
              foregroundExtraMuted: "#888",
              foregroundMuted: "#666",
              popoverForeground: "#111",
              surface3: "#eee",
              surfaceSidebarHover: "#eee",
            },
          })
        : factory,
  },
  withUnistyles: (Component: React.ComponentType) => Component,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children as React.ReactElement,
  TooltipContent: ({ children }: { children: ReactNode }) => children as React.ReactElement,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children as React.ReactElement,
}));
vi.mock("@/plugins/icons", () => ({ resolvePluginIcon: () => () => <span /> }));
vi.mock("@/plugins/sidebar-panel/order-store", () => ({
  usePluginSidebarOrderStore: (selector: (state: unknown) => unknown) =>
    selector({ orderByServer: {}, setOrder: vi.fn() }),
}));
vi.mock("@/plugins/sidebar-panel/presentation", () => ({
  resolvePluginLauncherIcon: () => "Blocks",
}));
vi.mock("@/plugins/sidebar-panel/selection-store", () => ({
  usePluginAppPanelStore: (selector: (state: unknown) => unknown) =>
    selector({ selection: null, toggle: vi.fn() }),
}));
vi.mock("@/plugins/sidebar-panel/sortable-plugin-grid", () => ({
  SortablePluginGrid: () => <div data-testid="plugin-grid" />,
}));
vi.mock("@/plugins/sidebar-panel/use-plugin-sidebar-host", () => ({
  usePluginSidebarHost: () => ({ serverId: "server", plugins: [plugin], online: true }),
}));
vi.mock("@/runtime/host-runtime", () => ({
  useHosts: () => [{ serverId: "server" }],
}));
vi.mock("@/stores/navigation-active-workspace-store", () => ({
  useActiveWorkspaceSelection: () => null,
}));
vi.mock("@/utils/host-routes", () => ({
  parseServerIdFromPathname: () => null,
}));

describe("InstalledPluginSidebarSection visibility", () => {
  beforeEach(() => {
    usePluginSidebarVisibilityStore.setState({ collapsed: false, hidden: false });
  });

  afterEach(cleanup);

  it("collapses the complete plugin grid and expands it again", () => {
    render(<InstalledPluginSidebarSection />);

    expect(screen.getByTestId("plugin-grid")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "折叠全部插件" }));
    expect(screen.queryByTestId("plugin-grid")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "展开全部插件" }));
    expect(screen.getByTestId("plugin-grid")).toBeTruthy();
  });

  it("hides the section completely and restores it collapsed from the footer action", () => {
    render(
      <>
        <InstalledPluginSidebarSection />
        <HiddenPluginSidebarRestoreButton />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "隐藏插件区域" }));
    expect(screen.queryByTestId("sidebar-installed-plugins")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "显示插件区域" }));
    expect(screen.getByTestId("sidebar-installed-plugins")).toBeTruthy();
    expect(screen.queryByTestId("plugin-grid")).toBeNull();
  });
});
