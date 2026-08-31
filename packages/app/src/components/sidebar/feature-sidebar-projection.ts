import { buildStatusGroups, type StatusGroup } from "@/hooks/sidebar-status-view-model";
import { splitHiddenSidebarProjects } from "@/hooks/sidebar-hidden-projects";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import { flattenVisibleProjectHierarchy } from "@/projects/project-hierarchy";
import {
  buildSidebarShortcutSections,
  type SidebarShortcutSection,
} from "@/utils/sidebar-shortcuts";
import {
  buildSidebarProjection,
  type SidebarProjection,
  type SidebarProjectionInput,
} from "./sidebar-projection";

export interface FeatureSidebarProjection extends SidebarProjection {
  statusGroups: StatusGroup[];
  hiddenProjects: SidebarProjectionInput["projects"];
}

export interface FeatureSidebarProjectionInput extends SidebarProjectionInput {
  hiddenProjectKeys?: ReadonlySet<string>;
}

/**
 * Applies feature-owned visibility and hierarchy rules around the stable
 * sidebar projection.
 */
export function buildFeatureSidebarProjection(
  input: FeatureSidebarProjectionInput,
): FeatureSidebarProjection {
  const { visibleProjects, hiddenProjects } = splitHiddenSidebarProjects(
    input.projects,
    input.hiddenProjectKeys ?? new Set(),
  );
  const hiddenProjectViewKeys = new Set(hiddenProjects.map((project) => project.viewKey));
  const visibleWorkspaceEntries = new Map(
    Array.from(input.workspaceEntriesByKey).filter(
      ([, workspace]) => !hiddenProjectViewKeys.has(workspace.projectViewKey),
    ),
  );
  const visibleInput: SidebarProjectionInput = {
    ...input,
    projects: visibleProjects,
    workspaceEntriesByKey: visibleWorkspaceEntries,
  };
  const projection = buildSidebarProjection(visibleInput);
  const pinnedWorkspaceKeys = new Set(input.pinnedKeys.pinnedWorkspaceKeys);
  const unpinnedWorkspaces = Array.from(visibleWorkspaceEntries.values()).filter(
    (workspace) => !pinnedWorkspaceKeys.has(workspace.workspaceKey),
  );
  const statusGroups =
    input.groupMode === "status"
      ? buildStatusGroups(unpinnedWorkspaces, input.projectNamesByViewKey)
      : [];

  if (input.groupMode !== "project") {
    return { ...projection, statusGroups, hiddenProjects };
  }

  const sections: SidebarShortcutSection[] = [];
  if (!input.pinnedCollapsed) {
    sections.push({ workspaces: projection.pinnedGroups.pinnedChats });
  }
  sections.push(
    ...flattenVisibleProjectHierarchy(
      projection.pinnedGroups.unpinnedProjects,
      input.collapsedProjectKeys,
    ).map((project) => ({
      workspaces: project.workspaces as SidebarWorkspaceEntry[],
      collapsed: input.collapsedProjectKeys.has(project.viewKey),
    })),
  );

  return {
    ...projection,
    statusGroups,
    hiddenProjects,
    shortcutModel: buildSidebarShortcutSections({ sections }),
  };
}
