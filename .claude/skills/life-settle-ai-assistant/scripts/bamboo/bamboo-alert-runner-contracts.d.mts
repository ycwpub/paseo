export type BambooRunnerCommandPhase =
  | "scan"
  | "prepare"
  | "troubleshoot"
  | "doc"
  | "close"
  | "drain"
  | "validate"
  | "repair"
  | "orchestration";

export interface BambooRunnerCommandContract {
  name: string;
  phase: BambooRunnerCommandPhase;
  sideEffect: boolean;
  external: boolean;
  requiresOutputFileForAudit: boolean;
}

export type BambooRunnerReasonCodeSeverity = "fatal" | "recoverable";

export interface BambooRunnerReasonCodeMeta {
  code: string;
  category: string;
  severity: BambooRunnerReasonCodeSeverity;
  autoFixable: boolean;
  blocksReadyToReportComplete: boolean;
  description: string;
}

export type BambooAlertBlockerCode =
  | "missing_env"
  | "missing_required_option"
  | "missing_command"
  | "cli_contract_missing"
  | "wiki_url_unresolvable"
  | "tmp_not_writable"
  | "markdown_skeleton_failed"
  | "publish_audit_failed"
  | "review_audit_failed"
  | "base_write_failed"
  | "card_writeback_failed"
  | "external_retry_exhausted";

export const BAMBOO_ALERT_BLOCKER_TAXONOMY: readonly BambooAlertBlockerCode[];

export const BAMBOO_RUNNER_COMMANDS: readonly BambooRunnerCommandContract[];
export function getBambooRunnerCommand(
  name: string | undefined,
): BambooRunnerCommandContract | undefined;
export function listBambooRunnerCommands(): string[];

export const BAMBOO_RUNNER_REASON_CODES: Readonly<Record<string, BambooRunnerReasonCodeMeta>>;
export function getBambooRunnerReasonCodeMeta(code: string): BambooRunnerReasonCodeMeta | undefined;
export function listBambooRunnerReasonCodes(): string[];
