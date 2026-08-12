import type { StreamItem } from "@/types/stream";
import type { StreamStrategy } from "./strategy";

export function collectAssistantTurnItems(input: {
  strategy: StreamStrategy;
  items: StreamItem[];
  assistantIndex: number;
}): StreamItem[] {
  const turnItems: StreamItem[] = [];

  for (
    let index = input.assistantIndex;
    index >= 0 && index < input.items.length;
    index = input.strategy.getNeighborIndex(index, "above")
  ) {
    const item = input.items[index];
    if (!item || item.kind === "user_message") {
      break;
    }
    turnItems.push(item);
  }

  return turnItems;
}
