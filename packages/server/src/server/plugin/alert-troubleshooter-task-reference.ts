export type AlertTroubleshooterLocalStage = "scan" | "table_poll" | "message_ingest";

interface AlertTroubleshooterTaskReference {
  recordId: string;
  uniqueId: string;
}

export function alertTroubleshooterLocalStage(
  task: AlertTroubleshooterTaskReference,
): AlertTroubleshooterLocalStage | null {
  if (task.uniqueId.startsWith("table_poll:")) return "table_poll";
  if (task.uniqueId.startsWith("scan:")) return "scan";
  if (
    (task.recordId.startsWith("failed:") || task.recordId.startsWith("local:")) &&
    task.uniqueId.startsWith("message_id:")
  ) {
    return "message_ingest";
  }
  return null;
}

export function localAlertTroubleshooterRecordId(uniqueId: string): string {
  return `local:${uniqueId}`;
}

export function isMissingAlertTroubleshooterRecordError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(?:1254043|RecordIdNotFound)\b/iu.test(message);
}
