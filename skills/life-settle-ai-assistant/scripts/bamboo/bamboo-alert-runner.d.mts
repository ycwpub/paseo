export interface CommandSpec {
  command: string;
  args: string[];
}

export interface GroupsScanPlanInput {
  groupIds: string[];
  rootPath: string;
  scanMinutes?: number;
  endTime?: Date | string;
  dryRun?: boolean;
}

export interface GroupsScanPlan {
  kind: "bamboo_alert_groups_scan_and_troubleshoot_plan";
  dryRun: boolean;
  scanWindow: {
    start: string;
    end: string;
  };
  dateKey: string;
  scanTasks: Array<{
    index: number;
    chatId: string;
    targetFolderPath: string;
    command: string;
  }>;
  autoTroubleshoot: {
    scanDirUrl: string;
    dateRange: string;
    command: string;
  };
}

export interface BaseBatchUpdateCommandInput {
  baseToken: string;
  tableId: string;
  jsonPath: string;
}

export interface BaseBatchUpdateInlineCommandInput {
  baseToken: string;
  tableId: string;
  body: Record<string, unknown>;
}

export interface WikiNodeGetCommandInput {
  scanDirUrl: string;
}

export interface WikiNodeListCommandInput {
  spaceId: string;
  parentNodeToken: string;
}

export interface WikiNodeCopyCommandInput {
  nodeToken: string;
  spaceId: string;
  targetParentNodeToken: string;
  targetSpaceId?: string;
  title?: string;
}

export interface BaseTokenInput {
  baseToken: string;
}

export interface BaseTableInput {
  baseToken: string;
  tableId: string;
}

export interface BaseRecordListCommandInput extends BaseTableInput {
  limit?: number;
}

export interface BaseRecordDeleteCommandInput extends BaseTableInput {
  recordIds: string[];
}

export interface MessageReplyCommandInput {
  messageId: string;
  markdown: string;
}

export interface BambooAlarmUpdateCardCommandInput {
  alarmRecordDetailId: string | number;
  filePath: string;
  dryRun?: boolean;
}

export interface DocsCreateCommandInput {
  title: string;
}

export interface TroubleshootingDocTitleInput {
  resultId: string | number;
  taskName: string;
  taskDate?: string;
  taskTime?: string | number;
}

export interface RuleSopDocTitleInput {
  ruleId: string | number;
  taskName: string;
}

export interface DocsOverwriteCommandInput {
  docToken: string;
  markdown: string;
}

export interface DocsOverwriteFileCommandInput {
  docToken: string;
  bodyJsonPath: string;
}

export interface WikiMoveCommandInput {
  objToken: string;
  targetSpaceId: string;
  targetParentToken: string;
}

export interface BambooAlertRunnerExecResult {
  stdout: string;
  stderr: string;
}

export interface BambooAlertRunnerOptions {
  execFile?: (
    command: string,
    args: string[],
    options?: Record<string, unknown>,
  ) => Promise<BambooAlertRunnerExecResult>;
  env?: NodeJS.ProcessEnv;
}

export interface ScanChatResult {
  command: string;
  message_read_identity: "bot" | "user";
  scanned: number;
  messages?: Array<Record<string, unknown>>;
  alerts: Array<Record<string, unknown>>;
}

export interface ScanChatMessagesResult {
  command: string;
  message_read_identity: "bot" | "user";
  scanned: number;
  messages: Array<Record<string, unknown>>;
}

export interface ScanChatToCsvInput {
  chatId: string;
  start: Date;
  end: Date;
  outputPath?: string;
  pageToken?: string;
  pageSize?: number;
  maxPages?: number;
}

export interface ScanChatToCsvResult {
  err: "";
  csv_path: string;
  rows_written: number;
  scanned: number;
  message_read_identity: "bot" | "user";
  command: string;
}

export interface ParseChatCsvToBambooAlertCsvInput {
  messageCsvPath: string;
  dateKey?: string;
}

export interface ParseChatCsvToBambooAlertCsvResult {
  err: "";
  message_csv_path: string;
  alert_csv_paths: string[];
  parsed_messages: number;
  alerts_written: number;
}

export interface UpsertBambooAlertCsvToDailyBaseInput {
  alertCsvPath: string;
  scanDirUrl: string;
  dateKey?: string;
  bizSuffix?: string;
  initStatus?: string;
}

export interface UpsertBambooAlertCsvToDailyBaseResult {
  err: "";
  alert_csv_path: string;
  date_key: string;
  daily_base_url: string;
  daily_base: Record<string, unknown>;
  rows_written: number;
  rows_skipped: number;
  skipped_alerts: Array<Record<string, unknown>>;
  field_names: string[];
  write: Record<string, unknown>;
}

export interface ScanChatToBaseViaCsvInput extends ScanChatToBaseInput {
  keepTemp?: boolean;
}

export interface ScanChatToBaseViaCsvResult {
  err: "";
  success: true;
  message_csv_path?: string;
  alert_csv_paths?: string[];
  daily_base_urls: string[];
  daily_bases: Array<Record<string, unknown>>;
  scan: Record<string, unknown>;
  parse: Record<string, unknown>;
  write: Record<string, unknown>;
  upserts: UpsertBambooAlertCsvToDailyBaseResult[];
}

export interface PrepareSingleTroubleshootDataInput {
  resultId?: string;
  result_id?: string;
  bambooUrl?: string;
  bamboo_url?: string;
  troubleshootingSopDoc?: string;
  troubleshooting_sop_doc?: string;
  troubleshootingSopLocalPath?: string;
  troubleshooting_sop_local_path?: string;
  expectedRuleId?: string | number;
  expected_rule_id?: string | number;
  outputDir?: string;
}

export interface PrepareSingleTroubleshootDataResult {
  err: "";
  result_id: string;
  rule_id: string;
  total_sop_local_path: string;
  rule_sop_local_path: string;
  rule_sop_doc_url: string;
  prepared_data_path: string;
  inspect_result: Record<string, unknown>;
  qc_result: Record<string, unknown>;
  work_item: Record<string, unknown>;
}

export interface WriteLocalTroubleshootingResultInput {
  resultId?: string;
  result_id?: string;
  status?: string;
  attributionResult?: string;
  attribution_result?: string;
  summary?: string;
  totalSopSuggestion?: string;
  total_sop_suggestion?: string;
  ruleSopMarkdown?: string;
  rule_sop_markdown?: string;
  outputPath?: string;
  ruleSopOutputPath?: string;
}

export interface WriteLocalTroubleshootingResultResult {
  result_id: string;
  status: string;
  troubleshooting_result_local_path: string;
  rule_sop_local_path: string;
}

export interface CloseSingleTroubleshootFromLocalInput {
  troubleshootingResultLocalPath?: string;
  troubleshooting_result_local_path?: string;
  ruleSopLocalPath?: string;
  rule_sop_local_path?: string;
  ruleSopDocUrl?: string;
  rule_sop_doc_url?: string;
  workItemsFile?: string;
  work_items_file?: string;
  resultDir?: string;
  result_dir?: string;
  outputFile?: string;
  output_file?: string;
  dryRunClose?: boolean;
  dry_run_close?: boolean;
}

export interface CloseSingleTroubleshootFromLocalResult {
  err: "";
  troubleshooting_result_local_path: string;
  rule_sop_local_path: string;
  rule_sop_doc_url: string;
  rule_sop_update_status: string;
  rule_sop_update_reason?: string;
  close_status: string;
  close_reason?: string;
  close?: Record<string, unknown>;
}

export interface ClaimNextWorkItemFromDailyBaseCsvInput {
  dailyCsvPaths?: string[];
  daily_csv_paths?: string[];
  scanDirUrl?: string;
  scan_dir_url?: string;
  troubleshootingSopDoc?: string;
  troubleshooting_sop_doc?: string;
  claimLimit?: number;
}

export interface ClaimNextWorkItemFromDailyBaseCsvResult {
  err: "";
  cloud_claim_required: true;
  candidate?: Record<string, unknown>;
  work_item?: Record<string, unknown>;
  prepare?: Record<string, unknown>;
  skipped?: boolean;
  reason?: string;
}

export interface ScanChatToBaseInput {
  chatId: string;
  start: Date;
  end: Date;
  scanDirUrl: string;
  dateKey?: string;
  bizSuffix?: string;
  pageToken?: string;
  pageSize?: number;
  initStatus?: string;
}

export interface CopyDailyBaseFromTemplateInput {
  [key: string]: unknown;
}

export interface CopyDailyBaseFromTemplateResult {
  created: boolean;
  existing: boolean;
  title?: string;
  node_token?: string;
  obj_token?: string;
  space_id?: string;
  note?: string;
}

export interface ScanChatToBaseResult {
  daily_base: {
    title?: string;
    node_token?: string;
    obj_token?: string;
    space_id?: string;
    created?: boolean;
    existing?: boolean;
  };
  table_id: string;
  scan: ScanChatResult;
  write: Record<string, unknown>;
}

export interface InspectBambooResultResult {
  resultId: string;
  command: string;
  result: Record<string, unknown>;
  sample_count_consistency?: {
    card_task_result_num: number;
    bamboo_false_data_length: number;
    false_reason_available: boolean;
    false_reason_length?: number;
    retry_attempts?: number;
    attempts?: Array<Record<string, unknown>>;
    verdict:
      | "consistent_or_not_applicable"
      | "sample_count_conflict"
      | "bamboo_result_inconsistent";
  };
  classification: {
    kind: "non_effective_alert" | "needs_investigation";
    success: boolean;
    cardUpdateAllowed: boolean;
    summary: string;
  };
  normalized?: Record<string, unknown>;
}

export interface InspectBambooResultOptions {
  expectedRuleId?: string | number;
  inspectCacheDir?: string;
  maxRetry?: number | string;
  taskResultNum?: string | number;
  cardTaskResultNum?: string | number;
}

export interface BackfillBaseAlertFieldsInput extends BaseRecordListCommandInput {}

export interface BackfillBaseAlertFieldsResult {
  success: true;
  scanned: number;
  updated: number;
  skipped: number;
  reason?: string;
  updates?: Array<Record<string, unknown>>;
  skipped_records?: Array<Record<string, unknown>>;
}

export interface DeleteDuplicateBaseAlertsInput extends BaseRecordListCommandInput {
  dryRun?: boolean;
}

export interface DeleteDuplicateBaseAlertsResult {
  success: true;
  scanned: number;
  unique_field?: "unique_id" | "uniqueid";
  duplicate_groups: number;
  deleted: number;
  planned_delete?: number;
  dry_run: boolean;
  reason?: string;
  kept_records?: Array<Record<string, unknown>>;
  deleted_records?: Array<Record<string, unknown>>;
  detail?: Record<string, unknown>;
}

export interface PublishTroubleshootingDocInput {
  title: string;
  markdown: string;
  parentWikiToken: string;
  targetSpaceId: string;
  existingTitlePrefix: string;
  troubleshootingSopDoc?: string;
  requireResultIdPrefix?: boolean;
  tmpDir?: string;
  // 【P0-3 硬固化】骨架生成 + QC 结果注入（末尾追加，零侵入）
  skeletonType?: SkeletonType;
  qcResult?: ClassifyQuickClosureConditionsResult | Record<string, unknown> | null;
  qc_result_json?: string;
  workItem?: Record<string, unknown> | null;
  work_item_json?: string;
  resultId?: string | number;
  result_id?: string | number;
  taskName?: string;
  task_name?: string;
  taskDate?: string;
  task_date?: string;
  ruleId?: string | number;
  rule_id?: string | number;
  bambooUrl?: string;
  bamboo_url?: string;
  topHardcodedAttribution?: BambooAttributionResult;
  top_hardcoded_attribution?: BambooAttributionResult;
  applySkeletonProtection?: boolean;
  apply_skeleton_protection?: boolean;
  dryRunSkeletonOnly?: boolean;
  dry_run_skeleton_only?: boolean;
  minSectionContentLength?: number;
  min_section_content_length?: number;
  allowMissingSectionsFillLater?: boolean;
  allow_missing_sections_fill_later?: boolean;
  outputFile?: string;
  output_file?: string;
}

export interface PublishTroubleshootingDocResult {
  success: boolean;
  title: string;
  doc_token: string;
  doc_url?: string;
  feishu_doc_url: string;
  doc_body_json_path: string;
  doc_write_status: "created" | "updated" | "failed" | "invalid_content" | "dry_run";
  doc_archive_status: "succeeded" | "failed" | "skipped";
  doc_archive_reason?: string;
  raw_command_error?: string;
  created_from_template?: boolean;
  parent_wiki_token?: string;
  target_space_id?: string;
  // 【P0-3 硬固化】骨架扩展返回字段（末尾追加，零侵入）
  skeletonType?: SkeletonType;
  skeletonBuild?: BuildDocSkeletonMarkdownResult;
  skeleton_protection?: ApplyDocSkeletonFillAndProtectionResult;
  skeletonProtection?: ApplyDocSkeletonFillAndProtectionResult;
  mergedMarkdown?: string;
  merged_markdown?: string;
  dryRunSkeletonOnly?: boolean;
  dry_run_skeleton_only?: boolean;
  outputFile?: string;
  output_file?: string;
  preview_output_file?: string;
}

export interface PublishSopDocInput {
  troubleshootingSopDoc: string;
  ruleId: string | number;
  taskName: string;
  markdown?: string;
  tmpDir?: string;
}

export interface PublishSopDocResult {
  success: true;
  sop_writeback_status: "succeeded" | "skipped";
  sop_writeback_reason?: string;
  sop_title?: string;
  sop_doc_url?: string;
  sop_doc_write_status?: "created" | "updated";
  sop_doc_archive_status?: "succeeded" | "failed" | "skipped";
  sop_doc_archive_reason?: string;
  sop_update_summary?: {
    rule_id: string;
    task_name: string;
    action: "created" | "updated";
    archived: boolean;
    doc_url?: string;
  };
}

export interface PrepareAutoTroubleshootInput {
  scanDirUrl: string;
  dateKeys: string[];
  bizSuffix?: string;
  troubleshootingSopDoc?: string;
  recordLimit?: number;
  claimLimit?: number;
  claimOrder?: "updated_time_desc" | "task_date_asc";
  statusOnly?: boolean;
  preflightOnly?: boolean;
  denyExistingProcessing?: boolean;
  allowBatchClaim?: boolean;
  aiSessionId?: string;
  autoRecoverStaleProcessing?: boolean;
  processingMaxAgeMinutes?: number | string;
}

export interface SopReviewChecklistInput {
  taskName?: string;
  taskId?: string;
  ruleId?: string;
  troubleshootingSopDoc?: string;
  summary?: string;
  docUrl?: string;
}

export interface SopReviewChecklist {
  required: boolean;
  status: "required" | "skipped";
  troubleshooting_sop_doc?: string;
  format_source?: {
    type: "troubleshooting_sop_doc" | "model_generated";
    url?: string;
    priority: "authoritative" | "fallback";
  };
  format_guidance?: string[];
  task_name?: string;
  task_id?: string;
  rule_id?: string;
  sop_title_name?: string;
  task_sop_title?: string;
  rule_sop_title?: string;
  rule_sop_lookup_key?: string;
  disambiguated_task_sop_title?: string;
  history_sop_reference?: {
    title: string;
    doc_token: string;
    doc_url: string;
    markdown: string;
    prompt: string;
  };
  evidence?: {
    summary?: string;
    doc_url?: string;
  };
  checks?: string[];
  reason?: string;
  next_step: string;
}

export interface PrepareAutoTroubleshootWorkItem {
  record_id: string;
  status?: string | string[];
  task_name?: string;
  task_time?: string | number;
  taskTime?: string | number;
  task_date?: string;
  taskDate?: string;
  task_id?: string;
  rule_id?: string;
  result_id?: string;
  bamboo_url?: string;
  alarm_record_detail_id?: string;
  task_result_num?: unknown;
  taskResultNum?: unknown;
  false_data_length?: unknown;
  falseDataLength?: unknown;
  false_reason?: unknown;
  falseReason?: unknown;
  inspect_result?: Record<string, unknown>;
  inspectResult?: Record<string, unknown>;
  qc_result?: Record<string, unknown>;
  qcResult?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  message_id?: string;
  parent_wiki_token?: string;
  target_space_id?: string;
  base_token?: string;
  table_id?: string;
  ai_session_id?: string;
  processing_started_at?: number;
  sop_review?: SopReviewChecklist;
  next_step?: string;
}

export interface PrepareAutoTroubleshootResult {
  success: true;
  processedBases: number;
  dateKeys?: string[];
  date_keys?: string[];
  claimOrder?: string;
  claim_order?: string;
  claimLimit?: number;
  claim_limit?: number;
  skippedRecords: number;
  statusCounts: Record<string, number>;
  notSupport: {
    total: number;
    by_rule_type: Record<string, number>;
    records: Array<Record<string, unknown>>;
  };
  newlyMarkedNotSupport: {
    total: number;
    by_rule_type: Record<string, number>;
    records: Array<Record<string, unknown>>;
  };
  statusOnly: boolean;
  preflightOnly?: boolean;
  preflight_only?: boolean;
  denyExistingProcessing?: boolean;
  deny_existing_processing?: boolean;
  aiSessionId?: string;
  ai_session_id?: string;
  blocked?: boolean;
  blocked_reason?: string;
  existingProcessingRecords?: Array<Record<string, unknown>>;
  existing_processing_records?: Array<Record<string, unknown>>;
  autoRecoveredProcessingRecords?: Array<Record<string, unknown>>;
  auto_recovered_processing_records?: Array<Record<string, unknown>>;
  candidateWorkItems: PrepareAutoTroubleshootWorkItem[];
  candidate_work_items?: PrepareAutoTroubleshootWorkItem[];
  workItems: PrepareAutoTroubleshootWorkItem[];
  effectiveWorkItems?: PrepareAutoTroubleshootWorkItem[];
  effective_work_items?: PrepareAutoTroubleshootWorkItem[];
  decisionHint?: string;
  decision_hint?: string;
  shouldProceed?: boolean;
  unsafeToDeclareDrained?: boolean;
  unsafe_to_declare_drained?: boolean;
  drainSafety?: {
    safe_to_declare_drained: boolean;
    reason: string;
    required_checks?: string[];
  };
  drain_safety?: {
    safe_to_declare_drained: boolean;
    reason: string;
    required_checks?: string[];
  };
}

export interface RecoverProcessingRecordsInput {
  scanDirUrl: string;
  dateKeys?: string[];
  bizSuffix?: string;
  recordLimit?: number | string;
  aiSessionId?: string;
  resultId?: string | number;
  maxAgeMinutes?: number | string;
  forceByResultId?: boolean;
  ignoreStale?: boolean;
  apply?: boolean;
}

export interface RecoverProcessingRecordsResult {
  success: boolean;
  dry_run: boolean;
  apply: boolean;
  processedBases?: number;
  session?: string;
  resultId?: string;
  result_id?: string;
  maxAgeMinutes?: number;
  forceByResultId?: boolean;
  force_by_result_id?: boolean;
  ignoreStale?: boolean;
  ignore_stale?: boolean;
  reason_code?: string;
  reason?: string;
  records: Array<Record<string, unknown>>;
  processingRecords: Array<Record<string, unknown>>;
  processing_records: Array<Record<string, unknown>>;
  workItems?: PrepareAutoTroubleshootWorkItem[];
  work_items?: PrepareAutoTroubleshootWorkItem[];
  recovered: Array<Record<string, unknown>>;
  skipped: Array<Record<string, unknown>>;
  decisionHint: string;
  decision_hint: string;
}

export interface AgentDriverDispatchPlan {
  kind: "bamboo_alert_agent_driver_dispatch_plan";
  next_action: "dispatch_required" | "final_drain_required";
  orchestrator: "main_session";
  agent_driver_contract: Record<string, unknown> & { nonOverride?: true };
  work_items_file: string;
  work_item_files: string[];
  expected_result_files: string[];
  close_commands: string[];
  continue_command: string;
  final_drain_command: string;
  dispatch_items: Array<
    Record<string, unknown> & {
      result_id?: string;
      record_id?: string;
      work_items_file: string;
      expected_result_file: string;
      close_command: string;
    }
  >;
  nonOverride: true;
}

export interface SplitWorkItemsInput {
  prepareFile?: string;
  prepare_file?: string;
  outputDir?: string;
  output_dir?: string;
  resultDir?: string;
  result_dir?: string;
  naming?: "result-id" | "index";
  scanDirUrl?: string;
  scan_dir_url?: string;
  dateKeys?: string[];
  date_keys?: string[];
  dateKeyList?: string[];
  date_key_list?: string[];
  bizSuffix?: string;
  biz_suffix?: string;
  troubleshootingSopDoc?: string;
  troubleshooting_sop_doc?: string;
}

export interface SplitWorkItemsResult {
  kind: "bamboo_alert_split_work_items";
  success: boolean;
  prepare_file: string;
  output_dir: string;
  total: number;
  work_items_file: string;
  items: Array<
    Record<string, unknown> & {
      result_id?: string;
      record_id?: string;
      work_items_file: string;
      expected_result_file: string;
    }
  >;
  expected_result_files: string[];
  dispatch_plan: AgentDriverDispatchPlan;
  orchestrator_state_file: string;
}

export interface RenderRunReportInput {
  runSummaryFile?: string;
  run_summary_file?: string;
  resultDir?: string;
  result_dir?: string;
  outputFile?: string;
  output_file?: string;
}

export interface RenderRunReportResult {
  kind: "bamboo_alert_run_report";
  success: boolean;
  ready_to_report_complete: boolean;
  scan_dir_url?: string;
  date_keys: string[];
  result_dir: string;
  scan: Record<string, unknown> & {
    groups?: Array<Record<string, unknown>>;
  };
  daily_bases: Array<Record<string, unknown>>;
  status_counts: Record<string, number>;
  processed_bases?: number;
  artifact_consistency?: ArtifactConsistencySummary | null;
  ready_to_report_complete_reason: string;
  business_close: Record<string, unknown> & { success: boolean };
  notification_close: Record<string, unknown> & { success: boolean; skipped_or_failed: number };
  blockers: Array<Record<string, unknown>>;
  results: Array<Record<string, unknown>>;
  markdown: string;
  nonOverride: true;
}

export interface RunGroupsScanAndPrepareInput {
  groupIds: string[];
  rootPath: string;
  scanMinutes?: number;
  endTime?: Date | string;
  dateKeys?: string[];
  dateKeyList?: string[];
  date_key_list?: string[];
  bizSuffix?: string;
  initStatus?: string;
  troubleshootingSopDoc?: string;
  claimOrder?: string;
  maxRounds?: number;
  resultDir?: string;
  heartbeat?: (
    event: Record<string, unknown> & { kind: "bamboo_runner_heartbeat"; phase: string },
  ) => void;
}

export interface RunGroupsScanAndPrepareResult {
  success: boolean;
  scan_failed?: boolean;
  plan: GroupsScanPlan;
  scan: {
    groups_total: number;
    groups_succeeded: number;
    groups_failed: number;
    scan_pipeline?: string;
    groups: Array<Record<string, unknown>>;
  };
  troubleshoot: {
    success: boolean;
    processed: number;
    processed_prepare_claim?: number;
    processed_batch_quick_closure?: number;
    close_attempted?: number;
    close_succeeded?: number;
    close_failed?: number;
    awaiting_model_results?: string[];
    rounds?: Array<Record<string, unknown> & { dispatch_plan?: AgentDriverDispatchPlan }>;
    dispatch_plan?: AgentDriverDispatchPlan | null;
    final_drain?: AutoTroubleshootDrainSummary | null;
    maxRoundsLoopPlan?: AutoTroubleshootLoopPlan | null;
    max_rounds?: number;
    claim_order?: string;
    near_by_claimable?: Record<string, unknown> | null;
    remaining_work_items: number;
    statusCounts?: Record<string, number>;
    notSupport?: PrepareAutoTroubleshootResult["notSupport"];
    workItems?: PrepareAutoTroubleshootWorkItem[];
    effectiveWorkItems?: PrepareAutoTroubleshootWorkItem[];
    effective_work_items?: PrepareAutoTroubleshootWorkItem[];
    candidateWorkItems?: PrepareAutoTroubleshootWorkItem[];
    candidate_work_items?: PrepareAutoTroubleshootWorkItem[];
  };
  shouldProceed?: boolean;
  should_proceed?: boolean;
  decisionHint?: string;
  decision_hint?: string;
}

export interface AutoTroubleshootLoopPlanInput {
  scanDirUrl: string;
  dateKeys?: string[];
  dateKeyList?: string[];
  date_key_list?: string[];
  bizSuffix?: string;
  troubleshootingSopDoc?: string;
  resultDir: string;
  maxRounds?: number;
}

export interface AutoTroubleshootLoopPlan {
  kind: "bamboo_alert_auto_troubleshoot_loop_plan";
  scanDirUrl: string;
  dateKeys: string[];
  bizSuffix?: string;
  troubleshootingSopDoc?: string;
  resultDir: string;
  maxRounds: number;
  preflightRecoveryCommandTemplate?: string;
  preflight_recovery_command_template?: string;
  prepareCommandTemplate: string;
  closeCommand: string;
  validation_repair_policy: {
    auto_fixable: {
      blockers: string[];
      fix_commands: string[];
      retry: string;
    };
    needs_rewrite: Record<string, unknown>;
    needs_permission: Record<string, unknown>;
    fatal: Record<string, unknown>;
  };
  failure_policy: {
    per_item_failure_isolated: boolean;
    continue_until_drained: boolean;
    forbidden: string[];
  };
  dispatch_plan: {
    orchestrator: "main_session";
    supported_subagent_mode: "host_native_fresh_context_only";
    prepare_owner: "main_session";
    close_owner: "main_session";
    drain_owner: "main_session";
    per_work_item_dispatch: Record<string, unknown>;
    forbidden: string[];
  };
  steps: string[];
  stopCondition: string;
}

export interface AutoTroubleshootDrainSummaryInput {
  scanDirUrl: string;
  dateKeys?: string[];
  dateKeyList?: string[];
  date_key_list?: string[];
  bizSuffix?: string;
  resultDir: string;
  workItems?:
    | PrepareAutoTroubleshootWorkItem[]
    | PrepareAutoTroubleshootWorkItem
    | {
        workItems?: PrepareAutoTroubleshootWorkItem[];
        work_items?: PrepareAutoTroubleshootWorkItem[];
      };
  workItemsFile?: string;
  scan?: { groups?: Array<Record<string, unknown>> };
  dailyBases?: Array<Record<string, unknown>>;
  daily_bases?: Array<Record<string, unknown>>;
  artifactConsistency?: Record<string, unknown> | null;
  artifact_consistency?: Record<string, unknown> | null;
  outputFile?: string;
  validateDailyBases?: boolean;
}

export interface ValidateDailyBaseSchemaInput {
  scanDirUrl: string;
  dateKeys?: string[];
  bizSuffix?: string;
}

export interface ValidateDailyBaseSchemaResult {
  success: boolean;
  schema_valid: boolean;
  processed_bases: number;
  date_keys: string[];
  expected_fields: string[];
  bases: Array<Record<string, unknown>>;
  blockers: Array<Record<string, unknown> & { code: string }>;
}

export interface ValidateDailyBaseRecordValuesInput {
  scanDirUrl: string;
  dateKeys?: string[];
  bizSuffix?: string;
  recordLimit?: number;
}

export interface ValidateDailyBaseRecordValuesResult {
  success: boolean;
  record_values_valid: boolean;
  processed_bases: number;
  date_keys: string[];
  checked_records: number;
  invalid_records: number;
  violations: Array<Record<string, unknown> & { code: string; record_id: string; field: string }>;
}

export interface ValidateDailyBaseDocRecordConsistencyInput {
  scanDirUrl: string;
  dateKeys?: string[];
  bizSuffix?: string;
  recordLimit?: number;
}

export interface ValidateDailyBaseDocRecordConsistencyResult {
  success: boolean;
  doc_record_consistency_valid: boolean;
  processed_bases: number;
  date_keys: string[];
  extra_docs: Array<Record<string, unknown> & { result_id: string; title: string }>;
  missing_docs: Array<Record<string, unknown> & { result_id: string }>;
  duplicate_docs: Array<
    Record<string, unknown> & {
      result_id: string;
      count: number;
      docs: Array<Record<string, unknown>>;
    }
  >;
  bases: Array<Record<string, unknown>>;
}

export interface ArtifactConsistencySummary {
  base_succeeded_records: number;
  active_wiki_docs: number;
  total_wiki_docs: number;
  extra_docs: number;
  missing_docs: number;
  duplicate_docs: number;
  ready_to_report_complete_allowed: boolean;
  cleanup_plan?: {
    mode: "manual_confirmation_required";
    action: "review_orphan_docs_before_delete_or_move";
    items: Array<Record<string, unknown> & { result_id: string; title: string }>;
  };
}

export interface AutoTroubleshootDrainSummary {
  kind: "bamboo_alert_auto_troubleshoot_drain_summary";
  success: boolean;
  ready_to_report_complete: boolean;
  final_drain?: {
    ready_to_report_complete: boolean;
    status_counts?: Record<string, number>;
    blockers?: Array<Record<string, unknown>>;
    drain_safety?: Record<string, unknown>;
    nonOverride?: true;
  };
  run_summary_file: string;
  scan_dir_url: string;
  date_keys: string[];
  date_key_list?: string[];
  result_dir: string;
  status_counts: Record<string, number>;
  processed_bases: number;
  drain_safety?: Record<string, unknown>;
  validation?: ValidateResultDirResult | null;
  schema?: ValidateDailyBaseSchemaResult | null;
  record_values?: ValidateDailyBaseRecordValuesResult | null;
  doc_records?: ValidateDailyBaseDocRecordConsistencyResult | null;
  artifact_consistency?: ArtifactConsistencySummary | null;
  unfinished_records?: Array<
    Record<string, unknown> & {
      result_id?: string;
      record_id?: string;
      base_status?: string;
      local_result_status?: string;
      blocker_code: string;
      blocker_reason?: string;
      next_action: string;
      auto_fixable?: boolean;
      diagnostics?: Array<Record<string, unknown>>;
    }
  >;
  audit_files?: {
    close?: string[];
    base_verify?: string;
  };
  blockers: Array<Record<string, unknown> & { code: string }>;
  decision_hint: string;
}

export interface ClosePreparedWorkItemsInput {
  workItems:
    | PrepareAutoTroubleshootWorkItem[]
    | PrepareAutoTroubleshootWorkItem
    | {
        workItems?: PrepareAutoTroubleshootWorkItem[];
        work_items?: PrepareAutoTroubleshootWorkItem[];
      };
  resultDir: string;
  outputFile?: string;
}

export interface ClosePreparedWorkItemsResult {
  success: boolean;
  processed: number;
  closed: number;
  business_close?: Record<string, unknown>;
  notification_close?: Record<string, unknown>;
  close_audit_file?: string;
  audit_files?: {
    close?: string;
  };
  missing_results: number;
  incomplete_results: number;
  dependency_preflight_failed?: number;
  invalid_ai_summary: number;
  invalid_failed_reason: number;
  validator_invalid_count?: number;
  semantic_guard_failed?: number;
  semantic_guard_passed?: boolean;
  failed_writebacks: number;
  failed_base_writebacks?: number;
  failed_notification_writebacks?: number;
  failed_card_updates?: number;
  failed_message_replies?: number;
  partial_failed?: boolean;
  results: Array<Record<string, unknown>>;
}

export interface ResumeAutoOrchestrationInput {
  resultDir?: string;
  result_dir?: string;
  workItemsFile?: string;
  work_items_file?: string;
  outputFile?: string;
  output_file?: string;
}

export interface ResumeAutoOrchestrationResult {
  kind: "bamboo_alert_resume_auto_orchestration";
  success: boolean;
  result_dir: string;
  state_file: string;
  work_items_file: string;
  next_action:
    | "dispatch_required"
    | "result_ready_to_close"
    | "close_repair_required"
    | "final_drain_required"
    | string;
  next_action_command: string;
  next_dispatch_items: Array<Record<string, unknown>>;
  final_drain_allowed: boolean;
  result_status: Record<string, Record<string, unknown>>;
  validation?: ValidateResultDirResult | null;
  close_files: string[];
  dispatch_plan: AgentDriverDispatchPlan;
  nonOverride: true;
}

export interface CloseReadyWorkItemsInput {
  workItems?:
    | PrepareAutoTroubleshootWorkItem[]
    | PrepareAutoTroubleshootWorkItem
    | {
        workItems?: PrepareAutoTroubleshootWorkItem[];
        work_items?: PrepareAutoTroubleshootWorkItem[];
      };
  work_items?:
    | PrepareAutoTroubleshootWorkItem[]
    | PrepareAutoTroubleshootWorkItem
    | {
        workItems?: PrepareAutoTroubleshootWorkItem[];
        work_items?: PrepareAutoTroubleshootWorkItem[];
      };
  workItemsFile?: string;
  work_items_file?: string;
  resultDir?: string;
  result_dir?: string;
  outputFile?: string;
  output_file?: string;
}

export interface CloseReadyWorkItemsResult {
  kind: "bamboo_alert_close_ready_work_items";
  success: boolean;
  result_dir: string;
  ready_count: number;
  skipped_count: number;
  ready_result_ids: string[];
  skipped_result_ids: string[];
  validation: ValidateResultDirResult;
  close_results: ClosePreparedWorkItemsResult[];
  next_action: string;
  nonOverride: true;
}

export interface NormalizeResultDocLinksInput {
  workItems:
    | PrepareAutoTroubleshootWorkItem[]
    | PrepareAutoTroubleshootWorkItem
    | {
        workItems?: PrepareAutoTroubleshootWorkItem[];
        work_items?: PrepareAutoTroubleshootWorkItem[];
      };
  resultDir: string;
  troubleshootingSopDoc?: string;
  outputFile?: string;
}

export interface NormalizeResultDocLinksResult {
  success: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: Array<Record<string, unknown>>;
}

export interface NormalizeModelResultJsonInput {
  input?: Record<string, unknown>;
  inputFile?: string;
  outputFile?: string;
  docUrl?: string;
  docToken?: string;
  requireResultIdPrefix?: boolean;
  fixAiSummaryKeywords?: boolean;
  sopResult?: Record<string, unknown>;
  sopResultFile?: string;
}

export type NormalizeModelResultJsonResult = Record<string, unknown>;

export interface ValidateResultDirInput {
  workItems:
    | PrepareAutoTroubleshootWorkItem[]
    | PrepareAutoTroubleshootWorkItem
    | {
        workItems?: PrepareAutoTroubleshootWorkItem[];
        work_items?: PrepareAutoTroubleshootWorkItem[];
      };
  resultDir: string;
}

export interface ValidateResultDirResult {
  success: boolean;
  processed: number;
  valid: number;
  invalid: number;
  semantic_guard_failed: number;
  hard_fail_code_counts: Record<string, number>;
  close_ready?: number;
  close_blocked?: number;
  per_result_close_readiness?: Array<Record<string, unknown>>;
  repair_plan?: Record<string, unknown>;
  repairPlan?: Record<string, unknown>;
  results: Array<Record<string, unknown>>;
  decisionHint: string;
}
export function buildLarkJsonCommand(args: string[]): CommandSpec;
export function isMainModule(metaUrl: string, argvPath?: string): boolean;
export function isMainModule(metaUrl: string, argvPath?: string): boolean;
export function buildBaseBatchUpdateCommand(input: BaseBatchUpdateCommandInput): CommandSpec;
export function buildBaseBatchUpdateInlineCommand(
  input: BaseBatchUpdateInlineCommandInput,
): CommandSpec;
export function buildWikiNodeGetCommand(input: WikiNodeGetCommandInput): CommandSpec;
export function buildWikiNodeListCommand(input: WikiNodeListCommandInput): CommandSpec;
export function buildWikiNodeCopyCommand(input: WikiNodeCopyCommandInput): CommandSpec;
export function buildBaseTableListCommand(input: BaseTokenInput): CommandSpec;
export function buildBaseFieldListCommand(input: BaseTableInput): CommandSpec;
export function buildBaseFieldGetCommand(input: BaseTableInput & { fieldId: string }): CommandSpec;
export function buildBaseFieldUpdateCommand(
  input: BaseTableInput & { fieldId: string; definition: Record<string, unknown> },
): CommandSpec;
export function buildBaseViewGetVisibleFieldsCommand(
  input: BaseTableInput & { viewId: string },
): CommandSpec;
export function buildBaseRecordListCommand(input: BaseRecordListCommandInput): CommandSpec;
export function buildBaseRecordDeleteCommand(input: BaseRecordDeleteCommandInput): CommandSpec;
export function extractWikiNodeToken(input: string): string;
export function isBotIdentityNotAllowedError(error: unknown): boolean;
export function replaceLarkIdentity(args: string[], identity: string): string[];
export function normalizeBambooTaskName(taskName: string): string;
export function buildTroubleshootingDocTitle(input: TroubleshootingDocTitleInput): string;
export function buildRuleSopDocTitle(input: RuleSopDocTitleInput): string;
export function buildSopReviewChecklist(input?: SopReviewChecklistInput): SopReviewChecklist;
export function buildBambooResultCommand(resultId: string | number): CommandSpec;
export function buildBambooAlarmUpdateCardCommand(
  input: BambooAlarmUpdateCardCommandInput,
): CommandSpec;
export function buildMessageReplyCommand(input: MessageReplyCommandInput): CommandSpec;
export function buildDocsCreateCommand(input: DocsCreateCommandInput): CommandSpec;
export function buildDocsOverwriteCommand(input: DocsOverwriteCommandInput): CommandSpec;
export function buildDocsOverwriteFileCommand(input: DocsOverwriteFileCommandInput): CommandSpec;
export function buildWikiMoveCommand(input: WikiMoveCommandInput): CommandSpec;
export function buildGroupsScanPlan(input: GroupsScanPlanInput): GroupsScanPlan;
export function createBambooAlertRunner(options?: BambooAlertRunnerOptions): {
  scanChatMessages(input: {
    chatId: string;
    start: Date;
    end: Date;
    pageToken?: string;
    pageSize?: number;
    maxPages?: number;
  }): Promise<ScanChatMessagesResult>;
  scanChat(input: {
    chatId: string;
    start: Date;
    end: Date;
    pageToken?: string;
    pageSize?: number;
    maxPages?: number;
  }): Promise<ScanChatResult>;
  scanChatToCsv(input: ScanChatToCsvInput): Promise<ScanChatToCsvResult>;
  parseChatCsvToBambooAlertCsv(
    input: ParseChatCsvToBambooAlertCsvInput,
  ): Promise<ParseChatCsvToBambooAlertCsvResult>;
  upsertBambooAlertCsvToDailyBase(
    input: UpsertBambooAlertCsvToDailyBaseInput,
  ): Promise<UpsertBambooAlertCsvToDailyBaseResult>;
  scanChatToBaseViaCsv(input: ScanChatToBaseViaCsvInput): Promise<ScanChatToBaseViaCsvResult>;
  prepareSingleTroubleshootData(
    input: PrepareSingleTroubleshootDataInput,
  ): Promise<PrepareSingleTroubleshootDataResult>;
  writeLocalTroubleshootingResult(
    input: WriteLocalTroubleshootingResultInput,
  ): Promise<WriteLocalTroubleshootingResultResult>;
  closeSingleTroubleshootFromLocal(
    input: CloseSingleTroubleshootFromLocalInput,
  ): Promise<CloseSingleTroubleshootFromLocalResult>;
  claimNextWorkItemFromDailyBaseCsv(
    input: ClaimNextWorkItemFromDailyBaseCsvInput,
  ): Promise<ClaimNextWorkItemFromDailyBaseCsvResult>;
  copyDailyBaseFromTemplate(
    input: CopyDailyBaseFromTemplateInput,
  ): Promise<CopyDailyBaseFromTemplateResult>;
  ensureDailyBase(input: {
    scanDirUrl: string;
    dateKey: string;
    bizSuffix?: string;
  }): Promise<CopyDailyBaseFromTemplateResult>;
  scanChatToBase(input: ScanChatToBaseInput): Promise<ScanChatToBaseResult>;
  inspectBambooResult(
    resultId: string | number,
    options?: InspectBambooResultOptions,
  ): Promise<InspectBambooResultResult>;
  claimBaseRecord(input: {
    baseToken: string;
    tableId: string;
    recordId: string;
  }): Promise<Record<string, unknown>>;
  finishBaseRecord(input: {
    baseToken: string;
    tableId: string;
    recordId: string;
    status: "init" | "processing" | "succeeded" | "failed" | "pending" | "not_support";
    summary: string;
    docUrl: string;
    finishedAt?: string | number | Date;
    pendingAdmission?: import("./bamboo-alert-workflow.mjs").PendingAdmission;
    failedAdmission?: import("./bamboo-alert-workflow.mjs").FailedAdmission;
    cardUpdateStatus?: import("./bamboo-alert-workflow.mjs").TerminalNotificationStatus;
    cardUpdateReason?: string;
    messageReplyStatus?: import("./bamboo-alert-workflow.mjs").TerminalNotificationStatus;
    messageReplyReason?: string;
  }): Promise<Record<string, unknown>>;
  writeBaseModelResult(input: {
    baseToken: string;
    tableId: string;
    recordId: string;
    status: "init" | "processing" | "succeeded" | "failed" | "pending" | "not_support";
    summary: string;
    docUrl: string;
    finishedAt?: string | number | Date;
    pendingAdmission?: import("./bamboo-alert-workflow.mjs").PendingAdmission;
    failedAdmission?: import("./bamboo-alert-workflow.mjs").FailedAdmission;
  }): Promise<Record<string, unknown>>;
  writeBaseNotificationStatus(input: {
    baseToken: string;
    tableId: string;
    recordId: string;
    extra?: Record<string, unknown> | string;
    cardUpdateStatus: import("./bamboo-alert-workflow.mjs").TerminalNotificationStatus;
    cardUpdateReason?: string;
    messageReplyStatus: import("./bamboo-alert-workflow.mjs").TerminalNotificationStatus;
    messageReplyReason?: string;
  }): Promise<Record<string, unknown>>;
  replyMessage(input: MessageReplyCommandInput): Promise<Record<string, unknown>>;
  updateAlarmCard(input: {
    alarmRecordDetailId: string | number;
    llmReason: string;
    maxAttempts?: number;
    timeoutMs?: number;
  }): Promise<Record<string, unknown>>;
  closePreparedWorkItem(input: {
    workItem: PrepareAutoTroubleshootWorkItem;
    modelResult: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
  closePreparedWorkItems(input: ClosePreparedWorkItemsInput): Promise<ClosePreparedWorkItemsResult>;
  resumeAutoOrchestration(
    input: ResumeAutoOrchestrationInput,
  ): Promise<ResumeAutoOrchestrationResult>;
  closeReadyWorkItems(input: CloseReadyWorkItemsInput): Promise<CloseReadyWorkItemsResult>;
  normalizeModelResultJson(
    input: NormalizeModelResultJsonInput,
  ): Promise<NormalizeModelResultJsonResult>;
  normalizeResultDocLinks(
    input: NormalizeResultDocLinksInput,
  ): Promise<NormalizeResultDocLinksResult>;
  validateResultDir(input: ValidateResultDirInput): Promise<ValidateResultDirResult>;
  backfillBaseAlertFields(
    input: BackfillBaseAlertFieldsInput,
  ): Promise<BackfillBaseAlertFieldsResult>;
  deleteDuplicateBaseAlerts(
    input: DeleteDuplicateBaseAlertsInput,
  ): Promise<DeleteDuplicateBaseAlertsResult>;
  publishTroubleshootingDoc(
    input: PublishTroubleshootingDocInput,
  ): Promise<PublishTroubleshootingDocResult>;
  publishSopDoc(input: PublishSopDocInput): Promise<PublishSopDocResult>;
  ensureBaseStatusOption(input: {
    baseToken: string;
    tableId: string;
    optionName: string;
  }): Promise<{ updated: boolean; option: string }>;
  prepareAutoTroubleshoot(
    input: PrepareAutoTroubleshootInput,
  ): Promise<PrepareAutoTroubleshootResult>;
  recoverProcessingRecords(
    input: RecoverProcessingRecordsInput,
  ): Promise<RecoverProcessingRecordsResult>;
  validateDailyBaseSchema(
    input: ValidateDailyBaseSchemaInput,
  ): Promise<ValidateDailyBaseSchemaResult>;
  validateDailyBaseRecordValues(
    input: ValidateDailyBaseRecordValuesInput,
  ): Promise<ValidateDailyBaseRecordValuesResult>;
  validateDailyBaseDocRecordConsistency(
    input: ValidateDailyBaseDocRecordConsistencyInput,
  ): Promise<ValidateDailyBaseDocRecordConsistencyResult>;
  buildAutoTroubleshootLoopPlan(input: AutoTroubleshootLoopPlanInput): AutoTroubleshootLoopPlan;
  splitWorkItems(input: SplitWorkItemsInput): Promise<SplitWorkItemsResult>;
  renderRunReport(input: RenderRunReportInput): Promise<RenderRunReportResult>;
  buildAutoTroubleshootDrainSummary(
    input: AutoTroubleshootDrainSummaryInput,
  ): Promise<AutoTroubleshootDrainSummary>;
  finalDrainCheck(input: AutoTroubleshootDrainSummaryInput): Promise<AutoTroubleshootDrainSummary>;
  runGroupsScanAndPrepare(
    input: RunGroupsScanAndPrepareInput,
  ): Promise<RunGroupsScanAndPrepareResult>;
  /** 【P0-1 硬固化】快速闭环条件分类：对 AI 产出的 JSON 跑一遍 QC-1~QC-4 硬匹配，输出权威 candidate（AI 不得 override） */
  classifyQuickClosure(input: ClassifyQuickClosureInput): Promise<ClassifyQuickClosureResult>;
  /** 【P0-2 核心硬约束】模型结果三层校验：L1结构/L2语义/L3 deep-check；不通过直接 throw/exit(1)，无 bypass；AI 提供的 confidence/needs/ai_summary/status 与硬规则冲突时按权威值 auto-correct 并覆盖写回 */
  validateModelResultJson(
    input: ValidateModelResultJsonInput,
  ): Promise<ValidateModelResultJsonOutput>;
  /** 【P1-1 归因硬约束】归因候选生成：从 QC 快速闭环、近30天同 rule_id 已知 issues、白名单目录 3 级 fallback，输出 topCandidate 权威归因（nonOverride=true，AI 不得 override） */
  buildAttributionCandidates(
    input: BuildAttributionCandidatesInput,
  ): Promise<BuildAttributionCandidatesOutput>;
  /** 【P1-2 日报分析】从 workItems 聚合近3天数据（归因分布/状态分布/Top规则/Top QC 命中码），输出 analysis_markdown 用于发布日报 wiki */
  prepareBaseAnalysis(input: PrepareBaseAnalysisInput): Promise<PrepareBaseAnalysisOutput>;
  /** 【P1-2 日报发布】将 prepareBaseAnalysis 生成的 analysis_markdown 发布为 wiki 子节点（未配置 token 时 dry-run，不阻塞） */
  publishBaseAnalysisReport(
    input: PublishBaseAnalysisReportInput,
  ): Promise<PublishBaseAnalysisReportOutput>;
  /** 【P1-3 白名单化加载/回写范围】构造 docToken 白名单（仅日报目录+SOP目录），判定任意 docToken 是否属于允许读写范围（越界文档禁止 AI 读取/写入） */
  buildReferenceDocGraph(input: BuildReferenceDocGraphInput): Promise<BuildReferenceDocGraphOutput>;
  /** 【P1-4 SOP 生成与违禁扫描】固定骨架 6 节（节标题 AI 只能加不能删），组装归因白名单内标签、根因、固定步骤；输出 scan_result 违禁内容扫描结果（归因白名单外/自由发挥操作建议/未脱敏手机号身份证号均标记为违规） */
  buildSopMarkdown(input: BuildSopMarkdownInput): Promise<BuildSopMarkdownOutput>;
  /** 【P1-5 循环编排脚本化】prepare-auto-troubleshoot → 逐条 buildAttributionCandidates → 生成合法 JSON 占位 → close-prepared-work-items（前置 validate + SOP 回写全链路），循环直到 eligible 为空或 maxRounds 达到 */
  runAutoTroubleshoot(input: RunAutoTroubleshootInput): Promise<RunAutoTroubleshootOutput>;
  /** 【P2-1 样本分类】对 false_data 样本列表按 QC/规则关键字分桶，输出 top 3 关键字（AI 只参考 top 3 减少噪声） */
  classifySamples(input: ClassifySamplesInput): Promise<ClassifySamplesOutput>;
  /** 【P2-2 卡片 patch 固化】严格限定 status 白名单（init/processing/succeeded/failed/pending/not_support），仅允许 ai_summary/ai_result/confidence/needs_manual_review 四个可写字段；succeeded 无飞书文档链接强制降级为 pending */
  buildBambooCardUpdatePatch(
    input: BuildBambooCardUpdatePatchInput,
  ): Promise<BuildBambooCardUpdatePatchOutput>;
  /** 【P2-3 RPC 参数校验】对照 P0-0 生成的 rpc-param-schemas.json，严格校验 psm/method/params，越权传参或字段类型错误直接 HARD FAIL throw，禁止 bypass */
  validateRpcRequest(input: ValidateRpcRequestInput): Promise<ValidateRpcRequestOutput>;
};

// 【P0-1 硬固化】classify-quick-closure CLI 入参
export interface ClassifyQuickClosureInput {
  /** 待分析的单条工作项 JSON（含 inspectResult、taskName 等字段）或内联对象 */
  workItem?: Record<string, unknown>;
  /** 或从文件读取 work item JSON（优先级低于 workItem） */
  workItemFile?: string;
  /** 或直接传原始字段（AI 自由发挥的原始值） */
  taskName?: string;
  resultId?: string | number;
  falseDataLength?: unknown;
  taskResultNum?: unknown;
  instanceStatus?: unknown;
  instanceFalseReason?: unknown;
  falseReason?: unknown;
  alertBody?: unknown;
  /** 自定义 QC-1 样本阈值，默认 5 */
  sampleThreshold?: number;
  /** 自定义 QC-3 diff 绝对值阈值，默认 1 */
  criticalDiffAbs?: number;
  /** 自定义 QC-3 diff 比例阈值，默认 0.001（0.1%） */
  criticalDiffRatio?: number;
}

// 【P0-1 硬固化】classify-quick-closure CLI 返回（权威结果，配合 nonOverride=true 禁止 AI override）
export interface ClassifyQuickClosureResult {
  version: "hardened.v1";
  resultId?: string | number;
  effectiveSamples: number;
  authoritativeSamples?: number;
  authoritative_samples?: number;
  authoritativeSampleSource?: string;
  authoritative_sample_source?: string;
  sampleThreshold: number;
  matchedConditions: import("./bamboo-alert-workflow.mjs").QuickClosureConditionMatch[];
  matchedCodes: Array<import("./bamboo-alert-workflow.mjs").QuickClosureConditionMatch["code"]>;
  quickClosureRecommended: boolean;
  quick_closure_recommended: boolean;
  topHardcodedAttribution?: import("./bamboo-alert-workflow.mjs").BambooAttributionResult;
  top_hardcoded_attribution?: import("./bamboo-alert-workflow.mjs").BambooAttributionResult;
  overallConfidence: "high" | "medium" | "low" | "none";
  overall_confidence: "high" | "medium" | "low" | "none";
  /** 【硬约束】此字段= true 时，AI 必须使用本返回的候选结论，不得自行 override */
  nonOverride: true;
  /** 骨架提示：publish-troubleshooting-doc 时建议引用的章节标题（QC-1~QC-4、快速闭环证据） */
  skeletonSectionHints: string[];
}

// 【P0-2 核心硬约束】validate-model-result-json 入参
export interface ValidateModelResultJsonInput {
  /** AI 产出的单条模型结果 JSON（内联） */
  modelResult?: Record<string, unknown>;
  /** 或从文件读取模型结果 JSON（优先级低于 modelResult） */
  modelResultFile?: string;
  /** 对应的 workItem（用于 QC 匹配和 pending 上下文，可选但建议必填） */
  workItem?: Record<string, unknown>;
  /** 或从文件读取 workItem */
  workItemFile?: string;
  /** 【硬约束】QC-1~QC-4 结果（已通过 classify-quick-closure 跑出来的，nonOverride=true） */
  qcResult?:
    | import("./bamboo-alert-workflow.mjs").ClassifyQuickClosureConditionsResult
    | ClassifyQuickClosureResult
    | Record<string, unknown>
    | null;
  /** 证据链项数（用于自动计算 confidence） */
  evidenceCount?: number | unknown;
  /** RPC 抽样次数（≥2 时 confidence 升一级） */
  rpcSampleCount?: number | unknown;
  /** 选择骨架类型：quick-closure / deep / pending / sop */
  skeletonType?: import("./bamboo-alert-workflow.mjs").SkeletonType | string;
  /** 排查文档填写后的 markdown 内容（可选，若提供则做 applyDocSkeletonFillAndProtection） */
  docFilledContent?: string;
  /** 排查文档 markdown 文件路径（优先级低于 docFilledContent） */
  docFilledFile?: string;
  /** failed 闭环重试次数阈值，默认 3 */
  failedAttemptsRequired?: number;
  /** 【硬约束】strictMode=true 时校验不通过直接 throw Error 并 exit(1)；false 返回 valid=false 但不 throw，默认 true */
  strictMode?: boolean;
}

// 【P0-2 核心硬约束】validate-model-result-json 输出（权威值，nonOverride=true 时 AI 不得 override）
export interface ValidateModelResultJsonOutput {
  version: "hardened.v1";
  /** L1 结构校验：status 白名单 + 必填字段齐全 */
  l1Structure: {
    valid: boolean;
    status?: string;
    requiredFieldsOk: boolean;
    missingRequired: string[];
    reasons: string[];
  };
  /** L2 语义校验：6 个维度分别产出结果 + normalizedModelResult */
  l2Semantics: {
    valid: boolean;
    needsManualReview: import("./bamboo-alert-workflow.mjs").ValidateNeedsManualConfirmationResult;
    aiSummary: import("./bamboo-alert-workflow.mjs").NormalizeAiSummaryResult;
    closedLoopFailed: import("./bamboo-alert-workflow.mjs").AssertClosedLoopFailedResult;
    confidence: import("./bamboo-alert-workflow.mjs").ComputeConfidenceByEvidenceResult;
    investigationEvidence?: Record<string, unknown> & {
      sampleGroupCoverage?: Record<string, unknown>;
      sample_group_coverage?: Record<string, unknown>;
    };
    investigation_evidence?: Record<string, unknown> & {
      sampleGroupCoverage?: Record<string, unknown>;
      sample_group_coverage?: Record<string, unknown>;
    };
    evidenceConsistency?: Record<string, unknown>;
    evidence_consistency?: Record<string, unknown>;
    hardFailCodes: string[];
    hard_fail_codes: string[];
    sampleCountAuthority?: import("./bamboo-alert-workflow.mjs").AuthoritativeSampleCountResult;
    sample_count_authority?: import("./bamboo-alert-workflow.mjs").AuthoritativeSampleCountResult;
    summarySampleCounts?: number[];
    summary_sample_counts?: number[];
    authoritySource?: string;
    authority_source?: string;
    blockedLowerPriorityRules?: Array<Record<string, unknown>>;
    blocked_lower_priority_rules?: Array<Record<string, unknown>>;
    reasons: string[];
  };
  /** L3 deep-check：status=pending 时 6 项 P-N 顺序命中即停；其他 status 跳过并标记 not_applicable */
  l3DeepCheck: import("./bamboo-alert-workflow.mjs").DeepValidatePendingAdmissionResult & {
    applicable: boolean;
  };
  diagnostics: Array<
    Record<string, unknown> & {
      blocker_type: string;
      human_readable_reason: string;
      auto_fixable: boolean;
      suggested_patch?: Record<string, unknown>;
      next_action?: string;
      hard_fail_codes?: string[];
      nonOverride?: true;
    }
  >;
  /** 【权威写入值】经过所有校验层后，AI 必须用此 normalizedResult 覆盖自己的 JSON（已自动纠正 confidence/needs/ai_summary/status 必填） */
  normalizedModelResult: Record<string, unknown> & {
    nonOverride: true;
    /** 原始 status 若与硬规则冲突，此值已被脚本纠正 */
    status: "init" | "processing" | "succeeded" | "failed" | "pending" | "not_support";
    authority_source?: string;
    raw_agent_attribution_result?: unknown;
    runner_attribution_result?: unknown;
    attribution_mapping_reason?: string;
    sample_count_authority?: import("./bamboo-alert-workflow.mjs").AuthoritativeSampleCountResult;
    investigation_evidence?: Record<string, unknown>;
    blocked_lower_priority_rules?: Array<Record<string, unknown>>;
    /** AI 提供的 vs 脚本纠正后的对比 */
    overrides: Array<{ field: string; from: unknown; to: unknown; reason: string }>;
  };
  /** 整体校验是否通过 */
  overallValid: boolean;
  overall_valid: boolean;
  semanticGuardPassed?: boolean;
  semantic_guard_passed?: boolean;
  /** 若 strictMode=true 且 overallValid=false，这里是最终抛错前的摘要；否则为 null */
  fatalError?: string | null;
  /** 骨架校验（若提供了 docFilledContent 或 docFilledFile），否则为 null */
  skeletonProtection:
    | (import("./bamboo-alert-workflow.mjs").ApplyDocSkeletonFillAndProtectionResult & {
        skeletonInfo: import("./bamboo-alert-workflow.mjs").GetDocSkeletonRequiredSectionsResult;
      })
    | null;
  nonOverride: true;
}

// 【P1-1 归因候选】归因候选入参
export interface BuildAttributionCandidatesInput {
  /** 单个 bamboo result_id（若传则自动调 inspectBambooResult 获取 classification+qcResult） */
  resultId?: string | number;
  result_id?: string | number;
  /** 规则 id（用于 ruleSpecificKnownIssues 匹配） */
  ruleId?: string;
  rule_id?: string;
  /** QC 快速闭环分类结果（classifyQuickClosureConditions/classifyQuickClosure 输出） */
  qcResult?: import("./bamboo-alert-workflow.mjs").QuickClosureClassificationResult | null;
  qc_result?: import("./bamboo-alert-workflow.mjs").QuickClosureClassificationResult | null;
  /** classifyBambooResult 输出（含 suggestedAttribution/confidence） */
  classification?: {
    suggestedAttribution?: string;
    attributionResult?: string;
    confidence?: number;
    kind?: string;
  } | null;
  /** 近 30 天同 rule_id 已知 issues 列表（可选，增强 KNOWN_ISSUE 优先级） */
  ruleSpecificKnownIssues?: Array<{
    label: string;
    count?: number;
    lastTaskDate?: string;
    sopDocToken?: string;
    confidence?: number;
  }>;
  rule_specific_known_issues?: BuildAttributionCandidatesInput["ruleSpecificKnownIssues"];
}

// 【P1-1 归因候选】归因候选输出
export interface BuildAttributionCandidatesOutput {
  result_id?: string;
  rule_id?: string;
  /** 候选列表（按 confidence 降序，WHITELIST_QC/KNOWN_ISSUE 位序优先） */
  candidates: Array<{
    label: import("./bamboo-alert-workflow.mjs").BambooAttributionResult;
    source: "WHITELIST_QC" | "KNOWN_ISSUE" | "CLASSIFY_FALLBACK" | "WHITELIST_CATALOG";
    confidence: number;
    reason: string;
    hardcodedAttribution: string;
    sopDocToken?: string;
    /** WHITELIST_QC/KNOWN_ISSUE = true 权威来源，AI 不得 override；其他 AI 可选参考 */
    nonOverride: boolean;
  }>;
  /** 权威推荐归因（topCandidate），nonOverride=true → AI 必须以此为准写入归因结论 */
  topCandidate:
    | BuildAttributionCandidatesOutput["candidates"][number]
    | {
        label: import("./bamboo-alert-workflow.mjs").BambooAttributionResult;
        source: "FALLBACK";
        confidence: number;
        reason: string;
        hardcodedAttribution: string;
        nonOverride: true;
      };
  /** 是否属于新问题（新问题 needs_manual_review=true，status=pending） */
  is_new_issue: boolean;
  /** 已知 issues 命中数 */
  known_issue_count: number;
  nonOverride: true;
}

// 【P1-2 日报分析】入参
export interface PrepareBaseAnalysisInput {
  baseToken?: string;
  base_token?: string;
  baseAppToken?: string;
  base_app_token?: string;
  tableId?: string;
  table_id?: string;
  /** 近 N 天（默认 3） */
  analysisDays?: number;
  analysis_days?: number;
  /** work items 列表（从 Base/prepare-auto-troubleshoot 拿到） */
  workItems?: Array<Record<string, unknown>>;
  work_items?: Array<Record<string, unknown>>;
}

// 【P1-2 日报分析】出参
export interface PrepareBaseAnalysisOutput {
  base_token: string;
  table_id: string;
  analysis_days: number;
  sample_count: number;
  top_attributions: Array<{ label: string; count: number }>;
  status_distribution: Array<{ label: string; count: number }>;
  top_rules: Array<{ rule_id: string; count: number }>;
  top_qc_codes: Array<{ code: string; count: number }>;
  /** 可直接发布为 wiki 文档的完整 markdown */
  analysis_markdown: string;
  /** 原始样本（前 500 条） */
  samples: Array<{
    result_id: string;
    task_name: string;
    status: string;
    rule_id: string;
    attribution: string;
    ai_summary: string;
  }>;
  nonOverride: true;
}

// 【P1-2 日报发布】入参
export interface PublishBaseAnalysisReportInput {
  /** prepareBaseAnalysis 输出（含 analysis_markdown） */
  baseAnalysis?: PrepareBaseAnalysisOutput | null;
  base_analysis?: PrepareBaseAnalysisOutput | null;
  /** wiki 父节点 token（BAMBOO_DAILY_REPORT_WIKI_PARENT 或近 3 天日报 Base 所在目录） */
  parentWikiToken?: string;
  parent_wiki_token?: string;
  /** 自定义文档标题（默认：Bamboo 对账报警日报分析 YYYY-MM-DD） */
  title?: string;
}

// 【P1-2 日报发布】出参
export interface PublishBaseAnalysisReportOutput {
  /** 成功条件：docToken 非空 或 dry_run=true（缺配置时不阻塞流程） */
  success: boolean;
  docToken: string;
  /** 未配置 parentWikiToken/缺少 wiki 权限时为 true，表示仅生成未实际发布 */
  dry_run: boolean;
  title: string;
  parent_wiki_token: string;
  error: string;
  analysis?: PrepareBaseAnalysisOutput;
  nonOverride: true;
}

// 【P1-3 文档白名单图】入参
export interface BuildReferenceDocGraphInput {
  currentDailyBaseParentWikiToken?: string;
  current_daily_base_parent_wiki_token?: string;
  currentDailyBaseChildTokens?: string[];
  current_daily_base_child_tokens?: string[];
  bambooSopRootToken?: string;
  bamboo_sop_root_token?: string;
  bambooSopChildTokens?: string[];
  bamboo_sop_child_tokens?: string[];
}

// 【P1-3 文档白名单图】出参
export interface BuildReferenceDocGraphOutput {
  whitelist: ReturnType<typeof import("./bamboo-alert-workflow.mjs").buildWhitelistedDocTokenSet>;
  /** docToken → { scope, allowed, title } 映射 */
  doc_meta: Record<string, { scope: string; allowed: boolean; title: string }>;
  allowed_count: number;
  scope_map: Record<string, string>;
  nonOverride: true;
  /** 暴露给 AI 的只读判定函数（CLI 序列化时被省略） */
  isDocAllowed?: (docToken: string) => boolean;
}

// 【P1-4 SOP Markdown 生成】入参
export interface BuildSopMarkdownInput {
  /** 规则 ID（SOP 主 key） */
  ruleId?: string;
  rule_id?: string;
  /** 任务名/报警标题（SOP 命名辅助） */
  taskName?: string;
  task_name?: string;
  /** 归因标签：必须 ∈ BAMBOO_ATTRIBUTION_RESULTS[*].label；否则 scan_result 标记违规 */
  attributionLabel?: string;
  attribution_label?: string;
  /** 根因说明（固定文本，允许 AI 据实填写，内容违规由 scan_result 拦截） */
  rootCause?: string;
  root_cause?: string;
  /** 固定排查/修复步骤（禁止『建议』『可能』等自由发挥措辞，scan_result 自动拦截） */
  fixedSteps?: string;
  fixed_steps?: string;
  /** 关联 result_id 列表（SOP 第 6 节自动填充） */
  relatedResultIds?: Array<string | number>;
  related_result_ids?: Array<string | number>;
}

// 【P1-4 SOP Markdown 生成】出参
export interface BuildSopMarkdownOutput {
  rule_id: string;
  task_name: string;
  /** SOP 文档名（按 AGENTS.md 规范：ruleId:taskName排查sop） */
  sop_title: string;
  /** 完整 SOP 6 节骨架 + 填充 + 违禁内容扫描 */
  sop_markdown: string;
  required_section_count: 6;
  /** 固定 6 节标题（AI 只能加不能删，修改即被 scan_result 拦截或 publish-sop-doc 回滚保护） */
  required_section_titles: [
    "一、SOP 元信息",
    "二、根因说明",
    "三、标准排查步骤",
    "四、判断此归因的判据",
    "五、修复/修数流程",
    "六、关联报警记录",
  ];
  scan_result: import("./bamboo-alert-workflow.mjs").ScanSopMarkdownForbiddenContentResult;
  nonOverride: true;
}

// 【P1-5 循环编排】入参
export interface RunAutoTroubleshootInput {
  targetDate?: string;
  target_date?: string;
  baseAppToken?: string;
  base_app_token?: string;
  tableId?: string;
  table_id?: string;
  /** 模型 JSON 占位输出目录（默认 .tmp/auto-troubleshoot） */
  resultDir?: string;
  result_dir?: string;
  /** 最大循环轮次（默认 1，防跑死） */
  maxRounds?: number;
  max_rounds?: number;
  /** 每轮最多处理 work items 数（默认 1，防越权批量处理） */
  maxItemsPerRound?: number;
  max_items_per_round?: number;
  /** processing 认领人 */
  claimer?: string;
  /** @deprecated 旧入口默认禁用；仅用于历史兼容排查。 */
  allowDeprecatedRunAutoTroubleshoot?: boolean;
  allow_deprecated_run_auto_troubleshoot?: boolean;
}

// 【P1-5 循环编排】出参
export interface RunAutoTroubleshootOutput {
  success: boolean;
  rounds: Array<{
    round: number;
    eligible_count: number;
    skipped_no_more_work?: boolean;
    closed_count?: number;
    model_results?: Array<{
      result_id: string;
      path: string;
      status: string;
      top_attribution: string;
    }>;
    close_results?: ReturnType<CreateBambooAlertRunner["closePreparedWorkItems"]> extends Promise<
      infer T
    >
      ? T
      : never;
    success?: boolean;
    error?: string;
  }>;
  result_dir: string;
  total_closed: number;
  nonOverride: true;
}

// 【P2-1 classify-samples】入参
export interface ClassifySamplesInput {
  /** false_data 样本列表（JSON 数组，每条为一个样本对象） */
  samples?: Array<Record<string, unknown>> | string;
  samplesFile?: string;
  samples_file?: string;
  /** 过滤关键字列表；未传时用默认 QC 关键字集 */
  keywordFilters?: string[];
  keyword_filters?: string[];
  ruleId?: string;
  rule_id?: string;
  taskName?: string;
  task_name?: string;
}

// 【P2-1 classify-samples】出参
export interface ClassifySamplesOutput {
  rule_id: string;
  task_name: string;
  total_samples: number;
  keyword_filtered_count: number;
  unclassified_count: number;
  /** 分桶结果（按 count 降序） */
  groups: Array<{
    keyword: string;
    samples: Array<Record<string, unknown>>;
    count: number;
  }>;
  unclassified_samples: Array<Record<string, unknown>>;
  /** Top 3 关键字：AI 只参考此 top 3 即可，减少长尾噪声 */
  top_keywords: Array<{ keyword: string; count: number }>;
  nonOverride: true;
}

// 【P2-2 build-bamboo-card-update-patch】入参
export interface BuildBambooCardUpdatePatchInput {
  resultId?: string | number;
  result_id?: string | number;
  /** 白名单 status：init/processing/succeeded/failed/pending/not_support；其他值强制改为 pending */
  status?: string;
  aiSummary?: string;
  ai_summary?: string;
  aiResult?: string;
  ai_result?: string;
  confidence?: number;
  needsManualReview?: boolean;
  needs_manual_review?: boolean;
  hardFailCode?: string;
  hard_fail_code?: string;
}

// 【P2-2 build-bamboo-card-update-patch】出参
export interface BuildBambooCardUpdatePatchOutput {
  result_id: string;
  /** 经白名单校验后的 status（非白名单 → pending） */
  status: "init" | "processing" | "succeeded" | "failed" | "pending" | "not_support";
  confidence: number;
  needs_manual_review: boolean;
  ai_summary: string;
  ai_result: string;
  hard_fail_code: string;
  generated_by: "bamboo-alert-runner-P2-2";
  nonOverride: true;
}

// 【P2-3 validate-rpc-request】入参
export interface ValidateRpcRequestInput {
  /** RPC PSM，如 life.settle.account */
  psm?: string;
  /** RPC 方法名，如 QuerySettleAccount */
  method?: string;
  /** RPC 参数（JSON 对象） */
  params?: Record<string, unknown>;
  /** 可选：自定义 schemas 文件路径；默认使用仓库内 scripts/core/rpc-param-schemas.json */
  schemasFile?: string;
  schemas_file?: string;
  /** 可选：内存 schema，主要用于测试或内部编排；CLI 仍使用 schemasFile */
  schemas?: Record<string, unknown>;
  /** 是否严格模式：true（默认）→ invalid 时 throw HARD FAIL；false → 仅返回结果不 throw */
  strictMode?: boolean;
}

// 【P2-3 validate-rpc-request】出参
export interface ValidateRpcRequestOutput {
  psm: string;
  method: string;
  overallValid: boolean;
  overall_valid: boolean;
  /** 校验失败原因（最多 30 条，清晰定位必填缺失/字段不在白名单/类型错误） */
  reasons: string[];
  matched_schema?: Record<string, unknown> | null;
  nonOverride: true;
  /** 规范化参数：仅当 overallValid=true 时非空；直接透传给 bytedcli api-test rpc-call */
  normalized_params: Record<string, unknown>;
}
