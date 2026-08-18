import { describe, expect, it } from "vitest";
import { resolveIslandBounds } from "./island-bounds";

describe("resolveIslandBounds", () => {
  it("places the island below the macOS menu bar or notch", () => {
    expect(
      resolveIslandBounds(
        {
          bounds: { x: 0, y: 0, width: 1512, height: 982 },
          workArea: { x: 0, y: 38, width: 1512, height: 944 },
        },
        { width: 420, height: 72 },
      ),
    ).toEqual({ x: 546, y: 46, width: 420, height: 72 });
  });

  it("supports external displays and negative coordinates", () => {
    expect(
      resolveIslandBounds(
        {
          bounds: { x: -1920, y: -120, width: 1920, height: 1080 },
          workArea: { x: -1920, y: -120, width: 1920, height: 1055 },
        },
        { width: 420, height: 142 },
      ),
    ).toEqual({ x: -1170, y: -112, width: 420, height: 142 });
  });

  it("keeps the island inside a narrow work area", () => {
    expect(
      resolveIslandBounds(
        {
          bounds: { x: 100, y: 50, width: 320, height: 600 },
          workArea: { x: 100, y: 74, width: 320, height: 576 },
        },
        { width: 420, height: 700 },
      ),
    ).toEqual({ x: 108, y: 82, width: 304, height: 560 });
  });
});
