import { describe, expect, test } from "vitest";
import {
  DEFAULT_MEMORY_PAGE_SIZE,
  MAX_MEMORY_PAGE_SIZE,
  normalizeMemoryPageSize,
  paginateMemoryItems,
} from "./memory-pagination";

describe("memory pagination", () => {
  test("uses ten items per page by default", () => {
    expect(normalizeMemoryPageSize(Number.NaN)).toBe(DEFAULT_MEMORY_PAGE_SIZE);
    expect(
      paginateMemoryItems(
        Array.from({ length: 12 }, (_, index) => index),
        1,
        10,
      ),
    ).toEqual({
      items: Array.from({ length: 10 }, (_, index) => index),
      page: 1,
      pageSize: 10,
      totalItems: 12,
      totalPages: 2,
      startItem: 1,
      endItem: 10,
    });
  });

  test("limits the page size to one hundred", () => {
    expect(normalizeMemoryPageSize(500)).toBe(MAX_MEMORY_PAGE_SIZE);
  });

  test("clamps the page after the last page becomes empty", () => {
    const result = paginateMemoryItems(["a", "b", "c"], 9, 2);
    expect(result.page).toBe(2);
    expect(result.items).toEqual(["c"]);
    expect(result.startItem).toBe(3);
    expect(result.endItem).toBe(3);
  });

  test("returns an empty first page for an empty list", () => {
    expect(paginateMemoryItems([], 3, 10)).toMatchObject({
      items: [],
      page: 1,
      totalItems: 0,
      totalPages: 1,
      startItem: 0,
      endItem: 0,
    });
  });
});
