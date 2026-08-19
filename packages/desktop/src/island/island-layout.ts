export interface IslandLayout {
  width: number;
  height: number;
}

export const ISLAND_COMPACT_HEIGHT = 64;
export const ISLAND_COMPACT_WIDTH = 520;

const EXPANDED_HORIZONTAL_GUTTER = 12;
const EXPANDED_MIN_HEIGHT = 182;
const EXPANDED_MAX_HEIGHT = 460;
const EXPANDED_HEADER_HEIGHT = 86;
const EXPANDED_ITEM_HEIGHT = 72;
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
