/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

let SidebarProjectVisibilityMenuItem: typeof import("./sidebar-project-visibility-menu-item").SidebarProjectVisibilityMenuItem;

describe("Sidebar Project visibility action", () => {
  beforeAll(async () => {
    ({ SidebarProjectVisibilityMenuItem } = await import("./sidebar-project-visibility-menu-item"));
  });

  afterEach(cleanup);

  it("hides a visible Project", () => {
    const onToggleHidden = vi.fn();
    render(
      <SidebarProjectVisibilityMenuItem
        surface="dropdown"
        projectViewKey="project-view"
        hidden={false}
        onToggleHidden={onToggleHidden}
      />,
    );

    fireEvent.click(screen.getByTestId("sidebar-project-menu-hide-project-view"));

    expect(screen.getByText("sidebar.project.actions.hide")).toBeTruthy();
    expect(onToggleHidden).toHaveBeenCalledTimes(1);
  });

  it("restores a hidden Project", () => {
    render(
      <SidebarProjectVisibilityMenuItem
        surface="context"
        projectViewKey="project-view"
        hidden
        onToggleHidden={vi.fn()}
      />,
    );

    expect(screen.getByTestId("sidebar-project-menu-show-project-view")).toBeTruthy();
    expect(screen.getByText("sidebar.project.actions.show")).toBeTruthy();
  });
});
