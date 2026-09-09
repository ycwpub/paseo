import { describe, expect, it } from "vitest";
import {
  AlertTroubleshooterScanNowRequestSchema,
  AlertTroubleshooterScanNowResponseSchema,
} from "./alert-troubleshooter-rpc-schemas";

describe("alert troubleshooter manual scan RPC", () => {
  it("accepts a one-off time range and returns its scan summary", () => {
    expect(
      AlertTroubleshooterScanNowRequestSchema.parse({
        type: "plugin.alert_troubleshooter.scan_now.request",
        requestId: "request-1",
        pluginId: "bamboo-reconciliation-troubleshooter",
        appId: "bamboo-troubleshooter-console",
        projectId: "prj_1",
        lookbackMinutes: 120,
        excludeRecentMinutes: 1,
      }),
    ).toMatchObject({
      lookbackMinutes: 120,
      excludeRecentMinutes: 1,
    });

    expect(
      AlertTroubleshooterScanNowResponseSchema.parse({
        type: "plugin.alert_troubleshooter.scan_now.response",
        payload: {
          requestId: "request-1",
          tasks: [],
          matchedCount: 2,
          failureCount: 0,
          auditFile: "/tmp/audit.json",
          error: null,
        },
      }).payload,
    ).toMatchObject({
      matchedCount: 2,
      failureCount: 0,
      auditFile: "/tmp/audit.json",
    });
  });

  it("rejects a range whose excluded period covers the full lookback", () => {
    expect(() =>
      AlertTroubleshooterScanNowRequestSchema.parse({
        type: "plugin.alert_troubleshooter.scan_now.request",
        requestId: "request-2",
        pluginId: "bamboo-reconciliation-troubleshooter",
        appId: "bamboo-troubleshooter-console",
        projectId: "prj_1",
        lookbackMinutes: 60,
        excludeRecentMinutes: 60,
      }),
    ).toThrow("excludeRecentMinutes must be less than lookbackMinutes");
  });
});
