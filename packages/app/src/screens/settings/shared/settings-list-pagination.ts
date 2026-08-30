import {
  DEFAULT_MEMORY_PAGE_SIZE,
  paginateMemoryItems,
} from "@/screens/settings/memory/memory-pagination";

export const DEFAULT_SETTINGS_LIST_PAGE_SIZE = DEFAULT_MEMORY_PAGE_SIZE;

export function paginateSettingsList<T>(items: readonly T[], page: number, pageSize: number) {
  return paginateMemoryItems(items, page, pageSize);
}
