import {
  AlertTroubleshooterPendingError,
  defaultAlertTroubleshooterFailureDecision,
  type AlertTroubleshooterFailureContext,
  type AlertTroubleshooterFailureDecision,
} from "./alert-troubleshooter-failure-policy.js";

const AUTHORIZATION_FAILURE =
  /(?:权限|授权|permission|authorization|999916(?:63|68|72|79)|missing[_ ]scope)/iu;
const RECORD_CONTRACT_FAILURE =
  /(?:缺少 result_id|缺少 rule_id|日报记录.*修复|记录.*不符合.*契约|record_reference_missing)/iu;
const VALIDATION_FAILURE =
  /(?:evidence|validation|validator|close 门禁|结果目录未通过|审核|证据|归因不合法|review_)/iu;
const TRANSIENT_EXTERNAL_FAILURE =
  /(?:HTTP\s*(?:408|425|429|5\d{2})|ECONN|ENETUNREACH|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|timeout|超时|网络|rate.?limit|限流|temporar(?:y|ily) unavailable|service unavailable)/iu;

export function classifyArgosExecutionFailure(
  context: AlertTroubleshooterFailureContext,
): AlertTroubleshooterFailureDecision {
  if (AUTHORIZATION_FAILURE.test(context.message)) {
    return {
      disposition: "pending",
      reason: `[authorization] ${context.message}`,
    };
  }
  if (RECORD_CONTRACT_FAILURE.test(context.message)) {
    return {
      disposition: "pending",
      reason: `[record_contract] ${context.message}`,
    };
  }
  if (
    context.error instanceof AlertTroubleshooterPendingError ||
    VALIDATION_FAILURE.test(context.message)
  ) {
    return {
      disposition: "pending",
      reason: `[evidence_validation] ${context.message}`,
    };
  }
  if (TRANSIENT_EXTERNAL_FAILURE.test(context.message)) {
    return defaultAlertTroubleshooterFailureDecision(context);
  }
  return {
    disposition: "failed",
    reason: `[fatal_runtime] ${context.message}`,
  };
}
