import { describe, expect, test, vi } from "vitest";
import type { TimelineResponsePayload } from "./viewed-timeline-sync";
import {
  createTimelineResponseDelivery,
  fetchAndDeliverTimelineResponse,
} from "./timeline-response-delivery";

function createPayload(requestId = "request-1"): TimelineResponsePayload {
  return {
    requestId,
    agentId: "agent-1",
    agent: null,
    direction: "tail",
    projection: "projected",
    reset: false,
    epoch: "epoch-1",
    window: { minSeq: 1, maxSeq: 1, nextSeq: 2 },
    startCursor: { epoch: "epoch-1", seq: 1 },
    endCursor: { epoch: "epoch-1", seq: 1 },
    entries: [],
    error: null,
    hasNewer: false,
    hasOlder: false,
    staleCursor: false,
    gap: false,
  };
}

describe("timeline response delivery", () => {
  test("applies a correlated response even when no broadcast listener observed it", async () => {
    let resolveFetch!: (payload: TimelineResponsePayload) => void;
    const fetch = new Promise<TimelineResponsePayload>((resolve) => {
      resolveFetch = resolve;
    });
    const apply = vi.fn();
    const delivery = createTimelineResponseDelivery(apply);
    const result = fetchAndDeliverTimelineResponse(() => fetch, delivery.deliver);

    expect(apply).not.toHaveBeenCalled();
    resolveFetch(createPayload());

    await expect(result).resolves.toMatchObject({ requestId: "request-1" });
    expect(apply).toHaveBeenCalledOnce();
  });

  test("deduplicates the broadcast and correlated Promise paths", async () => {
    const payload = createPayload();
    const apply = vi.fn();
    const delivery = createTimelineResponseDelivery(apply);

    expect(delivery.deliver(payload)).toBe(true);
    await fetchAndDeliverTimelineResponse(async () => payload, delivery.deliver);

    expect(apply).toHaveBeenCalledOnce();
  });

  test("allows the correlated Promise path to retry a failed broadcast application", async () => {
    const payload = createPayload();
    const apply = vi
      .fn<(payload: TimelineResponsePayload) => void>()
      .mockImplementationOnce(() => {
        throw new Error("listener replaced");
      })
      .mockImplementationOnce(() => undefined);
    const delivery = createTimelineResponseDelivery(apply);

    expect(() => delivery.deliver(payload)).toThrow("listener replaced");
    await expect(
      fetchAndDeliverTimelineResponse(async () => payload, delivery.deliver),
    ).resolves.toBe(payload);
    expect(apply).toHaveBeenCalledTimes(2);
  });
});
