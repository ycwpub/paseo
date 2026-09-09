import { describe, expect, it } from "vitest";
import { bambooDateKeys } from "./bamboo-date-range.js";

describe("bambooDateKeys", () => {
  it("keeps the default two-day runner window and supports a wider configured window", () => {
    const now = new Date("2026-09-09T12:00:00+08:00");
    expect(bambooDateKeys(2, now)).toEqual(["20260909", "20260908"]);
    expect(bambooDateKeys(4, now)).toEqual(["20260909", "20260908", "20260907", "20260906"]);
  });
});
