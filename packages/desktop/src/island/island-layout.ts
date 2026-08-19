export interface IslandLayout {
  width: number;
  height: number;
}

/**
 * Fallback compact size for Electron and Macs without a camera housing.
 * The native host replaces this with the current screen's real notch width.
 */
export const ISLAND_COMPACT_HEIGHT = 38;
export const ISLAND_COMPACT_WIDTH = 320;

const ISLAND_EDGE_GUTTER = 16;
const EXPANDED_DISPLAY_RATIO = 0.3;
const EXPANDED_MIN_WIDTH = 400;
const EXPANDED_MAX_WIDTH = 520;
const EXPANDED_MIN_HEIGHT = 180;
const EXPANDED_MAX_HEIGHT = 220;
const EXPANDED_CHROME_HEIGHT = 84;
const EXPANDED_ITEM_HEIGHT = 68;
const MAX_VISIBLE_ITEM_COUNT = 2;

export function resolveIslandLayout(
  displayWidth: number,
  itemCount: number,
  expanded: boolean,
): IslandLayout {
  const availableWidth = Math.max(304, Math.floor(displayWidth) - ISLAND_EDGE_GUTTER);
  if (!expanded) {
    return {
      width: Math.min(ISLAND_COMPACT_WIDTH, availableWidth),
      height: ISLAND_COMPACT_HEIGHT,
    };
  }

  const preferredWidth = Math.max(
    EXPANDED_MIN_WIDTH,
    Math.min(EXPANDED_MAX_WIDTH, Math.floor(displayWidth * EXPANDED_DISPLAY_RATIO)),
  );
  const visibleItemCount = Math.max(1, Math.min(MAX_VISIBLE_ITEM_COUNT, itemCount));
  return {
    width: Math.min(preferredWidth, availableWidth),
    height: Math.min(
      EXPANDED_MAX_HEIGHT,
      Math.max(
        EXPANDED_MIN_HEIGHT,
        EXPANDED_CHROME_HEIGHT + visibleItemCount * EXPANDED_ITEM_HEIGHT,
      ),
    ),
  };
}
