import type { StreamItem } from "@/types/stream";

export interface TurnHookCall {
  name: string;
  count: number;
}

export function collectTurnHookCalls(items: StreamItem[]): TurnHookCall[] {
  const callsByName = new Map<string, number>();

  for (const item of items) {
    if (item.kind !== "tool_call") {
      continue;
    }
    const rawName =
      item.payload.source === "agent" ? item.payload.data.name : item.payload.data.toolName;
    const name = rawName.trim();
    if (!name) {
      continue;
    }
    callsByName.set(name, (callsByName.get(name) ?? 0) + 1);
  }

  return [...callsByName].map(([name, count]) => ({ name, count }));
}
