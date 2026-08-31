/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { UseWorkspaceRemoveOptions } from "@/workspace/use-workspace-remove";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const removeState = vi.hoisted(() => ({
  options: null as UseWorkspaceRemoveOptions | null,
  supported: true,
  action: vi.fn(),
}));
const redirect = vi.hoisted(() => vi.fn());
const activeWorkspaceSelection = vi.hoisted(() => ({
  value: {
    serverId: "server-1",
    workspaceId: "workspace-1",
  } as { serverId: string; workspaceId: string } | null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/workspace/use-workspace-remove", () => ({
  useWorkspaceRemove: (options: UseWorkspaceRemoveOptions) => {
    removeState.options = options;
    return {
      supported: removeState.supported,
      remove: removeState.action,
      action: removeState.action,
      pending: false,
      busy: false,
      status: "idle",
    };
  },
}));

vi.mock("@/stores/navigation-active-workspace-store", () => ({
  useActiveWorkspaceSelection: () => activeWorkspaceSelection.value,
}));

vi.mock("@/stores/session-store", () => ({
  useSessionStore: (
    selector: (state: {
      sessions: Record<
        string,
        {
          workspaces: Map<
            string,
            {
              id: string;
              projectId: string;
              name: string;
            }
          >;
        }
      >;
    }) => unknown,
  ) =>
    selector({
      sessions: {
        "server-1": {
          workspaces: new Map([
            [
              "workspace-1",
              {
                id: "workspace-1",
                projectId: "project-1",
                name: "技术方案",
              },
            ],
          ]),
        },
      },
    }),
}));

vi.mock("@/utils/sidebar-workspace-archive-redirect", () => ({
  redirectIfArchivingActiveWorkspace: redirect,
}));

vi.mock("@/workspace-labels/picker", () => ({
  WORKSPACE_LABEL_PAGE_ID: "labels",
  useWorkspaceLabelMenuPages: () => [],
}));

vi.mock("@/workspace/open-in-file-manager/menu-item", () => ({
  OpenInFileManagerMenuItem: () => null,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => children,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => children,
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
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => children,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => children,
  ContextMenuContent: ({ children }: { children: ReactNode }) => children,
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

let SidebarWorkspaceMenu: typeof import("./sidebar-workspace-menu").SidebarWorkspaceMenu;

describe("Sidebar Workspace remove action", () => {
  beforeAll(async () => {
    ({ SidebarWorkspaceMenu } = await import("./sidebar-workspace-menu"));
  });

  beforeEach(() => {
    removeState.options = null;
    removeState.supported = true;
    removeState.action.mockReset();
    redirect.mockReset();
    activeWorkspaceSelection.value = {
      serverId: "server-1",
      workspaceId: "workspace-1",
    };
    removeState.action.mockImplementation(() => removeState.options?.onRemoveStarted?.());
  });

  afterEach(cleanup);

  it("shows a delete action and targets the selected Workspace storage", () => {
    render(
      <SidebarWorkspaceMenu
        workspaceKey="server-1:workspace-1"
        serverId="server-1"
        workspaceId="workspace-1"
        onArchive={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("sidebar-workspace-menu-remove-server-1:workspace-1"));

    expect(removeState.options).toMatchObject({
      serverId: "server-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      workspaceName: "技术方案",
    });
    expect(removeState.action).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith({
      serverId: "server-1",
      workspaceId: "workspace-1",
      activeWorkspaceSelection: {
        serverId: "server-1",
        workspaceId: "workspace-1",
      },
    });
  });

  it("hides the delete action when the connected Host does not support removal", () => {
    removeState.supported = false;
    activeWorkspaceSelection.value = null;

    render(
      <SidebarWorkspaceMenu
        workspaceKey="server-1:workspace-1"
        serverId="server-1"
        workspaceId="workspace-1"
        onArchive={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("sidebar-workspace-menu-remove-server-1:workspace-1")).toBeNull();
  });
});
