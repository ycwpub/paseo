import { AlertTroubleshooterPendingError } from "./alert-troubleshooter-failure-policy.js";

export type BambooFailureCategory =
  | "authorization"
  | "record_contract"
  | "evidence_validation"
  | "review_rework_exhausted"
  | "transient_external"
  | "fatal_runtime";

const AUTHORIZATION_FAILURE =
  /(?:权限|授权|permission|authorization|999916(?:63|68|72|79)|missing[_ ]scope)/iu;
const RECORD_CONTRACT_FAILURE =
  /(?:缺少 result_id|日报记录.*修复|记录.*不符合.*契约|record_reference_missing)/iu;
const EVIDENCE_VALIDATION_FAILURE =
  /(?:sample_checks|business_evidence|evidence|validation|validator|close 门禁|结果目录未通过|文档质量|样本|证据|归因不合法)/iu;
const EXTERNAL_FAILURE =
  /(?:HTTP\s*(?:408|425|429|5\d{2})|ECONN|ENETUNREACH|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|timeout|超时|网络|rate.?limit|限流|temporar(?:y|ily) unavailable|service unavailable)/iu;

export function classifyBambooFailureCategory(
  error: unknown,
  message: string,
): BambooFailureCategory {
  if (
    error instanceof AlertTroubleshooterPendingError &&
    error.reasonCode === "review_rework_exhausted"
  ) {
    return "review_rework_exhausted";
  }
  if (AUTHORIZATION_FAILURE.test(message)) return "authorization";
  if (RECORD_CONTRACT_FAILURE.test(message)) return "record_contract";
  if (
    error instanceof AlertTroubleshooterPendingError ||
    EVIDENCE_VALIDATION_FAILURE.test(message)
  ) {
    return "evidence_validation";
  }
  if (EXTERNAL_FAILURE.test(message)) return "transient_external";
  return "fatal_runtime";
}
