// Count is projected timeline items, not delta chunks. Fetch responses never return
// tool lifecycle deltas; `sourceSeqRanges` maps projected items back to source seqs.
export const TIMELINE_FETCH_PAGE_SIZE = 100;

// `limit` applies to source timeline seqs before projection. Reasoning and tool
// lifecycle rows are merged during projection, so 50 source seqs can become only
// a handful of visible rows. Match the normal page size and prefetch before the
// user reaches the edge instead of making the user stop for many tiny pages.
export const TIMELINE_OLDER_FETCH_PAGE_SIZE = 100;

// Jump-to-oldest is an explicit bulk navigation action. Fetch larger chunks while
// still yielding between pages so long sessions do not create one huge response
// or a single unbounded render/layout burst.
export const TIMELINE_OLDEST_FETCH_PAGE_SIZE = 300;
