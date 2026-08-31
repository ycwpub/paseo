import { describe, expect, test } from "vitest";
import {
  TIMELINE_OLDER_FETCH_PAGE_SIZE,
  TIMELINE_RESUME_FETCH_PAGE_SIZE,
} from "@/timeline/history-fetch-policy";
import { planTimelineOlderFetch } from "./history-sync-plan";
import { planTimelineResumeFetch, planTimelineTailFetch } from "./resume-sync-plan";

describe("timeline sync planning", () => {
  test("initial and resumed synchronization use a larger recovery window", () => {
    expect(planTimelineTailFetch()).toEqual({
      direction: "tail",
      limit: TIMELINE_RESUME_FETCH_PAGE_SIZE,
      projection: "projected",
    });

    expect(planTimelineResumeFetch({ epoch: "epoch-1", endSeq: 49 })).toEqual({
      direction: "after",
      cursor: { epoch: "epoch-1", seq: 49 },
      limit: TIMELINE_RESUME_FETCH_PAGE_SIZE,
      projection: "projected",
    });
  });

  test("older history loads one bounded page before the start cursor", () => {
    const plan = planTimelineOlderFetch({ epoch: "epoch-1", seq: 25 });
    expect(plan).toEqual({
      direction: "before",
      cursor: { epoch: "epoch-1", seq: 25 },
      limit: TIMELINE_OLDER_FETCH_PAGE_SIZE,
      projection: "projected",
    });
  });
});
