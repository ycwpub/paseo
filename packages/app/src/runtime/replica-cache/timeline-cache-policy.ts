export const MAX_PERSISTED_TIMELINE_ITEMS = 500;

export interface TimelineCacheWindow<T> {
  items: T[];
  startIndex: number;
  startsAtTurnBoundary: boolean;
}

/**
 * Keep recent history bounded without cutting the latest turn in half.
 *
 * Tool-heavy Codex turns regularly exceed the old 50-item cache limit. Starting
 * at a user message gives the persisted suffix a stable pagination boundary and
 * keeps the tool calls, progress messages, and final answer from that turn
 * together after an app restart.
 */
export function selectTimelineCacheWindow<T extends { kind: string }>(
  items: readonly T[],
  maxItems = MAX_PERSISTED_TIMELINE_ITEMS,
): TimelineCacheWindow<T> {
  if (items.length <= maxItems) {
    return {
      items: [...items],
      startIndex: 0,
      startsAtTurnBoundary: items[0]?.kind === "user_message",
    };
  }

  const cutoff = items.length - maxItems;
  let startIndex = items.findIndex(
    (item, index) => index >= cutoff && item.kind === "user_message",
  );

  if (startIndex < 0) {
    for (let index = cutoff - 1; index >= 0; index -= 1) {
      if (items[index]?.kind === "user_message") {
        startIndex = index;
        break;
      }
    }
  }

  if (startIndex < 0) {
    startIndex = cutoff;
  }

  return {
    items: items.slice(startIndex),
    startIndex,
    startsAtTurnBoundary: items[startIndex]?.kind === "user_message",
  };
}
