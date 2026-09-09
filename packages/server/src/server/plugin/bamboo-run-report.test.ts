import { describe, expect, it } from "vitest";
import { buildBambooTaskRunReport } from "./bamboo-run-report.js";

describe("buildBambooTaskRunReport", () => {
  it("preserves runner metrics, consistency, cleanup, scan, and close layers", () => {
    expect(
      buildBambooTaskRunReport({
        summary: {
          ready_to_report_complete: true,
          final_drain: { ready_to_report_complete: true },
          artifact_consistency: { cleanup_plan: [{ action: "review" }] },
          audit_files: { close: ["close-1.json"] },
        },
        strictDrain: {
          ready_to_report_complete: true,
          final_drain: { ready_to_report_complete: true },
        },
        report: {
          success: true,
          ready_to_report_complete: true,
          ready_to_report_complete_reason: "ready",
          metrics: { succeeded: 1 },
          scan: { groups: [{ chat_id: "oc_1" }] },
          daily_bases: [{ date_key: "20260909" }],
        },
        close: {
          success: true,
          ready_count: 1,
          skipped_count: 0,
          close_results: [
            {
              success: true,
              business_close: { success: true },
              notification_close: { success: false },
              results: [],
            },
          ],
        },
      }),
    ).toEqual({
      readyToReportComplete: true,
      reason: "ready",
      metrics: { succeeded: 1 },
      artifactConsistency: { cleanup_plan: [{ action: "review" }] },
      cleanupPlan: [{ action: "review" }],
      scanGroups: [{ chat_id: "oc_1" }],
      dailyBases: [{ date_key: "20260909" }],
      businessClose: [{ success: true }],
      notificationClose: [{ success: false }],
      auditFiles: { close: ["close-1.json"] },
    });
  });

  it("falls back to run-summary scan and daily Base details when the renderer omits them", () => {
    expect(
      buildBambooTaskRunReport({
        summary: {
          ready_to_report_complete: false,
          final_drain: { ready_to_report_complete: false },
          scan: { groups: [{ chat_id: "oc_summary" }] },
          daily_bases: [{ date_key: "20260908" }],
        },
        strictDrain: {
          ready_to_report_complete: false,
          final_drain: { ready_to_report_complete: false },
        },
        report: {
          success: true,
          ready_to_report_complete: false,
          ready_to_report_complete_reason: "仍有记录待处理",
        },
        close: {
          success: true,
          ready_count: 1,
          skipped_count: 0,
          close_results: [
            {
              success: true,
              business_close: { success: true },
              notification_close: { success: true },
              results: [],
            },
          ],
        },
      }),
    ).toEqual({
      readyToReportComplete: false,
      reason: "仍有记录待处理",
      scanGroups: [{ chat_id: "oc_summary" }],
      dailyBases: [{ date_key: "20260908" }],
      businessClose: [{ success: true }],
      notificationClose: [{ success: true }],
    });
  });
});
