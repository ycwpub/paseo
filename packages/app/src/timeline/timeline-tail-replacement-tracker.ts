import type { TimelineResponsePayload } from "./viewed-timeline-sync";

export interface TimelineTailReplacementTracker {
  track(requestId: string): void;
  clear(requestId: string): void;
  apply(payload: TimelineResponsePayload): TimelineResponsePayload;
}

function createRequestId(): string {
  const value =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `timeline-tail-replacement-${value}`;
}

export function createTimelineTailReplacementRequestId(): string {
  return createRequestId();
}

export function createTimelineTailReplacementTracker(): TimelineTailReplacementTracker {
  const requestIds = new Set<string>();

  return {
    track(requestId) {
      requestIds.add(requestId);
    },
    clear(requestId) {
      requestIds.delete(requestId);
    },
    apply(payload) {
      if (payload.direction !== "tail" || !requestIds.delete(payload.requestId)) {
        return payload;
      }
      return { ...payload, reset: true };
    },
  };
}
