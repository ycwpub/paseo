import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

interface PluginSidebarVisibilityState {
  collapsed: boolean;
  hidden: boolean;
  toggleCollapsed: () => void;
  hide: () => void;
  show: () => void;
}

const PluginSidebarVisibilityPersistedStateSchema = z.strictObject({
  collapsed: z.boolean(),
  hidden: z.boolean(),
});

export const usePluginSidebarVisibilityStore = create<PluginSidebarVisibilityState>()(
  persist(
    (set) => ({
      collapsed: false,
      hidden: false,
      toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
      hide: () => set({ collapsed: true, hidden: true }),
      show: () => set({ hidden: false }),
    }),
    {
      name: "sidebar-plugin-visibility",
      storage: createValidatedPersistStorage(
        AsyncStorage,
        PluginSidebarVisibilityPersistedStateSchema,
      ),
      partialize: (state) => ({
        collapsed: state.collapsed,
        hidden: state.hidden,
      }),
    },
  ),
);
