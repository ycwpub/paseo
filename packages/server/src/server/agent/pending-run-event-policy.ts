import type { AgentStreamEvent } from "./agent-sdk-types.js";

/**
 * Some provider work happens before a foreground turn is accepted. These events
 * must remain visible while startTurn is pending instead of being replayed only
 * after that work has already finished.
 */
export function shouldPublishWhileForegroundRunIsPending(event: AgentStreamEvent): boolean {
  return event.type === "timeline" && event.item.type === "compaction";
}
