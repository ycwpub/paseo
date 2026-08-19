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
 * Anchor the island to the physical top edge of the display. On macOS,
 * workArea.y starts below the menu bar/notch, so using it would make the island
 * look like an ordinary floating notification instead of part of the notch.
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
    y: display.bounds.y,
    width,
    height,
  };
}
