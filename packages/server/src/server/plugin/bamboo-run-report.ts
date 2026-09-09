import type { AlertTroubleshooterRunReport } from "@getpaseo/protocol/messages";
import type {
  BambooCloseReadyResult,
  BambooRunReport,
  BambooRunSummary,
} from "./bamboo-agent-runner.js";

function property(value: unknown, ...names: string[]): unknown {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const name of names) {
    if (record[name] !== undefined) return record[name];
  }
  return undefined;
}

function assignDefined<K extends keyof AlertTroubleshooterRunReport>(
  target: AlertTroubleshooterRunReport,
  key: K,
  value: AlertTroubleshooterRunReport[K] | undefined,
): void {
  if (value !== undefined) target[key] = value;
}

export function buildBambooTaskRunReport(input: {
  summary: BambooRunSummary;
  strictDrain: BambooRunSummary;
  report: BambooRunReport;
  close: BambooCloseReadyResult;
}): AlertTroubleshooterRunReport {
  const ready =
    input.summary.ready_to_report_complete === true &&
    input.summary.final_drain?.ready_to_report_complete === true &&
    input.strictDrain.ready_to_report_complete === true &&
    input.strictDrain.final_drain?.ready_to_report_complete === true &&
    input.report.ready_to_report_complete;
  const metrics = property(input.report, "metrics") ?? property(input.summary, "metrics");
  const artifactConsistency =
    property(input.report, "artifact_consistency", "artifactConsistency") ??
    property(input.summary, "artifact_consistency", "artifactConsistency");
  const cleanupPlan =
    property(input.report, "cleanup_plan", "cleanupPlan") ??
    property(artifactConsistency, "cleanup_plan", "cleanupPlan");
  const scanGroups =
    property(input.report, "scan_groups", "scanGroups") ??
    property(property(input.report, "scan"), "groups") ??
    property(input.summary, "scan_groups", "scanGroups") ??
    property(property(input.summary, "scan"), "groups");
  const dailyBases =
    property(input.report, "daily_bases", "dailyBases") ??
    property(input.summary, "daily_bases", "dailyBases");
  const auditFiles =
    property(input.report, "audit_files", "auditFiles") ??
    property(input.summary, "audit_files", "auditFiles");
  const taskReport: AlertTroubleshooterRunReport = {
    readyToReportComplete: ready,
    reason: input.report.ready_to_report_complete_reason,
    businessClose: input.close.close_results.map((closeResult) => closeResult.business_close),
    notificationClose: input.close.close_results.map(
      (closeResult) => closeResult.notification_close,
    ),
  };
  assignDefined(taskReport, "metrics", metrics);
  assignDefined(taskReport, "artifactConsistency", artifactConsistency);
  assignDefined(taskReport, "cleanupPlan", cleanupPlan);
  assignDefined(taskReport, "scanGroups", scanGroups);
  assignDefined(taskReport, "dailyBases", dailyBases);
  assignDefined(taskReport, "auditFiles", auditFiles);
  return taskReport;
}
