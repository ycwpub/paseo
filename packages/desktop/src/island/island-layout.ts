export interface IslandLayout {
  width: number;
  height: number;
}

/**
 * Fallback compact size for Electron and Macs without a camera housing.
 * The native host replaces this with the current screen's real notch width.
 */
export const ISLAND_COMPACT_HEIGHT = 48;
export const ISLAND_COMPACT_WIDTH = 320;

const EXPANDED_HORIZONTAL_GUTTER = 24;
const EXPANDED_MIN_HEIGHT = 286;
const EXPANDED_MAX_HEIGHT = 560;
const EXPANDED_HEADER_HEIGHT = 104;
const EXPANDED_ITEM_HEIGHT = 82;
const MAX_VISIBLE_ITEM_COUNT = 5;

export function resolveIslandLayout(
  displayWidth: number,
  itemCount: number,
  expanded: boolean,
): IslandLayout {
  const availableWidth = Math.max(304, Math.floor(displayWidth) - EXPANDED_HORIZONTAL_GUTTER);
  if (!expanded) {
    return {
      width: Math.min(ISLAND_COMPACT_WIDTH, availableWidth),
      height: ISLAND_COMPACT_HEIGHT,
    };
  }

  const visibleItemCount = Math.max(1, Math.min(MAX_VISIBLE_ITEM_COUNT, itemCount));
  return {
    width: availableWidth,
    height: Math.min(
      EXPANDED_MAX_HEIGHT,
      Math.max(
        EXPANDED_MIN_HEIGHT,
        EXPANDED_HEADER_HEIGHT + visibleItemCount * EXPANDED_ITEM_HEIGHT,
      ),
    ),
  };
}
