import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS_LIST_PAGE_SIZE, paginateSettingsList } from "./settings-list-pagination";

describe("settings list pagination", () => {
  test("shows ten items on the first page by default", () => {
    const result = paginateSettingsList(
      Array.from({ length: 21 }, (_, index) => index + 1),
      1,
      DEFAULT_SETTINGS_LIST_PAGE_SIZE,
    );

    expect(result.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.totalPages).toBe(3);
  });

  test("supports a user-selected page size", () => {
    const result = paginateSettingsList(
      Array.from({ length: 21 }, (_, index) => index + 1),
      1,
      20,
    );

    expect(result.items).toHaveLength(20);
    expect(result.totalPages).toBe(2);
  });

  test("clamps the page after filtering reduces the item count", () => {
    const result = paginateSettingsList(["only-result"], 4, 10);

    expect(result.page).toBe(1);
    expect(result.items).toEqual(["only-result"]);
  });
});
