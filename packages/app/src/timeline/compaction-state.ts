import type { StreamItem } from "@/types/stream";

export function hasActiveContextCompaction(
  ...timelineSegments: ReadonlyArray<readonly StreamItem[] | undefined>
): boolean {
  return timelineSegments.some((items) =>
    items?.some((item) => item.kind === "compaction" && item.status === "loading"),
  );
}
