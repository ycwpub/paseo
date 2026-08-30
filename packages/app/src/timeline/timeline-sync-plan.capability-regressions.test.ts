import { describe, expect, test } from "vitest";
import { TIMELINE_OLDER_FETCH_PAGE_SIZE } from "@/timeline/history-fetch-policy";
import { planTimelineOlderFetch } from "./history-sync-plan";
describe("timeline sync planning", () => {
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
