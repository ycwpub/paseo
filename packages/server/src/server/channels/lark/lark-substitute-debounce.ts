import type { LarkSubstituteMode } from "@getpaseo/protocol/messages";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";

interface PendingSubstituteMessage {
  timer: ReturnType<typeof setTimeout>;
  event: NormalizedLarkMessageEvent;
}

export class LarkSubstituteDebouncer {
  private readonly pending = new Map<string, PendingSubstituteMessage>();

  schedule(
    mode: LarkSubstituteMode,
    event: NormalizedLarkMessageEvent,
    handler: (event: NormalizedLarkMessageEvent) => Promise<void>,
  ): boolean {
    if (mode.delaySeconds <= 0) return false;
    const key = `${mode.id}:${event.chatId}:${event.openId}`;
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      const latest = this.pending.get(key);
      if (!latest) return;
      this.pending.delete(key);
      void handler(latest.event);
    }, mode.delaySeconds * 1_000);
    this.pending.set(key, { timer, event });
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
