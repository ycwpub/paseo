import { describe, expect, it } from "vitest";
import {
  getAlertTroubleshooterManualScanRangeDefaults,
  parseAlertTroubleshooterManualScanRange,
} from "./alert-troubleshooter-manual-scan-range";

describe("alert troubleshooter manual scan range", () => {
  it("uses the configured scheduled scan range as the initial value", () => {
    expect(
      getAlertTroubleshooterManualScanRangeDefaults({
        lookbackMinutes: 120,
        excludeRecentMinutes: 10,
      }),
    ).toEqual({
      lookbackMinutes: "120",
      excludeRecentMinutes: "10",
    });
  });

  it("parses an independent one-off scan range", () => {
    expect(
      parseAlertTroubleshooterManualScanRange({
        lookbackMinutes: "180",
        excludeRecentMinutes: "1",
      }),
    ).toEqual({
      ok: true,
      value: {
        lookbackMinutes: 180,
        excludeRecentMinutes: 1,
      },
    });
  });

  it("requires the excluded period to be smaller than the lookback", () => {
    expect(
      parseAlertTroubleshooterManualScanRange({
        lookbackMinutes: "60",
        excludeRecentMinutes: "60",
      }),
    ).toEqual({
      ok: false,
      error: "排除最近必须是非负整数，并且小于扫描范围。",
    });
  });
});
