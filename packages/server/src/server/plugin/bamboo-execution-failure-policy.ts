import {
  AlertTroubleshooterPendingError,
  defaultAlertTroubleshooterFailureDecision,
  type AlertTroubleshooterFailureContext,
  type AlertTroubleshooterFailureDecision,
} from "./alert-troubleshooter-failure-policy.js";

const AUTHORIZATION_FAILURE =
  /(?:权限|授权|permission|authorization|999916(?:63|68|72|79)|missing[_ ]scope)/iu;
const RECORD_CONTRACT_FAILURE = /(?:缺少 result_id|日报记录.*修复|记录.*不符合.*契约)/u;
const EXTERNAL_FAILURE =
  /(?:HTTP\s*(?:408|425|429|5\d{2})|ECONN|ENETUNREACH|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|timeout|超时|网络|rate.?limit|限流|temporar(?:y|ily) unavailable|service unavailable)/iu;

export function classifyBambooExecutionFailure(
  context: AlertTroubleshooterFailureContext,
): AlertTroubleshooterFailureDecision {
  if (
    context.error instanceof AlertTroubleshooterPendingError ||
    AUTHORIZATION_FAILURE.test(context.message) ||
    RECORD_CONTRACT_FAILURE.test(context.message)
  ) {
    return { disposition: "pending", reason: context.message };
  }
  if (!EXTERNAL_FAILURE.test(context.message)) {
    return { disposition: "pending", reason: context.message };
  }
  return defaultAlertTroubleshooterFailureDecision(context);
}
