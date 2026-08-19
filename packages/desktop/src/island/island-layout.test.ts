import { describe, expect, it } from "vitest";
import { ISLAND_COMPACT_HEIGHT, ISLAND_COMPACT_WIDTH, resolveIslandLayout } from "./island-layout";

describe("resolveIslandLayout", () => {
  it("uses a notch-shaped compact surface", () => {
    expect(resolveIslandLayout(1728, 3, false)).toEqual({
      width: ISLAND_COMPACT_WIDTH,
      height: ISLAND_COMPACT_HEIGHT,
    });
  });

  it("uses one quarter of the display and shows at most two messages before scrolling", () => {
    expect(resolveIslandLayout(1512, 1, true)).toEqual({ width: 453, height: 180 });
    expect(resolveIslandLayout(1512, 2, true)).toEqual({ width: 453, height: 220 });
    expect(resolveIslandLayout(1512, 20, true)).toEqual({ width: 453, height: 220 });
    expect(resolveIslandLayout(2560, 20, true)).toEqual({ width: 520, height: 220 });
  });

  it("stays inside narrow displays", () => {
    expect(resolveIslandLayout(320, 1, false)).toEqual({ width: 304, height: 38 });
    expect(resolveIslandLayout(320, 1, true)).toEqual({ width: 304, height: 180 });
  });
});
