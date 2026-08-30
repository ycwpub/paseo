import { describe, expect, test } from "vitest";
import { ScheduleRunSchema, ScheduleTargetSchema } from "./types.js";
describe("ScheduleTargetSchema", () => {
    test("accepts bash schedule targets", () => {
        expect(ScheduleTargetSchema.parse({
            type: "bash",
            config: {
                cwd: "/tmp/project",
                shell: "/bin/bash",
                timeoutMs: 60000,
            },
        })).toEqual({
            type: "bash",
            config: {
                cwd: "/tmp/project",
                shell: "/bin/bash",
                timeoutMs: 60000,
            },
        });
    });
    test("accepts assistant IDs on new-agent schedule targets", () => {
        expect(ScheduleTargetSchema.parse({
            type: "new-agent",
            config: {
                provider: "claude",
                cwd: "/tmp/project",
                assistantId: "assistant-1",
            },
        })).toEqual({
            type: "new-agent",
            config: {
                provider: "claude",
                cwd: "/tmp/project",
                assistantId: "assistant-1",
            },
        });
    });
});
describe("ScheduleRunSchema", () => {
    test("accepts run config snapshots", () => {
        expect(ScheduleRunSchema.parse({
            id: "run-1",
            scheduledFor: "2026-01-01T00:00:00.000Z",
            startedAt: "2026-01-01T00:00:01.000Z",
            endedAt: "2026-01-01T00:00:02.000Z",
            status: "succeeded",
            agentId: null,
            output: "ok",
            error: null,
            configSnapshot: {
                name: "Nightly build",
                prompt: "npm test",
                cadence: { type: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
                target: { type: "bash", config: { cwd: "/tmp/project", shell: "/bin/bash" } },
                maxRuns: 3,
                expiresAt: null,
            },
        })).toEqual({
            id: "run-1",
            scheduledFor: "2026-01-01T00:00:00.000Z",
            startedAt: "2026-01-01T00:00:01.000Z",
            endedAt: "2026-01-01T00:00:02.000Z",
            status: "succeeded",
            agentId: null,
            output: "ok",
            error: null,
            configSnapshot: {
                name: "Nightly build",
                prompt: "npm test",
                cadence: { type: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
                target: { type: "bash", config: { cwd: "/tmp/project", shell: "/bin/bash" } },
                maxRuns: 3,
                expiresAt: null,
            },
        });
    });
    test("accepts legacy run records without snapshots", () => {
        expect(ScheduleRunSchema.parse({
            id: "run-1",
            scheduledFor: "2026-01-01T00:00:00.000Z",
            startedAt: "2026-01-01T00:00:01.000Z",
            endedAt: null,
            status: "running",
            agentId: null,
            output: null,
            error: null,
        })).toEqual({
            id: "run-1",
            scheduledFor: "2026-01-01T00:00:00.000Z",
            startedAt: "2026-01-01T00:00:01.000Z",
            endedAt: null,
            status: "running",
            agentId: null,
            output: null,
            error: null,
        });
    });
});
