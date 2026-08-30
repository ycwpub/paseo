import type { ScheduleSummary } from "@getpaseo/protocol/schedule/types";
import { describe, expect, it } from "vitest";
import type { AggregatedSchedule } from "@/schedules/aggregated-schedules";
import { mergeReturnedSchedule } from "./use-schedule-mutations";
function schedule(overrides: Partial<AggregatedSchedule> = {}): AggregatedSchedule {
    const base: ScheduleSummary = {
        id: "schedule-1",
        name: "Nightly",
        prompt: "Run the task",
        cadence: { type: "every", everyMs: 60000 },
        target: { type: "new-agent", config: { provider: "codex", cwd: "/tmp/project" } },
        status: "active",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        nextRunAt: "2026-07-02T01:00:00.000Z",
        lastRunAt: null,
        pausedAt: null,
        expiresAt: null,
        maxRuns: null,
    };
    return { ...base, serverId: "host-a", serverName: "Host A", ...overrides };
}
describe("schedule mutation cache updates", () => {
    it("merges the schedule returned by resume while preserving host metadata", () => {
        const ended = schedule({
            status: "completed",
            maxRuns: 1,
            nextRunAt: null,
            lastRunAt: "2026-07-02T00:00:00.000Z",
        });
        const returned: ScheduleSummary = {
            ...ended,
            status: "active",
            nextRunAt: "2026-07-02T00:01:00.000Z",
            maxRuns: 2,
            updatedAt: "2026-07-02T00:00:30.000Z",
        };
        expect(mergeReturnedSchedule([ended], "host-a", returned)).toEqual([
            {
                ...returned,
                serverId: "host-a",
                serverName: "Host A",
            },
        ]);
    });
});
