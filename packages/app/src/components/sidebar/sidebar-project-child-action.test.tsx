/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useAddProjectFlowStore } from "@/stores/add-project-flow-store";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const featureState = vi.hoisted(() => ({ supported: true }));
const parentTarget = { serverId: "server-1", projectId: "project-parent" };
let SidebarProjectFeatureMenuItems: typeof import("./sidebar-project-feature-menu-items").SidebarProjectFeatureMenuItems;

vi.mock("@/runtime/host-features", () => ({
  useHostFeature: () => featureState.supported,
}));

vi.mock("./sidebar-project-plugin-link", () => ({
  useSidebarProjectPluginLink: () => ({ link: null, open: vi.fn() }),
}));

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenuItem: ({
    children,
    onSelect,
    testID,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    testID?: string;
  }) => (
    <button type="button" data-testid={testID} onClick={onSelect}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({
    children,
    onSelect,
    testID,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    testID?: string;
  }) => (
    <button type="button" data-testid={testID} onClick={onSelect}>
      {children}
    </button>
  ),
}));

describe("Sidebar Project child action", () => {
  beforeAll(async () => {
    ({ SidebarProjectFeatureMenuItems } = await import("./sidebar-project-feature-menu-items"));
  });

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
      <SidebarProjectFeatureMenuItems
        active
        projectViewKey="project-view"
        settingsTarget={parentTarget}
        surface="dropdown"
      />,
    );

    fireEvent.click(screen.getByTestId("sidebar-project-menu-create-child-project-view"));

    expect(useAddProjectFlowStore.getState().request).toMatchObject({
      preferredHostId: "server-1",
      parentProjectId: "project-parent",
    });
  });

  it("does not show the action when the host does not support Project hierarchy", () => {
    featureState.supported = false;

    render(
      <SidebarProjectFeatureMenuItems
        active
        projectViewKey="project-view"
        settingsTarget={parentTarget}
        surface="dropdown"
      />,
    );

    expect(screen.queryByTestId("sidebar-project-menu-create-child-project-view")).toBeNull();
  });
});
