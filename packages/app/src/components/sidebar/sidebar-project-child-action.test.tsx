/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAddProjectFlowStore } from "@/stores/add-project-flow-store";
import { SidebarProjectChildAction } from "./sidebar-project-child-action";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const featureState = vi.hoisted(() => ({ supported: true }));
const parentTarget = { serverId: "server-1", projectId: "project-parent" };

vi.mock("@/runtime/host-features", () => ({
  useHostFeature: () => featureState.supported,
}));

vi.mock("@/constants/platform", () => ({
  isNative: false,
  isWeb: true,
}));

vi.mock("lucide-react-native", () => ({
  FolderPlus: (props: Record<string, unknown>) => <span {...props} />,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: () => null,
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function"
        ? factory({
            borderRadius: { md: 6 },
            fontSize: { xs: 11 },
            colors: {
              foreground: "#111",
              foregroundMuted: "#777",
              surfaceSidebarHover: "#eee",
            },
          })
        : factory,
  },
  withUnistyles: (Component: React.ComponentType) => Component,
}));

describe("SidebarProjectChildAction", () => {
  beforeEach(() => {
    featureState.supported = true;
    useAddProjectFlowStore.setState({ request: null });
  });

  afterEach(() => {
    cleanup();
    useAddProjectFlowStore.setState({ request: null });
  });

  it("opens the add Project flow with the selected parent Project", () => {
    render(
      <SidebarProjectChildAction
        target={parentTarget}
        displayName="零售配送"
        visible
        projectViewKey="project-view"
      />,
    );

    fireEvent.click(screen.getByTestId("sidebar-project-create-child-project-view"));

    expect(useAddProjectFlowStore.getState().request).toMatchObject({
      preferredHostId: "server-1",
      parentProjectId: "project-parent",
    });
  });

  it("does not show the action when the host does not support Project hierarchy", () => {
    featureState.supported = false;

    render(
      <SidebarProjectChildAction
        target={parentTarget}
        displayName="零售配送"
        visible
        projectViewKey="project-view"
      />,
    );

    expect(screen.queryByTestId("sidebar-project-create-child-project-view")).toBeNull();
  });
});
