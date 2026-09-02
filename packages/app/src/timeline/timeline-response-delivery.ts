import type { TimelineResponsePayload } from "./viewed-timeline-sync";

const MAX_REMEMBERED_REQUEST_IDS = 2_048;

export interface TimelineResponseDelivery {
  deliver(payload: TimelineResponsePayload): boolean;
}

/**
 * Timeline fetches have two completion paths:
 *
 * 1. the daemon client's typed message event;
 * 2. the Promise returned by the correlated request.
 *
 * Keeping both paths prevents a response from being lost while a connection or
 * React listener is being replaced. Request IDs make the two paths idempotent.
 */
export function createTimelineResponseDelivery(
  apply: (payload: TimelineResponsePayload) => void,
): TimelineResponseDelivery {
  const deliveredRequestIds = new Set<string>();

  return {
    deliver(payload) {
      const key = `${payload.agentId}\0${payload.requestId}`;
      if (deliveredRequestIds.has(key)) return false;

      // Only remember a response after it was applied successfully. If a
      // broadcast listener fails, the correlated Promise path can retry it.
      apply(payload);
      deliveredRequestIds.add(key);
      if (deliveredRequestIds.size > MAX_REMEMBERED_REQUEST_IDS) {
        const oldest = deliveredRequestIds.values().next().value;
        if (oldest !== undefined) deliveredRequestIds.delete(oldest);
      }
      return true;
    },
  };
}

export async function fetchAndDeliverTimelineResponse(
  fetchResponse: () => Promise<TimelineResponsePayload>,
  deliver: (payload: TimelineResponsePayload) => void,
): Promise<TimelineResponsePayload> {
  const payload = await fetchResponse();
  deliver(payload);
  return payload;
}
