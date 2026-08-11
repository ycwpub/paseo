import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  type HiddenProjectsState,
  type PersistedHiddenProjects,
  mergePersistedHiddenProjects,
  serializeHiddenProjects,
  setProjectHidden,
  toggleHiddenSection,
} from "./state";

interface SidebarHiddenProjectsState extends HiddenProjectsState {
  setProjectHidden: (projectKey: string, hidden: boolean) => void;
  toggleHiddenSection: () => void;
}

export const useSidebarHiddenProjectsStore = create<SidebarHiddenProjectsState>()(
  persist(
    (set) => ({
      hiddenProjectKeys: new Set(),
      hiddenSectionCollapsed: true,
      setProjectHidden: (projectKey, hidden) =>
        set((state) => setProjectHidden(state, projectKey, hidden)),
      toggleHiddenSection: () => set((state) => toggleHiddenSection(state)),
    }),
    {
      name: "sidebar-hidden-projects",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => serializeHiddenProjects(state),
      merge: (persistedState, currentState) =>
        mergePersistedHiddenProjects(
          persistedState as PersistedHiddenProjects | undefined,
          currentState,
        ),
    },
  ),
);
