import { describe, expect, test } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { TIMELINE_RESUME_FETCH_PAGE_SIZE } from "./history-fetch-policy";
import { requestTimelineReplacement } from "./timeline-replacement";

describe("requestTimelineReplacement", () => {
  test("requests the existing projected tail without receiving a timeline installer", async () => {
    const requests: Parameters<DaemonClient["fetchAgentTimeline"]>[] = [];
    const client = {
      fetchAgentTimeline: async (...request: Parameters<DaemonClient["fetchAgentTimeline"]>) => {
        requests.push(request);
        throw new Error("fetch complete");
      },
    };

    await expect(requestTimelineReplacement(client, "agent-1")).rejects.toThrow("fetch complete");

    expect(requests).toEqual([
      [
        "agent-1",
        {
          direction: "tail",
          projection: "projected",
          limit: TIMELINE_RESUME_FETCH_PAGE_SIZE,
        },
      ],
    ]);
  });
});
