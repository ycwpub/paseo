import type { StreamItem } from "@/types/stream";

/**
 * Keeps turn-level change analysis independent from timeline presentation.
 *
 * The visible timeline may collapse tool calls and thoughts after a turn
 * completes. File-change detection still needs the original tool calls because
 * they carry repository working directories and edited file paths.
 */
export function indexTurnChangeItemsByAssistantId(input: {
  tail: readonly StreamItem[];
  head: readonly StreamItem[];
}): ReadonlyMap<string, StreamItem[]> {
  const itemsByAssistantId = new Map<string, StreamItem[]>();
  let turnItems: StreamItem[] = [];
  let assistantIds: string[] = [];

  const flushTurn = () => {
    if (turnItems.length > 0) {
      for (const assistantId of assistantIds) {
        itemsByAssistantId.set(assistantId, turnItems);
      }
    }
    turnItems = [];
    assistantIds = [];
  };

  for (const item of [...input.tail, ...input.head]) {
    if (item.kind === "user_message") {
      flushTurn();
      continue;
    }
    turnItems.push(item);
    if (item.kind === "assistant_message") {
      assistantIds.push(item.id);
    }
  }
  flushTurn();

  return itemsByAssistantId;
}
