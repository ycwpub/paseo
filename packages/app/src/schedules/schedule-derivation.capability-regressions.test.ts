import type { ScheduleSummary } from "@getpaseo/protocol/schedule/types";
import { describe, expect, it } from "vitest";
import { resolveSchedule, type ScheduleTargetAgent } from "./schedule-derivation";
const NOW = Date.parse("2026-07-02T00:00:00.000Z");
function makeSchedule(overrides: Partial<ScheduleSummary>): ScheduleSummary {
  return {
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
    ...overrides,
  };
}
function resolve(
  schedule: ScheduleSummary,
  options?: {
    agents?: Array<[string, ScheduleTargetAgent]>;
    projects?: Array<[string, string]>;
    agentDataLoaded?: boolean;
  },
) {
  return resolveSchedule({
    schedule,
    serverId: "host-1",
    now: NOW,
    agentsByKey: new Map(options?.agents ?? []),
    projectNameByCwd: new Map(options?.projects ?? []),
    agentDataLoaded: options?.agentDataLoaded ?? true,
  });
}
describe("resolveSchedule target line", () => {
  it("names a bash cwd without a provider glyph", () => {
    const schedule = makeSchedule({
      target: { type: "bash", config: { cwd: "/tmp/project" } },
    });
    expect(resolve(schedule, { projects: [["host-1:/tmp/project", "My Project"]] }).target).toEqual(
      {
        label: "My Project",
        provider: null,
      },
    );
  });
});
