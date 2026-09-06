import type { LarkSubstituteMode } from "@getpaseo/protocol/messages";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";

interface PendingSubstituteMessage {
  timer: ReturnType<typeof setTimeout>;
  latestEvent: NormalizedLarkMessageEvent;
  bufferedEvents: NormalizedLarkMessageEvent[];
}

export interface DebouncedLarkSubstituteMessage {
  latestEvent: NormalizedLarkMessageEvent;
  bufferedEvents: NormalizedLarkMessageEvent[];
}

function getPendingKey(mode: LarkSubstituteMode, event: NormalizedLarkMessageEvent): string {
  if (event.chatType?.toLowerCase() === "p2p") {
    return `${mode.id}:${event.chatId}:private`;
  }
  return `${mode.id}:${event.chatId}:group`;
}

export class LarkSubstituteDebouncer {
  private readonly pending = new Map<string, PendingSubstituteMessage>();

  schedule(
    mode: LarkSubstituteMode,
    event: NormalizedLarkMessageEvent,
    handler: (message: DebouncedLarkSubstituteMessage) => Promise<void>,
  ): boolean {
    if (mode.delaySeconds <= 0) return false;
    const key = getPendingKey(mode, event);
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing.timer);
    const bufferedEvents = existing ? [...existing.bufferedEvents, event] : [event];
    const timer = setTimeout(() => {
      const latest = this.pending.get(key);
      if (!latest) return;
      this.pending.delete(key);
      void handler({
        latestEvent: latest.latestEvent,
        bufferedEvents: latest.bufferedEvents,
      });
    }, mode.delaySeconds * 1_000);
    this.pending.set(key, { timer, latestEvent: event, bufferedEvents });
    return true;
  }

  cancelMode(modeId: string): void {
    for (const [key, pending] of this.pending) {
      if (!key.startsWith(`${modeId}:`)) continue;
      clearTimeout(pending.timer);
      this.pending.delete(key);
    }
  }

  clear(): void {
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
  }
}
