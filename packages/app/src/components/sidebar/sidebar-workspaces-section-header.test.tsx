/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const sidebarModel = vi.hoisted(() => ({
  allWorkspaceGroupsCollapsed: false,
  setAllWorkspaceGroupsCollapsed: vi.fn(),
}));
const bulkActions = vi.hoisted(() => ({
  active: false,
  selectedCount: 0,
  archiving: false,
  removing: false,
  busy: false,
  removeUnsupportedCount: 0,
  start: vi.fn(),
  cancel: vi.fn(),
  archiveSelected: vi.fn(),
  removeSelected: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("lucide-react-native", () => ({
  Archive: () => <span />,
  ChevronsDown: () => <span />,
  ChevronsUp: () => <span />,
  ListChecks: () => <span />,
  Search: () => <span />,
  Trash2: () => <span />,
  X: () => <span />,
}));

vi.mock("@/components/sidebar/sidebar-model", () => ({
  useSidebarModel: () => ({
    ...sidebarModel,
    workspaceEntriesByKey: new Map(),
  }),
}));

vi.mock("@/components/sidebar/sidebar-workspace-bulk-archive", () => ({
  useSidebarWorkspaceBulkArchive: () => bulkActions,
}));

vi.mock("@/components/sidebar/display-preferences/menu", () => ({
  SidebarDisplayPreferencesMenu: () => <div />,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/ui/shortcut", () => ({
  Shortcut: () => null,
}));

vi.mock("@/hooks/use-shortcut-keys", () => ({
  useShortcutKeys: () => null,
}));

vi.mock("@/stores/keyboard-shortcuts-store", () => ({
  useKeyboardShortcutsStore: (
    selector: (state: { setCommandCenterOpen: (open: boolean) => void }) => unknown,
  ) => selector({ setCommandCenterOpen: vi.fn() }),
}));

let WorkspacesSectionHeader: typeof import("./sidebar-workspaces-section-header").WorkspacesSectionHeader;

describe("Workspaces section header", () => {
  beforeAll(async () => {
    ({ WorkspacesSectionHeader } = await import("./sidebar-workspaces-section-header"));
  });

  beforeEach(() => {
    sidebarModel.allWorkspaceGroupsCollapsed = false;
    sidebarModel.setAllWorkspaceGroupsCollapsed.mockReset();
    bulkActions.active = false;
    bulkActions.selectedCount = 0;
    bulkActions.archiving = false;
    bulkActions.removing = false;
    bulkActions.busy = false;
    bulkActions.removeUnsupportedCount = 0;
    bulkActions.start.mockReset();
    bulkActions.cancel.mockReset();
    bulkActions.archiveSelected.mockReset();
    bulkActions.removeSelected.mockReset();
  });

  afterEach(cleanup);

  it("collapses all Project groups with one action", () => {
    render(<WorkspacesSectionHeader />);

    fireEvent.click(screen.getByTestId("sidebar-toggle-all-workspaces"));

    expect(sidebarModel.setAllWorkspaceGroupsCollapsed).toHaveBeenCalledWith(true);
  });

  it("expands all Project groups when they are collapsed", () => {
    sidebarModel.allWorkspaceGroupsCollapsed = true;
    render(<WorkspacesSectionHeader />);

    fireEvent.click(screen.getByTestId("sidebar-toggle-all-workspaces"));

    expect(sidebarModel.setAllWorkspaceGroupsCollapsed).toHaveBeenCalledWith(false);
  });

  it("offers archive and delete actions for selected Workspaces", () => {
    bulkActions.active = true;
    bulkActions.selectedCount = 2;
    render(<WorkspacesSectionHeader />);

    fireEvent.click(screen.getByTestId("sidebar-bulk-archive-workspaces"));
    fireEvent.click(screen.getByTestId("sidebar-bulk-remove-workspaces"));

    expect(bulkActions.archiveSelected).toHaveBeenCalledTimes(1);
    expect(bulkActions.removeSelected).toHaveBeenCalledTimes(1);
  });
});
