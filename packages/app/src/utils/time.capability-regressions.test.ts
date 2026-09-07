import { describe, it, expect } from "vitest";
import { formatActionTimeRange } from "./action-time";
describe("formatActionTimeRange", () => {
  it("shows start and end timestamps for completed actions", () => {
    const now = new Date(2026, 7, 9, 12, 30, 0);
    const formatted = formatActionTimeRange({
      startedAt: new Date(2026, 7, 9, 12, 1, 3),
      completedAt: new Date(2026, 7, 9, 12, 1, 9),
      now,
    });
    expect(formatted).toMatch(/12:01:03/);
    expect(formatted).toMatch(/12:01:09/);
    expect(formatted).toContain("→");
  });
  it("shows an open end for running actions", () => {
    const formatted = formatActionTimeRange({
      startedAt: new Date(2026, 7, 9, 12, 1, 3),
      now: new Date(2026, 7, 9, 12, 30, 0),
    });
    expect(formatted).toMatch(/12:01:03/);
    expect(formatted).toContain("→ …");
  });
});
