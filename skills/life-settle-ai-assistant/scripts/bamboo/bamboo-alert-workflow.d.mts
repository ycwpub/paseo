export interface ChatMessageListArgsInput {
  chatId: string;
  start: Date;
  end: Date;
  pageToken?: string;
  pageSize?: number;
}

export interface BambooMessage {
  chat_id?: string;
  message_id?: string;
  message_app_link?: string;
  content?: string;
}

export interface BaseRecordPatchInput {
  recordId: string;
  status: "init" | "processing" | "succeeded" | "failed" | "pending" | "not_support";
  summary: string;
  docUrl: string;
  finishedAt?: string | number | Date;
  pendingAdmission?: PendingAdmission;
  failedAdmission?: FailedAdmission;
  cardUpdateStatus?: TerminalNotificationStatus;
  cardUpdateReason?: string;
  messageReplyStatus?: TerminalNotificationStatus;
  messageReplyReason?: string;
}

export interface BaseModelResultPatchInput {
  recordId: string;
  status: BaseRecordPatchInput["status"];
  summary: string;
  docUrl: string;
  finishedAt?: string | number | Date;
  pendingAdmission?: PendingAdmission;
  failedAdmission?: FailedAdmission;
}

export interface BaseNotificationPatchInput {
  recordId: string;
  extra?: Record<string, unknown> | string;
  cardUpdateStatus: TerminalNotificationStatus;
  cardUpdateReason?: string;
  messageReplyStatus: TerminalNotificationStatus;
  messageReplyReason?: string;
}

export type TerminalNotificationStatus = "succeeded" | "failed" | "skipped";

export interface PendingAdmissionCheck {
  status: "done" | "blocked" | "not_applicable";
  evidence: string;
}

export interface SampleCountConsistency {
  card_task_result_num: number;
  bamboo_false_data_length: number;
  authoritative_samples?: number;
  authoritative_source?: string;
  positive_sources?: Array<Record<string, unknown>>;
  can_quick_close_zero_samples?: boolean;
  false_reason_available: boolean;
  false_reason_length?: number;
  false_reason_source_type?: string;
  retry_attempts?: number;
  attempts?: Array<Record<string, unknown>>;
  verdict: "consistent_or_not_applicable" | "sample_count_conflict" | "bamboo_result_inconsistent";
}

export interface AuthorizationPendingAdmission {
  waiting_for_user_authorization: true;
  authorization_request: {
    target: string;
    permission: string;
    apply_url?: string;
  };
  rule_and_samples: PendingAdmissionCheck;
  current_online_state: PendingAdmissionCheck;
  permission_blockers: PendingAdmissionCheck;
  code_idl_config: PendingAdmissionCheck;
  closure_candidates: PendingAdmissionCheck;
  manual_question: string;
}

export interface BambooResultInconsistentPendingAdmission {
  pending_reason_type: "bamboo_result_inconsistent";
  waiting_for_user_authorization: false;
  needs_manual_confirmation?: false;
  sample_count_consistency: SampleCountConsistency;
  manual_question: string;
}

export type PendingAdmission =
  | AuthorizationPendingAdmission
  | BambooResultInconsistentPendingAdmission;

export interface FailedAdmission {
  error_class: "network" | "transient" | "cli_network";
  attempts: number;
  cli_name: string;
  last_error: string;
  retry_command: string;
}

export interface BambooResultSummaryInput {
  result?: string;
  alert_status?: string;
  alarm_detail_id?: string | number | null;
  false_data_length?: string | number | null;
  instance_status?: string;
  instance_false_reason?: string;
  false_reason?: unknown;
  repeat_reason?: unknown;
  comment?: unknown;
}

export type BambooAttributionResult =
  | "[有效告警]代码问题(已知问题)"
  | "[有效告警]代码问题(新问题)"
  | "[有效告警]补偿任务问题(已知问题)"
  | "[有效告警]补偿任务问题(新问题)"
  | "[有效告警]上下游问题(已知问题)"
  | "[有效告警]上下游问题(新问题)"
  | "[有效告警]其他原因(需要修数)(已知问题)"
  | "[有效告警]其他原因(需要修数)(新问题)"
  | "[有效告警]对账脚本有误/未兼容(已知问题)"
  | "[有效告警]业务底表丢数"
  | "[有效告警]离线同步问题，已恢复，无需修数"
  | "[有效告警]数据生产存在时间差, 导致数据不一致问题[已知问题]"
  | "[有效告警]商家冻结户余额不足，需充钱[已知问题]"
  | "[有效告警]业务刷数"
  | "[无效告警]测试数据"
  | "[无效告警]对账平台问题"
  | "[无效告警]正常数据波动"
  | "[无效告警]临界数据飘移"
  | "[无效告警]表权限缺失"
  | "[无效告警]非业务底表丢数"
  | "[无效告警]规则调试"
  | "[无效告警]其他原因(不需要修数)"
  | "[无效告警]业务刷数";

export const BAMBOO_ATTRIBUTION_RESULTS: readonly BambooAttributionResult[];

export interface TroubleshootingDocSectionTitles {
  baseInfo: "一、基础信息";
  rawBambooSummary: "二、原始Bamboo结果摘要";
  quickClosureEvidence: "三、快速闭环匹配证据（脚本硬匹配，nonOverride=true）";
  deepInvestigation: "三、深度排查过程";
  evidenceSummary: "四、证据链汇总";
  quickConclusion: "四、归因结论与建议";
  deepConclusion: "五、归因结论与建议";
  pendingEvidence: "三、已完成证据（6项deep-check通过）";
  pendingAuthorization: "四、待用户授权点（authorization_request）";
  pendingUserAction: "五、用户操作指引（manual_question）";
}

export const TROUBLESHOOTING_DOC_SECTION_TITLES: Readonly<TroubleshootingDocSectionTitles>;

export function formatIsoWithOffset(date: Date, offsetMinutes?: number): string;

export function buildChatMessageListArgs(input: ChatMessageListArgsInput): string[];

export function normalizeBambooTaskName(taskName: unknown): string;

export function normalizeBambooTaskNameForBase(taskName: unknown): string;

export function normalizeBambooAlertTaskName(taskName: unknown): string;

export function extractBambooAlertFromMessage(
  message: BambooMessage,
): Record<string, unknown> | null;

export function isAllowedBambooAttributionResult(value: unknown): value is BambooAttributionResult;

export function extractBambooAttributionResult(
  summary: unknown,
): BambooAttributionResult | undefined;

export function validateAiSummary(
  summary: unknown,
  opts?: { requireAttribution?: boolean; minFreeTextLength?: number },
): {
  valid: boolean;
  attributionResult?: BambooAttributionResult;
  matchedResults: BambooAttributionResult[];
  raw_length: number;
  stripped_length: number;
  reasons: string[];
  hints: string[];
  sampleFixed?: string;
};

export function validateAiSummary(
  summary: unknown,
  opts?: { requireAttribution?: boolean; minFreeTextLength?: number },
): {
  valid: boolean;
  attributionResult?: BambooAttributionResult;
  matchedResults: BambooAttributionResult[];
  raw_length: number;
  stripped_length: number;
  reasons: string[];
  hints: string[];
  sampleFixed?: string;
};

export const GENERIC_ATTRIBUTION_FORBIDDEN_SUMMARY_PATTERNS: readonly string[];

export function normalizeAttributionSummary(
  summary: unknown,
  attribution?: BambooAttributionResult,
): string;

export function containsForbiddenGenericAttribution(summary: unknown): boolean;

export function summaryContainsConcreteEvidence(summary: unknown): boolean;

export function validateFailedStatus(input: {
  summary?: unknown;
  reason?: unknown;
  failedAdmission?: FailedAdmission;
  extra?: unknown;
}): {
  valid: boolean;
  blocked_keywords: string[];
  reasons: string[];
  hints: string[];
};

export function isValidFeishuDocumentUrl(value: unknown): boolean;

export function assertPendingAdmission(pendingAdmission: unknown): void;

export function assertFailedAdmission(failedAdmission: unknown): void;

export function classifyBambooResult(input: BambooResultSummaryInput): {
  kind:
    | "non_effective_alert"
    | "table_permission_missing"
    | "reconciliation_script_incompatible"
    | "reconciliation_script_type_incompatible"
    | "reconciliation_script_missing_table"
    | "hive_object_not_found"
    | "hive_column_not_resolved"
    | "hive_partition_not_ready"
    | "hive_sql_syntax_or_type_error"
    | "hive_execution_environment_error"
    | "compensation_task_missing_settlement"
    | "upstream_ledger_payer_account_mismatch"
    | "upstream_finance_document_missing"
    | "local_payment_missing_compensation"
    | "local_payment_missing_code"
    | "offline_sync_recovered"
    | "needs_investigation";
  success: boolean;
  cardUpdateAllowed: boolean;
  attributionResult?: BambooAttributionResult;
  suggestedAttribution?: BambooAttributionResult;
  confidence?: number;
  error_class?: string;
  evidence?: string[];
  summary: string;
  nonOverride?: true;
};

export function classifyBySqlAndSamples(
  input?: BambooResultSummaryInput | Record<string, unknown>,
): ReturnType<typeof classifyBambooResult> | null;

export function buildBaseRecordPatch(input: BaseRecordPatchInput): {
  record_id_list: string[];
  patch: {
    status: BaseRecordPatchInput["status"];
    ai_summary: string;
    ai_result: string;
    ai_finished_at: number;
    extra?: string;
  };
};

export function buildBaseModelResultPatch(input: BaseModelResultPatchInput): {
  record_id_list: string[];
  patch: {
    status: BaseRecordPatchInput["status"];
    ai_summary: string;
    ai_result: string;
    ai_finished_at: number;
  };
};

export function buildBaseNotificationPatch(input: BaseNotificationPatchInput): {
  record_id_list: string[];
  patch: {
    extra: string;
  };
};

export function isPositiveIntegerId(value: unknown): boolean;

// 【P0-1 硬固化】QC 条件命中明细
export interface QuickClosureConditionMatch {
  code: "QC-1" | "QC-2" | "QC-3" | "QC-4";
  name: string;
  hit: true;
  confidence: "high" | "medium" | "low";
  evidence: string;
  hardcodedAttribution: BambooAttributionResult;
}

// 【P0-1 硬固化】countEffectiveSamples 入参
export type CountEffectiveSamplesInput = unknown;

// 【P0-1 硬固化】classifyQuickClosureConditions 入参
export interface ClassifyQuickClosureConditionsInput {
  taskName?: unknown;
  falseDataLength?: unknown;
  taskResultNum?: unknown;
  instanceStatus?: unknown;
  instanceFalseReason?: unknown;
  falseReason?: unknown;
  alertBody?: unknown;
  sampleThreshold?: number;
  criticalDiffAbs?: number;
  criticalDiffRatio?: number;
}

export interface ClassifySampleCountConsistencyInput {
  taskResultNum?: unknown;
  cardTaskResultNum?: unknown;
  falseDataLength?: unknown;
  bambooFalseDataLength?: unknown;
  falseReason?: unknown;
  abnormalList?: unknown;
  retryAttempts?: unknown;
}

export interface AuthoritativeSampleCountInput extends ClassifySampleCountConsistencyInput {
  baseTaskResultNum?: unknown;
}

export interface AuthoritativeSampleCountResult {
  authoritativeSamples: number;
  authoritative_samples: number;
  source: string;
  sources: Array<{ source: string; count: number; known: boolean; priority: number }>;
  positiveSources: Array<{ source: string; count: number; known: boolean; priority: number }>;
  positive_sources: Array<{ source: string; count: number; known: boolean; priority: number }>;
  conflict: boolean;
  sample_count_conflict: boolean;
  canQuickCloseZeroSamples: boolean;
  can_quick_close_zero_samples: boolean;
  nonOverride: true;
}

// 【P0-1 硬固化】classifyQuickClosureConditions 返回（权威值，AI 不得 override）
export interface ClassifyQuickClosureConditionsResult {
  effectiveSamples: number;
  authoritativeSamples: number;
  authoritative_samples: number;
  authoritativeSampleSource: string;
  authoritative_sample_source: string;
  sampleCountConsistency: SampleCountConsistency;
  sample_count_consistency: SampleCountConsistency;
  sampleThreshold: number;
  matchedConditions: QuickClosureConditionMatch[];
  matchedCodes: Array<QuickClosureConditionMatch["code"]>;
  quickClosureRecommended: boolean;
  quick_closure_recommended: boolean;
  topHardcodedAttribution?: BambooAttributionResult;
  top_hardcoded_attribution?: BambooAttributionResult;
  topHardcodedSummary?: string;
  top_hardcoded_summary?: string;
  overallConfidence: "high" | "medium" | "low" | "none";
  overall_confidence: "high" | "medium" | "low" | "none";
  /** 硬约束标记：此返回为最终权威值，AI 不得 override */
  nonOverride: true;
}

export function countEffectiveSamples(value: CountEffectiveSamplesInput): number;

export function classifySampleCountConsistency(
  input?: ClassifySampleCountConsistencyInput,
): SampleCountConsistency;

export function normalizeAuthoritativeSampleCount(
  input?: AuthoritativeSampleCountInput,
): AuthoritativeSampleCountResult;

export function classifyQuickClosureConditions(
  input: ClassifyQuickClosureConditionsInput,
): ClassifyQuickClosureConditionsResult;

// 【P0-2 L2】validateNeedsManualConfirmation 入参/返回
export interface ValidateNeedsManualConfirmationOpts {
  overrideByDoc?: boolean;
  needsManualReviewProvided?: boolean;
  pendingAdmission?: PendingAdmission;
}
export interface ValidateNeedsManualConfirmationResult {
  valid: boolean;
  needsManualReview?: boolean;
  reasons: string[];
  nonOverride: true;
}
export function validateNeedsManualConfirmation(
  status: unknown,
  opts?: ValidateNeedsManualConfirmationOpts,
): ValidateNeedsManualConfirmationResult;

// 【P0-2 L2】normalizeAiSummaryLengthAndKeywords 入参/返回
export interface NormalizeAiSummaryOpts {
  requiredAttribution?: BambooAttributionResult;
  qcHardcodedSummary?: string;
  minLength?: number;
  maxLength?: number;
  requireFreeTextKeywords?: boolean;
}
export interface NormalizeAiSummaryResult {
  valid: boolean;
  raw: string;
  normalized: string;
  rawLength: number;
  normalizedLength: number;
  attributionResult?: BambooAttributionResult;
  matchedResults: BambooAttributionResult[];
  minLength: number;
  maxLength: number;
  reasons: string[];
  hints: string[];
  sampleFixed?: string;
  nonOverride: true;
}
export function normalizeAiSummaryLengthAndKeywords(
  aiSummary: unknown,
  opts?: NormalizeAiSummaryOpts,
): NormalizeAiSummaryResult;

// 【P0-2 L3】deepValidatePendingAdmission 入参/返回
export interface DeepValidatePendingAdmissionContext {
  workItem?: Record<string, unknown>;
  skeletonType?: "quick-closure" | "deep" | "pending" | "sop";
}
export interface DeepValidatePendingAdmissionResult {
  deepValid: boolean;
  hardFailCode:
    | ""
    | "P-0"
    | "P-0b"
    | "P-1"
    | "P-2"
    | "P-3"
    | "P-4"
    | "P-5"
    | "P-6"
    | "P-BAMBOO-RESULT"
    | null;
  passedChecks: string[];
  failedChecks: string[];
  reasons: string[];
  manualQuestion: string;
  nonOverride: true;
}
export function deepValidatePendingAdmission(
  pendingAdmission: unknown,
  context?: DeepValidatePendingAdmissionContext,
): DeepValidatePendingAdmissionResult;

// 【P0-2 L2】assertClosedLoopFailed 入参/返回
export interface AssertClosedLoopFailedResult {
  valid: boolean;
  reasons: string[];
  hints: string[];
  requiredAttempts: number;
  nonOverride: true;
}
export function assertClosedLoopFailed(
  status: unknown,
  failedAdmission: unknown,
  requiredAttempts?: number,
): AssertClosedLoopFailedResult;

// 【P0-2 L2】computeConfidenceByEvidence 入参/返回
export interface ComputeConfidenceByEvidenceInput {
  qcResult?: ClassifyQuickClosureConditionsResult | null;
  evidenceCount?: number | unknown;
  sampleSize?: unknown;
  rpcSampleCount?: number | unknown;
  providedConfidence?: unknown;
}
export interface ComputeConfidenceByEvidenceResult {
  autoConfidence: "high" | "medium" | "low";
  auto_confidence: "high" | "medium" | "low";
  overridden: boolean;
  correctedFrom?: unknown;
  evidenceItemCount: number;
  sampleSizeEffective: number;
  rpcSampleCount: number;
  reasons: string[];
  nonOverride: true;
}
export function computeConfidenceByEvidence(
  input?: ComputeConfidenceByEvidenceInput,
): ComputeConfidenceByEvidenceResult;

// 【P0-2 骨架】getDocSkeletonRequiredSections 入参/返回
export type SkeletonType = "quick-closure" | "deep" | "pending" | "sop";
export interface GetDocSkeletonRequiredSectionsResult {
  skeletonType: SkeletonType;
  requiredSectionTitles: string[];
  required_section_titles: string[];
  requiredSections: Record<string, string>;
  required_sections: Record<string, string>;
  nonOverride: true;
}
export function getDocSkeletonRequiredSections(
  skeletonType?: SkeletonType | string,
): GetDocSkeletonRequiredSectionsResult;

// 【P0-2 骨架】applyDocSkeletonFillAndProtection 入参/返回
export interface ApplyDocSkeletonFillAndProtectionOpts {
  minSectionContentLength?: number;
  allowMissingSectionsFillLater?: boolean;
}
export interface DocSectionFillInfo {
  title: string;
  bodyLength: number;
  bodyPreview: string;
}
export interface DocSectionMissingContent {
  title: string;
  bodyLength: number;
  required: number;
}
export interface ApplyDocSkeletonFillAndProtectionResult {
  valid: boolean;
  skeletonType: SkeletonType | string;
  protectedRequiredSections: DocSectionFillInfo[];
  missingRequiredSections: string[];
  missing_required_sections: string[];
  missingContent: DocSectionMissingContent[];
  minSectionContentLength: number;
  reasons: string[];
  nonOverride: true;
}
export function applyDocSkeletonFillAndProtection(
  skeletonInfo: GetDocSkeletonRequiredSectionsResult | null | undefined,
  filledContent: unknown,
  opts?: ApplyDocSkeletonFillAndProtectionOpts,
): ApplyDocSkeletonFillAndProtectionResult;

// 【P0-3 硬固化】骨架 markdown 生成器
export interface BuildDocSkeletonMarkdownInput {
  skeletonType?: SkeletonType;
  qcResult?: ClassifyQuickClosureConditionsResult | Record<string, unknown> | null;
  workItem?: Record<string, unknown> | null;
  userProvidedMarkdown?: string;
  resultId?: string | number;
  taskName?: string;
  taskDate?: string;
  ruleId?: string | number;
  bambooUrl?: string;
  topHardcodedAttribution?: BambooAttributionResult;
}
export interface BuildDocSkeletonMarkdownResult {
  skeletonInfo: GetDocSkeletonRequiredSectionsResult;
  skeletonType: SkeletonType;
  mergedMarkdown: string;
  merged_markdown: string;
  requiredSectionTitles: string[];
  required_section_titles: string[];
  autoFillMeta: {
    resultId: string;
    taskName: string;
    taskDate: string;
    ruleId: string;
    bambooUrl: string;
    topHardcodedAttribution?: BambooAttributionResult;
    qcMatchedCodes: string[];
  };
  nonOverride: true;
}
export function buildDocSkeletonMarkdown(
  input?: BuildDocSkeletonMarkdownInput,
): BuildDocSkeletonMarkdownResult;

// 【P1-4 SOP 违禁内容扫描返回类型】
export interface ScanSopMarkdownForbiddenContentResult {
  rule_id: string;
  task_name: string;
  /** 是否合法（无任何违规 = true） */
  valid: boolean;
  /** 违规总数 */
  violation_count: number;
  /** 违规明细（code 分类：SOP_ATTR_NOT_IN_WHITELIST / SOP_OPINIONATED_OP_SUGGESTION / SOP_UNREDACTED_PHONE / SOP_UNREDACTED_ID_CARD） */
  violations: Array<{
    code: string;
    message: string;
    match: string;
  }>;
  nonOverride: true;
}
// 【P1-4 SOP 违禁内容扫描（纯函数）】
export function scanSopMarkdownForbiddenContent(input?: {
  sopMarkdown?: string;
  ruleId?: string;
  taskName?: string;
}): ScanSopMarkdownForbiddenContentResult;

// 【P1-1 归因候选返回类型（workflow 层）】
export interface BuildAttributionCandidatesWorkflowResult {
  candidates: Array<{
    label: BambooAttributionResult;
    source: "WHITELIST_QC" | "KNOWN_ISSUE" | "CLASSIFY_FALLBACK" | "WHITELIST_CATALOG";
    confidence: number;
    reason: string;
    hardcodedAttribution: string;
    sopDocToken?: string;
    nonOverride: boolean;
  }>;
  topCandidate:
    | BuildAttributionCandidatesWorkflowResult["candidates"][number]
    | {
        label: BambooAttributionResult;
        source: "FALLBACK";
        confidence: number;
        reason: string;
        hardcodedAttribution: string;
        nonOverride: true;
      };
  is_new_issue: boolean;
  known_issue_count: number;
  nonOverride: true;
}
// 【P1-1 归因候选生成（纯函数）】
export function buildAttributionCandidates(input?: {
  qcResult?: QuickClosureClassificationResult | null;
  classification?: {
    suggestedAttribution?: string;
    attributionResult?: string;
    confidence?: number;
  } | null;
  ruleSpecificKnownIssues?: Array<{
    label: string;
    count?: number;
    lastTaskDate?: string;
    sopDocToken?: string;
    confidence?: number;
  }>;
}): BuildAttributionCandidatesWorkflowResult;

// 【P1-3 白名单 docToken 集合构建返回类型】
export interface BuildWhitelistedDocTokenSetResult {
  allowed_tokens: string[];
  size: number;
  /** 判定函数（AI 直接调用） */
  isAllowed: (docToken: string) => boolean;
  nonOverride: true;
}
// 【P1-3 白名单 docToken 集合构建（纯函数，用于 runner 层 buildReferenceDocGraph 调用）】
export function buildWhitelistedDocTokenSet(input?: {
  currentDailyBaseParentWikiToken?: string;
  currentDailyBaseChildTokens?: string[];
  bambooSopRootToken?: string;
  bambooSopChildTokens?: string[];
}): BuildWhitelistedDocTokenSetResult;

// 【P2-1 classify-samples 返回类型】
export interface ClassifySamplesWorkflowResult {
  rule_id: string;
  task_name: string;
  total_samples: number;
  keyword_filtered_count: number;
  unclassified_count: number;
  groups: Array<{
    keyword: string;
    samples: Array<Record<string, unknown>>;
    count: number;
  }>;
  unclassified_samples: Array<Record<string, unknown>>;
  top_keywords: Array<{ keyword: string; count: number }>;
  nonOverride: true;
}
// 【P2-1 classify-samples（纯函数）】
export function classifySamples(input?: {
  samples?: Array<Record<string, unknown>> | string;
  keywordFilters?: string[];
  ruleId?: string;
  taskName?: string;
}): ClassifySamplesWorkflowResult;

// 【P2-2 build-bamboo-card-update-patch 返回类型】
export interface BuildBambooCardUpdatePatchResult {
  result_id: string;
  status: "init" | "processing" | "succeeded" | "failed" | "pending" | "not_support";
  confidence: number;
  needs_manual_review: boolean;
  ai_summary: string;
  ai_result: string;
  hard_fail_code: string;
  generated_by: "bamboo-alert-runner-P2-2";
  nonOverride: true;
}
// 【P2-2 build-bamboo-card-update-patch（纯函数）】
export function buildBambooCardUpdatePatch(input?: {
  resultId?: string | number;
  status?: string;
  aiSummary?: string;
  aiResult?: string;
  confidence?: number;
  needsManualReview?: boolean;
  hardFailCode?: string;
}): BuildBambooCardUpdatePatchResult;

// 【P2-3 validate-rpc-request 返回类型】
export interface ValidateRpcRequestWorkflowResult {
  psm: string;
  method: string;
  overallValid: boolean;
  overall_valid: boolean;
  reasons: string[];
  matched_schema?: Record<string, unknown> | null;
  nonOverride: true;
  normalized_params: Record<string, unknown>;
}
// 【P2-3 validate-rpc-request（纯函数，对照 rpc-param-schemas.json）】
export function validateRpcRequest(input?: {
  psm?: string;
  method?: string;
  params?: Record<string, unknown>;
  schemas?: Record<string, unknown> | null;
}): ValidateRpcRequestWorkflowResult;
