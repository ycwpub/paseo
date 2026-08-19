import { describe, expect, it } from "vitest";
import { ISLAND_COMPACT_HEIGHT, ISLAND_COMPACT_WIDTH, resolveIslandLayout } from "./island-layout";

describe("resolveIslandLayout", () => {
  it("uses a notch-shaped compact surface", () => {
    expect(resolveIslandLayout(1728, 3, false)).toEqual({
      width: ISLAND_COMPACT_WIDTH,
      height: ISLAND_COMPACT_HEIGHT,
    });
  });

  it("expands across the display and grows with unread messages", () => {
    expect(resolveIslandLayout(1512, 1, true)).toEqual({ width: 1488, height: 286 });
    expect(resolveIslandLayout(1512, 4, true)).toEqual({ width: 1488, height: 432 });
    expect(resolveIslandLayout(1512, 20, true)).toEqual({ width: 1488, height: 514 });
  });

  it("stays inside narrow displays", () => {
    expect(resolveIslandLayout(320, 1, false)).toEqual({ width: 304, height: 48 });
    expect(resolveIslandLayout(320, 1, true)).toEqual({ width: 304, height: 286 });
  });
});
