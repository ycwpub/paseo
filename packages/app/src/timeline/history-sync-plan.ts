import { TIMELINE_OLDER_FETCH_PAGE_SIZE } from "@/timeline/history-fetch-policy";
import type { TimelineSyncCursor } from "@/timeline/timeline-sync-plan";

export function planTimelineOlderFetch(cursor: TimelineSyncCursor) {
  return {
    direction: "before",
    cursor,
    limit: TIMELINE_OLDER_FETCH_PAGE_SIZE,
    projection: "projected",
  } as const;
}
