import React, { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import {
  useSidebarWorkspacesList,
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
  type SidebarWorkspacesListResult,
} from "@/hooks/use-sidebar-workspaces-list";
import { sortSidebarProjectsByActivity } from "@/hooks/sidebar-workspaces-view-model";
import { useSidebarWorkspaceEntries } from "@/hooks/use-sidebar-workspace-entries";
import type { StatusGroup } from "@/hooks/sidebar-status-view-model";
import { usePinnedSidebarKeys, type PinnedSidebarGroups } from "@/hooks/use-sidebar-pins";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import { useSidebarHiddenProjectsStore } from "@/stores/sidebar-hidden-projects-store";
import { useSidebarViewStore, type SidebarGroupMode } from "@/stores/sidebar-view-store";
import type { SidebarShortcutModel } from "@/utils/sidebar-shortcuts";
import { buildSidebarProjection } from "./sidebar-projection";

interface SidebarModel extends SidebarWorkspacesListResult {
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  groupMode: SidebarGroupMode;
  statusGroups: StatusGroup[];
  pinnedGroups: PinnedSidebarGroups;
  hiddenProjects: SidebarProjectEntry[];
  hiddenProjectsCollapsed: boolean;
  collapsedProjectKeys: ReadonlySet<string>;
  toggleProjectCollapsed: (projectViewKey: string) => void;
  toggleHiddenProjectsCollapsed: () => void;
  allWorkspaceGroupsCollapsed: boolean;
  setAllWorkspaceGroupsCollapsed: (collapsed: boolean) => void;
  setProjectHidden: (projectViewKey: string, hidden: boolean) => void;
  shortcutModel: SidebarShortcutModel;
}

const SidebarModelContext = createContext<SidebarModel | null>(null);
const EMPTY_WORKSPACE_ENTRIES = new Map<string, SidebarWorkspaceEntry>();

export function SidebarModelProvider({
  active,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  const list = useSidebarWorkspacesList();
  const groupMode = useSidebarViewStore((state) => state.groupMode);
  const sortMode = useSidebarViewStore((state) => state.sortMode);
  const collapsedProjectKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedProjectKeys,
  );
  const collapsedStatusGroupKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedStatusGroupKeys,
  );
  const pinnedCollapsed = useSidebarCollapsedSectionsStore((state) => state.collapsedPinned);
  const toggleProjectCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.toggleProjectCollapsed,
  );
  const setProjectCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.setProjectCollapsed,
  );
  const setWorkspaceGroupsCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.setWorkspaceGroupsCollapsed,
  );
  const hiddenProjectKeys = useSidebarHiddenProjectsStore((state) => state.hiddenProjectKeys);
  const hiddenProjectsCollapsed = useSidebarHiddenProjectsStore(
    (state) => state.hiddenSectionCollapsed,
  );
  const setProjectHiddenInStore = useSidebarHiddenProjectsStore((state) => state.setProjectHidden);
  const toggleHiddenProjectsCollapsed = useSidebarHiddenProjectsStore(
    (state) => state.toggleHiddenSection,
  );
  const setProjectHidden = useCallback(
    (projectViewKey: string, hidden: boolean) => {
      setProjectHiddenInStore(projectViewKey, hidden);
      if (hidden) {
        setProjectCollapsed(projectViewKey, true);
      }
    },
    [setProjectCollapsed, setProjectHiddenInStore],
  );
  const isStatusMode = groupMode === "status";
  const workspaceEntriesByKey = useSidebarWorkspaceEntries(
    list.workspacePlacements,
    active !== false || isStatusMode,
  );
  const projects = useMemo(
    () =>
      sortMode === "activity"
        ? sortSidebarProjectsByActivity({
            projects: list.projects,
            workspaceEntriesByKey,
          })
        : list.projects,
    [list.projects, sortMode, workspaceEntriesByKey],
  );
  const projectionWorkspaceEntriesByKey = isStatusMode
    ? workspaceEntriesByKey
    : EMPTY_WORKSPACE_ENTRIES;
  const pinnedKeys = usePinnedSidebarKeys(projects);
  const projection = useMemo(
    () =>
      buildSidebarProjection({
        projects,
        pinnedKeys,
        workspaceEntriesByKey: projectionWorkspaceEntriesByKey,
        projectNamesByViewKey: list.projectNamesByViewKey,
        groupMode,
        pinnedCollapsed,
        hiddenProjectKeys,
        collapsedProjectKeys,
        collapsedStatusGroupKeys,
      }),
    [
      collapsedProjectKeys,
      collapsedStatusGroupKeys,
      groupMode,
      hiddenProjectKeys,
      list.projectNamesByViewKey,
      projects,
      pinnedCollapsed,
      pinnedKeys,
      projectionWorkspaceEntriesByKey,
    ],
  );
  const projectGroupKeys = useMemo(
    () => projection.pinnedGroups.unpinnedProjects.map((project) => project.viewKey),
    [projection.pinnedGroups.unpinnedProjects],
  );
  const statusGroupKeys = useMemo(
    () => projection.statusGroups.map((group) => group.bucket),
    [projection.statusGroups],
  );
  const activeWorkspaceGroupKeys = groupMode === "status" ? statusGroupKeys : projectGroupKeys;
  const allWorkspaceGroupsCollapsed =
    activeWorkspaceGroupKeys.length > 0 &&
    activeWorkspaceGroupKeys.every((key) =>
      groupMode === "status" ? collapsedStatusGroupKeys.has(key) : collapsedProjectKeys.has(key),
    );
  const setAllWorkspaceGroupsCollapsed = useCallback(
    (collapsed: boolean) => {
      setWorkspaceGroupsCollapsed(
        groupMode === "project" ? projectGroupKeys : [],
        groupMode === "status" ? statusGroupKeys : [],
        collapsed,
      );
    },
    [groupMode, projectGroupKeys, setWorkspaceGroupsCollapsed, statusGroupKeys],
  );
  const value = useMemo(
    () => ({
      ...list,
      projects,
      workspaceEntriesByKey,
      groupMode,
      statusGroups: projection.statusGroups,
      pinnedGroups: projection.pinnedGroups,
      hiddenProjects: projection.hiddenProjects,
      hiddenProjectsCollapsed,
      collapsedProjectKeys,
      toggleProjectCollapsed,
      toggleHiddenProjectsCollapsed,
      allWorkspaceGroupsCollapsed,
      setAllWorkspaceGroupsCollapsed,
      setProjectHidden,
      shortcutModel: projection.shortcutModel,
    }),
    [
      collapsedProjectKeys,
      allWorkspaceGroupsCollapsed,
      groupMode,
      hiddenProjectsCollapsed,
      list,
      projects,
      projection,
      setProjectHidden,
      setAllWorkspaceGroupsCollapsed,
      toggleHiddenProjectsCollapsed,
      toggleProjectCollapsed,
      workspaceEntriesByKey,
    ],
  );

  return <SidebarModelContext.Provider value={value}>{children}</SidebarModelContext.Provider>;
}

export function useSidebarModel(): SidebarModel {
  const model = useContext(SidebarModelContext);
  if (!model) throw new Error("SidebarModelProvider is required");
  return model;
}
