import { TIMELINE_RESUME_FETCH_PAGE_SIZE } from "@/timeline/history-fetch-policy";
import type {
  ProjectedTimelineForwardFetchPlan,
  TimelineSyncCursor,
} from "@/timeline/timeline-sync-plan";

export type { ProjectedTimelineForwardFetchPlan };

export function planTimelineCatchUpAfter(cursor: TimelineSyncCursor) {
  return {
    direction: "after",
    cursor,
    limit: TIMELINE_RESUME_FETCH_PAGE_SIZE,
    projection: "projected",
  } as const;
}

export function planTimelineTailFetch() {
  return {
    direction: "tail",
    limit: TIMELINE_RESUME_FETCH_PAGE_SIZE,
    projection: "projected",
  } as const;
}

export function planTimelineResumeFetch(
  range: { epoch: string; endSeq: number } | null | undefined,
): ProjectedTimelineForwardFetchPlan {
  return range
    ? planTimelineCatchUpAfter({ epoch: range.epoch, seq: range.endSeq })
    : planTimelineTailFetch();
}
