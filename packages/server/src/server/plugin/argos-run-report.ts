import type { AlertTroubleshooterRunReport } from "@getpaseo/protocol/messages";
import type {
  ArgosCloseReadyResult,
  ArgosRunReport,
  ArgosRunSummary,
} from "./argos-agent-runner.js";

function field(value: unknown, name: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[name] : undefined;
}

export function buildArgosTaskRunReport(input: {
  summary: ArgosRunSummary;
  report: ArgosRunReport;
  close: ArgosCloseReadyResult;
}): AlertTroubleshooterRunReport {
  const results = input.close.results;
  return {
    readyToReportComplete:
      input.summary.ready_to_report_complete &&
      input.summary.final_drain.ready_to_report_complete &&
      input.report.ready_to_report_complete,
    reason: input.report.ready_to_report_complete_reason,
    metrics: field(input.report, "status_counts") ?? field(input.summary, "status_counts"),
    dailyBases: field(input.report, "daily_bases") ?? field(input.summary, "daily_bases"),
    auditFiles: field(input.summary, "audit_files"),
    businessClose: results.map((result) => ({
      resultId: field(result, "result_id"),
      status: field(result, "status"),
      documentStatus: field(result, "doc_archive_status"),
      sopStatus: field(result, "sop_writeback_status"),
    })),
    notificationClose: results.map((result) => ({
      resultId: field(result, "result_id"),
      cardStatus: field(result, "card_update_status"),
      messageReplyStatus: field(result, "message_reply_status"),
      messageReplyReason: field(result, "message_reply_reason"),
    })),
  };
}
