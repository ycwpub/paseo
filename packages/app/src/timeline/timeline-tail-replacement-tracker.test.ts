import { describe, expect, test } from "vitest";
import type { TimelineResponsePayload } from "./viewed-timeline-sync";
import { createTimelineTailReplacementTracker } from "./timeline-tail-replacement-tracker";

function createPayload(
  requestId: string,
  overrides: Partial<TimelineResponsePayload> = {},
): TimelineResponsePayload {
  return {
    requestId,
    agentId: "agent-1",
    agent: null,
    direction: "tail",
    projection: "projected",
    epoch: "epoch-1",
    reset: false,
    staleCursor: false,
    gap: false,
    window: { minSeq: 0, maxSeq: 0, nextSeq: 0 },
    startCursor: null,
    endCursor: null,
    hasOlder: false,
    hasNewer: false,
    entries: [],
    error: null,
    ...overrides,
  };
}

describe("timeline tail replacement tracker", () => {
  test("only forces reset for the tracked request when concurrent responses arrive", () => {
    const tracker = createTimelineTailReplacementTracker();
    tracker.track("replacement-request");

    const ordinaryResponse = createPayload("ordinary-request");
    expect(tracker.apply(ordinaryResponse)).toBe(ordinaryResponse);

    expect(tracker.apply(createPayload("replacement-request"))).toMatchObject({
      requestId: "replacement-request",
      reset: true,
    });
  });

  test("consumes a tracked request only once", () => {
    const tracker = createTimelineTailReplacementTracker();
    tracker.track("replacement-request");

    expect(tracker.apply(createPayload("replacement-request")).reset).toBe(true);
    expect(tracker.apply(createPayload("replacement-request")).reset).toBe(false);
  });

  test("does not consume a tracked request for a non-tail response", () => {
    const tracker = createTimelineTailReplacementTracker();
    tracker.track("replacement-request");

    const beforeResponse = createPayload("replacement-request", {
      direction: "before",
    });
    expect(tracker.apply(beforeResponse)).toBe(beforeResponse);
    expect(tracker.apply(createPayload("replacement-request")).reset).toBe(true);
  });

  test("clears a failed request before a delayed response can force reset", () => {
    const tracker = createTimelineTailReplacementTracker();
    tracker.track("replacement-request");
    tracker.clear("replacement-request");

    expect(tracker.apply(createPayload("replacement-request")).reset).toBe(false);
  });
});
