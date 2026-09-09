import {
  defaultAlertTroubleshooterFailureDecision,
  type AlertTroubleshooterFailureContext,
  type AlertTroubleshooterFailureDecision,
} from "./alert-troubleshooter-failure-policy.js";
import { classifyBambooFailureCategory } from "./bamboo-failure-taxonomy.js";

export function classifyBambooExecutionFailure(
  context: AlertTroubleshooterFailureContext,
): AlertTroubleshooterFailureDecision {
  const category = classifyBambooFailureCategory(context.error, context.message);
  if (category === "transient_external") return defaultAlertTroubleshooterFailureDecision(context);
  if (
    category === "authorization" ||
    category === "record_contract" ||
    category === "evidence_validation" ||
    category === "review_rework_exhausted"
  ) {
    return { disposition: "pending", reason: `[${category}] ${context.message}` };
  }
  return { disposition: "failed", reason: `[${category}] ${context.message}` };
}
