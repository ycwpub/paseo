import { describe, expect, test } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { TIMELINE_RESUME_FETCH_PAGE_SIZE } from "./history-fetch-policy";
import { requestResumeTimelineReplacement } from "./resume-timeline-replacement";

describe("requestResumeTimelineReplacement", () => {
  test("requests enough history to restore a tool-heavy turn", async () => {
    const requests: unknown[] = [];
    const client = {
      fetchAgentTimeline: (...args: unknown[]) => {
        requests.push(args);
        return Promise.reject(new Error("fetch complete"));
      },
    } as unknown as Pick<DaemonClient, "fetchAgentTimeline">;

    await expect(requestResumeTimelineReplacement(client, "agent-1")).rejects.toThrow(
      "fetch complete",
    );

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
