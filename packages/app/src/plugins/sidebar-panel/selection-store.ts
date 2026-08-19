import { create } from "zustand";
import {
  isSamePluginAppSelection,
  type PluginAppPanelSelection,
} from "@/plugins/sidebar-panel/model";

interface PluginAppPanelState {
  selection: PluginAppPanelSelection | null;
  open: (selection: PluginAppPanelSelection) => void;
  toggle: (selection: PluginAppPanelSelection) => void;
  close: () => void;
}

export const usePluginAppPanelStore = create<PluginAppPanelState>()((set) => ({
  selection: null,
  open: (selection) => set({ selection }),
  toggle: (selection) =>
    set((state) => ({
      selection: isSamePluginAppSelection(state.selection, selection) ? null : selection,
    })),
  close: () => set({ selection: null }),
}));
