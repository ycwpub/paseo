import { describe, expect, test } from "vitest";
import { formatSelectedWeekdays, WEEKDAY_OPTIONS } from "./weekday-options";

describe("weekday options", () => {
  test("shows weekday names without numeric prefixes", () => {
    expect(WEEKDAY_OPTIONS.map((option) => option.label)).toEqual([
      "周一",
      "周二",
      "周三",
      "周四",
      "周五",
      "周六",
      "周日",
    ]);
    expect(formatSelectedWeekdays([1, 3, 7])).toBe("周一、周三、周日");
    expect(formatSelectedWeekdays([1, 2, 3, 4, 5, 6, 7])).toBe("每天");
  });
});
