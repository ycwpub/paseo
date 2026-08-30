// Initial paint and reconnect need enough projected rows to include the process
// of a tool-heavy Codex turn, not only its trailing reasoning/compaction rows.
export const TIMELINE_RESUME_FETCH_PAGE_SIZE = 500;

// `limit` applies to source timeline seqs before projection. Reasoning and tool
// lifecycle rows are merged during projection, so 50 source seqs can become only
// a handful of visible rows. Match the normal page size and prefetch before the
// user reaches the edge instead of making the user stop for many tiny pages.
export const TIMELINE_OLDER_FETCH_PAGE_SIZE = 100;

// Jump-to-oldest is an explicit bulk navigation action. Fetch larger chunks while
// still yielding between pages so long sessions do not create one huge response
// or a single unbounded render/layout burst.
export const TIMELINE_OLDEST_FETCH_PAGE_SIZE = 300;
