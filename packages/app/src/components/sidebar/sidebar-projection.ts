import { buildStatusGroups, type StatusGroup } from "@/hooks/sidebar-status-view-model";
import {
  splitPinnedSidebarGroups,
  type PinnedSidebarGroups,
  type PinnedSidebarKeys,
} from "@/hooks/use-sidebar-pins";
import { splitHiddenSidebarProjects } from "@/hooks/sidebar-hidden-projects";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import type { SidebarGroupMode } from "@/stores/sidebar-view-store";
import {
  buildSidebarShortcutSections,
  type SidebarShortcutModel,
  type SidebarShortcutSection,
} from "@/utils/sidebar-shortcuts";

export interface SidebarProjection {
  pinnedGroups: PinnedSidebarGroups;
  hiddenProjects: SidebarProjectEntry[];
  statusGroups: StatusGroup[];
  shortcutModel: SidebarShortcutModel;
}

export function buildSidebarProjection(input: {
  projects: SidebarProjectEntry[];
  pinnedKeys: PinnedSidebarKeys;
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  projectNamesByViewKey: Map<string, string>;
  groupMode: SidebarGroupMode;
  pinnedCollapsed: boolean;
  hiddenProjectKeys: ReadonlySet<string>;
  collapsedProjectKeys: ReadonlySet<string>;
  collapsedStatusGroupKeys: ReadonlySet<string>;
}): SidebarProjection {
  const { visibleProjects, hiddenProjects } = splitHiddenSidebarProjects(
    input.projects,
    input.hiddenProjectKeys,
  );
  const pinnedGroups = splitPinnedSidebarGroups({
    projects: visibleProjects,
    keys: input.pinnedKeys,
  });
  const pinnedWorkspaceKeys = new Set(input.pinnedKeys.pinnedWorkspaceKeys);
  const statusGroups =
    input.groupMode === "status"
      ? buildStatusGroups(
          Array.from(input.workspaceEntriesByKey.values()).filter(
            (workspace) =>
              !input.hiddenProjectKeys.has(workspace.projectViewKey) &&
              !pinnedWorkspaceKeys.has(workspace.workspaceKey),
          ),
          input.projectNamesByViewKey,
        )
      : [];

  const sections: SidebarShortcutSection[] = [];
  if (!input.pinnedCollapsed) {
    sections.push({ workspaces: pinnedGroups.pinnedChats });
  }
  if (input.groupMode === "status") {
    sections.push(
      ...statusGroups.map((group) => ({
        workspaces: group.rows,
        collapsed: input.collapsedStatusGroupKeys.has(group.bucket),
      })),
    );
  } else {
    sections.push(
      ...pinnedGroups.unpinnedProjects.map((project) => ({
        workspaces: project.workspaces,
        collapsed: input.collapsedProjectKeys.has(project.viewKey),
      })),
    );
  }

  return {
    pinnedGroups,
    hiddenProjects,
    statusGroups,
    shortcutModel: buildSidebarShortcutSections({ sections }),
  };
}
