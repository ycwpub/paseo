import { describe, expect, it } from "vitest";
import {
  ScheduleCreateRequestSchema,
  ScheduleLogsResponseSchema,
  ScheduleUpdateRequestSchema,
} from "./rpc-schemas.js";

describe("schedule RPC schemas", () => {
  it("round-trips new-agent run options on create requests", () => {
    expect(
      ScheduleCreateRequestSchema.parse({
        type: "schedule/create",
        requestId: "request-1",
        prompt: "Run the task",
        cadence: { type: "every", everyMs: 60_000 },
        target: {
          type: "new-agent",
          config: {
            provider: "claude",
            cwd: "/tmp/project",
            thinkingOptionId: "think-hard",
            assistantId: "assistant-1",
            archiveOnFinish: false,
            isolation: "worktree",
          },
        },
      }),
    ).toEqual({
      type: "schedule/create",
      requestId: "request-1",
      prompt: "Run the task",
      cadence: { type: "every", everyMs: 60_000 },
      target: {
        type: "new-agent",
        config: {
          provider: "claude",
          cwd: "/tmp/project",
          thinkingOptionId: "think-hard",
          assistantId: "assistant-1",
          archiveOnFinish: false,
          isolation: "worktree",
        },
      },
    });
  });

  it("round-trips bash targets on create requests", () => {
    expect(
      ScheduleCreateRequestSchema.parse({
        type: "schedule/create",
        requestId: "request-1",
        prompt: "npm test",
        cadence: { type: "cron", expression: "0 9 * * *" },
        target: {
          type: "bash",
          config: {
            cwd: "/tmp/project",
            shell: "/bin/bash",
            timeoutMs: 120_000,
          },
        },
      }),
    ).toEqual({
      type: "schedule/create",
      requestId: "request-1",
      prompt: "npm test",
      cadence: { type: "cron", expression: "0 9 * * *" },
      target: {
        type: "bash",
        config: {
          cwd: "/tmp/project",
          shell: "/bin/bash",
          timeoutMs: 120_000,
        },
      },
    });
  });

  it("round-trips new-agent run options on update requests", () => {
    expect(
      ScheduleUpdateRequestSchema.parse({
        type: "schedule/update",
        requestId: "request-1",
        scheduleId: "schedule-1",
        newAgentConfig: {
          thinkingOptionId: "think-hard",
          assistantId: "assistant-1",
          archiveOnFinish: false,
          isolation: "worktree",
        },
      }),
    ).toEqual({
      type: "schedule/update",
      requestId: "request-1",
      scheduleId: "schedule-1",
      newAgentConfig: {
        thinkingOptionId: "think-hard",
        assistantId: "assistant-1",
        archiveOnFinish: false,
        isolation: "worktree",
      },
    });
  });

  it("round-trips bash run options on update requests", () => {
    expect(
      ScheduleUpdateRequestSchema.parse({
        type: "schedule/update",
        requestId: "request-1",
        scheduleId: "schedule-1",
        bashConfig: {
          cwd: "/tmp/project",
          shell: null,
          timeoutMs: null,
        },
      }),
    ).toEqual({
      type: "schedule/update",
      requestId: "request-1",
      scheduleId: "schedule-1",
      bashConfig: {
        cwd: "/tmp/project",
        shell: null,
        timeoutMs: null,
      },
    });
  });

  it("round-trips run config snapshots in logs responses", () => {
    expect(
      ScheduleLogsResponseSchema.parse({
        type: "schedule/logs/response",
        payload: {
          requestId: "request-1",
          error: null,
          runs: [
            {
              id: "run-1",
              scheduledFor: "2026-01-01T00:00:00.000Z",
              startedAt: "2026-01-01T00:00:01.000Z",
              endedAt: "2026-01-01T00:00:02.000Z",
              status: "succeeded",
              agentId: null,
              output: "ok",
              error: null,
              configSnapshot: {
                name: null,
                prompt: "npm test",
                cadence: { type: "every", everyMs: 60_000 },
                target: { type: "bash", config: { cwd: "/tmp/project" } },
                maxRuns: 1,
                expiresAt: null,
              },
            },
          ],
        },
      }),
    ).toEqual({
      type: "schedule/logs/response",
      payload: {
        requestId: "request-1",
        error: null,
        runs: [
          {
            id: "run-1",
            scheduledFor: "2026-01-01T00:00:00.000Z",
            startedAt: "2026-01-01T00:00:01.000Z",
            endedAt: "2026-01-01T00:00:02.000Z",
            status: "succeeded",
            agentId: null,
            output: "ok",
            error: null,
            configSnapshot: {
              name: null,
              prompt: "npm test",
              cadence: { type: "every", everyMs: 60_000 },
              target: { type: "bash", config: { cwd: "/tmp/project" } },
              maxRuns: 1,
              expiresAt: null,
            },
          },
        ],
      },
    });
  });
});
