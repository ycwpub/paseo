import type { AlertTroubleshooterQueueItem } from "./alert-troubleshooter-queue-store.js";

export type AlertTroubleshooterFailureDisposition = "retry" | "pending" | "failed";

export interface AlertTroubleshooterFailureContext {
  error: unknown;
  message: string;
  task: AlertTroubleshooterQueueItem;
}

export interface AlertTroubleshooterFailureDecision {
  disposition: AlertTroubleshooterFailureDisposition;
  reason: string;
}

export class AlertTroubleshooterPendingError extends Error {
  constructor(
    message: string,
    public readonly reasonCode: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AlertTroubleshooterPendingError";
  }
}

export function defaultAlertTroubleshooterFailureDecision(
  context: AlertTroubleshooterFailureContext,
): AlertTroubleshooterFailureDecision {
  if (context.error instanceof AlertTroubleshooterPendingError) {
    return { disposition: "pending", reason: context.error.message };
  }
  return context.task.nextRetryAt
    ? { disposition: "retry", reason: context.message }
    : { disposition: "failed", reason: context.message };
}
