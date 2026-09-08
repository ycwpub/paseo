import { describe, expect, it } from "vitest";
import {
  BAMBOO_MAX_AUTOMATIC_RETRIES,
  isAlertTroubleshooterRetryDue,
  nextAlertTroubleshooterRetryAt,
} from "./alert-troubleshooter-retry-policy.js";

describe("alert troubleshooter retry policy", () => {
  const failedAt = new Date("2026-09-08T08:00:00.000Z");

  it("waits for the configured interval before retrying", () => {
    const nextRetryAt = nextAlertTroubleshooterRetryAt({
      failedAt,
      attempts: 1,
      intervalMinutes: 30,
      maxAutomaticRetries: BAMBOO_MAX_AUTOMATIC_RETRIES,
    });

    expect(nextRetryAt).toBe("2026-09-08T08:30:00.000Z");
    expect(isAlertTroubleshooterRetryDue(nextRetryAt, new Date("2026-09-08T08:29:59.999Z"))).toBe(
      false,
    );
    expect(isAlertTroubleshooterRetryDue(nextRetryAt, new Date("2026-09-08T08:30:00.000Z"))).toBe(
      true,
    );
  });

  it("stops after three automatic retries following the initial attempt", () => {
    expect(
      nextAlertTroubleshooterRetryAt({
        failedAt,
        attempts: 3,
        intervalMinutes: 30,
        maxAutomaticRetries: BAMBOO_MAX_AUTOMATIC_RETRIES,
      }),
    ).toBe("2026-09-08T08:30:00.000Z");
    expect(
      nextAlertTroubleshooterRetryAt({
        failedAt,
        attempts: 4,
        intervalMinutes: 30,
        maxAutomaticRetries: BAMBOO_MAX_AUTOMATIC_RETRIES,
      }),
    ).toBeNull();
  });
});
