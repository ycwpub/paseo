import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

interface PluginSidebarOrderState {
  orderByServer: Record<string, string[]>;
  setOrder: (serverId: string, pluginIds: string[]) => void;
}

const PluginSidebarOrderPersistedStateSchema = z.strictObject({
  orderByServer: z.record(z.string(), z.array(z.string())),
});

function uniquePluginIds(pluginIds: string[]): string[] {
  return [...new Set(pluginIds.filter(Boolean))];
}

export const usePluginSidebarOrderStore = create<PluginSidebarOrderState>()(
  persist(
    (set) => ({
      orderByServer: {},
      setOrder: (serverId, pluginIds) =>
        set((state) => ({
          orderByServer: {
            ...state.orderByServer,
            [serverId]: uniquePluginIds(pluginIds),
          },
        })),
    }),
    {
      name: "sidebar-plugin-order",
      storage: createValidatedPersistStorage(AsyncStorage, PluginSidebarOrderPersistedStateSchema),
      partialize: (state) => ({ orderByServer: state.orderByServer }),
    },
  ),
);
