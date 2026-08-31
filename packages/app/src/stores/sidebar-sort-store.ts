import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

export type SidebarSortMode = "activity" | "name" | "manual";

interface SidebarSortStoreState {
  sortMode: SidebarSortMode;
  setSortMode: (mode: SidebarSortMode) => void;
}

const SidebarSortPersistedStateSchema = z.strictObject({
  sortMode: z.enum(["activity", "name", "manual"]),
});

export const useSidebarSortStore = create<SidebarSortStoreState>()(
  persist(
    (set) => ({
      sortMode: "activity",
      setSortMode: (sortMode) => set({ sortMode }),
    }),
    {
      name: "sidebar-project-sort",
      storage: createValidatedPersistStorage(AsyncStorage, SidebarSortPersistedStateSchema),
      partialize: (state) => ({ sortMode: state.sortMode }),
    },
  ),
);
