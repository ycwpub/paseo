import type { ScheduleSummary } from "@getpaseo/protocol/schedule/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isRunnableSchedule } from "../schedules/runnable-schedule";
import { isNewAgentSchedule, scheduleProductName } from "./schedule-format";
function createSchedule(input: {
  name?: string | null;
  prompt?: string;
  title?: string | null;
  targetType?: "agent" | "new-agent" | "bash";
}): ScheduleSummary {
  let target: ScheduleSummary["target"];
  if (input.targetType === "agent") {
    target = { type: "agent", agentId: "00000000-0000-4000-8000-000000000000" };
  } else if (input.targetType === "bash") {
    target = { type: "bash", config: { cwd: "/tmp/project" } };
  } else {
    target = {
      type: "new-agent",
      config: {
        provider: "codex",
        cwd: "/tmp/project",
        title: input.title,
      },
    };
  }
  return {
    id: "schedule-1",
    name: input.name ?? null,
    prompt: input.prompt ?? "Run the task",
    cadence: { type: "every", everyMs: 60000 },
    target,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    nextRunAt: null,
    lastRunAt: null,
    pausedAt: null,
    expiresAt: null,
    maxRuns: null,
  };
}
afterEach(() => {
  vi.useRealTimers();
});
describe("schedule title helpers", () => {
  it("identifies new-agent schedules", () => {
    expect(isNewAgentSchedule(createSchedule({ targetType: "new-agent" }))).toBe(true);
    expect(isNewAgentSchedule(createSchedule({ targetType: "bash" }))).toBe(false);
    expect(isNewAgentSchedule(createSchedule({ targetType: "agent" }))).toBe(false);
  });
  it("identifies schedules that can run from the schedule UI", () => {
    expect(isRunnableSchedule(createSchedule({ targetType: "new-agent" }))).toBe(true);
    expect(isRunnableSchedule(createSchedule({ targetType: "bash" }))).toBe(true);
    expect(isRunnableSchedule(createSchedule({ targetType: "agent" }))).toBe(false);
  });
  it("labels engine records by product meaning", () => {
    expect(scheduleProductName(createSchedule({ targetType: "new-agent" }))).toBe("Schedule");
    expect(scheduleProductName(createSchedule({ targetType: "bash" }))).toBe("Schedule");
    expect(scheduleProductName(createSchedule({ targetType: "agent" }))).toBe("Heartbeat");
  });
});
