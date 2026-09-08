import { describe, expect, it } from "vitest";
import { isAlertTroubleshooterActionDue } from "./alert-troubleshooter-schedule.js";

describe("isAlertTroubleshooterActionDue", () => {
  const now = new Date("2026-09-08T12:30:00.000Z");

  it("uses the most recent in-memory timestamp", () => {
    expect(
      isAlertTroubleshooterActionDue({
        now,
        intervalMinutes: 30,
        inMemoryTimestamp: Date.parse("2026-09-08T12:15:00.000Z"),
      }),
    ).toBe(false);
  });

  it("preserves the configured interval after a daemon restart", () => {
    expect(
      isAlertTroubleshooterActionDue({
        now,
        intervalMinutes: 30,
        persistedTimestamp: "2026-09-08T12:05:00.000Z",
      }),
    ).toBe(false);
  });

  it("treats invalid persisted timestamps as missing", () => {
    expect(
      isAlertTroubleshooterActionDue({
        now,
        intervalMinutes: 30,
        persistedTimestamp: "invalid",
      }),
    ).toBe(true);
  });
});
