import { useSidebarDisplayPreferences, type SidebarDisplayPreferences } from "./model";
import { useSidebarSortStore, type SidebarSortMode } from "@/stores/sidebar-sort-store";

export interface SortableSidebarDisplayPreferences extends SidebarDisplayPreferences {
  sorting: SidebarSortMode;
  setSorting: (mode: SidebarSortMode) => void;
}

export function useSortableSidebarDisplayPreferences(): SortableSidebarDisplayPreferences {
  const preferences = useSidebarDisplayPreferences();
  const sorting = useSidebarSortStore((state) => state.sortMode);
  const setSorting = useSidebarSortStore((state) => state.setSortMode);
  return {
    ...preferences,
    sorting,
    setSorting,
  };
}
