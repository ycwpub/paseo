import { create } from "zustand";
import {
  isSamePluginAppSelection,
  type PluginAppPanelSelection,
} from "@/plugins/sidebar-panel/model";

interface PluginAppPanelState {
  selection: PluginAppPanelSelection | null;
  toggle: (selection: PluginAppPanelSelection) => void;
  close: () => void;
}

export const usePluginAppPanelStore = create<PluginAppPanelState>()((set) => ({
  selection: null,
  toggle: (selection) =>
    set((state) => ({
      selection: isSamePluginAppSelection(state.selection, selection) ? null : selection,
    })),
  close: () => set({ selection: null }),
}));
