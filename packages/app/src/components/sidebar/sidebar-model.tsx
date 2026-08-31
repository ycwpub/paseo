import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  useSidebarWorkspacesList,
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
  type SidebarWorkspacesListResult,
} from "@/hooks/use-sidebar-workspaces-list";
import { sortSidebarProjectsByActivity } from "@/hooks/sidebar-workspaces-view-model";
import { useSidebarWorkspaceEntries } from "@/hooks/use-sidebar-workspace-entries";
import { usePinnedSidebarKeys, type PinnedSidebarGroups } from "@/hooks/use-sidebar-pins";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import { setWorkspaceGroupsCollapsed } from "@/stores/sidebar-collapsed-sections-store/feature-state";
import {
  hasActiveSidebarLabelFilter,
  useSidebarViewStore,
  type SidebarGroupMode,
} from "@/stores/sidebar-view-store";
import { useSidebarSortStore } from "@/stores/sidebar-sort-store";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import { useSidebarHiddenProjectsStore } from "@/stores/sidebar-hidden-projects-store";
import type { SidebarShortcutModel } from "@/utils/sidebar-shortcuts";
import { buildFeatureSidebarProjection } from "./feature-sidebar-projection";
import type { SidebarProjectIconTarget } from "@/utils/sidebar-project-row-model";
import { filterWorkspacesByLabels, type SidebarWorkspaceGroup } from "./sidebar-labels";
import { filterWorkspacesByProjects, resolveActiveProjectFilters } from "./sidebar-project-filter";
import {
  hasAuthoritativeWorkspaceLabelCatalog,
  useWorkspaceLabelProjection,
} from "@/workspace-labels";
import { sortSidebarProjectsByName } from "./sidebar-project-sorting";

interface SidebarModel extends SidebarWorkspacesListResult {
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  /**
   * Every project the sidebar could show, before any filter narrows it.
   *
   * `projects` is the FILTERED list. A surface that offers a filter picker must read this one, or
   * narrowing the filter deletes the rows that would undo it.
   */
  allProjects: SidebarProjectEntry[];
  /** The project filter as it is actually being applied — see `resolveActiveProjectFilters`. */
  resolvedProjectFilters: readonly string[];
  hasProjectsBeforeFilter: boolean;
  groupMode: SidebarGroupMode;
  workspaceGroups: SidebarWorkspaceGroup[];
  projectIconTargets: SidebarProjectIconTarget[];
  pinnedGroups: PinnedSidebarGroups;
  collapsedProjectKeys: ReadonlySet<string>;
  toggleProjectCollapsed: (projectViewKey: string) => void;
  allWorkspaceGroupsCollapsed: boolean;
  setAllWorkspaceGroupsCollapsed: (collapsed: boolean) => void;
  shortcutModel: SidebarShortcutModel;
}

const SidebarModelContext = createContext<SidebarModel | null>(null);

export function SidebarModelProvider({
  active,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  const list = useSidebarWorkspacesList({ enabled: active });
  const groupMode = useSidebarViewStore((state) => state.groupMode);
  const sortMode = useSidebarSortStore((state) => state.sortMode);
  const labelFilter = useSidebarViewStore((state) => state.labelFilter);
  const projectFilters = useSidebarViewStore((state) => state.projectFilters);
  const reconcileLabelFilter = useSidebarViewStore((state) => state.reconcileLabelFilter);
  const { hosts: labelHosts } = useWorkspaceLabelProjection();
  const collapsedProjectKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedProjectKeys,
  );
  const collapsedWorkspaceGroupKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedWorkspaceGroupKeys,
  );
  const pinnedCollapsed = useSidebarCollapsedSectionsStore((state) => state.collapsedPinned);
  const pinnedWorkspaceOrder = useSidebarOrderStore((state) => state.pinnedWorkspaceOrder);
  const toggleProjectCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.toggleProjectCollapsed,
  );
  const hiddenProjectKeys = useSidebarHiddenProjectsStore((state) => state.hiddenProjectKeys);
  const availableLabelNames = useMemo(
    () => labelHosts.flatMap((host) => host.labels.map((label) => label.name)),
    [labelHosts],
  );
  const hasAuthoritativeLabelCatalog = hasAuthoritativeWorkspaceLabelCatalog(labelHosts);
  useEffect(() => {
    if (!hasAuthoritativeLabelCatalog) return;
    reconcileLabelFilter(availableLabelNames);
  }, [availableLabelNames, hasAuthoritativeLabelCatalog, reconcileLabelFilter]);
  const hasActiveLabelFilter = hasActiveSidebarLabelFilter(labelFilter);
  // The project filter is deliberately absent from this gate. It reads `projectViewKey`, which
  // lives on the project and the placement, so it can narrow the project list without hydrating
  // anything; the label filter reads `labels`, which only exists on an entry. Hydration opens a
  // live session-store subscription over every workspace on every visible host, so widening this
  // for a filter that does not need it costs a retained-but-inactive sidebar real work.
  const needsWorkspaceEntries =
    groupMode !== "project" || sortMode === "activity" || hasActiveLabelFilter;
  const workspaceEntriesByKey = useSidebarWorkspaceEntries(
    list.workspacePlacements,
    active !== false || needsWorkspaceEntries,
  );
  const orderedProjects = useMemo(() => {
    switch (sortMode) {
      case "activity":
        return sortSidebarProjectsByActivity({
          projects: list.projects,
          workspaceEntriesByKey,
        });
      case "name":
        return sortSidebarProjectsByName(list.projects);
      case "manual":
        return list.projects;
    }
  }, [list.projects, sortMode, workspaceEntriesByKey]);
  const resolvedProjectFilters = useMemo(
    () =>
      resolveActiveProjectFilters(
        projectFilters,
        new Set(orderedProjects.map((project) => project.viewKey)),
      ),
    [orderedProjects, projectFilters],
  );
  const hasActiveProjectFilter = resolvedProjectFilters.length > 0;
  const filteredWorkspaceEntriesByKey = useMemo(() => {
    const byProject = filterWorkspacesByProjects({
      workspaces: [...workspaceEntriesByKey.values()],
      projectFilters: resolvedProjectFilters,
    });
    const filtered = filterWorkspacesByLabels({ workspaces: byProject, ...labelFilter });
    return new Map(filtered.map((workspace) => [workspace.workspaceKey, workspace]));
  }, [labelFilter, resolvedProjectFilters, workspaceEntriesByKey]);
  const visibleWorkspaceKeys = useMemo(
    () => new Set(filteredWorkspaceEntriesByKey.keys()),
    [filteredWorkspaceEntriesByKey],
  );
  // The two filters prune differently on purpose. The project filter is a membership test on the
  // project itself, so a project you filtered TO survives even with no workspaces — it still owns
  // a header row you can create your first workspace under. The label filter can only ask about
  // workspaces, so a project it empties has nothing left to show.
  const filteredProjects = useMemo(() => {
    let projects = orderedProjects;
    if (hasActiveProjectFilter) {
      const included = new Set(resolvedProjectFilters);
      projects = projects.filter((project) => included.has(project.viewKey));
    }
    if (hasActiveLabelFilter) {
      projects = projects.flatMap((project) => {
        const workspaces = project.workspaces.filter((workspace) =>
          visibleWorkspaceKeys.has(workspace.workspaceKey),
        );
        return workspaces.length > 0 ? [{ ...project, workspaces }] : [];
      });
    }
    return projects;
  }, [
    hasActiveLabelFilter,
    hasActiveProjectFilter,
    orderedProjects,
    resolvedProjectFilters,
    visibleWorkspaceKeys,
  ]);
  const pinnedKeys = usePinnedSidebarKeys(filteredProjects);
  const projectionInput = useMemo(
    () => ({
      projects: filteredProjects,
      pinnedKeys,
      pinnedWorkspaceOrder,
      workspaceEntriesByKey: filteredWorkspaceEntriesByKey,
      projectNamesByViewKey: list.projectNamesByViewKey,
      groupMode,
      pinnedCollapsed,
      collapsedProjectKeys,
      collapsedWorkspaceGroupKeys,
      hiddenProjectKeys,
    }),
    [
      collapsedProjectKeys,
      collapsedWorkspaceGroupKeys,
      hiddenProjectKeys,
      groupMode,
      list.projectNamesByViewKey,
      filteredProjects,
      pinnedCollapsed,
      pinnedKeys,
      pinnedWorkspaceOrder,
      filteredWorkspaceEntriesByKey,
    ],
  );
  const projection = useMemo(
    () => buildFeatureSidebarProjection(projectionInput),
    [projectionInput],
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
      groupMode === "status" ? collapsedWorkspaceGroupKeys.has(key) : collapsedProjectKeys.has(key),
    );
  const setAllWorkspaceGroupsCollapsed = useCallback(
    (collapsed: boolean) => {
      useSidebarCollapsedSectionsStore.setState((state) =>
        setWorkspaceGroupsCollapsed(
          state,
          groupMode === "project" ? projectGroupKeys : [],
          groupMode === "status" ? statusGroupKeys : [],
          collapsed,
        ),
      );
    },
    [groupMode, projectGroupKeys, statusGroupKeys],
  );
  const value = useMemo(
    () => ({
      ...list,
      projects: filteredProjects,
      allProjects: orderedProjects,
      resolvedProjectFilters,
      hasProjectsBeforeFilter: orderedProjects.length > 0,
      workspaceEntriesByKey: filteredWorkspaceEntriesByKey,
      groupMode,
      workspaceGroups: projection.workspaceGroups,
      projectIconTargets: projection.projectIconTargets,
      pinnedGroups: projection.pinnedGroups,
      collapsedProjectKeys,
      toggleProjectCollapsed,
      allWorkspaceGroupsCollapsed,
      setAllWorkspaceGroupsCollapsed,
      shortcutModel: projection.shortcutModel,
    }),
    [
      resolvedProjectFilters,
      collapsedProjectKeys,
      groupMode,
      list,
      orderedProjects,
      filteredProjects,
      projection,
      allWorkspaceGroupsCollapsed,
      setAllWorkspaceGroupsCollapsed,
      toggleProjectCollapsed,
      filteredWorkspaceEntriesByKey,
    ],
  );

  return <SidebarModelContext.Provider value={value}>{children}</SidebarModelContext.Provider>;
}

export function useSidebarModel(): SidebarModel {
  const model = useContext(SidebarModelContext);
  if (!model) throw new Error("SidebarModelProvider is required");
  return model;
}
