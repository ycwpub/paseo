import type { Rectangle } from "electron";

const ISLAND_EDGE_GAP = 8;

export interface IslandDisplayGeometry {
  bounds: Rectangle;
  workArea: Rectangle;
}

export interface IslandSize {
  width: number;
  height: number;
}

/**
 * Keep the island inside the usable display area. On macOS, display.bounds.y is
 * inside the menu bar/notch region, while workArea.y starts immediately below it.
 */
export function resolveIslandBounds(display: IslandDisplayGeometry, size: IslandSize): Rectangle {
  const availableWidth = Math.max(1, display.workArea.width - ISLAND_EDGE_GAP * 2);
  const width = Math.min(size.width, availableWidth);
  const height = Math.min(size.height, Math.max(1, display.workArea.height - ISLAND_EDGE_GAP * 2));
  const centeredX = display.bounds.x + (display.bounds.width - width) / 2;
  const minimumX = display.workArea.x + ISLAND_EDGE_GAP;
  const maximumX = display.workArea.x + display.workArea.width - width - ISLAND_EDGE_GAP;

  return {
    x: Math.round(Math.min(Math.max(centeredX, minimumX), maximumX)),
    y: display.workArea.y + ISLAND_EDGE_GAP,
    width,
    height,
  };
}
