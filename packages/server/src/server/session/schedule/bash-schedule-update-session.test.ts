import pino from "pino";
import { describe, expect, it } from "vitest";

import type { SessionOutboundMessage } from "../../messages.js";
import type { ScheduleService } from "../../schedule/service.js";
import { createStub } from "../../test-utils/class-mocks.js";
import { findByType } from "../../test-utils/session-stubs.js";
import { BashScheduleUpdateSession } from "./bash-schedule-update-session.js";

describe("BashScheduleUpdateSession", () => {
  it("forwards Bash configuration when updating a schedule", async () => {
    const emitted: SessionOutboundMessage[] = [];
    let update: Parameters<ScheduleService["update"]>[0] | null = null;
    const schedule = {
      id: "schedule-1",
      name: "Bash",
      prompt: "",
      cadence: { type: "every" as const, everyMs: 60_000 },
      target: {
        type: "bash" as const,
        config: { command: "npm test", cwd: "/repo" },
      },
      status: "active" as const,
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
      nextRunAt: null,
      lastRunAt: null,
      pausedAt: null,
      expiresAt: null,
      maxRuns: null,
    };
    const session = new BashScheduleUpdateSession({
      emit: (message) => emitted.push(message),
      scheduleService: createStub<ScheduleService>({
        update: async (input) => {
          update = input;
          return schedule;
        },
      }),
      logger: pino({ level: "silent" }),
    });

    await session.handle({
      type: "schedule/update",
      requestId: "request-1",
      scheduleId: schedule.id,
      bashConfig: { command: "npm run test:unit", cwd: "/repo/packages/server" },
    });

    expect(update).toEqual({
      id: schedule.id,
      bashConfig: { command: "npm run test:unit", cwd: "/repo/packages/server" },
    });
    expect(findByType(emitted, "schedule/update/response")?.payload).toEqual({
      requestId: "request-1",
      schedule,
      error: null,
    });
  });
});
