export const DEFAULT_MEMORY_PAGE_SIZE = 10;
export const MAX_MEMORY_PAGE_SIZE = 100;
export const MEMORY_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export interface MemoryPagination<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startItem: number;
  endItem: number;
}

export function normalizeMemoryPageSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MEMORY_PAGE_SIZE;
  return Math.min(MAX_MEMORY_PAGE_SIZE, Math.max(1, Math.floor(value)));
}

export function paginateMemoryItems<T>(
  items: readonly T[],
  requestedPage: number,
  requestedPageSize: number,
): MemoryPagination<T> {
  const pageSize = normalizeMemoryPageSize(requestedPageSize);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(totalPages, Math.max(1, Math.floor(requestedPage) || 1));
  const startIndex = (page - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);

  return {
    items: pageItems,
    page,
    pageSize,
    totalItems,
    totalPages,
    startItem: totalItems === 0 ? 0 : startIndex + 1,
    endItem: totalItems === 0 ? 0 : startIndex + pageItems.length,
  };
}
