import type { ComponentProps } from "react";
import { MemoryPaginationControls } from "@/screens/settings/memory/memory-pagination-controls";
import {
  DEFAULT_MEMORY_PAGE_SIZE,
  paginateMemoryItems,
} from "@/screens/settings/memory/memory-pagination";

export const DEFAULT_ASSISTANT_RESOURCE_PAGE_SIZE = DEFAULT_MEMORY_PAGE_SIZE;

export function paginateAssistantResources<T>(items: readonly T[], page: number, pageSize: number) {
  return paginateMemoryItems(items, page, pageSize);
}

export function AssistantResourcePaginationControls(
  props: ComponentProps<typeof MemoryPaginationControls>,
) {
  return <MemoryPaginationControls {...props} />;
}
