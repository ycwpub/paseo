import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import {
  type CollapsedProjectsState,
  type PersistedCollapsedProjects,
  mergePersistedCollapsedProjects,
  PersistedCollapsedProjectsSchema,
  serializeCollapsedProjects,
  setProjectCollapsed,
  setWorkspaceGroupsCollapsed,
  togglePinnedCollapsed,
  toggleProjectCollapsed,
  toggleWorkspaceGroupCollapsed,
} from "./state";

interface SidebarCollapsedSectionsState extends CollapsedProjectsState {
  toggleProjectCollapsed: (projectKey: string) => void;
  setProjectCollapsed: (projectKey: string, collapsed: boolean) => void;
  toggleWorkspaceGroupCollapsed: (workspaceGroupKey: string) => void;
  setWorkspaceGroupsCollapsed: (
    projectKeys: readonly string[],
    statusGroupKeys: readonly string[],
    collapsed: boolean,
  ) => void;
  togglePinnedCollapsed: () => void;
}

export const useSidebarCollapsedSectionsStore = create<SidebarCollapsedSectionsState>()(
  persist<SidebarCollapsedSectionsState, [], [], PersistedCollapsedProjects>(
    (set) => ({
      collapsedProjectKeys: new Set(),
      collapsedWorkspaceGroupKeys: new Set(),
      collapsedStatusGroupKeys: new Set(),
      collapsedPinned: false,
      toggleProjectCollapsed: (projectKey) =>
        set((state) => toggleProjectCollapsed(state, projectKey)),
      setProjectCollapsed: (projectKey, collapsed) =>
        set((state) => setProjectCollapsed(state, projectKey, collapsed)),
      toggleWorkspaceGroupCollapsed: (workspaceGroupKey) =>
        set((state) => toggleWorkspaceGroupCollapsed(state, workspaceGroupKey)),
      setWorkspaceGroupsCollapsed: (projectKeys, statusGroupKeys, collapsed) =>
        set((state) => setWorkspaceGroupsCollapsed(state, projectKeys, statusGroupKeys, collapsed)),
      togglePinnedCollapsed: () => set((state) => togglePinnedCollapsed(state)),
    }),
    {
      name: "sidebar-collapsed-sections",
      storage: createValidatedPersistStorage(AsyncStorage, PersistedCollapsedProjectsSchema),
      partialize: (state) => serializeCollapsedProjects(state),
      merge: (persistedState, currentState) =>
        mergePersistedCollapsedProjects(persistedState, currentState),
    },
  ),
);
