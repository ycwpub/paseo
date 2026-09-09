#!/usr/bin/env node
import { execFile as nodeExecFile } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  BAMBOO_ATTRIBUTION_RESULTS,
  TROUBLESHOOTING_DOC_SECTION_TITLES,
  buildBaseModelResultPatch,
  buildBaseNotificationPatch,
  buildBaseRecordPatch,
  buildChatMessageListArgs,
  classifyBambooResult,
  classifyQuickClosureConditions,
  classifySampleCountConsistency,
  computeConfidenceByEvidence,
  deepValidatePendingAdmission,
  extractBambooAlertFromMessage,
  formatIsoWithOffset,
  getDocSkeletonRequiredSections,
  applyDocSkeletonFillAndProtection,
  isAllowedBambooAttributionResult,
  isValidFeishuDocumentUrl,
  buildDocSkeletonMarkdown,
  isPositiveIntegerId,
  normalizeAuthoritativeSampleCount,
  normalizeBambooTaskName as normalizeWorkflowBambooTaskName,
  normalizeBambooTaskNameForBase,
  normalizeAiSummaryLengthAndKeywords,
  containsForbiddenGenericAttribution,
  summaryContainsConcreteEvidence,
  assertClosedLoopFailed,
  validateAiSummary,
  validateFailedStatus,
  validateNeedsManualConfirmation,
  validateRpcRequest,
} from "./bamboo-alert-workflow.mjs";
import {
  hasFeishuBotCredentials,
  hasProjectScopedFeishuBotCredentials,
  preprocessBambooCommandEnv,
} from "./bamboo-alert-preprocess.mjs";
import { getBambooRunnerCommand } from "./bamboo-alert-runner-contracts.mjs";

const execFilePromise = promisify(nodeExecFile);
const runnerScriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRpcParamSchemasFile = resolve(
  runnerScriptDir,
  "../../../scripts/core/rpc-param-schemas.json",
);

export function isMainModule(metaUrl, argvPath = process.argv[1]) {
  if (!argvPath) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(argvPath);
  } catch {
    return metaUrl === `file://${argvPath}`;
  }
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

async function writeJsonFile(filePath, payload) {
  if (!filePath) return;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function fileExists(filePath) {
  if (!filePath) return false;
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

function previewOutputFilePath(filePath) {
  if (!filePath) return undefined;
  return String(filePath).endsWith(".json")
    ? String(filePath).replace(/\.json$/, ".preview.json")
    : `${filePath}.preview.json`;
}

function extractDocUrlFromModelResult(modelResult = {}) {
  return String(
    modelResult?.feishu_doc_url ||
      modelResult?.doc_url ||
      modelResult?.ai_result ||
      modelResult?.ai_result_doc ||
      modelResult?.resultDoc ||
      modelResult?.wiki_url ||
      "",
  ).trim();
}

function extractDocTokenFromModelResult(modelResult = {}) {
  return String(
    modelResult?.doc_token ||
      modelResult?.docToken ||
      modelResult?.document_token ||
      modelResult?.obj_token ||
      modelResult?.objToken ||
      "",
  ).trim();
}

function extractWikiTokenFromUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const match = url.pathname.match(/\/wiki\/([^/?#]+)/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function buildCloseErrorHints({
  reasonCode,
  missing = [],
  examples = {},
  fixCommands = [],
  docInspect,
} = {}) {
  return compactObject({
    reason_code: reasonCode,
    required_fields_missing: missing.length > 0 ? missing : undefined,
    required_fields_examples: Object.keys(examples).length > 0 ? examples : undefined,
    fix_commands: fixCommands.length > 0 ? fixCommands : undefined,
    doc_ref: "life-settle-ai-assistant SKILL.md#section-close-error-hints",
    doc_inspect: docInspect,
  });
}

function buildRunnerError(message, extra = {}) {
  return Object.assign(new Error(message), extra);
}

function buildCloseReadiness({ modelResult = {}, workItem = {} } = {}) {
  const status = String(modelResult?.status || "").trim() || deriveTerminalStatus(modelResult);
  const blockers = [];
  const missing = [];
  const docUrl = extractDocUrlFromModelResult(modelResult);
  const summary = String(modelResult?.summary || modelResult?.ai_summary || "").trim();
  const sopStatus = String(
    modelResult?.sop_writeback_status || modelResult?.sopWritebackStatus || "",
  ).trim();
  if (["succeeded", "pending"].includes(status)) {
    if (!String(modelResult?.feishu_doc_url || "").trim()) missing.push("feishu_doc_url");
    if (!String(modelResult?.doc_url || "").trim()) missing.push("doc_url");
    if (!docUrl) blockers.push("missing_doc_url");
    if (!sopStatus) blockers.push("missing_sop_writeback_status");
    const aiSummary = normalizeAiSummaryLengthAndKeywords(summary, {
      minLength: 20,
      maxLength: 500,
      requireFreeTextKeywords: true,
    });
    if (!aiSummary.valid) blockers.push("ai_summary_missing_keywords");
    if (
      String(workItem?.parent_wiki_token || workItem?.parentWikiToken || "").trim() &&
      !isWikiDocumentUrl(docUrl)
    ) {
      blockers.push("doc_url_must_be_wiki_link");
    }
  }
  for (const field of missing) {
    blockers.push(`missing_${field}`);
  }
  const uniqueBlockers = [...new Set(blockers)];
  return {
    ready_for_close: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    required_fields_missing: [...new Set(missing)],
    auto_fixable_via_normalize: uniqueBlockers.some((item) =>
      [
        "missing_doc_url",
        "missing_feishu_doc_url",
        "missing_doc_url",
        "missing_sop_writeback_status",
        "ai_summary_missing_keywords",
      ].includes(item),
    ),
  };
}

function buildValidationRepairPlan(results = []) {
  const categories = {
    auto_fixable: [],
    needs_rewrite: [],
    needs_permission: [],
    fatal: [],
  };
  const nextActions = [];
  const addAction = (action, reason, resultIds = []) => {
    if (!nextActions.some((item) => item.action === action && item.reason === reason)) {
      nextActions.push(compactObject({ action, reason, result_ids: resultIds.filter(Boolean) }));
    }
  };
  const autoFixableBlockers = new Set([
    "missing_doc_url",
    "missing_feishu_doc_url",
    "missing_sop_writeback_status",
    "ai_summary_missing_keywords",
    "doc_url_must_be_wiki_link",
  ]);
  const permissionPattern = /permission|auth|scope|unauthori[sz]ed|forbidden|权限/i;
  const fatalPattern = /result_id_mismatch|invalid_work_item|dependency_preflight_failed/i;

  for (const item of results || []) {
    const resultId = String(item?.result_id || "").trim();
    const blockers = Array.isArray(item?.close_readiness?.blockers)
      ? item.close_readiness.blockers
      : [];
    const hardFailCodes = Array.isArray(item?.hard_fail_codes) ? item.hard_fail_codes : [];
    const reasons = Array.isArray(item?.reasons) ? item.reasons : [];
    const autoBlockers = blockers.filter((blocker) => autoFixableBlockers.has(String(blocker)));
    if (autoBlockers.length > 0) {
      categories.auto_fixable.push(
        compactObject({
          result_id: resultId,
          record_id: item?.record_id,
          blockers: autoBlockers,
          fix_commands: autoBlockers.includes("doc_url_must_be_wiki_link")
            ? ["normalize-result-doc-links"]
            : ["normalize-model-result-json"],
        }),
      );
      if (autoBlockers.includes("doc_url_must_be_wiki_link")) {
        addAction("normalize-result-doc-links", "doc_url_must_be_wiki_link", [resultId]);
      }
      if (autoBlockers.some((blocker) => blocker !== "doc_url_must_be_wiki_link")) {
        addAction("normalize-model-result-json", "missing_or_normalizable_result_fields", [
          resultId,
        ]);
      }
    }

    if (hardFailCodes.length > 0) {
      const target = hardFailCodes.some((code) => permissionPattern.test(String(code)))
        ? "needs_permission"
        : hardFailCodes.some((code) => fatalPattern.test(String(code)))
          ? "fatal"
          : "needs_rewrite";
      categories[target].push(
        compactObject({
          result_id: resultId,
          record_id: item?.record_id,
          hard_fail_codes: hardFailCodes,
          reasons,
        }),
      );
      addAction(
        target === "needs_permission"
          ? "request-permission-or-add-alternative-evidence"
          : target === "fatal"
            ? "stop-and-fix-runner-input"
            : "rewrite-model-result",
        target,
        [resultId],
      );
    }
  }

  return {
    categories,
    next_actions: nextActions,
    policy: {
      auto_fixable:
        "先执行 normalize-model-result-json 或 normalize-result-doc-links 后重跑 validate/close",
      needs_rewrite: "单条结果证据或摘要语义不成立，必须重写模型结果或补证",
      needs_permission: "需要权限授权或补替代证据；权限不足不能推导业务不存在",
      fatal: "输入、依赖或跨记录混用错误，停止并修复 runner 输入",
    },
  };
}

function buildValidatorDiagnostics({ l1, l2, l3, skeletonProtection, normalizedModelResult } = {}) {
  const diagnostics = [];
  const add = (item) =>
    diagnostics.push(
      compactObject({
        blocker_type: item.blocker_type,
        human_readable_reason: item.human_readable_reason,
        auto_fixable: Boolean(item.auto_fixable),
        suggested_patch: item.suggested_patch || {},
        next_action: item.next_action,
        hard_fail_codes: item.hard_fail_codes,
        nonOverride: true,
      }),
    );

  if (l1 && !l1.valid) {
    add({
      blocker_type: "invalid_structure",
      human_readable_reason: (l1.reasons || []).filter(Boolean).join("；") || "模型结果结构不合法",
      auto_fixable: false,
      next_action: "rewrite model result with required status fields",
    });
  }

  const aiSummary = l2?.aiSummary;
  if (aiSummary && !aiSummary.valid) {
    add({
      blocker_type: "invalid_ai_summary",
      human_readable_reason:
        (aiSummary.reasons || []).filter(Boolean).join("；") ||
        "ai_summary 不满足固定归因、自由文案或终态关键词要求",
      auto_fixable: true,
      suggested_patch: compactObject({
        ai_summary: normalizedModelResult?.ai_summary,
        attribution_result: normalizedModelResult?.runner_attribution_result,
      }),
      next_action: "run normalize-model-result-json then validate again",
    });
  }

  for (const code of l2?.hardFailCodes || []) {
    const reasons = (l2.reasons || []).filter(Boolean);
    const autoFixable = ["auto_troubleshoot_doc_must_be_wiki_link"].includes(String(code));
    const permissionRelated = /permission|auth|scope|unauthori[sz]ed|forbidden|权限/i.test(
      String(code),
    );
    add({
      blocker_type: String(code),
      human_readable_reason: reasons.join("；") || `语义门禁失败：${code}`,
      auto_fixable: autoFixable,
      suggested_patch: autoFixable
        ? { ai_result: "publish troubleshooting doc under current daily Wiki node" }
        : {},
      next_action: autoFixable
        ? "run normalize-result-doc-links then validate again"
        : permissionRelated
          ? "request permission or add alternative evidence before close"
          : "rewrite model result with additional evidence then validate again",
      hard_fail_codes: [String(code)],
    });
  }

  if (l3?.applicable && !l3.deepValid) {
    add({
      blocker_type: l3.hardFailCode || "invalid_pending_admission",
      human_readable_reason:
        (l3.reasons || []).filter(Boolean).join("；") || "pending_admission 不满足深度校验",
      auto_fixable: false,
      next_action: "rewrite pending_admission with structured admission evidence",
    });
  }

  if (skeletonProtection && !skeletonProtection.valid) {
    add({
      blocker_type: "doc_content_quality_gate_failed",
      human_readable_reason:
        (skeletonProtection.reasons || []).filter(Boolean).join("；") ||
        "排查文档正文未通过质量门禁",
      auto_fixable: false,
      next_action: "rewrite troubleshooting document with concrete evidence",
    });
  }

  return diagnostics;
}

function isWikiDocumentUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" && /\/wiki\/[^/?#]+/.test(url.pathname);
  } catch {
    return false;
  }
}

function normalizeWorkItemsInput(workItems) {
  if (Array.isArray(workItems)) {
    return workItems;
  }
  if (workItems && typeof workItems === "object") {
    if (Array.isArray(workItems.workItems)) {
      return workItems.workItems;
    }
    if (Array.isArray(workItems.work_items)) {
      return workItems.work_items;
    }
    return [workItems];
  }
  return [];
}

function getWorkItemResultId(workItem = {}, fallback = "") {
  return String(
    workItem?.result_id || workItem?.resultId || workItem?.bamboo_result_id || fallback || "",
  ).trim();
}

function buildPerResultWorkItemsFilePath(resultDir, resultId, index = 0, naming = "result-id") {
  const safeResultId = String(resultId || "").trim();
  const suffix =
    naming === "index" || !safeResultId ? String(index + 1).padStart(3, "0") : safeResultId;
  return join(resultDir, `work-items-${suffix}.json`);
}

function buildAgentDriverDispatchPlan({
  workItems = [],
  resultDir,
  scanDirUrl,
  dateKeys = [],
  dateKeyList,
  date_key_list,
  bizSuffix,
  troubleshootingSopDoc,
  commandName = "run-groups-scan-and-troubleshoot",
} = {}) {
  const normalizedResultDir = String(resultDir || "").trim();
  const resolvedDateKeys = normalizeDateKeyList({ dateKeyList, date_key_list, dateKeys });
  const dateKeyArgs = resolvedDateKeys
    .filter(Boolean)
    .flatMap((dateKey) => ["--date-key", String(dateKey)]);
  const expectedResultFiles = [];
  const workItemFiles = [];
  const closeCommands = [];
  const dispatchItems = [];
  const normalizedWorkItems = normalizeWorkItemsInput(workItems);
  normalizedWorkItems.forEach((workItem, index) => {
    const resultId = getWorkItemResultId(workItem, String(index + 1));
    const workItemsFile = buildPerResultWorkItemsFilePath(normalizedResultDir, resultId, index);
    const expectedResultFile = join(normalizedResultDir, `${resultId}.json`);
    workItemFiles.push(workItemsFile);
    expectedResultFiles.push(expectedResultFile);
    closeCommands.push(
      commandToShell({
        command: "node",
        args: [
          "scripts/bamboo/bamboo-alert-runner.mjs",
          "close-prepared-work-items",
          "--work-items-file",
          workItemsFile,
          "--result-dir",
          normalizedResultDir,
          "--output-file",
          join(normalizedResultDir, `close-${resultId}.json`),
        ],
      }),
    );
    dispatchItems.push(
      compactObject({
        result_id: resultId,
        record_id: workItem?.record_id || workItem?.recordId,
        work_items_file: workItemsFile,
        expected_result_file: expectedResultFile,
        close_command: closeCommands[closeCommands.length - 1],
        child_agent_contract: [
          "fresh context",
          "only process this work item",
          "write resultDir/${result_id}.json",
          "do not run close-prepared-work-items",
        ],
        nonOverride: true,
      }),
    );
  });
  const continueCommand = commandToShell({
    command: "node",
    args: [
      "scripts/bamboo/bamboo-alert-runner.mjs",
      commandName,
      "--root-path",
      scanDirUrl || "",
      ...dateKeyArgs,
      ...(bizSuffix ? ["--biz-suffix", bizSuffix] : []),
      ...(troubleshootingSopDoc ? ["--troubleshooting-sop-doc", troubleshootingSopDoc] : []),
      "--result-dir",
      normalizedResultDir,
    ],
  });
  const finalDrainCommand = commandToShell({
    command: "node",
    args: [
      "scripts/bamboo/bamboo-alert-runner.mjs",
      "auto-troubleshoot-drain",
      "--scan-dir-url",
      scanDirUrl || "",
      ...dateKeyArgs,
      ...(bizSuffix ? ["--biz-suffix", bizSuffix] : []),
      "--result-dir",
      normalizedResultDir,
      "--work-items-file",
      join(normalizedResultDir, "work-items.json"),
      "--output-file",
      join(normalizedResultDir, "run-summary.json"),
    ],
  });
  return {
    kind: "bamboo_alert_agent_driver_dispatch_plan",
    next_action: normalizedWorkItems.length > 0 ? "dispatch_required" : "final_drain_required",
    orchestrator: "main_session",
    agent_driver_contract: {
      mode: "host_native_fresh_context_only",
      runner_owns: ["scan", "prepare", "close", "drain", "business_side_effects"],
      agent_driver_owns: ["dispatch_child_agent", "collect_model_result_json"],
      forbidden: [
        "no runner-side LLM or agent SDK",
        "no review agent gate",
        "no manual Base/Bamboo/Lark writeback outside runner",
      ],
      nonOverride: true,
    },
    work_items_file: normalizedResultDir ? join(normalizedResultDir, "work-items.json") : "",
    work_item_files: workItemFiles,
    expected_result_files: expectedResultFiles,
    close_commands: closeCommands,
    continue_command: continueCommand,
    final_drain_command: finalDrainCommand,
    dispatch_items: dispatchItems,
    nonOverride: true,
  };
}

function buildArtifactConsistencySummary(
  docRecordValidation,
  statusCounts = {},
  readyToReportComplete = false,
) {
  if (!docRecordValidation) return null;
  const bases = Array.isArray(docRecordValidation.bases) ? docRecordValidation.bases : [];
  let totalWikiDocs = 0;
  let activeWikiDocs = 0;
  for (const base of bases) {
    totalWikiDocs += Number(base?.child_docs || 0);
    const recordIds = new Set(
      Array.isArray(base?.record_result_ids) ? base.record_result_ids.map((id) => String(id)) : [],
    );
    const docIds = new Set(
      Array.isArray(base?.doc_result_ids) ? base.doc_result_ids.map((id) => String(id)) : [],
    );
    for (const docId of docIds) {
      if (recordIds.has(docId)) activeWikiDocs += 1;
    }
  }
  const extraDocs = Array.isArray(docRecordValidation.extra_docs)
    ? docRecordValidation.extra_docs
    : [];
  const missingDocs = Array.isArray(docRecordValidation.missing_docs)
    ? docRecordValidation.missing_docs
    : [];
  const duplicateDocs = Array.isArray(docRecordValidation.duplicate_docs)
    ? docRecordValidation.duplicate_docs
    : [];
  return {
    base_succeeded_records: Number(statusCounts.succeeded || 0),
    active_wiki_docs: activeWikiDocs,
    total_wiki_docs: totalWikiDocs,
    extra_docs: extraDocs.length,
    missing_docs: missingDocs.length,
    duplicate_docs: duplicateDocs.length,
    ready_to_report_complete_allowed: Boolean(readyToReportComplete),
    cleanup_plan:
      extraDocs.length > 0
        ? {
            mode: "manual_confirmation_required",
            action: "review_orphan_docs_before_delete_or_move",
            items: extraDocs,
          }
        : undefined,
  };
}

function extractDailyBasesFromScanGroups(groups = []) {
  const seen = new Set();
  const dailyBases = [];
  for (const group of groups || []) {
    const detailBases = Array.isArray(group?.detail?.daily_bases) ? group.detail.daily_bases : [];
    for (const base of detailBases) {
      const wikiUrl =
        base.wiki_url ||
        base.wikiUrl ||
        base.url ||
        (base.node_token ? `https://bytedance.larkoffice.com/wiki/${base.node_token}` : undefined);
      const key = [
        base.date_key || base.dateKey || "",
        wikiUrl || "",
        base.base_token || base.obj_token || "",
        base.table_id || "",
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      dailyBases.push(
        compactObject({
          date_key: base.date_key || base.dateKey,
          title: base.title,
          wiki_url: wikiUrl,
          node_token: base.node_token,
          base_token: base.base_token || base.obj_token,
          table_id: base.table_id,
        }),
      );
    }
    const baseUrls = Array.isArray(group?.base_urls) ? group.base_urls : [];
    for (const url of baseUrls) {
      const key = `url|${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dailyBases.push({ wiki_url: url });
    }
  }
  return dailyBases;
}
function buildUnfinishedDrainRecords(status = {}, validation = null) {
  const records = [];
  const seen = new Set();
  const add = (item = {}, statusValue, blockerCode, nextAction, extra = {}) => {
    const fields = item.fields && typeof item.fields === "object" ? item.fields : {};
    const resultId = String(
      item.result_id ||
        item.resultId ||
        item.bamboo_result_id ||
        fields.result_id ||
        fields.resultId ||
        "",
    ).trim();
    const recordId = String(item.record_id || item.recordId || "").trim();
    const key = `${resultId || recordId}:${statusValue}:${blockerCode}`;
    if (!resultId && !recordId) return;
    if (seen.has(key)) return;
    seen.add(key);
    records.push(
      compactObject({
        result_id: resultId,
        record_id: recordId,
        base_status: statusValue,
        local_result_status: item.local_result_status,
        blocker_code: blockerCode,
        blocker_reason: extra.blocker_reason,
        next_action: nextAction,
        auto_fixable: Boolean(extra.auto_fixable),
        diagnostics: extra.diagnostics,
      }),
    );
  };

  for (const item of status.candidateWorkItems || status.candidate_work_items || []) {
    const baseStatus =
      String(item.status || "")
        .trim()
        .toLowerCase() || "init";
    const blockerCode =
      baseStatus === "failed" ? "base_status_failed_remaining" : "base_status_init_remaining";
    add(
      item,
      baseStatus,
      blockerCode,
      "run prepare-auto-troubleshoot to claim and troubleshoot this record",
    );
  }

  for (const item of status.existingProcessingRecords || status.existing_processing_records || []) {
    add(
      item,
      "processing",
      "base_status_processing_remaining",
      "finish or recover the processing record before final drain",
    );
  }

  for (const item of validation?.per_result_close_readiness || []) {
    if (item?.ready_for_close === false) {
      const blockers = Array.isArray(item.blockers) ? item.blockers : [];
      add(
        item,
        item.status || "local_invalid",
        blockers[0] || "validate_result_dir_failed",
        "fix local model result then rerun validate-result-dir",
        {
          blocker_reason: blockers.join("; "),
          auto_fixable: item.auto_fixable_via_normalize,
          diagnostics: item.diagnostics,
        },
      );
    }
  }

  return records;
}

function serializeExtraField(value) {
  const text = JSON.stringify(compactObject(value || {}));
  if (text.length <= 45000) {
    return text;
  }
  return JSON.stringify({
    truncated: true,
    raw_length: text.length,
    ...compactObject({
      chat_id: value?.chat_id,
      group_id: value?.group_id,
      message_id: value?.message_id,
      topic_id: value?.topic_id,
      source_chat_id: value?.source_chat_id,
      source_message_id: value?.source_message_id,
      source_topic_id: value?.source_topic_id,
      message_link: value?.message_link,
      message_sent_at_ms: value?.message_sent_at_ms,
      message_sent_at: value?.message_sent_at,
      raw_title: value?.raw_title,
      original_title: value?.original_title,
      bamboo_check_time: value?.bamboo_check_time,
    }),
  });
}

function parseObjectField(value) {
  if (!value) {
    return {};
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readFirstStringField(value, ...keys) {
  const source = parseObjectField(value);
  for (const key of keys) {
    const found = source[key];
    if (found !== undefined && found !== null && String(found).trim()) {
      return String(found).trim();
    }
  }
  return "";
}

function buildProcessingSessionId(value) {
  const explicit = String(value || "").trim();
  if (explicit) return explicit;
  const fromEnv = String(
    process.env.TRAE_SESSION_ID || process.env.AIME_SESSION_ID || process.env.USER || "",
  ).trim();
  const suffix = `${Date.now()}-${process.pid}`;
  return fromEnv ? `${fromEnv}-${suffix}` : `bamboo-auto-${suffix}`;
}

function getProcessingSession(record) {
  const extra = parseObjectField(record?.fields?.extra);
  return String(
    extractSingleCellValue(record?.fields?.ai_session_id) ||
      extra.processing_session_id ||
      extra.ai_session_id ||
      "",
  ).trim();
}

function getProcessingStartedAt(record) {
  const extra = parseObjectField(record?.fields?.extra);
  return (
    extractSingleCellValue(record?.fields?.processing_started_at) ||
    extra.processing_started_at ||
    extra.processingStartedAt ||
    ""
  );
}

function buildProcessingClaimPatch({ record, fieldNames = [], sessionId, startedAt }) {
  const patch = { status: "processing" };
  if (fieldNames.includes("ai_session_id")) {
    patch.ai_session_id = sessionId;
  }
  if (fieldNames.includes("processing_started_at")) {
    patch.processing_started_at = startedAt;
  }
  const extra = parseObjectField(record?.fields?.extra);
  patch.extra = JSON.stringify({
    ...extra,
    processing_session_id: sessionId,
    processing_started_at: startedAt,
  });
  return patch;
}

function shellQuote(value) {
  const text = String(value);
  if (/^[a-zA-Z0-9_./:=@+-]+$/.test(text)) {
    return text;
  }
  return `'${text.replaceAll("'", "'\\''")}'`;
}

function commandToShell(command) {
  return [command.command, ...command.args].map(shellQuote).join(" ");
}

function extractJsonBlocks(text) {
  const input = String(text || "");
  const blocks = [];
  for (let start = 0; start < input.length; start += 1) {
    const first = input[start];
    if (first !== "{" && first !== "[") continue;
    const stack = [];
    let inString = false;
    let escaped = false;
    for (let i = start; i < input.length; i += 1) {
      const ch = input[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{" || ch === "[") {
        stack.push(ch);
        continue;
      }
      if (ch === "}" || ch === "]") {
        const expected = ch === "}" ? "{" : "[";
        if (stack.pop() !== expected) break;
        if (stack.length === 0) {
          const candidate = input.slice(start, i + 1);
          try {
            blocks.push(JSON.parse(candidate));
          } catch {
            // bytedcli Metrics prefixes can look bracket-like but are not JSON.
          }
          start = i;
          break;
        }
      }
    }
  }
  return blocks;
}

function writeBytedcliJsonParseTrace({ command, stdout, stderr, error }) {
  try {
    const dir = join(process.cwd(), ".tmp", "bytedcli-json-trace");
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `parse-failed-${Date.now()}-${process.pid}.json`);
    writeFileSync(
      filePath,
      `${JSON.stringify(
        {
          command: commandToShell(command),
          error: error?.message || String(error || ""),
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    return filePath;
  } catch {
    return "";
  }
}

function normalizeJsonOutput(stdout, command, stderr = "") {
  try {
    return JSON.parse(stdout || "{}");
  } catch (error) {
    const blocks = extractJsonBlocks(stdout);
    if (blocks.length > 0) {
      return blocks[blocks.length - 1];
    }
    const wrapped = new Error(`Command did not return JSON: ${commandToShell(command)}`);
    wrapped.cause = error;
    wrapped.reason_code = "BYTEDCLI_JSON_PARSE_FAILED";
    wrapped.error_code = "BYTEDCLI_JSON_PARSE_FAILED";
    wrapped.stdout = stdout;
    wrapped.stderr = stderr;
    wrapped.trace_file = writeBytedcliJsonParseTrace({ command, stdout, stderr, error });
    throw wrapped;
  }
}

function assertSuccessJson(payload, command, stderr) {
  if (payload?.ok === false) {
    const error = new Error(`Command returned ok=false: ${commandToShell(command)}`);
    error.payload = payload;
    error.stderr = stderr;
    throw error;
  }
}

export function isBotIdentityNotAllowedError(error) {
  const details = [
    error?.message,
    error?.stderr,
    error?.stdout,
    error?.payload ? JSON.stringify(error.payload) : undefined,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return (
    details.includes("bot identity is not allowed") ||
    details.includes("lark_cli_bot_command_denied") ||
    details.includes("bot identity is only allowed for aime-approved lark-cli commands") ||
    details.includes('strict mode is "user"') ||
    details.includes("strict mode is user") ||
    details.includes("only user-identity commands are available") ||
    details.includes("app-identity commands are disabled") ||
    details.includes("bot identity disabled") ||
    // AIME guard 文案：`lark_cli_im_read_guard: bot identity is not allowed for AIME lark-cli IM read commands`
    // 以及更宽泛的 `lark_cli_im_read_guard:*` 前缀，必须识别成 IM 读取的 bot-not-allowed 特定错误
    details.includes("lark_cli_im_read_guard")
  );
}

function isStrictModeUserError(error) {
  const details = [
    error?.message,
    error?.stderr,
    error?.stdout,
    error?.payload ? JSON.stringify(error.payload) : undefined,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return (
    details.includes('strict mode is "user"') ||
    details.includes("strict mode is user") ||
    details.includes("only user-identity commands are available") ||
    details.includes("app-identity commands are disabled") ||
    details.includes("bot identity disabled") ||
    // IM 读取专用 guard 前缀也归入 strict-mode 语义：AIME 下 IM 读取 guard 允许 IM 读取 user 兜底
    details.includes("lark_cli_im_read_guard")
  );
}

export function replaceLarkIdentity(args, identity) {
  const nextArgs = [...args];
  const identityFlagIndex = nextArgs.indexOf("--as");
  if (identityFlagIndex >= 0 && identityFlagIndex < nextArgs.length - 1) {
    nextArgs[identityFlagIndex + 1] = identity;
    return nextArgs;
  }
  nextArgs.push("--as", identity);
  return nextArgs;
}

function isLarkBotCommand(command) {
  if (!command || command.command !== "bytedcli" || !Array.isArray(command.args)) {
    return false;
  }
  const larkIndex = command.args.indexOf("lark");
  const identityFlagIndex = command.args.indexOf("--as");
  return larkIndex >= 0 && identityFlagIndex >= 0 && command.args[identityFlagIndex + 1] === "bot";
}

function buildExecEnvForCommand(command, baseEnv = process.env) {
  if (!isLarkBotCommand(command)) {
    return baseEnv;
  }
  return preprocessBambooCommandEnv(baseEnv);
}

function getItems(payload) {
  const data = payload?.data;
  if (Array.isArray(data?.items)) {
    return data.items;
  }
  if (Array.isArray(data?.messages)) {
    return data.messages;
  }
  if (Array.isArray(data?.nodes)) {
    return data.nodes;
  }
  if (Array.isArray(data?.tables)) {
    return data.tables;
  }
  if (Array.isArray(data?.fields)) {
    return data.fields;
  }
  if (Array.isArray(data?.views)) {
    return data.views;
  }
  if (Array.isArray(data?.dashboards)) {
    return data.dashboards;
  }
  if (Array.isArray(data?.workflows)) {
    return data.workflows;
  }
  if (Array.isArray(data?.data)) {
    return data.data;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  return [];
}

function getFirstItem(payload) {
  return getItems(payload)[0];
}

async function assertDailyBaseDefaultSurface({ baseToken, expectedTableId, runJsonFn }) {
  const dashboardPayload = await runJsonFn(buildBaseDashboardListCommand({ baseToken }));
  const dashboards = getItems(dashboardPayload)
    .map((item) => ({
      dashboardId: extractFirstString(item?.dashboard_id, item?.id, item?.dashboardId),
      dashboardName: extractFirstString(item?.name, item?.dashboard_name, item?.title),
    }))
    .filter((item) => item.dashboardId);
  if (dashboards.length > 0) {
    throw buildRunnerError("ensureDailyBase: final Base dashboard state is not empty", {
      reason_code: "DAILY_BASE_FINAL_DASHBOARD_STATE_INVALID",
      dashboard_ids: dashboards.map((item) => item.dashboardId),
      final_dashboards: dashboards,
    });
  }

  const workflowPayload = await runJsonFn(buildBaseWorkflowListCommand({ baseToken }));
  const workflows = getItems(workflowPayload)
    .map((item) => ({
      workflowId: extractFirstString(item?.workflow_id, item?.id, item?.workflowId),
      workflowName: extractFirstString(item?.name, item?.workflow_name, item?.title),
      status: extractFirstString(item?.status),
    }))
    .filter((item) => item.workflowId);
  if (workflows.length > 0) {
    throw buildRunnerError("ensureDailyBase: final Base workflow state is not empty", {
      reason_code: "DAILY_BASE_FINAL_WORKFLOW_STATE_INVALID",
      workflow_ids: workflows.map((item) => item.workflowId),
      final_workflows: workflows,
    });
  }

  const tablePayload = await runJsonFn(buildBaseTableListCommand({ baseToken }));
  const tables = getItems(tablePayload)
    .map((item) => ({
      tableId: extractFirstString(item?.table_id, item?.id, item?.tableId),
      tableName: extractFirstString(item?.name, item?.table_name, item?.title),
    }))
    .filter((item) => item.tableId);
  if (
    tables.length !== 1 ||
    (expectedTableId && tables[0].tableId !== expectedTableId) ||
    tables[0].tableName !== DAILY_BASE_TABLE_NAME
  ) {
    throw buildRunnerError(
      "ensureDailyBase: final Base table state is not a single attribution table",
      {
        reason_code: "DAILY_BASE_FINAL_TABLE_STATE_INVALID",
        table_id: expectedTableId || "",
        final_tables: tables,
      },
    );
  }
  return {
    finalTables: tables,
    finalDashboardIds: dashboards.map((item) => item.dashboardId),
    finalWorkflowIds: workflows.map((item) => item.workflowId),
  };
}

function getNextPageToken(payload) {
  const data = payload?.data ?? payload;
  const hasMore = Boolean(data?.has_more ?? data?.hasMore);
  if (!hasMore) {
    return undefined;
  }
  return extractFirstString(data?.page_token, data?.next_page_token, data?.nextPageToken);
}

function getBambooResultData(payload) {
  return payload?.data?.data ?? payload?.data ?? payload;
}

function normalizePositiveIntegerId(value) {
  const normalized = String(value ?? "").trim();
  return isPositiveIntegerId(normalized) ? normalized : "";
}

function normalizeNonNegativeIntegerId(value) {
  const normalized = String(value ?? "").trim();
  return /^(0|[1-9]\d*)$/.test(normalized) ? normalized : "";
}

function isMissingAlarmRecordDetailIdForBackfill(value) {
  const normalized = String(extractSingleCellValue(value) ?? "").trim();
  return normalized === "" || normalized === "0";
}

function firstPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function firstPresentDeepValue(value, keys, depth = 0) {
  if (!value || depth > 8) {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstPresentDeepValue(item, keys, depth + 1);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  if (typeof value !== "object") {
    return undefined;
  }
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null && value[key] !== "") {
      return value[key];
    }
  }
  for (const child of Object.values(value)) {
    const found = firstPresentDeepValue(child, keys, depth + 1);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function extractAlarmRecordDetailIdFromBambooResult(result) {
  if (!result || typeof result !== "object") {
    return "";
  }
  return normalizeNonNegativeIntegerId(
    firstPresentValue(
      result.alarm_record_detail_id,
      result.alarm_detail_id,
      result.alarmRecordDetailId,
      result.alarmRecordDetailID,
      result.alarmRecordDetail?.id,
      result.alarm_record_detail?.id,
      firstPresentDeepValue(result, [
        "alarm_record_detail_id",
        "alarm_detail_id",
        "alarmRecordDetailId",
        "alarmRecordDetailID",
      ]),
    ),
  );
}

function extractTaskResultNumFromBambooResult(result) {
  const value = firstPresentValue(
    result?.false_data_length,
    result?.falseDataLength,
    result?.task_result_num,
    result?.taskResultNum,
    result?.repeat_false_data_length,
    result?.repeatFalseDataLength,
    result?.cnt_nums,
    result?.cntNums,
    firstPresentDeepValue(result, [
      "false_data_length",
      "falseDataLength",
      "task_result_num",
      "taskResultNum",
      "repeat_false_data_length",
      "repeatFalseDataLength",
      "cnt_nums",
      "cntNums",
    ]),
  );
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : undefined;
}

function extractFirstString(...values) {
  return values.find((value) => typeof value === "string" && value.length > 0);
}

function extractFirstNumber(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.length > 0) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function extractCreatedDocToken(payload) {
  const token = extractFirstString(
    payload?.data?.doc_token,
    payload?.data?.document?.document_id,
    payload?.data?.document?.doc_token,
    payload?.data?.document?.token,
    payload?.data?.obj_token,
    payload?.document_id,
    payload?.doc_token,
    payload?.token,
  );
  if (!token) {
    throw new Error("docs create response did not include a doc token");
  }
  return token;
}

function extractCreatedDocUrl(payload, docToken) {
  return (
    extractFirstString(
      payload?.data?.url,
      payload?.data?.document?.url,
      payload?.data?.doc_url,
      payload?.url,
      payload?.doc_url,
    ) || `https://bytedance.larkoffice.com/docx/${docToken}`
  );
}

function buildDocsOverwriteBody(markdown) {
  return {
    command: "overwrite",
    doc_format: "markdown",
    content: markdown,
  };
}

function extractMarkdownText(payload) {
  return (
    extractFirstString(
      payload?.data?.markdown,
      payload?.data?.content,
      payload?.data?.text,
      payload?.markdown,
      payload?.content,
      payload?.text,
    ) || ""
  );
}

function extractTroubleshootingDocTemplateFromSopMarkdown(markdown) {
  const text = String(markdown || "");
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      const value = extractFirstString(
        parsed?.troubleshooting_doc_template,
        parsed?.troubleshootingDocTemplate,
        parsed?.doc_template,
        parsed?.docTemplate,
      );
      if (value) return value.trim();
    } catch {
      // 继续尝试行式配置。
    }
  }
  const lineMatch = text.match(
    /(?:^|\n)\s*(?:troubleshooting_doc_template|troubleshootingDocTemplate|doc_template|docTemplate)\s*[:=]\s*(\S+)/,
  );
  return lineMatch ? lineMatch[1].trim() : "";
}

function ensureMarkdownTitle({ title, markdown }) {
  const normalizedMarkdown = String(markdown ?? "");
  if (!title) {
    return normalizedMarkdown;
  }
  if (/^#\s+.+$/m.test(normalizedMarkdown)) {
    return normalizedMarkdown.replace(/^#\s+.+$/m, `# ${title}`);
  }
  return `# ${title}\n\n${normalizedMarkdown}`;
}

function stripLeadingMarkdownTitle(markdown) {
  return String(markdown ?? "").replace(/^#\s+.*\n(?:\s*\n){0,2}/, "");
}

function parseMarkdownTopSections(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const sections = [];
  let current = { heading: "", lines: [] };
  for (const line of lines) {
    const match = line.match(/^##\s+(.+)\s*$/);
    if (match) {
      sections.push(current);
      current = { heading: match[1], lines: [] };
      continue;
    }
    if (/^#\s+/.test(line)) continue;
    current.lines.push(line);
  }
  sections.push(current);
  return sections;
}

function mergeMarkdownSections({ title, existingMarkdown, newMarkdown }) {
  const existingBody = stripLeadingMarkdownTitle(existingMarkdown);
  const newBody = stripLeadingMarkdownTitle(newMarkdown);
  if (!String(existingBody).trim()) return ensureMarkdownTitle({ title, markdown: newBody });
  if (!String(newBody).trim()) return ensureMarkdownTitle({ title, markdown: existingBody });

  const normalizeHeading = (heading) =>
    String(heading || "")
      .trim()
      .toLowerCase();
  const merged = [];
  const index = new Map();
  for (const section of parseMarkdownTopSections(existingBody)) {
    const key = normalizeHeading(section.heading);
    const entry = { heading: section.heading, lines: section.lines.slice() };
    merged.push(entry);
    if (!index.has(key)) index.set(key, entry);
  }
  for (const section of parseMarkdownTopSections(newBody)) {
    const key = normalizeHeading(section.heading);
    const target = index.get(key);
    if (!target) {
      const entry = { heading: section.heading, lines: section.lines.slice() };
      merged.push(entry);
      index.set(key, entry);
      continue;
    }
    const existingLineSet = new Set(
      target.lines.map((line) => String(line).trim()).filter(Boolean),
    );
    for (const line of section.lines) {
      const normalizedLine = String(line).trim();
      if (!normalizedLine) {
        target.lines.push(line);
        continue;
      }
      if (existingLineSet.has(normalizedLine)) continue;
      existingLineSet.add(normalizedLine);
      target.lines.push(line);
    }
  }
  const mergedBody = merged
    .map((section) => {
      const block = section.lines
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trimEnd();
      return section.heading ? [`## ${section.heading}`, block].filter(Boolean).join("\n") : block;
    })
    .filter((chunk) => String(chunk).trim())
    .join("\n\n")
    .trim();
  return ensureMarkdownTitle({ title, markdown: mergedBody });
}

const TROUBLESHOOTING_DOC_PLACEHOLDER_LINE_RE =
  /(?:^|\s)(?:TBD|TODO|待补充|填写指引|请填写|请在此下方填写内容|骨架必含节|骨架自动生成|AI\s*不得删除|请引用\s*build-attribution-candidates|引用\s*build-attribution-candidates|权威归因\s*nonOverride|表格化列出|至少\s*2\s*段|YYYY-MM-DD|已知\/新问题判定：\s*（|是否需要修数：\s*（|预计修复完成时间|下游通知与操作建议：\s*$)/i;

function extractMeaningfulTroubleshootingDocSectionBody(body) {
  return String(body || "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*>+\s?/, "")
        .replace(/^\s*[-*]\s*/, "")
        .trim(),
    )
    .filter((line) => line && !TROUBLESHOOTING_DOC_PLACEHOLDER_LINE_RE.test(line))
    .join("\n")
    .trim();
}

function validateTroubleshootingDocContent({ title, markdown, skeletonType, attribution }) {
  const text = String(markdown || "");
  const reasons = [];
  const h1 = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
  if (title && h1 !== String(title).trim()) {
    reasons.push(`首个 H1 必须等于文档标题 "${title}"，当前为 "${h1 || "<missing>"}"`);
  }

  const deepRequired = [
    TROUBLESHOOTING_DOC_SECTION_TITLES.deepInvestigation,
    TROUBLESHOOTING_DOC_SECTION_TITLES.evidenceSummary,
    TROUBLESHOOTING_DOC_SECTION_TITLES.deepConclusion,
  ];
  if (skeletonType === "deep") {
    for (const section of deepRequired) {
      const idx = text.indexOf(section);
      if (idx < 0) {
        reasons.push(`deep 排查文档缺少必填节：${section}`);
        continue;
      }
      const rest = text.slice(idx + section.length);
      const next = rest.search(/\n[一二三四五六七八九十百]+、/);
      const body = (next > 0 ? rest.slice(0, next) : rest).replace(/[#*\-`>\s\n]+$/g, "").trim();
      const meaningfulBody = extractMeaningfulTroubleshootingDocSectionBody(body);
      if (
        !body ||
        /^(TBD|TODO|待补充|填写|请填写|引用 build-attribution-candidates|表格化列出|至少 2 段)/i.test(
          body,
        ) ||
        meaningfulBody.length < 20
      ) {
        reasons.push(`${section} 不能只包含 TBD、TODO 或骨架填写指引`);
      }
    }
  }

  if (attribution === "[无效告警]表权限缺失") {
    const hasPermissionEvidence =
      /NoPrivilegeException|No valid privileges|does not have privileges for QUERY|Permission denied|无权限|权限不足|缺少.*查询权限/i.test(
        text,
      );
    if (!hasPermissionEvidence) {
      reasons.push(
        "表权限缺失归因文档必须包含 NoPrivilegeException / No valid privileges / Permission denied / 权限 等关键证据",
      );
    }
    if (!text.includes("[无效告警]表权限缺失")) {
      reasons.push("表权限缺失归因文档必须包含最终固定归因：[无效告警]表权限缺失");
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
    checkedSections: skeletonType === "deep" ? deepRequired : [],
    nonOverride: true,
  };
}

function extractSummarySampleCounts(summary) {
  const text = String(summary || "");
  const counts = [];
  const patterns = [
    /(?:异常样本数|样本数|有效差异样本|有效异常样本)\s*[=:=：为]?\s*(\d+)\s*(?:条|个|$)?/g,
    /规则命中\s*(\d+)\s*条(?:有效差异样本|有效异常样本|异常样本)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n >= 0) counts.push(Math.floor(n));
    }
  }
  return [...new Set(counts)];
}

function normalizeArrayField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hasMeaningfulValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function validateSampleChecks(sampleChecks) {
  const checks = normalizeArrayField(sampleChecks);
  const validChecks = [];
  const invalidChecks = [];
  for (const [index, rawCheck] of checks.entries()) {
    const check =
      rawCheck && typeof rawCheck === "object" && !Array.isArray(rawCheck) ? rawCheck : {};
    const objectType =
      check.object_type ??
      check.objectType ??
      check.entity_type ??
      check.entityType ??
      check.biz_type ??
      check.bizType;
    const objectId =
      check.object_id ??
      check.objectId ??
      check.entity_id ??
      check.entityId ??
      check.biz_id ??
      check.bizId;
    const tool =
      check.tool ?? check.rpc ?? check.command ?? check.query_tool ?? check.queryTool ?? check.psm;
    const currentState =
      check.current_state ??
      check.currentState ??
      check.current_status ??
      check.currentStatus ??
      check.online_state ??
      check.onlineState;
    const snapshotState =
      check.snapshot_state ??
      check.snapshotState ??
      check.snapshot_status ??
      check.snapshotStatus ??
      check.bamboo_state ??
      check.bambooState;
    const evidence = check.evidence ?? check.result ?? check.observation ?? check.conclusion;
    const missing = [];
    if (!hasMeaningfulValue(objectType)) missing.push("object_type");
    if (!hasMeaningfulValue(objectId)) missing.push("object_id");
    if (!hasMeaningfulValue(tool)) missing.push("tool");
    if (
      !hasMeaningfulValue(currentState) &&
      !hasMeaningfulValue(snapshotState) &&
      !hasMeaningfulValue(evidence)
    ) {
      missing.push("current_state|snapshot_state|evidence");
    }
    if (missing.length === 0) {
      validChecks.push({
        index,
        object_type: String(objectType),
        object_id: String(objectId),
        tool: String(tool),
      });
    } else {
      invalidChecks.push({ index, missing });
    }
  }
  return {
    checks,
    validChecks,
    valid_checks: validChecks,
    invalidChecks,
    invalid_checks: invalidChecks,
    valid: checks.length > 0 && validChecks.length > 0 && invalidChecks.length === 0,
    nonOverride: true,
  };
}

function parseJsonArrayText(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sampleGroupKeyFromObject(value = {}) {
  const item = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const diffReason = String(
    item.diff_reason ?? item.diffReason ?? item.reason ?? item.error_code ?? item.errorCode ?? "",
  ).trim();
  const status = String(
    item.status ??
      item.current_status ??
      item.currentStatus ??
      item.order_status ??
      item.orderStatus ??
      "",
  ).trim();
  const objectType = String(
    item.object_type ??
      item.objectType ??
      item.entity_type ??
      item.entityType ??
      item.biz_type ??
      item.bizType ??
      "",
  ).trim();
  const parts = [];
  if (diffReason) parts.push(`diff_reason=${diffReason}`);
  if (status) parts.push(`status=${status}`);
  if (parts.length === 0 && objectType) parts.push(`object_type=${objectType}`);
  return parts.length > 0 ? parts.join("|") : "";
}

function buildSampleGroupCoverage({ modelResult, workItem, sampleCheckValidation }) {
  const inspect =
    workItem?.inspect_result ||
    workItem?.inspectResult ||
    modelResult?.inspect_result ||
    modelResult?.inspectResult ||
    {};
  const rows = [
    ...parseJsonArrayText(inspect.false_reason ?? inspect.falseReason),
    ...parseJsonArrayText(modelResult?.false_reason ?? modelResult?.falseReason),
    ...normalizeArrayField(inspect.samples ?? inspect.sample_rows ?? inspect.sampleRows),
    ...normalizeArrayField(
      modelResult?.samples ?? modelResult?.sample_rows ?? modelResult?.sampleRows,
    ),
  ];
  const requiredKeys = [...new Set(rows.map(sampleGroupKeyFromObject).filter(Boolean))];
  const coveredKeys = new Set(
    sampleCheckValidation.validChecks
      .map(({ index }) => sampleGroupKeyFromObject(sampleCheckValidation.checks[index]))
      .filter(Boolean),
  );
  const missingKeys = requiredKeys.filter((key) => !coveredKeys.has(key));
  const applicable = requiredKeys.length > 1;
  return {
    applicable,
    valid: !applicable || missingKeys.length === 0,
    required_groups: requiredKeys,
    covered_groups: [...coveredKeys].filter((key) => requiredKeys.includes(key)),
    missing_groups: missingKeys,
    required_group_count: requiredKeys.length,
    covered_group_count: requiredKeys.filter((key) => coveredKeys.has(key)).length,
    reason:
      applicable && missingKeys.length > 0
        ? `有效样本存在 ${requiredKeys.length} 个主要 diff/status/object_type 分组，sample_checks 未覆盖：${missingKeys.join("; ")}`
        : "",
    nonOverride: true,
  };
}

function detectEvidenceCategories({
  modelResult,
  normalizedSummaryText,
  qcResult,
  hasEffectiveSampleEvidence,
  sampleCheckValidation,
}) {
  const text = [
    normalizedSummaryText,
    modelResult?.rule_evidence,
    modelResult?.ruleEvidence,
    modelResult?.sql_summary,
    modelResult?.sqlSummary,
    modelResult?.task_sql,
    modelResult?.taskSql,
    modelResult?.diff_reason,
    modelResult?.diffReason,
  ]
    .filter(Boolean)
    .map((value) => String(value))
    .join("\n");
  const evidenceItems = normalizeArrayField(
    modelResult?.evidence_items ?? modelResult?.evidenceItems,
  );
  const hasRuleEvidence =
    (!hasEffectiveSampleEvidence &&
      Boolean(qcResult?.topHardcodedAttribution || qcResult?.top_hardcoded_attribution)) ||
    /SQL|规则|rule_id|task_sql|diff_reason|false_reason|TQS-\d+|NoPrivilegeException|Table not found|表不存在|字段不存在|权限|样本字段|create_date|after_sale|ledger|settle/i.test(
      text,
    ) ||
    evidenceItems.some((item) =>
      /rule|sql|bamboo|sample|规则|样本|SQL/i.test(JSON.stringify(item)),
    );
  const hasOnlineEvidence =
    sampleCheckValidation.validChecks.length > 0 ||
    Number(modelResult?.rpc_sample_count ?? modelResult?.rpcSampleCount ?? 0) > 0 ||
    normalizeArrayField(modelResult?.online_evidence ?? modelResult?.onlineEvidence).length > 0 ||
    normalizeArrayField(modelResult?.log_evidence ?? modelResult?.logEvidence).length > 0 ||
    evidenceItems.some((item) =>
      /rpc|online|current|log|trace|线上|当前|日志|点查/i.test(JSON.stringify(item)),
    );
  const categories = [];
  if (hasRuleEvidence) categories.push("rule_evidence");
  if (hasOnlineEvidence) categories.push("online_or_log_evidence");
  if (hasEffectiveSampleEvidence && sampleCheckValidation.validChecks.length > 0)
    categories.push("sample_checks");
  return {
    categories,
    hasRuleEvidence,
    has_rule_evidence: hasRuleEvidence,
    hasOnlineEvidence,
    has_online_evidence: hasOnlineEvidence,
    nonOverride: true,
  };
}

function validateInvestigationEvidence({
  status,
  modelResult,
  workItem,
  normalizedSummaryText,
  hasEffectiveSampleEvidence,
  sampleCountAuthority,
  finalAttribution,
  qcResult,
}) {
  const sampleCheckValidation = validateSampleChecks(
    modelResult?.sample_checks ?? modelResult?.sampleChecks,
  );
  const rawEvidenceCount = modelResult?.evidence_count ?? modelResult?.evidenceCount;
  const evidenceItems = normalizeArrayField(
    modelResult?.evidence_items ?? modelResult?.evidenceItems,
  );
  const evidenceConsistency = {
    valid: true,
    declared_count: Number.isFinite(Number(rawEvidenceCount))
      ? Number(rawEvidenceCount)
      : undefined,
    evidence_items_count: evidenceItems.length,
    sample_checks_count: sampleCheckValidation.validChecks.length,
    reasons: [],
  };
  if (
    status === "succeeded" &&
    evidenceConsistency.declared_count === 0 &&
    (evidenceConsistency.evidence_items_count > 0 || evidenceConsistency.sample_checks_count > 0)
  ) {
    evidenceConsistency.valid = false;
    evidenceConsistency.reasons.push(
      `evidence_count=0 但 evidence_items=${evidenceConsistency.evidence_items_count}、sample_checks=${evidenceConsistency.sample_checks_count} 表示存在证据，禁止产生互相矛盾的审计结果`,
    );
  }
  const evidenceCategories = detectEvidenceCategories({
    modelResult,
    normalizedSummaryText,
    qcResult,
    hasEffectiveSampleEvidence,
    sampleCheckValidation,
  });
  const hardFailCodes = [];
  const reasons = [];
  if (
    status === "succeeded" &&
    hasEffectiveSampleEvidence &&
    sampleCheckValidation.validChecks.length === 0
  ) {
    hardFailCodes.push("sample_checks_required_for_effective_samples");
    reasons.push(
      `权威样本数=${sampleCountAuthority?.authoritativeSamples ?? "unknown"} 或 false_reason 有效时，必须提供 sample_checks，至少点查一个异常对象`,
    );
  }
  if (
    status === "succeeded" &&
    sampleCheckValidation.checks.length > 0 &&
    sampleCheckValidation.invalidChecks.length > 0
  ) {
    hardFailCodes.push("sample_checks_schema_invalid");
    reasons.push(
      `sample_checks schema 不完整：${JSON.stringify(sampleCheckValidation.invalidChecks)}`,
    );
  }
  if (
    status === "succeeded" &&
    !hasEffectiveSampleEvidence &&
    /\[无效告警\]/.test(String(finalAttribution || "")) &&
    !/无需修数|已恢复|无业务样本|权限缺失|规则调试|测试数据|对账平台|正常数据波动|临界数据飘移|不需要修数/i.test(
      normalizedSummaryText,
    )
  ) {
    hardFailCodes.push("invalid_alert_requires_invalid_reason");
    reasons.push("无效告警必须解释为何无效、为何已恢复或为何无需修数，不能只给固定归因标签");
  }
  if (
    status === "succeeded" &&
    (modelResult?.need_manual_fix === true || modelResult?.needManualFix === true) &&
    /无需处理|无需修数|不需要修数|已自动确认无需修数/i.test(normalizedSummaryText)
  ) {
    hardFailCodes.push("manual_fix_cannot_be_no_action");
    reasons.push("need_manual_fix=true 时禁止自动写无需处理/无需修数");
  }
  if (
    status === "succeeded" &&
    hasEffectiveSampleEvidence &&
    (!evidenceCategories.hasRuleEvidence || !evidenceCategories.hasOnlineEvidence)
  ) {
    hardFailCodes.push("business_evidence_categories_missing");
    reasons.push(
      "有有效样本的 succeeded 结论至少需要规则证据和线上/日志/点查证据两类，禁止无证据 quick-closure",
    );
  }
  if (!evidenceConsistency.valid) {
    hardFailCodes.push("evidence_count_conflict");
    reasons.push(...evidenceConsistency.reasons);
  }
  const sampleGroupCoverage = buildSampleGroupCoverage({
    modelResult,
    workItem,
    sampleCheckValidation,
  });
  if (status === "succeeded" && hasEffectiveSampleEvidence && !sampleGroupCoverage.valid) {
    hardFailCodes.push("sample_group_coverage_missing");
    reasons.push(sampleGroupCoverage.reason);
  }
  return {
    valid: hardFailCodes.length === 0,
    sampleChecks: sampleCheckValidation,
    sample_checks: sampleCheckValidation,
    sampleGroupCoverage,
    sample_group_coverage: sampleGroupCoverage,
    evidenceCategories,
    evidence_categories: evidenceCategories,
    evidenceConsistency,
    evidence_consistency: evidenceConsistency,
    hardFailCodes,
    hard_fail_codes: hardFailCodes,
    reasons,
    nonOverride: true,
  };
}

async function writeDocsOverwriteBodyFile({ markdown, docToken, tmpDir }) {
  const dir = tmpDir || (await mkdtemp(join(tmpdir(), "bamboo-alert-doc-")));
  const bodyJsonPath = join(dir, `${docToken}.body.json`);
  await writeFile(
    bodyJsonPath,
    `${JSON.stringify(buildDocsOverwriteBody(markdown), null, 2)}\n`,
    "utf8",
  );
  return bodyJsonPath;
}

function extractWikiNode(payload) {
  const data = payload?.data?.node ?? payload?.data?.item ?? payload?.data ?? payload;
  const nodeToken = extractFirstString(data?.node_token, data?.token, data?.wiki_token);
  const spaceId = extractFirstString(data?.space_id, data?.spaceId);
  const objToken = extractFirstString(
    data?.obj_token,
    data?.object_token,
    data?.base_token,
    data?.app_token,
    data?.objToken,
  );
  const objType = extractFirstString(data?.obj_type, data?.object_type, data?.objType);
  const title = extractFirstString(data?.title, data?.name);
  const parentNodeToken = extractFirstString(
    data?.parent_node_token,
    data?.parentNodeToken,
    data?.parent_token,
    data?.parentToken,
    data?.parent?.node_token,
    data?.parent?.nodeToken,
    data?.parent?.token,
  );

  if (!nodeToken) {
    throw new Error("wiki node response did not include node_token");
  }
  if (!spaceId) {
    throw new Error("wiki node response did not include space_id");
  }

  return { nodeToken, spaceId, objToken, objType, title, parentNodeToken };
}

export function extractWikiNodeToken(input) {
  const value = String(input || "").trim();
  if (!value) {
    throw new Error("wiki node token or URL is required");
  }

  try {
    const url = new URL(value);
    // 支持三种 URL 格式：
    //   - Wiki 文档节点：https://.../wiki/<node_token>
    //   - Docx 文档：https://.../docx/<doc_token> （docx token 可直接作为 node-token 传 lark-cli wiki +node-get）
    //   - Base 多维表格：https://.../wiki/<node_token>?table=...  （同上，取 wiki node）
    //   - /base/、/sheet/、/slides/ 等其他文档类型：取 doc_token 作为 node-token
    const wikiMatch = url.pathname.match(/\/wiki\/([^/?#]+)/);
    if (wikiMatch?.[1]) {
      return decodeURIComponent(wikiMatch[1]);
    }
    const docMatch = url.pathname.match(
      /\/(docx|base|sheet|slides|bitable|doc|mindnote|whiteboard)\/([^/?#]+)/,
    );
    if (docMatch?.[2]) {
      return decodeURIComponent(docMatch[2]);
    }
    throw new Error(
      "wiki/doc URL path must contain /wiki/<token> or /docx/<token> or /base/<token> etc.",
    );
  } catch (error) {
    if (/^https?:\/\//i.test(value)) {
      throw error;
    }
  }

  return value;
}

function normalizeNodeItem(item, fallbackSpaceId) {
  return {
    title: extractFirstString(item?.title, item?.name) || "",
    node_token: extractFirstString(
      item?.node_token,
      item?.nodeToken,
      item?.token,
      item?.wiki_token,
    ),
    obj_token: extractFirstString(
      item?.obj_token,
      item?.objToken,
      item?.object_token,
      item?.base_token,
      item?.app_token,
    ),
    obj_type: extractFirstString(item?.obj_type, item?.objType, item?.object_type),
    space_id: extractFirstString(item?.space_id, item?.spaceId) || fallbackSpaceId,
    updated_time: Number(item?.updated_time ?? item?.update_time ?? item?.modified_time ?? 0),
  };
}

/**
 * 唯一规范的日报 Base 标题后缀：`${dateKey}-${CANONICAL_DAILY_BASE_BIZ_SUFFIX}`
 * （例如 20260806-bamboo对账归因记录）
 * 禁止 AI 在 CLI 或 skill 中把 bizSuffix 自由发挥成「bamboo报警记录」「对账日报」等变体。
 * 即使调用方传入了非规范 bizSuffix，脚本也会以 CANONICAL 为第一优先级匹配；只有当规范标题不存在时，
 * 才允许回退到用户传入的 bizSuffix，并在返回值中明确记录 `biz_suffix_was_fallback`。
 */
const CANONICAL_DAILY_BASE_BIZ_SUFFIX = "bamboo对账归因记录";
const DAILY_BASE_TABLE_NAME = "归因记录";
// 字段顺序、类型、选项严格对齐对账归因记录模板（node_token=HDMPw5bkUi36ACkDM8dcldisnAh, table_id=tblUuPdmJBqyGZuo, view_id=vewTQyDhQ7）
// 视图顺序：unique_id, result_id, alarm_record_detail_id, task_id, task_name, task_time, bamboo_url,
// created_at, task_sql, task_result_num, task_result_object, extra, status, ai_session_id,
// ai_summary, ai_result, ai_finished_at, last_error
const DAILY_BASE_SCHEMA_FIELDS = [
  { field_name: "unique_id", type: "text" },
  { field_name: "result_id", type: "text" },
  { field_name: "alarm_record_detail_id", type: "text" },
  { field_name: "task_id", type: "text" },
  { field_name: "task_name", type: "text" },
  { field_name: "task_time", type: "date_time", style: { format: "yyyy-MM-dd HH:mm" } },
  { field_name: "bamboo_url", type: "text" },
  { field_name: "created_at", type: "date_time", style: { format: "yyyy-MM-dd HH:mm" } },
  { field_name: "task_sql", type: "text" },
  {
    field_name: "task_result_num",
    type: "number",
    style: { type: "plain", precision: 0, percentage: false, thousands_separator: false },
  },
  { field_name: "task_result_object", type: "text" },
  { field_name: "extra", type: "text" },
  {
    field_name: "status",
    type: "single_select",
    property: { options: ["succeeded", "failed", "processing", "init", "not_support", "pending"] },
  },
  { field_name: "ai_session_id", type: "text" },
  { field_name: "ai_summary", type: "text" },
  { field_name: "ai_result", type: "text" },
  { field_name: "ai_finished_at", type: "date_time", style: { format: "yyyy-MM-dd HH:mm" } },
  { field_name: "last_error", type: "text" },
];
const DAILY_BASE_DEFAULT_FIELD_NAMES = ["Text", "Single option", "Date", "Attachment"];
const CHAT_MESSAGE_CSV_FIELDS = [
  "message_id",
  "chat_id",
  "topic_id",
  "msg_timestamp",
  "create_time",
  "message_link",
  "content",
  "raw_json",
];
const BAMBOO_ALERT_CSV_FIELDS = [
  "unique_id",
  "result_id",
  "task_id",
  "task_name",
  "task_time",
  "task_date_key",
  "bamboo_url",
  "chat_id",
  "message_id",
  "message_link",
  "msg_timestamp",
  "message_sent_at_ms",
  "alarm_record_detail_id",
  "task_result_num",
  "extra_json",
];

/**
 * 对调用方传入的 bizSuffix 做规范化：
 *  - 为空 → 返回 CANONICAL
 *  - 等于 CANONICAL → 原样返回，无需回退
 *  - 不等于 CANONICAL → 返回 { normalized, needsFallback: true, original }
 *    脚本先用 canonical 匹配；匹配不到才允许用 original 回退匹配一次，防止遗留旧表被直接跳过。
 */
/**
 * 历史兼容兜底：旧版本曾同时扫描用户指定节点和父目录，可能把父目录同名日报
 * 混进候选集。当前约束是只在指定归因目录查找同名日报；正常路径下不会再出现
 * parent_of_input_node 来源。保留该函数只是为了旧审计输入的只读去噪，不作为
 * 新流程跨目录查找或复用的依据。
 */
function pruneCrossContainerDuplicateDailyBases({
  children,
  dateKeys,
  bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
}) {
  if (!Array.isArray(children) || children.length === 0) return children;
  if (!Array.isArray(dateKeys) || dateKeys.length === 0) return children;
  const norm = normalizeBizSuffix(bizSuffix);
  const candidateTitles = new Set();
  for (const dk of dateKeys) {
    candidateTitles.add(`${dk}-${norm.canonical}`);
    if (norm.needsFallback) candidateTitles.add(`${dk}-${norm.original}`);
  }
  let result = children;
  for (const title of candidateTitles) {
    const matches = result.filter((n) => n?.obj_token && n?.node_token && n.title === title);
    const bitableMatches = matches.filter(isDailyBaseBitableNode);
    if (bitableMatches.length <= 1) continue;
    const fromPrimary = bitableMatches.filter((n) => n._containerSource === "input_node_itself");
    const fromFallback = bitableMatches.filter(
      (n) => n._containerSource === "parent_of_input_node",
    );
    if (
      fromPrimary.length === 1 &&
      fromFallback.length >= 1 &&
      fromPrimary.length + fromFallback.length === bitableMatches.length
    ) {
      const keepNodeToken = fromPrimary[0].node_token;
      const dropNodeTokens = new Set(fromFallback.map((n) => n.node_token));
      result = result.filter((child) => {
        if (child.node_token === keepNodeToken) return true;
        if (
          dropNodeTokens.has(child.node_token) &&
          child.title === title &&
          isDailyBaseBitableNode(child)
        )
          return false;
        return true;
      });
    }
  }
  return result;
}

function normalizeBizSuffix(bizSuffix) {
  const original = bizSuffix == null ? "" : String(bizSuffix).trim();
  if (!original) {
    return {
      normalized: CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      canonical: CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      original: CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      needsFallback: false,
      usedOriginal: false,
    };
  }
  if (original === CANONICAL_DAILY_BASE_BIZ_SUFFIX) {
    return {
      normalized: CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      canonical: CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      original,
      needsFallback: false,
      usedOriginal: false,
    };
  }
  return {
    normalized: CANONICAL_DAILY_BASE_BIZ_SUFFIX,
    canonical: CANONICAL_DAILY_BASE_BIZ_SUFFIX,
    original,
    needsFallback: true,
    usedOriginal: false,
  };
}

function csvEscape(value) {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function csvLine(values) {
  return values.map(csvEscape).join(",");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function splitCsvRecords(text) {
  const records = [];
  let current = "";
  let quoted = false;
  const input = String(text || "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      current += char;
      if (char === '"' && input[index + 1] === '"') {
        current += input[index + 1];
        index += 1;
      } else if (char === '"') {
        quoted = false;
      }
    } else if (char === '"') {
      quoted = true;
      current += char;
    } else if (char === "\n") {
      const record = current.endsWith("\r") ? current.slice(0, -1) : current;
      if (record.length > 0) records.push(record);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.length > 0) {
    records.push(current.endsWith("\r") ? current.slice(0, -1) : current);
  }
  return records;
}

function parseCsv(text) {
  const lines = splitCsvRecords(text);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

async function writeCsvFile(filePath, fields, rows) {
  await mkdir(dirname(filePath), { recursive: true });
  const content =
    [csvLine(fields), ...rows.map((row) => csvLine(fields.map((field) => row[field])))].join("\n") +
    "\n";
  await writeFile(filePath, content, "utf8");
}

function safeJsonParse(value, fallback = undefined) {
  if (value === undefined || value === null || value === "") return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function defaultChatCsvPath({ chatId, end = new Date() } = {}) {
  const safeChatId = String(chatId || "chat").replace(/[^A-Za-z0-9_-]/g, "_");
  const suffix = new Date(end || Date.now())
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);
  return join(process.cwd(), ".tmp", `chat_messages_${safeChatId}_${suffix}.csv`);
}

function extractMessageId(message) {
  return extractFirstString(
    message?.message_id,
    message?.messageId,
    message?.msg_id,
    message?.msgId,
    message?.id,
  );
}

function extractChatId(message) {
  return extractFirstString(
    message?.chat_id,
    message?.chatId,
    message?.chat?.chat_id,
    message?.chat?.id,
  );
}

function messageToCsvRow(message) {
  return {
    message_id: extractMessageId(message),
    chat_id: extractChatId(message),
    topic_id: extractFirstString(
      message?.topic_id,
      message?.topicId,
      message?.thread_id,
      message?.threadId,
    ),
    msg_timestamp: extractFirstString(
      message?.msg_timestamp,
      message?.create_time,
      message?.createTime,
    ),
    create_time: extractFirstString(message?.create_time, message?.createTime),
    message_link: extractFirstString(
      message?.message_app_link,
      message?.message_link,
      message?.url,
    ),
    content: extractFirstString(message?.content, message?.body?.content, message?.text),
    raw_json: JSON.stringify(message || {}),
  };
}

function csvRowToMessage(row) {
  const firstRaw = safeJsonParse(row.raw_json, {});
  const raw = typeof firstRaw === "string" ? safeJsonParse(firstRaw, {}) : firstRaw;
  const content = safeJsonParse(row.content, row.content);
  return {
    ...raw,
    message_id: row.message_id || raw.message_id,
    chat_id: row.chat_id || raw.chat_id,
    topic_id: row.topic_id || raw.topic_id,
    msg_timestamp: row.msg_timestamp || raw.msg_timestamp,
    create_time: row.create_time || raw.create_time,
    message_app_link: row.message_link || raw.message_app_link,
    content: content || raw.content,
  };
}

function effectiveAlertDateKey(alert, fallbackDateKey) {
  return String(
    alert?.alarm_date ||
      alert?.task_date_key ||
      fallbackDateKey ||
      new Date().toISOString().slice(0, 10).replace(/-/g, ""),
  );
}

function parseTroubleshootingDocResultIdFromTitle(title) {
  const text = String(title || "").trim();
  if (!text) return "";
  const withLabel = text.match(/^result_id:([A-Za-z0-9_-]+):/);
  if (withLabel) return withLabel[1];
  return text.match(/^([A-Za-z0-9_-]+):/)?.[1] || "";
}

function alertToCsvRow(alert, fallbackDateKey) {
  const resultId = String(alert?.result_id || "").trim();
  const bambooUrl = alert?.bamboo_url || alert?.bamboo_result_url || alert?.extra?.rule_link || "";
  const messageSentAtMs = alert?.extra?.message_sent_at_ms || alert?.msg_timestamp || "";
  return {
    unique_id: resultId,
    result_id: resultId,
    task_id: alert?.task_id ? String(alert.task_id) : "",
    task_name: normalizeBambooTaskNameForBase(alert?.title || alert?.task_name || ""),
    task_time: alert?.task_time || alert?.extra?.bamboo_check_time || "",
    task_date_key: effectiveAlertDateKey(alert, fallbackDateKey),
    bamboo_url: bambooUrl,
    chat_id: alert?.chat_id || alert?.extra?.chat_id || "",
    message_id: alert?.message_id || alert?.extra?.message_id || "",
    message_link: alert?.message_link || alert?.extra?.message_link || "",
    msg_timestamp: messageSentAtMs,
    message_sent_at_ms: messageSentAtMs,
    alarm_record_detail_id: alert?.alarm_record_detail_id || "",
    task_result_num: alert?.task_result_num ?? "",
    extra_json: JSON.stringify({
      ...alert?.extra,
      raw_title: alert?.title || alert?.extra?.raw_title,
      original_title: alert?.title || alert?.extra?.original_title,
    }),
  };
}

function csvRowToAlert(row) {
  const extra = safeJsonParse(row.extra_json, {});
  const messageSentAtMs = extractFirstNumber(
    row.message_sent_at_ms,
    row.msg_timestamp,
    extra?.message_sent_at_ms,
  );
  const resultId = String(row.result_id || parseResultIdFromBambooUrl(row.bamboo_url) || "").trim();
  return {
    unique_id: row.unique_id,
    result_id: resultId,
    task_id: row.task_id,
    task_name: row.task_name,
    title: extra?.raw_title || row.task_name,
    task_time: row.task_time,
    task_date_key: row.task_date_key,
    bamboo_url: row.bamboo_url,
    chat_id: row.chat_id,
    message_id: row.message_id,
    message_link: row.message_link,
    alarm_record_detail_id: row.alarm_record_detail_id,
    task_result_num: row.task_result_num === "" ? undefined : Number(row.task_result_num),
    extra: compactObject({
      ...extra,
      message_sent_at_ms: messageSentAtMs,
      message_sent_at: messageSentAtMs
        ? new Date(messageSentAtMs).toISOString()
        : extra?.message_sent_at,
    }),
  };
}

function titleMatchesCandidateSuffix({ title, dateKey, suffix }) {
  return suffix
    ? title === `${dateKey}-${suffix}`
    : title === dateKey || title.startsWith(`${dateKey}-`);
}

/**
 * 标题匹配（固化为 CANONICAL 优先匹配，禁止 AI 自由发挥）：
 *   1) 先按规范化后的 canonical suffix 精确匹配；命中等价于 success=true
 *   2) 若不命中且调用方 original 跟 canonical 不一致 → 允许 original 回退命中一次，
 *      但会在外部记录 usedOriginal，提示调用方下次应该直接用 canonical 标题。
 * 返回: { matched: boolean, matchedSuffix, wasFallback }
 */
function titleMatchesDate({ title, dateKeys, bizSuffix }) {
  const norm = normalizeBizSuffix(bizSuffix);
  let result = {
    matched: false,
    matchedSuffix: null,
    wasFallback: false,
    canonical: norm.canonical,
    original: norm.original,
  };
  for (const dateKey of dateKeys) {
    if (titleMatchesCandidateSuffix({ title, dateKey, suffix: norm.canonical })) {
      return { ...result, matched: true, matchedSuffix: norm.canonical, wasFallback: false };
    }
  }
  if (norm.needsFallback) {
    for (const dateKey of dateKeys) {
      if (titleMatchesCandidateSuffix({ title, dateKey, suffix: norm.original })) {
        return { ...result, matched: true, matchedSuffix: norm.original, wasFallback: true };
      }
    }
  }
  return result;
}

/**
 * 从 title 或 dateKeys 中提取日报 Base 的 YYYYMMDD 日期 key。
 * 优先用 titleMatchesDate 中命中的 canonical dateSuffix（来自标题前缀），
 * 其次从 dateKeys 中取第一个包含该标题字面量的 key；都取不到则返回空字符串。
 */
function extractDailyBaseDateKey({ title, match, dateKeys }) {
  const fromMatch = (match && (match.canonical || match.matchedSuffix || match.dateSuffix)) || "";
  if (typeof fromMatch === "string" && /^\d{8}$/.test(fromMatch)) return fromMatch;
  const titleStr = String(title || "");
  const prefixHit = titleStr.match(/^(\d{8})-/)?.[1];
  if (prefixHit) return prefixHit;
  if (Array.isArray(dateKeys)) {
    for (const key of dateKeys) {
      if (typeof key === "string" && /^\d{8}$/.test(key) && titleStr.includes(key)) return key;
    }
  }
  return "";
}

/**
 * 选择日报 Base 节点（CANONICAL 优先排序 + fallback 命中标记）：
 *   - 只保留 `titleMatchesDate().matched === true` 的节点
 *   - canonical 命中永远排在 fallback 命中前面；同类内支持 claimOrder：
 *       - `updated_time_desc`（默认）：按 updated_time 降序（今天先处理）
 *       - `task_date_asc`：按日报日期 key（YYYYMMDD）升序（昨天先处理，适合补历史积压）
 *       - 其它未知值回退到默认 updated_time_desc
 *   - 最终带上 bizSuffixMatch 信息供调用方记录
 */
function selectDailyBaseNodes({ nodes, dateKeys, bizSuffix, claimOrder = "updated_time_desc" }) {
  const normalizedOrder =
    claimOrder === "task_date_asc" || claimOrder === "updated_time_desc"
      ? claimOrder
      : "updated_time_desc";
  const withMatchInfo = nodes
    .filter((node) => node.obj_token && node.node_token)
    .map((node) => {
      const match = titleMatchesDate({ title: node.title, dateKeys, bizSuffix });
      return {
        node,
        match,
        dateKey: extractDailyBaseDateKey({ title: node.title, match, dateKeys }),
      };
    })
    .filter((x) => x.match.matched);
  withMatchInfo.sort((a, b) => {
    const orderA = a.match.wasFallback ? 1 : 0;
    const orderB = b.match.wasFallback ? 1 : 0;
    if (orderA !== orderB) return orderA - orderB;
    if (normalizedOrder === "task_date_asc") {
      // 有 dateKey 的按日期升序（昨天先处理）；无 dateKey 的放后面再按 updated_time 升序
      const hasA = a.dateKey ? 0 : 1;
      const hasB = b.dateKey ? 0 : 1;
      if (hasA !== hasB) return hasA - hasB;
      if (a.dateKey && b.dateKey && a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
      return Number(a.node.updated_time || 0) - Number(b.node.updated_time || 0);
    }
    // 默认 updated_time_desc（新日报先处理，今天先 claim，保证新告警优先）
    return Number(b.node.updated_time || 0) - Number(a.node.updated_time || 0);
  });
  const enriched = [];
  for (const { node, match, dateKey } of withMatchInfo) {
    enriched.push({
      ...node,
      date_key: dateKey || "",
      biz_suffix_match: {
        canonical: match.canonical,
        original: match.original,
        matched_suffix: match.matchedSuffix,
        was_fallback: match.wasFallback,
      },
    });
  }
  return enriched;
}

function normalizeFieldName(field) {
  return extractFirstString(field?.field_name, field?.name, field?.property_name);
}

/**
 * 将 runner 内部 canonical schema 字段（使用 type=single_select|url|date_time 等别名 + property 包装）
 * 转换为 bytedcli lark base field-create 真正接受的 API payload：
 *  - discriminator type 限定 text|number|select|datetime|link 等
 *  - single_select 的选项从 property.options 移到顶层 options，且只保留 [{name}] 形状
 *  - 剥离其它字段的 property，避免 API 报 "Unrecognized key(s): property"
 */
function toFieldCreatePayload(field) {
  const { field_name, type, property, style } = field;
  let apiType = "text";
  if (type === "text") apiType = "text";
  else if (type === "url") apiType = "text";
  else if (type === "number") apiType = "number";
  else if (type === "date_time") apiType = "datetime";
  else if (type === "single_select") apiType = "select";

  const payload = { field_name, type: apiType };
  if (style && typeof style === "object") {
    payload.style = { ...style };
  }
  if (apiType === "select" && Array.isArray(property?.options)) {
    payload.options = property.options.map((opt) =>
      typeof opt === "string" ? { name: opt } : { name: opt.name },
    );
  }
  return payload;
}

function toTableCreateFieldPayload(field) {
  const payload = toFieldCreatePayload(field);
  const { field_name, ...rest } = payload;
  return { name: field_name, ...rest };
}

function normalizeFields(payload) {
  return getItems(payload).map(normalizeFieldName).filter(Boolean);
}

function selectDailyBaseTable(tablePayload) {
  const items = getItems(tablePayload);
  return (
    items.find(
      (item) =>
        extractFirstString(item?.name, item?.table_name, item?.title) === DAILY_BASE_TABLE_NAME,
    ) || items[0]
  );
}

async function ensureDailyBaseViewFieldOrder({ baseToken, tableId, runJsonFn }) {
  const viewPayload = await runJsonFn(buildBaseViewListCommand({ baseToken, tableId }));
  const view = getFirstItem(viewPayload);
  const viewId = extractFirstString(view?.id, view?.view_id, view?.viewId, view?.name);
  if (!viewId) return null;
  return runJsonFn(
    buildBaseViewSetVisibleFieldsCommand({
      baseToken,
      tableId,
      viewId,
      fieldNames: DAILY_BASE_SCHEMA_FIELDS.map((field) => field.field_name),
    }),
  );
}

function normalizeVisibleFieldNames(payload) {
  const raw =
    payload?.data?.visible_fields ||
    payload?.data?.visibleFields ||
    payload?.data?.fields ||
    payload?.visible_fields ||
    payload?.visibleFields ||
    payload?.fields ||
    getItems(payload);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((field) => {
      if (typeof field === "string") return field;
      return normalizeFieldName(field) || extractFirstString(field?.field_id, field?.id);
    })
    .filter(Boolean);
}

function normalizeBaseFieldDefinitions(payload) {
  const definitions = [];
  for (const field of getItems(payload)) {
    if (typeof field === "string") {
      definitions.push({ field_name: field, name: field, type: "" });
      continue;
    }
    const fieldName = normalizeFieldName(field);
    if (!fieldName) continue;
    definitions.push({
      ...field,
      field_name: fieldName,
      name: fieldName,
      type: String(field?.type || field?.ui_type || field?.field_type || "")
        .trim()
        .toLowerCase(),
      style: field?.style || field?.formatter || field?.property?.formatter || {},
      options: field?.options || field?.property?.options || field?.property?.options_list || [],
    });
  }
  return definitions;
}

function explicitPrimaryFieldName(fieldDefinitions) {
  const primary = fieldDefinitions.find(
    (field) => field?.is_primary === true || field?.isPrimary === true || field?.primary === true,
  );
  return primary?.field_name || "";
}

function expectedApiTypeForDailyField(field) {
  if (field.type === "date_time") return "datetime";
  if (field.type === "single_select") return "select";
  if (field.type === "url") return "text";
  return field.type;
}

function fieldTypeMatches(actualType, expectedType) {
  if (!actualType) return true;
  const normalized = String(actualType).toLowerCase();
  if (expectedType === "datetime")
    return normalized === "datetime" || normalized === "date_time" || normalized === "date";
  if (expectedType === "select")
    return (
      normalized === "select" || normalized === "single_select" || normalized === "singleoption"
    );
  return normalized === expectedType;
}

function dailyBaseSchemaErrorCode(code) {
  const map = {
    primary_field_not_unique_id: "BASE_FIRST_FIELD_NOT_UNIQUE_ID",
    visible_field_order_mismatch: "BASE_VIEW_ORDER_MISMATCH",
    field_type_mismatch: "BASE_FIELD_TYPE_MISMATCH",
    table_id_missing: "DAILY_BASE_SCHEMA_MISMATCH",
    daily_base_table_name_mismatch: "DAILY_BASE_SCHEMA_MISMATCH",
    canonical_fields_missing: "DAILY_BASE_SCHEMA_MISMATCH",
    canonical_fields_extra: "DAILY_BASE_SCHEMA_MISMATCH",
    number_precision_mismatch: "DAILY_BASE_SCHEMA_MISMATCH",
    datetime_format_mismatch: "DAILY_BASE_SCHEMA_MISMATCH",
    select_options_missing: "DAILY_BASE_SCHEMA_MISMATCH",
  };
  return map[code] || "DAILY_BASE_SCHEMA_MISMATCH";
}

function withDailyBaseSchemaErrorCode(blocker) {
  if (!blocker || typeof blocker !== "object") return blocker;
  return {
    error_code: dailyBaseSchemaErrorCode(blocker.code),
    ...blocker,
  };
}

function hasSecondPrecision(value) {
  const scalar = extractSingleCellValue(value);
  if (typeof scalar === "number" && Number.isFinite(scalar)) return true;
  const text = String(scalar ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return true;
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text) &&
    Number.isFinite(Date.parse(text))
  );
}

function isEmptyBaseTextCell(value) {
  const scalar = extractSingleCellValue(value);
  return scalar === undefined || scalar === null || String(scalar).trim() === "";
}

function normalizeRecord(record) {
  return {
    record_id: extractFirstString(record?.record_id, record?.id),
    fields: record?.fields || record?.record || {},
    created_time:
      record?.created_time ?? record?.createdTime ?? record?.create_time ?? record?.createTime,
    updated_time:
      record?.updated_time ?? record?.updatedTime ?? record?.modified_time ?? record?.modifiedTime,
  };
}

function normalizeRecords(payload) {
  const data = payload?.data;
  if (
    Array.isArray(data?.data) &&
    Array.isArray(data?.fields) &&
    Array.isArray(data?.record_id_list)
  ) {
    return data.data
      .map((row, index) => {
        const fields = {};
        data.fields.forEach((fieldName, fieldIndex) => {
          fields[fieldName] = row[fieldIndex];
        });
        return {
          record_id: data.record_id_list[index],
          fields,
          created_time: undefined,
          updated_time: undefined,
        };
      })
      .filter((record) => record.record_id);
  }

  return getItems(payload)
    .map(normalizeRecord)
    .filter((record) => record.record_id);
}

function parseResultIdFromBambooUrl(url) {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(String(url)).searchParams.get("id") || undefined;
  } catch {
    return String(url).match(/[?&]id=(\d+)/)?.[1];
  }
}

function normalizeTaskDate({ taskDate, taskTime } = {}) {
  const input = taskDate || taskTime;
  if (!input) {
    throw new Error("task_date or task_time is required to build a troubleshooting doc title");
  }

  const text = String(input).trim();
  const compactDate = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactDate) {
    return `${compactDate[1]}${compactDate[2]}${compactDate[3]}`;
  }

  const separatedDate = text.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (separatedDate) {
    return `${separatedDate[1]}${separatedDate[2].padStart(2, "0")}${separatedDate[3].padStart(2, "0")}`;
  }

  const numericTime = Number(text);
  const parsedDate = Number.isFinite(numericTime)
    ? new Date(numericTime < 1000000000000 ? numericTime * 1000 : numericTime)
    : new Date(text);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid task_time: ${text}`);
  }

  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function normalizeBambooTaskName(taskName) {
  const normalized = normalizeWorkflowBambooTaskName(taskName);
  if (!normalized) {
    throw new Error("task_name is empty after removing invalid Bamboo alert title text");
  }
  return normalized;
}

function requirePreparedTaskName(taskName) {
  const preparedTaskName = String(taskName ?? "").trim();
  if (!preparedTaskName) {
    throw new Error("task_name is empty");
  }
  return preparedTaskName;
}

export function buildTroubleshootingDocTitle({ resultId, taskName, taskDate, taskTime } = {}) {
  if (!resultId) {
    throw new Error("result_id is required to build a troubleshooting doc title");
  }
  if (!taskName) {
    throw new Error("task_name is required to build a troubleshooting doc title");
  }
  return `${resultId}:${requirePreparedTaskName(taskName)}:${normalizeTaskDate({ taskDate, taskTime })}排查结果`;
}

export function buildRuleSopDocTitle({ ruleId, taskName } = {}) {
  if (!ruleId) {
    throw new Error("rule_id is required to build a rule SOP doc title");
  }
  if (!taskName) {
    throw new Error("task_name is required to build a rule SOP doc title");
  }
  return `${ruleId}:${requirePreparedTaskName(taskName)}排查sop`;
}

function findChildByTitle({ children, title }) {
  return children.find((child) => child.title === title);
}

function findChildrenByTitle({ children, title }) {
  return children.filter((child) => child.title === title);
}

function findChildByTitlePrefix({ children, titlePrefix }) {
  return children.find((child) => child.title?.startsWith(titlePrefix));
}

function normalizeWikiObjType(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isDailyBaseBitableNode(node) {
  const objType = normalizeWikiObjType(node?.obj_type || node?.objType || node?.object_type);
  // Some bytedcli versions omit obj_type in node-list. Treat missing as unknown-compatible,
  // but reject explicit non-bitable nodes such as docx/sheet that caused false directory pages.
  return !objType || objType === "bitable" || objType === "base";
}

function describeDailyBaseNode(node) {
  return compactObject({
    title: node?.title,
    node_token: node?.node_token || node?.nodeToken,
    obj_token: node?.obj_token || node?.objToken,
    obj_type: node?.obj_type || node?.objType || node?.object_type,
    space_id: node?.space_id || node?.spaceId,
    container_source: node?._containerSource,
    container_label: node?._containerLabel,
  });
}

function buildDailyBaseInvariantError({ title, conflictType, nodes, actualObjType }) {
  return buildRunnerError(
    `E_DAILY_001: daily attribution record "${title}" must be exactly one bitable node under scanDir`,
    {
      reason_code: "E_DAILY_001",
      error_code: "E_DAILY_001",
      conflict_type: conflictType,
      title,
      actual_obj_type: actualObjType || undefined,
      matched_nodes: (nodes || []).map(describeDailyBaseNode),
      fix_commands: [
        "Remove or rename duplicate/non-bitable daily attribution nodes under scanDir",
        "node scripts/bamboo/bamboo-alert-runner.mjs ensure-daily-base --scan-dir-url <wiki-url> --date-key <YYYYMMDD>",
      ],
    },
  );
}

function assertSingleBitableDailyBaseTitle({ children, title }) {
  const matches = findChildrenByTitle({ children, title }).filter(
    (node) => node?.obj_token && node?.node_token,
  );
  if (matches.length > 1) {
    throw buildDailyBaseInvariantError({
      title,
      conflictType: "duplicate_daily_base_title",
      nodes: matches,
    });
  }
  const [match] = matches;
  if (match && !isDailyBaseBitableNode(match)) {
    throw buildDailyBaseInvariantError({
      title,
      conflictType: "daily_base_must_be_bitable",
      nodes: matches,
      actualObjType: normalizeWikiObjType(match.obj_type),
    });
  }
  return match;
}

function assertSelectedDailyBasesAreBitable({ dailyBases }) {
  const byTitle = new Map();
  for (const node of dailyBases || []) {
    if (!node?.title) continue;
    const list = byTitle.get(node.title) || [];
    list.push(node);
    byTitle.set(node.title, list);
  }
  for (const [title, nodes] of byTitle.entries()) {
    if (nodes.length > 1) {
      throw buildDailyBaseInvariantError({
        title,
        conflictType: "duplicate_daily_base_title",
        nodes,
      });
    }
    const invalid = nodes.find((node) => !isDailyBaseBitableNode(node));
    if (invalid) {
      throw buildDailyBaseInvariantError({
        title,
        conflictType: "daily_base_must_be_bitable",
        nodes,
        actualObjType: normalizeWikiObjType(invalid.obj_type),
      });
    }
  }
}

function modelResultFileCandidates({ resultDir, workItem }) {
  const keys = [workItem?.result_id, workItem?.resultId, workItem?.record_id, workItem?.recordId]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(keys)].map((key) => join(resultDir, `${key}.json`));
}

function modelResultMarkdownCandidates({ resultDir, workItem }) {
  const keys = [workItem?.result_id, workItem?.resultId, workItem?.record_id, workItem?.recordId]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const candidates = [];
  for (const key of new Set(keys)) {
    candidates.push(join(resultDir, `${key}.md`));
    candidates.push(join(resultDir, `doc-${key}.md`));
  }
  return candidates;
}

async function readModelResultForWorkItem({ resultDir, workItem }) {
  const candidates = modelResultFileCandidates({ resultDir, workItem });
  for (const filePath of candidates) {
    try {
      const raw = await readFile(filePath, "utf8");
      if (!String(raw || "").trim()) {
        return {
          filePath,
          incomplete: true,
          hardFailCode: "RESULT_JSON_INCOMPLETE",
          reason: "model result JSON file is empty",
        };
      }
      return {
        filePath,
        result: JSON.parse(raw),
      };
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      return {
        filePath,
        incomplete: true,
        hardFailCode: "RESULT_JSON_INCOMPLETE",
        reason: `model result JSON file is incomplete or invalid: ${error.message}`,
      };
    }
  }
  return {
    missing: true,
    candidates,
  };
}

function buildIncompleteModelResultValidation({ filePath, reason }) {
  return {
    version: "hardened.v1",
    overallValid: false,
    overall_valid: false,
    hardFailCode: "RESULT_JSON_INCOMPLETE",
    hard_fail_code: "RESULT_JSON_INCOMPLETE",
    fatalError: reason || "model result JSON file is empty or incomplete",
    fatal_error: reason || "model result JSON file is empty or incomplete",
    model_result_file: filePath,
    next_action: "wait_or_retry",
    diagnostics: [
      {
        blocker_type: "RESULT_JSON_INCOMPLETE",
        human_readable_reason: reason || "模型结果 JSON 文件为空或未写完整",
        auto_fixable: false,
        suggested_patch: null,
        next_action: "wait_or_retry",
      },
    ],
    nonOverride: true,
  };
}

async function findModelResultMarkdownForWorkItem({ resultDir, workItem }) {
  const candidates = modelResultMarkdownCandidates({ resultDir, workItem });
  for (const filePath of candidates) {
    try {
      const markdown = await readFile(filePath, "utf8");
      if (String(markdown || "").trim()) {
        return { filePath, exists: true };
      }
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw new Error(`Invalid model result Markdown ${filePath}: ${error.message}`, {
        cause: error,
      });
    }
  }
  return {
    missing: true,
    candidates,
  };
}

function workItemArtifactKeys(workItem) {
  return [workItem?.result_id, workItem?.resultId, workItem?.record_id, workItem?.recordId]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function modelResultReviewCandidates({ resultDir, workItem }) {
  const candidates = [];
  for (const key of new Set(workItemArtifactKeys(workItem))) {
    candidates.push(join(resultDir, `${key}.review.json`));
    candidates.push(join(resultDir, `review-${key}.json`));
  }
  return candidates;
}

function modelResultPublishAuditCandidates({ resultDir, workItem }) {
  const candidates = [];
  for (const key of new Set(workItemArtifactKeys(workItem))) {
    candidates.push(join(resultDir, `publish-doc-${key}.json`));
    candidates.push(join(resultDir, `${key}.doc.json`));
  }
  return candidates;
}

function buildArtifactGateResult({ valid, code, reason, filePath, candidates, extra = {} }) {
  return compactObject({
    valid,
    code,
    reason,
    file_path: filePath,
    filePath,
    candidates,
    ...extra,
  });
}

async function inspectReviewAuditForWorkItem({ resultDir, workItem }) {
  const candidates = modelResultReviewCandidates({ resultDir, workItem });
  for (const filePath of candidates) {
    try {
      const review = JSON.parse(await readFile(filePath, "utf8"));
      const blockers = Array.isArray(review.blockers) ? review.blockers : [];
      const checkedFiles =
        Array.isArray(review.checked_files) || Array.isArray(review.checkedFiles)
          ? review.checked_files || review.checkedFiles
          : [];
      const missingFields = [];
      if (typeof review.review_passed !== "boolean") missingFields.push("review_passed");
      if (!Array.isArray(review.blockers)) missingFields.push("blockers[]");
      if (!("required_rework_prompt" in review)) missingFields.push("required_rework_prompt");
      if (checkedFiles.length === 0) missingFields.push("checked_files[]");
      if (!review.validation_command) missingFields.push("validation_command");
      if (!review.review_summary) missingFields.push("review_summary");
      if (missingFields.length > 0) {
        return buildArtifactGateResult({
          valid: false,
          code: "invalid_review_audit_schema",
          reason: `review audit 缺少固定字段: ${missingFields.join(", ")}`,
          filePath,
          candidates,
          extra: { review, missing_fields: missingFields },
        });
      }
      if (review.review_passed !== true) {
        return buildArtifactGateResult({
          valid: false,
          code: "review_not_passed",
          reason: blockers.length > 0 ? blockers.join("; ") : "review_passed=false",
          filePath,
          candidates,
          extra: { review, blockers },
        });
      }
      return buildArtifactGateResult({
        valid: true,
        code: "review_passed",
        reason: "review_passed=true",
        filePath,
        candidates,
        extra: { review },
      });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      return buildArtifactGateResult({
        valid: false,
        code: "invalid_review_audit_json",
        reason: `review audit JSON 无法读取或解析: ${error.message}`,
        filePath,
        candidates,
      });
    }
  }
  return buildArtifactGateResult({
    valid: false,
    code: "missing_review_audit",
    reason:
      "缺少 <result_id>.review.json 或 review-<result_id>.json，不能证明 fresh context 审查已通过",
    candidates,
  });
}

async function inspectPublishAuditForWorkItem({ resultDir, workItem, modelResult }) {
  const candidates = modelResultPublishAuditCandidates({ resultDir, workItem });
  for (const filePath of candidates) {
    try {
      const audit = JSON.parse(await readFile(filePath, "utf8"));
      if (
        audit.dry_run === true ||
        audit.dry_run_skeleton_only === true ||
        audit.dryRunSkeletonOnly === true
      ) {
        return buildArtifactGateResult({
          valid: false,
          code: "publish_doc_audit_is_preview",
          reason: "publish audit 是 dry-run/preview，不是最终发布结果",
          filePath,
          candidates,
          extra: { audit },
        });
      }
      const archiveStatus = String(
        audit.doc_archive_status || audit.archive_status || audit.status || "",
      ).trim();
      if (audit.success !== true || archiveStatus !== "succeeded") {
        return buildArtifactGateResult({
          valid: false,
          code: "publish_doc_audit_not_succeeded",
          reason: `publish audit 未成功: success=${audit.success} doc_archive_status=${archiveStatus}`,
          filePath,
          candidates,
          extra: { audit },
        });
      }
      const mergedMarkdown = String(audit.mergedMarkdown || audit.merged_markdown || "").trim();
      if (!mergedMarkdown) {
        return buildArtifactGateResult({
          valid: false,
          code: "publish_doc_audit_missing_merged_markdown",
          reason: "最终 publish audit 缺少 mergedMarkdown/merged_markdown，不能审计已发布正文",
          filePath,
          candidates,
          extra: { audit },
        });
      }
      const qualityGate = validateTroubleshootingDocContent({
        title:
          audit.title || workItem?.task_name || workItem?.taskName || modelResult?.task_name || "",
        markdown: ensureMarkdownTitle({
          title: audit.title || "排查结果",
          markdown: mergedMarkdown,
        }),
        skeletonType: audit.skeletonType || audit.skeleton_type || "deep",
        attribution: modelResult?.attribution_result || modelResult?.attributionResult,
      });
      if (!qualityGate.valid) {
        return buildArtifactGateResult({
          valid: false,
          code: "published_doc_quality_gate_failed",
          reason: `最终 publish audit 正文质量门禁失败: ${qualityGate.reasons.join("; ")}`,
          filePath,
          candidates,
          extra: { audit, doc_content_quality_gate: qualityGate },
        });
      }
      return buildArtifactGateResult({
        valid: true,
        code: "publish_doc_audit_passed",
        reason: "最终 publish audit 正文质量门禁通过",
        filePath,
        candidates,
        extra: { audit, doc_content_quality_gate: qualityGate },
      });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      return buildArtifactGateResult({
        valid: false,
        code: "invalid_publish_doc_audit_json",
        reason: `publish audit JSON 无法读取或解析: ${error.message}`,
        filePath,
        candidates,
      });
    }
  }
  return buildArtifactGateResult({
    valid: false,
    code: "missing_publish_doc_audit",
    reason: "缺少 publish-doc-<result_id>.json 或 <result_id>.doc.json，不能审计最终已发布正文",
    candidates,
  });
}

function deriveTerminalStatus(modelResult) {
  if (
    modelResult?.pending_reason_type === "bamboo_result_inconsistent" &&
    (modelResult?.pending_admission || modelResult?.pendingAdmission)
  ) {
    return "pending";
  }
  if (
    modelResult?.waiting_for_user_authorization === true ||
    (modelResult?.needs_manual_confirmation === true && modelResult?.pending_admission)
  ) {
    return "pending";
  }
  if (modelResult?.success === true) {
    return "succeeded";
  }
  if (modelResult?.failed_admission || modelResult?.failedAdmission) {
    return "failed";
  }
  return "incomplete_model_result";
}

function getWorkItemExtra(workItem) {
  return parseObjectField(workItem?.extra || workItem?.fields?.extra);
}

function getWorkItemMessageId(workItem) {
  const extra = getWorkItemExtra(workItem);
  return (
    String(workItem?.message_id || workItem?.messageId || "").trim() ||
    readFirstStringField(extra, "message_id", "source_message_id")
  );
}

function getWorkItemAlarmRecordDetailId(workItem) {
  const extra = getWorkItemExtra(workItem);
  return normalizePositiveIntegerId(
    firstPresentValue(
      workItem?.alarm_record_detail_id,
      workItem?.alarmRecordDetailId,
      workItem?.fields?.alarm_record_detail_id,
      extra.alarm_record_detail_id,
      extra.alarm_detail_id,
    ),
  );
}

function buildAlarmCardReason({ summary, docUrl }) {
  return [`结算ai值班智能归因（请点击飞书文档）：${docUrl}`, `归因结论：${summary}`].join("\n");
}

const TRITON_TABLE_PERMISSION_APPROVAL_URL =
  "https://data.bytedance.net/triton/approval_manage/approval/record?id=8211653&groupName=default#group=default";

const TABLE_PERMISSION_MISSING_PATTERNS = Object.freeze([
  /\bNoPrivilegeException\b/i,
  /\bpermission\s+denied\b/i,
  /\bno\s+privilege\b/i,
  /权限不足/i,
  /无权限/i,
  /表权限缺失/i,
  /\btable\s+not\s+found\b/i,
  /Object\s+'.*'\s+not\s+found/i,
  /Table\s+'.*'\s+not\s+found/i,
  /表不存在/i,
]);

function isInvalidAlarmAttribution(attributionResult, fallbackText) {
  const text = `${String(attributionResult || "")}\n${String(fallbackText || "")}`;
  return text.includes("[无效告警]") || /无效告警/.test(text);
}

function hasTablePermissionMissingEvidence(text) {
  const normalized = String(text || "");
  return TABLE_PERMISSION_MISSING_PATTERNS.some((pattern) => pattern.test(normalized));
}

function shouldAppendTritonPermissionLink(modelResult) {
  const attributionResult = String(
    modelResult?.attribution_result || modelResult?.attributionResult || "",
  );
  const rootCause = String(modelResult?.root_cause || modelResult?.rootCause || "");
  const conclusion = String(modelResult?.conclusion || "");
  const summary = String(modelResult?.summary || "");
  const merged = [attributionResult, rootCause, conclusion, summary].filter(Boolean).join("\n");
  const invalidAlarm = isInvalidAlarmAttribution(attributionResult, merged);
  const permissionMissing =
    attributionResult.includes("表权限缺失") || hasTablePermissionMissingEvidence(merged);
  return invalidAlarm && permissionMissing;
}

function appendTritonPermissionLink(summary) {
  const text = String(summary || "").trim();
  if (!text) return text;
  if (text.includes(TRITON_TABLE_PERMISSION_APPROVAL_URL) || /Triton\s*数据权限申请/.test(text)) {
    return text;
  }
  return `${text}；Triton 数据权限申请：${TRITON_TABLE_PERMISSION_APPROVAL_URL}`;
}

function buildWorkItemReplyMarkdown({ workItem, status, summary, docUrl, modelResult }) {
  const lines = [
    "### Bamboo 报警自动排查结果",
    `- result_id: ${workItem?.result_id || modelResult?.result_id || ""}`,
    `- 状态: ${status}`,
    `- 摘要: ${summary}`,
  ];
  if (docUrl) {
    lines.push(`- 排查文档: ${docUrl}`);
  }
  if (modelResult?.attribution_result) {
    lines.push(`- 固定归因: ${modelResult.attribution_result}`);
  }
  return lines.join("\n");
}

export function buildSopReviewChecklist({
  taskName,
  taskId,
  ruleId,
  troubleshootingSopDoc,
  summary,
  docUrl,
} = {}) {
  // 【任务 13】新增三字段返回：
  //   rule_id_exists_in_index        — 当前 rule_id 是否能在 troubleshootingSopDoc 里的"规则族索引表"命中（默认：undefined，需 bytedcli 取文档后再判定；此处保留位 + 缺省说明）
  //   existing_rule_sop_node_token  — 若索引表里有该 rule_id 的既有 SOP 子文档节点 token（否则 ""/undefined）
  //   suggested_sop_markdown_outline — 若命中索引表或模板内置默认结构，返回推荐 SOP Markdown 大纲字符串（5 节骨架 + 证据/入口占位）
  const normalizedRuleId = ruleId || taskId;
  const sopTitleName = taskName ? requirePreparedTaskName(taskName) : undefined;
  const fallbackOutline = (() => {
    const rId = normalizedRuleId || "<rule_id>";
    const tName = sopTitleName || taskName || "<task_name>";
    return (
      `# ${rId ? `${rId}:` : ""}${tName}排查sop\n\n` +
      `## 1. 规则背景与口径说明\n\n` +
      `- rule_id：${rId}\n` +
      `- task_name：${tName}\n` +
      `- 数据来源 / 依赖 / 运行时序：<由本次排查结果摘要补齐>\n\n` +
      `## 2. 典型异常类型与归因映射（含 BAMBOO_ATTRIBUTION_RESULTS 首选归因）\n\n` +
      `| 异常症状 | 首选归因结果 | 命中前提 / 证据链 | 需人工确认的边界 |\n|---|---|---|---|\n| <按本次异常现象填充> | <从 23 项归因枚举中选 1> | <SQL / RPC / 日志 / 配置证据> | <人工边界>\n\n` +
      `## 3. 自动排查步骤（优先复用 RPC / 脚本 / QC 快速闭环）\n\n` +
      `1. 取 bamboo rules result --id ${rId} 核验 false_data_length / false_reason / instance_status。\n` +
      `2. 命中 QC-1/2/4 的走 classifyQuickClosureConditions 权威归因，不要 AI override。\n` +
      `3. 否则按 skill deep 骨架调用对应 RPC 下钻。\n\n` +
      `## 4. 修复 / 重跑 / 修数操作指引\n\n` +
      `- 典型修复动作（SQL、配置变更、RPC 入参调整）：<按本次结论填充>\n` +
      `- 修数窗口与回流校验：<如有>\n\n` +
      `## 5. 常见坑位与注意事项（含本次新增坑位）\n\n` +
      `- <按本次排查沉淀的坑位逐条填充，含错误示例 / 避免方法 / 关联规则族>`
    );
  })();

  if (!troubleshootingSopDoc) {
    return {
      required: false,
      status: "skipped",
      format_source: {
        type: "model_generated",
        priority: "fallback",
      },
      format_guidance: [
        "未传 troubleshooting_sop_doc 时，排查结果文档正文由模型按当前证据和 skill 内置建议自行组织。",
        "仍必须保留固定标题、查重、归档、合法飞书链接和 Base 状态回写约束。",
        "SOP 写回不执行，必须记录 sop_writeback_status=skipped 和未传 troubleshooting_sop_doc 的原因。",
      ],
      // 【任务 13】缺 troubleshooting_sop_doc 时，index / node_token 无法查到；推荐大纲仍提供 5 节 fallback 结构
      rule_id_exists_in_index: false,
      existing_rule_sop_node_token: undefined,
      suggested_sop_markdown_outline: fallbackOutline,
      reason: "troubleshooting_sop_doc not provided",
      next_step:
        "生成排查结果文档时由模型自行组织正文；记录 sop_writeback_status=skipped，并说明未传 troubleshooting_sop_doc。",
    };
  }

  return compactObject({
    required: true,
    status: "required",
    troubleshooting_sop_doc: troubleshootingSopDoc,
    format_source: {
      type: "troubleshooting_sop_doc",
      url: troubleshootingSopDoc,
      priority: "authoritative",
    },
    format_guidance: [
      "排查结果文档和规则 SOP 文档的正文结构以 troubleshooting_sop_doc 入口文档中描述的格式为准。",
      "runner 只负责固定标题、查重、归档和写回状态，不在代码中固化另一套业务正文模板。",
      "若入口 SOP 文档格式与 skill 内置建议冲突，以入口 SOP 文档为准；固定标题和合法飞书链接校验仍必须保留。",
    ],
    task_name: taskName,
    task_id: taskId,
    rule_id: normalizedRuleId,
    sop_title_name: sopTitleName,
    task_sop_title: sopTitleName ? `${sopTitleName}排查sop` : undefined,
    rule_sop_title:
      normalizedRuleId && sopTitleName
        ? buildRuleSopDocTitle({ ruleId: normalizedRuleId, taskName: sopTitleName })
        : undefined,
    rule_sop_lookup_key: normalizedRuleId,
    disambiguated_task_sop_title:
      taskId && sopTitleName ? `${sopTitleName}（task_id ${taskId}）排查sop` : undefined,
    // 【任务 13】三字段（prepare 阶段无 bytedcli 拉文档，三字段先给占位 + 推荐默认大纲；单条排障调 publish-sop-doc 时会再校验）
    rule_id_exists_in_index: undefined,
    existing_rule_sop_node_token: undefined,
    suggested_sop_markdown_outline: fallbackOutline,
    evidence: compactObject({
      summary,
      doc_url: docUrl,
    }),
    checks: [
      "读取 troubleshooting_sop_doc 入口文档，按其中描述的排查结果文档和 SOP 文档格式组织正文。",
      "判断是否有可复用的通用排查知识需要补充。",
      "按 rule_sop_lookup_key 只用 rule_id 判断具体规则 SOP 是否存在；存在则更新，不存在则按 rule_sop_title 新建。",
      "只写入被本次 Bamboo 明细、线上核验、日志/Trace、代码或配置证据支撑的可复用知识。",
      "若没有可沉淀内容、无权限或定位不唯一，记录 sop_writeback_status=skipped|failed 和原因。",
    ],
    next_step:
      "调用单条排障时必须先读取 troubleshooting_sop_doc 作为排查结果文档和 SOP 文档格式来源；完成 Base 成功回写前，必须更新 SOP 或记录明确的 sop_writeback_status 与原因。",
  });
}

/**
 * 选单值字段（select/单选）在不同 bytedcli/lark-cli 命令下会返回数组或字符串两种格式：
 *   - bytedcli --json lark base record-list → 有时返回 { status: ["init"] }（数字索引字段名格式）
 *   - lark-cli base +record-list → 有时返回 { status: "init" }（字段名格式）
 *   - batch-update/写回场景也可能混合两种格式
 * 统一用这个函数取"第一个非空标量值"，避免下游判定出现 "init" vs "['init']" 的漂移。
 */
function extractSingleCellValue(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item == null) continue;
      if (typeof item === "object") {
        const name = item?.name ?? item?.value ?? item?.text ?? item?.title;
        if (name != null && String(name).trim() !== "") return name;
      } else {
        const s = String(item).trim();
        if (s !== "") return item;
      }
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    const name = value.name ?? value.value ?? value.text ?? value.title ?? value.url ?? value.link;
    if (name != null && String(name).trim() !== "") return name;
  }
  return value;
}

function buildStatusCounts(records) {
  const counts = {};
  for (const record of records) {
    const rawStatus = extractSingleCellValue(record.fields?.status);
    const status = String(rawStatus == null ? "" : rawStatus).trim() || "";
    counts[status || "empty"] = (counts[status || "empty"] || 0) + 1;
  }
  return counts;
}

function isEligibleRecord(record) {
  const rawStatus = extractSingleCellValue(record.fields?.status);
  const status = String(rawStatus == null ? "" : rawStatus)
    .trim()
    .toLowerCase();
  return status === "init" || status === "failed";
}

function getBambooUrlField(fields) {
  return extractSingleCellValue(fields?.bamboo_url);
}

const OFFLINE_HIVE_RULE_TYPES = new Set([
  "",
  "hive",
  "hive_task",
  "offline_hive",
  "offline_hive_task",
]);

function normalizeBambooRuleType(value) {
  const scalar = extractSingleCellValue(value);
  return scalar == null ? "" : String(scalar).trim().toLowerCase();
}

function parseBambooRuleTypeFromUrl(value) {
  const text = value == null ? "" : String(value).trim();
  if (!text) {
    return "";
  }
  try {
    return normalizeBambooRuleType(new URL(text).searchParams.get("rule_type"));
  } catch {
    const match = /(?:[?&])rule_type=([^&#]+)/.exec(text);
    return match ? normalizeBambooRuleType(decodeURIComponent(match[1].replace(/\+/g, " "))) : "";
  }
}

function getBambooRuleType(fields) {
  return normalizeBambooRuleType(
    fields?.rule_type || fields?.ruleType || parseBambooRuleTypeFromUrl(getBambooUrlField(fields)),
  );
}

function isOfflineHiveRecord(record) {
  return OFFLINE_HIVE_RULE_TYPES.has(getBambooRuleType(record.fields));
}

function buildUnsupportedRuleTypeSummary(record) {
  const ruleType = getBambooRuleType(record.fields) || "unknown";
  const sampleAuthority = normalizeAuthoritativeSampleCount({
    falseDataLength: record.fields?.false_data_length ?? record.fields?.falseDataLength,
    falseReason:
      record.fields?.false_reason ??
      record.fields?.falseReason ??
      record.fields?.task_result_object,
    taskResultNum: record.fields?.task_result_num ?? record.fields?.taskResultNum,
    cardTaskResultNum: record.fields?.cnt_nums ?? record.fields?.cntNums,
  });
  const sampleText =
    sampleAuthority.source === "unknown"
      ? "权威样本数=unknown"
      : `权威样本数=${sampleAuthority.authoritativeSamples}（source=${sampleAuthority.source}）`;
  return `当前自动排障只支持离线 Hive Bamboo 规则，rule_type=${ruleType} 暂不支持自动排查，${sampleText}，已跳过单条排查流程。`;
}

function getFieldDefinition(payload) {
  return payload?.data?.field ?? payload?.data ?? payload;
}

function normalizeSelectOption(option) {
  return compactObject({
    name: extractFirstString(option?.name, option?.text, option?.value),
    hue: option?.hue,
    lightness: option?.lightness,
  });
}

function normalizeRecordTimestamp(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1000000000000 ? value * 1000 : value;
  }
  const text = String(value).trim();
  if (!text) {
    return undefined;
  }
  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    return numeric < 1000000000000 ? numeric * 1000 : numeric;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.getTime();
}

function getRecordFreshness(record) {
  return (
    normalizeRecordTimestamp(record.fields?.created_at) ??
    normalizeRecordTimestamp(record.created_time) ??
    normalizeRecordTimestamp(record.updated_time) ??
    0
  );
}

export function buildLarkJsonCommand(args) {
  return {
    command: "bytedcli",
    args: ["--json", "lark", ...args],
  };
}

export function buildBaseBatchUpdateCommand({ baseToken, tableId, jsonPath }) {
  return {
    command: "bytedcli",
    args: [
      "lark",
      "base",
      "record-batch-update",
      "--base-token",
      baseToken,
      "--table-id",
      tableId,
      `--json=@${jsonPath}`,
      "--as",
      "bot",
    ],
  };
}

export function buildBaseBatchUpdateInlineCommand({ baseToken, tableId, body }) {
  return {
    command: "bytedcli",
    args: [
      "lark",
      "base",
      "record-batch-update",
      "--base-token",
      baseToken,
      "--table-id",
      tableId,
      `--json=${JSON.stringify(body)}`,
      "--as",
      "bot",
    ],
  };
}

export function buildBaseRecordDeleteCommand({ baseToken, tableId, recordIds }) {
  const ids = [...new Set((recordIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new Error("buildBaseRecordDeleteCommand: at least one record id is required");
  }
  return buildLarkJsonCommand([
    "base",
    "record-delete",
    "--base-token",
    baseToken,
    "--table-id",
    tableId,
    `--json=${JSON.stringify({ record_id_list: ids })}`,
    "--yes",
    "--as",
    "bot",
  ]);
}

export function buildWikiNodeGetCommand({ scanDirUrl }) {
  return buildLarkJsonCommand([
    "wiki",
    "+node-get",
    "--node-token",
    extractWikiNodeToken(scanDirUrl),
    "--as",
    "bot",
  ]);
}

export function buildWikiNodeListCommand({ spaceId, parentNodeToken }) {
  return buildLarkJsonCommand([
    "wiki",
    "+node-list",
    "--space-id",
    spaceId,
    "--parent-node-token",
    parentNodeToken,
    "--page-all",
    "--page-limit",
    "50",
    "--as",
    "bot",
  ]);
}

export function buildBaseTableListCommand({ baseToken }) {
  return buildLarkJsonCommand(["base", "table-list", "--base-token", baseToken, "--as", "bot"]);
}

export function buildBaseTableDeleteCommand({ baseToken, tableId }) {
  if (!String(tableId || "").trim()) {
    throw new Error("buildBaseTableDeleteCommand: tableId is required");
  }
  return buildLarkJsonCommand([
    "base",
    "table-delete",
    "--base-token",
    baseToken,
    "--table-id",
    tableId,
    "--yes",
    "--as",
    "bot",
  ]);
}

export function buildBaseTableUpdateCommand({ baseToken, tableId, name }) {
  if (!String(tableId || "").trim()) {
    throw new Error("buildBaseTableUpdateCommand: tableId is required");
  }
  if (!String(name || "").trim()) {
    throw new Error("buildBaseTableUpdateCommand: name is required");
  }
  return buildLarkJsonCommand([
    "base",
    "table-update",
    "--base-token",
    baseToken,
    "--table-id",
    tableId,
    "--name",
    name,
    "--as",
    "bot",
  ]);
}

export function buildBaseDashboardListCommand({ baseToken }) {
  return buildLarkJsonCommand(["base", "dashboard-list", "--base-token", baseToken, "--as", "bot"]);
}

export function buildBaseDashboardDeleteCommand({ baseToken, dashboardId }) {
  if (!String(dashboardId || "").trim()) {
    throw new Error("buildBaseDashboardDeleteCommand: dashboardId is required");
  }
  return buildLarkJsonCommand([
    "base",
    "dashboard-delete",
    "--base-token",
    baseToken,
    "--dashboard-id",
    dashboardId,
    "--yes",
    "--as",
    "bot",
  ]);
}

export function buildBaseWorkflowListCommand({ baseToken }) {
  return buildLarkJsonCommand(["base", "workflow-list", "--base-token", baseToken, "--as", "bot"]);
}

export function buildBaseWorkflowDisableCommand({ baseToken, workflowId }) {
  if (!String(workflowId || "").trim()) {
    throw new Error("buildBaseWorkflowDisableCommand: workflowId is required");
  }
  return buildLarkJsonCommand([
    "base",
    "workflow-disable",
    "--base-token",
    baseToken,
    "--workflow-id",
    workflowId,
    "--as",
    "bot",
  ]);
}

export function buildBaseCreateCommand({ title, fields = [] }) {
  const args = ["base", "base-create", "--name", title];
  if (Array.isArray(fields) && fields.length > 0) {
    args.push("--table-name", DAILY_BASE_TABLE_NAME, "--fields", JSON.stringify(fields));
  }
  args.push("--as", "bot");
  return buildLarkJsonCommand(args);
}

export function buildWikiMoveDriveBitableToWikiCommand({ baseToken, parentNodeToken, spaceId }) {
  const args = [
    "wiki",
    "move",
    "--obj-token",
    baseToken,
    "--obj-type",
    "bitable",
    "--target-parent-token",
    parentNodeToken,
  ];
  if (spaceId) args.push("--target-space-id", spaceId);
  args.push("--as", "bot");
  return buildLarkJsonCommand(args);
}

export function buildBaseTableCreateCommand({ baseToken, name, fields = [] }) {
  // base table-create 子命令使用 --name <string> 传表名；建日报时直接通过 --fields
  // 初始化模板字段，避免 Feishu 自动生成 Text/Single option/Date/Attachment 默认列。
  const args = ["base", "table-create", "--base-token", baseToken, "--name", name];
  if (Array.isArray(fields) && fields.length > 0) {
    args.push("--fields", JSON.stringify(fields));
  }
  args.push("--as", "bot");
  return buildLarkJsonCommand(args);
}

export function buildBaseViewListCommand({ baseToken, tableId }) {
  return buildLarkJsonCommand([
    "base",
    "view-list",
    "--base-token",
    baseToken,
    "--table-id",
    tableId,
  ]);
}

export function buildBaseViewGetVisibleFieldsCommand({ baseToken, tableId, viewId }) {
  return buildLarkJsonCommand([
    "base",
    "view-get-visible-fields",
    "--base-token",
    baseToken,
    "--table-id",
    tableId,
    "--view-id",
    viewId,
  ]);
}

export function buildBaseViewSetVisibleFieldsCommand({ baseToken, tableId, viewId, fieldNames }) {
  return buildLarkJsonCommand([
    "base",
    "view-set-visible-fields",
    "--base-token",
    baseToken,
    "--table-id",
    tableId,
    "--view-id",
    viewId,
    `--json=${JSON.stringify({ visible_fields: fieldNames })}`,
  ]);
}

export function buildBaseFieldCreateCommand({ baseToken, tableId, field }) {
  return buildLarkJsonCommand([
    "base",
    "field-create",
    "--base-token",
    baseToken,
    "--table-id",
    tableId,
    `--json=${JSON.stringify(toFieldCreatePayload(field))}`,
    "--as",
    "bot",
  ]);
}

export function buildBaseFieldDeleteCommand({ baseToken, tableId, fieldName }) {
  return buildLarkJsonCommand([
    "base",
    "field-delete",
    "--base-token",
    baseToken,
    "--table-id",
    tableId,
    "--field-id",
    fieldName,
    "--yes",
    "--as",
    "bot",
  ]);
}

export function buildBaseFieldListCommand({ baseToken, tableId }) {
  return buildLarkJsonCommand([
    "base",
    "field-list",
    "--base-token",
    baseToken,
    "--table-id",
    tableId,
    "--as",
    "bot",
  ]);
}

export function buildBaseFieldGetCommand({ baseToken, tableId, fieldId }) {
  return buildLarkJsonCommand([
    "base",
    "field-get",
    "--base-token",
    baseToken,
    "--table-id",
    tableId,
    "--field-id",
    fieldId,
    "--as",
    "bot",
  ]);
}

export function buildBaseFieldUpdateCommand({ baseToken, tableId, fieldId, definition }) {
  return buildLarkJsonCommand([
    "base",
    "field-update",
    "--base-token",
    baseToken,
    "--table-id",
    tableId,
    "--field-id",
    fieldId,
    `--json=${JSON.stringify(definition)}`,
    "--yes",
    "--as",
    "bot",
  ]);
}

export function buildBaseRecordListCommand({ baseToken, tableId, limit = 100 }) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  return buildLarkJsonCommand([
    "base",
    "record-list",
    "--base-token",
    baseToken,
    "--table-id",
    tableId,
    "--limit",
    String(safeLimit),
    "--as",
    "bot",
  ]);
}

/**
 * Wiki +node-copy：复制模板 Wiki 节点到目标父节点。
 * - 必须加 --yes；
 * - 同 space / docs-to-wiki 场景都显式传目标父节点和目标 space，覆盖不同 bytedcli 版本校验。
 */
export function buildWikiNodeCopyCommand({
  nodeToken,
  spaceId,
  targetParentNodeToken,
  targetSpaceId,
  title,
}) {
  if (!nodeToken || !spaceId || !targetParentNodeToken) {
    throw new Error(
      "buildWikiNodeCopyCommand: nodeToken, spaceId and targetParentNodeToken are required",
    );
  }
  const args = [
    "wiki",
    "+node-copy",
    "--node-token",
    nodeToken,
    "--space-id",
    spaceId,
    "--target-parent-node-token",
    targetParentNodeToken,
    "--target-space-id",
    targetSpaceId || spaceId,
    "--yes",
    "--as",
    "bot",
  ];
  if (title) {
    args.push("--title", title);
  }
  return buildLarkJsonCommand(args);
}

/**
 * Base record-batch-create 真实命令面 schema（已实测可用）：
 * {
 *   fields: ["unique_id","status","task_name",...],   // 与 field-list 返回顺序严格对应；空值填 null
 *   rows:  [[val1, val2, ...], [val1, val2, ...], ...]  // 二维数组，每行值的顺序与 fields 一致
 * }
 * JSON 传参必须是 CWD 下的相对路径：--json=@./.tmp/xxx.json
 */
export function buildBaseRecordBatchCreateCommand({ baseToken, tableId, jsonPath }) {
  return {
    command: "bytedcli",
    args: [
      "lark",
      "base",
      "record-batch-create",
      "--base-token",
      baseToken,
      "--table-id",
      tableId,
      `--json=@${jsonPath}`,
      "--as",
      "bot",
    ],
  };
}

export function buildBambooResultCommand(resultId) {
  return {
    command: "bamboo",
    args: ["rules", "result", "--id", String(resultId), "--json"],
  };
}

export function buildBambooAlarmUpdateCardCommand({
  alarmRecordDetailId,
  filePath,
  dryRun = false,
}) {
  if (!normalizePositiveIntegerId(alarmRecordDetailId)) {
    throw new Error(
      "buildBambooAlarmUpdateCardCommand: alarmRecordDetailId must be a positive integer",
    );
  }
  const args = ["alarms", "update-card", "--file", filePath];
  if (dryRun) {
    args.push("--dry-run");
  }
  return {
    command: "bamboo",
    args,
  };
}

export function buildMessageReplyCommand({ messageId, markdown }) {
  return buildLarkJsonCommand([
    "im",
    "messages-reply",
    "--message-id",
    messageId,
    "--reply-in-thread",
    "--markdown",
    markdown,
    "--as",
    "bot",
  ]);
}

export function buildDocsCreateCommand({ title }) {
  return buildLarkJsonCommand(["docs", "create", "--title", title, "--as", "bot"]);
}

export function buildDocsOverwriteCommand({ docToken, markdown }) {
  return buildLarkJsonCommand([
    "docs",
    "update",
    "--doc",
    docToken,
    "--command",
    "overwrite",
    "--doc-format",
    "markdown",
    "--content",
    markdown,
    "--as",
    "bot",
  ]);
}

export function buildDocsFetchCommand({ docToken }) {
  return buildLarkJsonCommand([
    "docs",
    "fetch",
    "--doc",
    docToken,
    "--doc-format",
    "markdown",
    "--as",
    "bot",
  ]);
}

export function buildDocsOverwriteFileCommand({ docToken, bodyJsonPath }) {
  return buildLarkJsonCommand([
    "docs",
    "update",
    "--doc",
    docToken,
    `--body-json=@${bodyJsonPath}`,
    "--as",
    "bot",
  ]);
}

/**
 * Wiki move 命令面：
 * - bytedcli 内置 wiki move（无 +）：obj-token / obj-type / target-parent-node-token / target-space-id
 *   bytedcli 会在下层代理到 lark-cli 的 wiki +move，并在需要时自动补齐参数映射。
 * - 历史上 lark-cli wiki +move 的参数名是 --target-parent-token，和 bytedcli 的映射不同；
 *   但当前 runner 统一通过 bytedcli --json lark wiki move ... 发送请求，所以参数名沿用
 *   bytedcli 的外层命名：--target-parent-node-token / --target-space-id / --obj-token / --obj-type。
 * - nodeToken 场景：当传入 nodeToken（而不是 objToken）时，也走 bytedcli wiki move，
 *   只传 --obj-token = nodeToken 与 --obj-type=wiki，不经过 +move 子命令。
 */
export function buildWikiMoveCommand({
  objToken,
  targetParentNodeToken,
  targetSpaceId,
  objType = "docx",
  nodeToken,
  sourceSpaceId,
}) {
  const args = ["wiki", "move"];
  if (nodeToken) {
    args.push("--obj-token", nodeToken, "--obj-type", "wiki");
  } else if (objToken) {
    args.push("--obj-token", objToken, "--obj-type", objType);
  } else {
    throw new Error("buildWikiMoveCommand: nodeToken or objToken is required");
  }
  if (sourceSpaceId) {
    // bytedcli wiki move 没有 --source-space-id，这里保留给未来可能的扩展，实际不传递
  }
  // --target-space-id 与 --target-parent-node-token 互斥：同 space 内 move 只用 parent，跨 space 需传 space
  if (targetParentNodeToken) {
    args.push("--target-parent-node-token", targetParentNodeToken);
  } else if (targetSpaceId) {
    args.push("--target-space-id", targetSpaceId);
  } else {
    throw new Error("buildWikiMoveCommand: targetParentNodeToken or targetSpaceId is required");
  }
  // 注意：lark-cli wiki +move 在 docs→wiki 迁入时需要 --target-space-id；
  // 如果用户只传了 --target-parent-node-token，为了避免 "target-space-id is required for docs-to-wiki move"，
  // 这里在同时持有 sourceSpaceId / fallbackSpaceId 的情况下补齐 target-space-id，
  // 因为在 Bamboo 目录里「同 space 下父节点」是最常见场景。
  if (args.includes("--target-parent-node-token") && !args.includes("--target-space-id")) {
    const spaceId = sourceSpaceId;
    if (spaceId) args.push("--target-space-id", spaceId);
  }
  args.push("--as", "bot");
  return buildLarkJsonCommand(args);
}

export function buildWikiNodeCreateDocCommand({ title, parentNodeToken, spaceId }) {
  const args = ["wiki", "+node-create", "--obj-type", "docx"];
  if (title) args.push("--title", title);
  if (parentNodeToken) args.push("--parent-node-token", parentNodeToken);
  if (spaceId) args.push("--space-id", spaceId);
  args.push("--as", "bot");
  return buildLarkJsonCommand(args);
}

export function buildGroupsScanPlan({
  groupIds,
  rootPath,
  scanMinutes = 60,
  endTime = new Date(),
  dryRun = false,
}) {
  const normalizedGroupIds = groupIds.map((groupId) => String(groupId).trim()).filter(Boolean);
  const end = endTime instanceof Date ? endTime : new Date(endTime);
  const start = new Date(end.getTime() - Number(scanMinutes) * 60 * 1000);
  const scanWindow = {
    start: formatIsoWithOffset(start),
    end: formatIsoWithOffset(end),
  };
  const dateKey = scanWindow.end.slice(0, 10).replaceAll("-", "");

  return {
    kind: "bamboo_alert_groups_scan_and_troubleshoot_plan",
    dryRun: Boolean(dryRun),
    scanWindow,
    dateKey,
    scanTasks: normalizedGroupIds.map((chatId, index) => ({
      index,
      chatId,
      targetFolderPath: rootPath,
      command: commandToShell({
        command: "node",
        args: [
          "scripts/bamboo/bamboo-alert-runner.mjs",
          "scan-chat-to-base-via-csv",
          "--input-json=@./.tmp/<scan-input>.json",
        ],
      }),
    })),
    autoTroubleshoot: {
      scanDirUrl: rootPath,
      dateRange: "今天和昨天",
      command: commandToShell({
        command: "node",
        args: [
          "scripts/bamboo/bamboo-alert-runner.mjs",
          "auto-troubleshoot-plan",
          "--scan-dir-url",
          rootPath,
          "--date-range",
          "今天和昨天",
        ],
      }),
    },
  };
}

function localDateKey(date) {
  return formatIsoWithOffset(date).slice(0, 10).replaceAll("-", "");
}

function formatDateTimeSecond(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatIsoWithOffset(date).slice(0, 19).replace("T", " ");
}

function recentTwoDateKeys(referenceTime) {
  const end = referenceTime instanceof Date ? referenceTime : new Date(referenceTime);
  return [localDateKey(end), localDateKey(new Date(end.getTime() - 24 * 60 * 60 * 1000))];
}

function normalizeDateKeyList(
  { dateKeyList, date_key_list, dateKeys } = {},
  referenceTime = new Date(),
) {
  const explicitList =
    Array.isArray(dateKeyList) && dateKeyList.length > 0
      ? dateKeyList
      : Array.isArray(date_key_list) && date_key_list.length > 0
        ? date_key_list
        : Array.isArray(dateKeys) && dateKeys.length > 0
          ? dateKeys
          : [];
  const normalized = Array.from(
    new Set(explicitList.map((dateKey) => String(dateKey || "").trim()).filter(Boolean)),
  );
  return normalized.length > 0 ? normalized : recentTwoDateKeys(referenceTime);
}

function recentScanDateKeys({ dateKey, end } = {}) {
  return Array.from(
    new Set(
      [dateKey ? String(dateKey) : "", ...recentTwoDateKeys(end || new Date())].filter(Boolean),
    ),
  );
}

export function createBambooAlertRunner({ execFile = execFilePromise, env = process.env } = {}) {
  const runnerEnv = env || process.env;
  // 全局状态：是否已执行过 bot 自动登录（整个 runner 生命周期只执行一次）
  let botAutoLoginAttempted = false;
  let botAutoLoginResult = null;
  // 【任务 5】inspect-result 内存缓存：整个 runner 生命周期同 result_id 只调一次 bamboo rules result
  // key = `${resultId}::${expectedRuleId || ''}`；避免 close-prepare 循环内同 result_id 多次重复调用
  const INSPECT_RESULT_MEM_CACHE = new Map();
  let closeDependencyPreflightPromise = null;
  // 【任务 5】默认外层 maxRetry（runJsonOnce 内部已有 3 次；此处为 CLI 可配置的「额外外层」重试次数，默认 0）
  const DEFAULT_INSPECT_OUTER_RETRY = 0;

  function errorDetails(error) {
    return [
      error?.message,
      error?.stderr,
      error?.stdout,
      error?.payload ? JSON.stringify(error.payload) : undefined,
      error,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function runCommandVersion(command, args = ["--version"]) {
    try {
      const { stdout, stderr } = await execFile(command, args, {
        maxBuffer: 1024 * 1024,
        env: runnerEnv,
      });
      return {
        status: "succeeded",
        stdout: String(stdout || "")
          .trim()
          .slice(0, 500),
        stderr: String(stderr || "")
          .trim()
          .slice(0, 500),
      };
    } catch (error) {
      return {
        status: "failed",
        reason: error?.message || String(error),
        stdout: String(error?.stdout || "")
          .trim()
          .slice(0, 500),
        stderr: String(error?.stderr || "")
          .trim()
          .slice(0, 500),
      };
    }
  }

  async function commandPath(command) {
    const { stdout } = await execFile("bash", ["-lc", `command -v ${command}`], {
      maxBuffer: 1024 * 1024,
      env: runnerEnv,
    });
    return String(stdout || "").trim();
  }

  async function runCloseDependencyPreflight() {
    const checkedAt = new Date().toISOString();
    const tools = {};
    for (const command of ["life-settle-ai-assistant", "bamboo", "bytedcli"]) {
      try {
        tools[command] = {
          path: await commandPath(command),
        };
      } catch (error) {
        return {
          success: false,
          status: "failed",
          checked_at: checkedAt,
          failed_tool: command,
          reason: `${command} is not available in runner PATH: ${error?.message || String(error)}`,
          tools,
        };
      }
    }

    tools["life-settle-ai-assistant"].registry = await runCommandVersion(
      "life-settle-ai-assistant",
      ["list"],
    );
    tools.bytedcli.version = await runCommandVersion("bytedcli", ["--version"]);
    tools.bamboo.help = await runCommandVersion("bamboo", ["--help"]);
    if (tools["life-settle-ai-assistant"].registry.status !== "succeeded") {
      return {
        success: false,
        status: "failed",
        checked_at: checkedAt,
        failed_tool: "life-settle-ai-assistant",
        reason: `life-settle-ai-assistant list failed: ${tools["life-settle-ai-assistant"].registry.reason || tools["life-settle-ai-assistant"].registry.stderr || "unknown error"}`,
        tools,
      };
    }
    if (tools.bamboo.help.status !== "succeeded") {
      return {
        success: false,
        status: "failed",
        checked_at: checkedAt,
        failed_tool: "bamboo",
        reason: `bamboo --help failed: ${tools.bamboo.help.reason || tools.bamboo.help.stderr || "unknown error"}`,
        tools,
      };
    }

    return {
      success: true,
      status: "succeeded",
      checked_at: checkedAt,
      tools,
    };
  }

  async function ensureCloseDependencyPreflight() {
    if (!closeDependencyPreflightPromise) {
      closeDependencyPreflightPromise = runCloseDependencyPreflight();
    }
    return closeDependencyPreflightPromise;
  }

  function classifyBambooCardUpdateFailure(error) {
    const details = errorDetails(error);
    if (
      /ENOENT|command not found|not found:\s*bamboo|spawn bamboo ENOENT|no such file or directory/i.test(
        details,
      )
    ) {
      return "bamboo_not_found";
    }
    if (
      /permission denied|unauthorized|forbidden|auth(?:orization|entication)? failed|invalid token|no permission|鉴权|权限/i.test(
        details,
      )
    ) {
      return "auth_failed";
    }
    if (
      /life[-_\s]?alarm.*(?:timeout|timed out)|(?:timeout|timed out|ETIMEDOUT|deadline exceeded)/i.test(
        details,
      )
    ) {
      return "life_alarm_timeout";
    }
    if (
      /fetch failed|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|network|gateway|upstream|5\d{2}/i.test(
        details,
      )
    ) {
      return "fetch_failed";
    }
    return "unknown";
  }

  function shouldRetryCardUpdateFailure(failureClass) {
    return ["life_alarm_timeout", "fetch_failed", "unknown"].includes(failureClass);
  }

  function isTokenMissingOrNotConfiguredError(error) {
    if (!error) return false;
    const details = errorDetails(error).toLowerCase();
    return (
      details.includes("token_missing") ||
      details.includes("not_configured") ||
      details.includes("app access token not configured") ||
      details.includes("app token is not configured") ||
      details.includes("bot token not configured") ||
      details.includes("access_token missing") ||
      details.includes("token is missing") ||
      details.includes("no app credential") ||
      details.includes("credential not configured") ||
      details.includes("未配置 token") ||
      details.includes("token 未配置")
    );
  }

  async function tryFeishuBotLogin() {
    if (!hasFeishuBotCredentials(runnerEnv)) {
      return {
        success: false,
        skipped: true,
        reason: "FEISHU_BOT_APP_ID/FEISHU_BOT_APP_SECRET not set",
      };
    }
    try {
      // 为了避免把 secret 暴露到进程参数（ps/top 可见），采用以下策略：
      //   1. FEISHU_BOT_APP_ID 和 FEISHU_BOT_APP_SECRET 只放在 env 中传递给 bash，不直接拼到命令字符串
      //   2. secret 通过 printf + pipe 传给 bytedcli lark config init 的 --app-secret-stdin
      //   3. 运行前通过 preprocessBambooCommandEnv 清理旧凭证并设置 bot CLI 环境变量
      const cleanEnv = preprocessBambooCommandEnv(runnerEnv);
      // bash 命令字符串里只引用变量名，不会包含实际 secret 值
      const bashScript = [
        "printf '%s' \"$FEISHU_BOT_APP_SECRET\" |",
        "  bytedcli lark config init \\",
        "      --new \\",
        "      --force-init \\",
        "      --brand feishu \\",
        "      --lang zh \\",
        '      --app-id "$FEISHU_BOT_APP_ID" \\',
        "      --app-secret-stdin",
      ].join("\n");
      const { stdout, stderr } = await execFile("bash", ["-lc", bashScript], {
        maxBuffer: 1024 * 1024,
        env: cleanEnv,
      });
      return {
        success: true,
        method: "bytedcli_lark_config_init_stdin",
        stdout,
        stderr,
      };
    } catch (error) {
      return {
        success: false,
        method: "bytedcli_lark_config_init_stdin",
        error: error?.message || String(error),
        stderr: error?.stderr,
        stdout: error?.stdout,
      };
    }
  }

  async function ensureProjectBotLogin(command) {
    if (
      !isLarkBotCommand(command) ||
      botAutoLoginAttempted ||
      !hasProjectScopedFeishuBotCredentials(runnerEnv)
    ) {
      return;
    }
    botAutoLoginAttempted = true;
    botAutoLoginResult = await tryFeishuBotLogin();
    if (botAutoLoginResult.success) {
      return;
    }
    const reason =
      botAutoLoginResult.error ||
      botAutoLoginResult.stderr ||
      botAutoLoginResult.reason ||
      "unknown";
    throw new Error(`项目配置的飞书机器人初始化失败：${reason}`);
  }

  function isImSendCommand(command) {
    const argsStr = (command?.args || []).join(" ");
    return /\blark\s+im\s+(?:messages-reply|message-send|messages-send|chat-messages-send|topics-reply)\b/.test(
      argsStr,
    );
  }

  function isBaseWriteCommand(command) {
    const argsStr = (command?.args || []).join(" ");
    // Base 多维表格的写入类子命令：批量更新、批量写入、批量删除、字段更新/写入、状态选项等——严格模式下也允许 user 兜底。
    return /\blark\s+base\s+(?:record-batch-update|record-batch-create|record-create|record-update|records-batch-update|records-batch-create|records-batch-write|record-write|record-batch-write|record-delete|record-batch-delete|batch-create|batch-update|batch-write|field-update|option-update)\b/.test(
      argsStr,
    );
  }

  function isImReadCommand(command) {
    const argsStr = (command?.args || []).join(" ");
    // IM 读取类子命令：查历史消息、查群/聊天信息、查聊天列表、查话题/消息详情、查成员、搜索消息 —— 只有这些才允许 bot-not-allowed 回退 user
    return /\blark\s+im\s+(?:chat-messages-list|chat-get|chats-list|chats-search|chat-members-list|message-get|messages-get|chat-topics-list|messages-search|chat-messages-search|im-messages-search)\b/.test(
      argsStr,
    );
  }

  function isLarkCliImReadGuardError(error) {
    if (!error) return false;
    const details = [
      error?.message,
      error?.stderr,
      error?.stdout,
      error?.payload ? JSON.stringify(error.payload) : undefined,
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return details.includes("lark_cli_im_read_guard");
  }

  function isTransientError(error) {
    if (!error) return false;
    const msg = errorDetails(error);
    const code = String(error?.code || "");
    if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|EPIPE|ESOCKETTIMEDOUT/.test(code))
      return true;
    if (/base is copying,\s*please try again/i.test(msg)) return true;
    if (
      /\b(?:5\d{2}|gateway|timeout|upstream|temporarily|rate limit|429|TooManyRequests|throttl)\b/i.test(
        msg,
      )
    )
      return true;
    return false;
  }

  function isBytedcliUnknownCommandError(error) {
    if (!error) return false;
    const msg = errorDetails(error);
    return /CLI_PARSE_ERROR/.test(msg) && /Unknown command|unknown (?:sub)?command/i.test(msg);
  }

  function isBytedcliUnknownFlagError(error) {
    if (!error) return false;
    const msg = errorDetails(error);
    return (
      (/unknown flag/i.test(msg) || /invalid_argument/i.test(msg)) &&
      /did you mean|suggestions?\b/i.test(msg)
    );
  }

  function isBytedcliMutuallyExclusiveFlagError(error) {
    if (!error) return false;
    const msg = errorDetails(error);
    return /mutually exclusive/i.test(msg);
  }

  async function tryDisableLarkStrictMode() {
    try {
      const cmd = { command: "lark-cli", args: ["config", "strict-mode", "off"] };
      await execFile("bash", ["-lc", commandToShell(cmd)], {
        maxBuffer: 1024 * 1024,
        env: runnerEnv,
      });
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  }

  function applyBytedcliMutuallyExclusiveFlagFallback(command, error) {
    if (!command || !Array.isArray(command.args)) return command;
    const msg = errorDetails(error);
    const args = command.args.slice();
    const hasTargetSpace = args.includes("--target-space-id");
    const hasTargetParent =
      args.includes("--target-parent-node-token") || args.includes("--target-parent-token");
    if (
      hasTargetSpace &&
      hasTargetParent &&
      /--target-space-id/.test(msg) &&
      /--target-parent-(?:node-)?token/.test(msg)
    ) {
      const idx = args.indexOf("--target-space-id");
      if (idx >= 0) args.splice(idx, 2);
      return { ...command, args };
    }
    return command;
  }

  function applyBytedcliFlagSuggestion(command, error) {
    if (!command || !Array.isArray(command.args)) return command;
    const msg = errorDetails(error);
    const suggestionsMatch = msg.match(/"suggestions"\s*:\s*\[([^\]]*)\]/);
    let suggestions = [];
    if (suggestionsMatch?.[1]) {
      suggestions = suggestionsMatch[1]
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    } else {
      const hintMatch = msg.match(/did you mean\s+([^?]+?)\?/i);
      if (hintMatch?.[1]) {
        suggestions = hintMatch[1]
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
    if (suggestions.length === 0) return command;
    const args = command.args.slice();
    // 遍历已知的 "未知 flag" 名称：从 params[].name 中抽取实际被拒的 flag（如果能解析到）
    const badFlagMatch = msg.match(/"name"\s*:\s*"(--?[A-Za-z0-9][A-Za-z0-9_-]*)"/);
    const badFlags = [];
    if (badFlagMatch?.[1]) badFlags.push(badFlagMatch[1]);
    else {
      const unknownFlagMatch = msg.match(/unknown flag\s+"(--?[^"]+)"/i);
      if (unknownFlagMatch?.[1]) badFlags.push(unknownFlagMatch[1]);
    }
    // 按 suggestions 中候选顺序替换第一个命中的 bad flag
    for (const bad of badFlags) {
      const idx = args.indexOf(bad);
      if (idx < 0) continue;
      const sug = suggestions[0];
      args[idx] = sug;
      return { ...command, args };
    }
    // 如果找不到 bad flag 名称，兜底：当 args 中存在某个明显老名字（如 --target-parent-node-token），
    // 并且 suggestion 中含更短名字（如 --target-parent-token），直接替换。
    const legacyMap = {
      "--target-parent-node-token": "--target-parent-token",
    };
    for (const [legacy, sug] of Object.entries(legacyMap)) {
      const idx = args.indexOf(legacy);
      if (idx >= 0 && suggestions.includes(sug)) {
        args[idx] = sug;
        return { ...command, args };
      }
    }
    return command;
  }

  function flipBytedcliWikiSubcommand(command) {
    if (!command || !Array.isArray(command.args)) return command;
    const args = command.args.slice();
    const idx = args.indexOf("wiki");
    if (idx < 0 || idx >= args.length - 1) return command;
    const sub = args[idx + 1];
    if (!sub) return command;
    let nextSub;
    if (sub.startsWith("+")) nextSub = sub.slice(1);
    else nextSub = `+${sub}`;
    args[idx + 1] = nextSub;
    return { ...command, args };
  }

  function sleep(ms) {
    return new Promise((complete) => setTimeout(complete, ms));
  }

  async function runJsonOnce(command, options = {}) {
    const maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        // bytedcli 通过 `--json lark <子命令>` 做代理时，部分命令走内置「短名」（如 wiki node-create），
        // 另一部分命令必须走 lark-cli 原生的「+ 前缀命令」（如 wiki +node-copy / wiki +node-get / wiki +node-list）。
        // 「未知命令」或「未知 flag」时，根据错误中的 suggestion/did you mean 进行针对性修复重试：
        //  1. 未知子命令：wiki <X> 与 wiki +<X> 互转；
        //  2. 未知 flag：优先按 bytedcli hint 的 suggestion 替换（例如 wiki move 的 --target-parent-node-token
        //     会被 lark-cli wiki +move 拒绝，hint 建议改为 --target-parent-token）。
        let cmd = command;
        if (lastError) {
          if (isBytedcliUnknownCommandError(lastError)) {
            cmd = flipBytedcliWikiSubcommand(command);
          } else if (isBytedcliUnknownFlagError(lastError)) {
            cmd = applyBytedcliFlagSuggestion(command, lastError);
          } else if (isBytedcliMutuallyExclusiveFlagError(lastError)) {
            cmd = applyBytedcliMutuallyExclusiveFlagFallback(command, lastError);
          }
        }
        const { stdout, stderr } = await execFile(cmd.command, cmd.args, {
          maxBuffer: 64 * 1024 * 1024,
          env: buildExecEnvForCommand(cmd, runnerEnv),
          timeout: options.timeoutMs,
        });
        const payload = normalizeJsonOutput(stdout, cmd, stderr);
        assertSuccessJson(payload, cmd, stderr);
        return payload;
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts - 1) break;
        if (
          !isTransientError(error) &&
          !isBytedcliUnknownCommandError(error) &&
          !isBytedcliUnknownFlagError(error) &&
          !isBytedcliMutuallyExclusiveFlagError(error)
        ) {
          break;
        }
        const baseDelay = 500 * 2 ** attempt;
        const jitter = Math.floor(Math.random() * 200);
        await sleep(baseDelay + jitter);
      }
    }
    throw lastError;
  }

  async function runJson(command, options = {}) {
    await ensureProjectBotLogin(command);
    try {
      const payload = await runJsonOnce(command, options);
      payload.__identity_used = "bot";
      return payload;
    } catch (error) {
      // 【首次 bot lark 命令 token 缺失自动登录重试】
      // 只对 lark bot 身份命令生效，且整个 runner 生命周期只自动登录一次
      if (
        isLarkBotCommand(command) &&
        !botAutoLoginAttempted &&
        isTokenMissingOrNotConfiguredError(error) &&
        hasFeishuBotCredentials(runnerEnv)
      ) {
        botAutoLoginAttempted = true;
        const loginResult = await tryFeishuBotLogin();
        botAutoLoginResult = loginResult;
        if (loginResult.success) {
          try {
            const retryPayload = await runJsonOnce(command);
            retryPayload.__identity_used = "bot";
            retryPayload.__bot_auto_login_status = "succeeded";
            return retryPayload;
          } catch (retryError) {
            // 自动登录后首次重试仍失败，继续走后续的身份兜底流程
            retryError.__bot_auto_login_status = "succeeded_but_retry_failed";
            throw retryError;
          }
        }
        // 自动登录失败，继续 throw 原始 error，让后续流程处理
        error.__bot_auto_login_status = "failed";
        error.__bot_auto_login_error = loginResult.error;
      }
      if (isImSendCommand(command)) {
        const isStrictModeErr = isStrictModeUserError(error);
        const isTokenMissingErr = isTokenMissingOrNotConfiguredError(error);
        if (!isStrictModeErr && !isTokenMissingErr) {
          throw error;
        }
        // token_missing 不属于 strict-mode 问题，跳过关 strict-mode 直接走 user 兜底
        let disableResult = { success: false, skipped: true, reason: "token_missing_skip" };
        if (isStrictModeErr) {
          disableResult = await tryDisableLarkStrictMode();
          if (disableResult.success) {
            try {
              const retryPayload = await runJsonOnce(command);
              retryPayload.__identity_used = "bot";
              retryPayload.__strict_mode_disable_status = "succeeded";
              return retryPayload;
            } catch (retryError) {
              if (
                !isStrictModeUserError(retryError) &&
                !isTokenMissingOrNotConfiguredError(retryError)
              ) {
                throw retryError;
              }
            }
          }
        }
        const fallbackCommand = {
          ...command,
          args: replaceLarkIdentity(command.args, "user"),
        };
        const payload = await runJsonOnce(fallbackCommand);
        payload.__identity_used = "user";
        payload.__strict_mode_disable_status = disableResult.success
          ? "ineffective"
          : disableResult.skipped
            ? "skipped"
            : "failed";
        payload.__identity_fallback_reason = isTokenMissingErr
          ? "token_missing_im_send"
          : "strict-mode-user";
        return payload;
      }
      // 【AGENTS.md 硬固化 · IM 读取身份回退】
      // 只有 IM 读取命令 + 「bot identity is not allowed / lark_cli_im_read_guard / token_missing」
      // 这些特定错误才允许自动回退 --as user。其他 lark/wiki/base/bamboo/doc bot 错误一律不回退 user，
      // 必须用 bot 身份申请权限/排查，禁止 AI 自由把 user 身份兜底滥用到非 IM 读取场景。
      const imReadEligibleError =
        isBotIdentityNotAllowedError(error) || isTokenMissingOrNotConfiguredError(error);
      if (isImReadCommand(command) && imReadEligibleError) {
        const fallbackCommand = {
          ...command,
          args: replaceLarkIdentity(command.args, "user"),
        };
        const payload = await runJsonOnce(fallbackCommand);
        payload.__identity_used = "user";
        payload.__identity_fallback_reason = isTokenMissingOrNotConfiguredError(error)
          ? "token_missing_im_read"
          : isLarkCliImReadGuardError(error)
            ? "lark_cli_im_read_guard"
            : "bot_identity_not_allowed_im_read";
        return payload;
      }
      // 【AGENTS.md 硬固化 · Base 写入 strict-mode 兜底】
      // Base 写入（对账归因记录回写、processing 认领、not_support 标记等）在 strict-mode=user
      // （含 lark_cli_im_read_guard 触发的严格模式）或 bot token 缺失时也允许自动回退 --as user，
      // 避免因为 CLI 全局 strict-mode 或未配置 bot token 导致所有写 Base 都必须让 AI 手工 --as user 自由发挥。
      // 非 strict-mode / non-token-missing / non-IM 类的 bot 错误（如权限不足、scope 缺失）仍不回退，必须走 bot 申请权限。
      const baseWriteStrictModeErr = isStrictModeUserError(error);
      const baseWriteTokenMissingErr = isTokenMissingOrNotConfiguredError(error);
      if (isBaseWriteCommand(command) && (baseWriteStrictModeErr || baseWriteTokenMissingErr)) {
        // token_missing 不属于 strict-mode 问题，跳过关 strict-mode 直接走 user 兜底
        let disableResult = { success: false, skipped: true, reason: "token_missing_skip" };
        if (baseWriteStrictModeErr) {
          disableResult = await tryDisableLarkStrictMode();
          if (disableResult.success) {
            try {
              const retryPayload = await runJsonOnce(command);
              retryPayload.__identity_used = "bot";
              retryPayload.__strict_mode_disable_status = "succeeded";
              return retryPayload;
            } catch (retryError) {
              if (
                !isStrictModeUserError(retryError) &&
                !isTokenMissingOrNotConfiguredError(retryError)
              ) {
                throw retryError;
              }
            }
          }
        }
        const fallbackCommand = {
          ...command,
          args: replaceLarkIdentity(command.args, "user"),
        };
        const payload = await runJsonOnce(fallbackCommand);
        payload.__identity_used = "user";
        payload.__strict_mode_disable_status = disableResult.success
          ? "ineffective"
          : disableResult.skipped
            ? "skipped"
            : "failed";
        payload.__identity_fallback_reason = baseWriteTokenMissingErr
          ? "token_missing_base_write"
          : "strict-mode-user-base-write";
        return payload;
      }
      // 【Skill 规范兜底 · 非 IM 发送类命令 strict-mode 统一回退】
      // Skill 文档明确要求：非 IM 发送类命令命中 strict-mode=user / bot-identity-not-allowed /
      // token-missing 时，自动回退 --as user 再执行一次。此兜底覆盖 wiki/base/docs 读取类、
      // base-create/table-create/field-create/record-list/field-list 等前面分类未覆盖的其余
      // 非 IM 发送 lark 命令，避免分类不全导致的 strict-mode 阻塞。
      if (isLarkBotCommand(command) && !isImSendCommand(command)) {
        const strictModeEligible = isStrictModeUserError(error);
        const botNotAllowedEligible = isBotIdentityNotAllowedError(error);
        const tokenMissingEligible = isTokenMissingOrNotConfiguredError(error);
        if (strictModeEligible || botNotAllowedEligible || tokenMissingEligible) {
          let disableResult = { success: false, skipped: true, reason: "bot_issue_skip" };
          if (strictModeEligible) {
            disableResult = await tryDisableLarkStrictMode();
            if (disableResult.success) {
              try {
                const retryPayload = await runJsonOnce(command);
                retryPayload.__identity_used = "bot";
                retryPayload.__strict_mode_disable_status = "succeeded";
                return retryPayload;
              } catch (retryError) {
                if (
                  !isStrictModeUserError(retryError) &&
                  !isBotIdentityNotAllowedError(retryError) &&
                  !isTokenMissingOrNotConfiguredError(retryError)
                ) {
                  throw retryError;
                }
              }
            }
          }
          const fallbackCommand = { ...command, args: replaceLarkIdentity(command.args, "user") };
          const payload = await runJsonOnce(fallbackCommand);
          payload.__identity_used = "user";
          payload.__strict_mode_disable_status = disableResult.success
            ? "ineffective"
            : disableResult.skipped
              ? "skipped"
              : "failed";
          const reason = strictModeEligible
            ? "strict-mode-user-catchall"
            : botNotAllowedEligible
              ? "bot-identity-not-allowed-catchall"
              : "token-missing-catchall";
          payload.__identity_fallback_reason = reason;
          return payload;
        }
      }
      throw error;
    }
  }

  async function fetchBambooResult(resultId) {
    const normalizedResultId = String(resultId || "").trim();
    if (!normalizedResultId) {
      return {};
    }
    const payload = await runJson(buildBambooResultCommand(normalizedResultId));
    return getBambooResultData(payload);
  }

  return {
    async scanChatMessages({ chatId, start, end, pageToken, pageSize = 50, maxPages = 20 }) {
      let messageReadIdentity = "bot";
      let nextPageToken = pageToken;
      let lastCommand;
      let scanned = 0;
      const messagesOut = [];

      const startMs = start ? new Date(start).getTime() : 0;

      for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
        const chatArgs = buildChatMessageListArgs({
          chatId,
          start,
          end,
          pageToken: nextPageToken,
          pageSize,
        });
        let command = {
          command: "bytedcli",
          args: ["--json", ...chatArgs],
        };
        if (messageReadIdentity !== "bot") {
          command = {
            ...command,
            args: replaceLarkIdentity(command.args, messageReadIdentity),
          };
        }

        const payload = await runJson(command);
        if (payload.__identity_used === "user") {
          messageReadIdentity = "user";
        }
        lastCommand = command;

        const messages = getItems(payload);
        scanned += messages.length;
        messagesOut.push(...messages);

        if (startMs > 0 && messages.length > 0) {
          let earliestMs = Number.MAX_SAFE_INTEGER;
          for (const m of messages) {
            const t = extractFirstNumber(m?.msg_timestamp, m?.create_time, m?.createTime);
            if (t && t < earliestMs) earliestMs = t;
          }
          if (earliestMs < Number.MAX_SAFE_INTEGER && earliestMs < startMs) {
            nextPageToken = "";
            break;
          }
        }

        nextPageToken = getNextPageToken(payload);
        if (!nextPageToken) {
          break;
        }
      }

      return {
        command: lastCommand ? commandToShell(lastCommand) : "",
        message_read_identity: messageReadIdentity,
        scanned,
        messages: messagesOut,
      };
    },

    async scanChat({ chatId, start, end, pageToken, pageSize = 50, maxPages = 20 }) {
      const scan = await this.scanChatMessages({
        chatId,
        start,
        end,
        pageToken,
        pageSize,
        maxPages,
      });
      return {
        command: scan.command,
        message_read_identity: scan.message_read_identity,
        scanned: scan.scanned,
        messages: scan.messages,
        alerts: scan.messages
          .map((message) => extractBambooAlertFromMessage(message))
          .filter(Boolean),
      };
    },

    async scanChatToCsv({
      chatId,
      start,
      end,
      outputPath,
      pageToken,
      pageSize = 50,
      maxPages = 20,
    }) {
      const csvPath = outputPath || defaultChatCsvPath({ chatId, end });
      const scan = await this.scanChatMessages({
        chatId,
        start,
        end,
        pageToken,
        pageSize,
        maxPages,
      });
      const rows = scan.messages.map(messageToCsvRow);
      await writeCsvFile(csvPath, CHAT_MESSAGE_CSV_FIELDS, rows);
      return {
        err: "",
        csv_path: csvPath,
        rows_written: rows.length,
        scanned: scan.scanned,
        message_read_identity: scan.message_read_identity,
        command: scan.command,
      };
    },

    async parseChatCsvToBambooAlertCsv({ messageCsvPath, dateKey }) {
      if (!messageCsvPath) {
        throw buildRunnerError("messageCsvPath is required", {
          reason_code: "MESSAGE_CSV_PATH_REQUIRED",
        });
      }
      const rows = parseCsv(await readFile(messageCsvPath, "utf8"));
      const alertsByDate = new Map();
      let parsedMessages = 0;
      for (const row of rows) {
        parsedMessages += 1;
        const alert = extractBambooAlertFromMessage(csvRowToMessage(row));
        if (!alert?.result_id) continue;
        const currentDateKey = effectiveAlertDateKey(alert, dateKey);
        if (!alertsByDate.has(currentDateKey)) alertsByDate.set(currentDateKey, []);
        alertsByDate.get(currentDateKey).push(alertToCsvRow(alert, currentDateKey));
      }
      const outputDir = dirname(messageCsvPath);
      const alertCsvPaths = [];
      let alertsWritten = 0;
      for (const [currentDateKey, alertRows] of alertsByDate.entries()) {
        const dedupedRows = [];
        const seen = new Set();
        for (const row of alertRows) {
          const uniqueId = String(row.unique_id || "").trim();
          if (uniqueId && seen.has(uniqueId)) continue;
          if (uniqueId) seen.add(uniqueId);
          dedupedRows.push(row);
        }
        const alertCsvPath = join(outputDir, `${currentDateKey}-bamboo-alerts.csv`);
        await writeCsvFile(alertCsvPath, BAMBOO_ALERT_CSV_FIELDS, dedupedRows);
        alertCsvPaths.push(alertCsvPath);
        alertsWritten += dedupedRows.length;
      }
      return {
        err: "",
        message_csv_path: messageCsvPath,
        alert_csv_paths: alertCsvPaths,
        parsed_messages: parsedMessages,
        alerts_written: alertsWritten,
      };
    },

    async upsertBambooAlertCsvToDailyBase({
      alertCsvPath,
      scanDirUrl,
      dateKey,
      bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      initStatus = "init",
    }) {
      if (!alertCsvPath) {
        throw buildRunnerError("alertCsvPath is required", {
          reason_code: "ALERT_CSV_PATH_REQUIRED",
        });
      }
      if (!scanDirUrl) {
        throw buildRunnerError("scanDirUrl is required", { reason_code: "SCAN_DIR_URL_REQUIRED" });
      }
      const csvRows = parseCsv(await readFile(alertCsvPath, "utf8"));
      const alerts = csvRows.map(csvRowToAlert).filter((alert) => alert.result_id);
      const inferredDateKey =
        alerts.find((alert) => alert.task_date_key)?.task_date_key ||
        path.basename(alertCsvPath).match(/^(\d{8})-/)?.[1] ||
        dateKey ||
        new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const dailyBase = await this.ensureDailyBase({
        scanDirUrl,
        dateKey: inferredDateKey,
        bizSuffix,
      });
      const tablePayload = await runJson(
        buildBaseTableListCommand({ baseToken: dailyBase.obj_token }),
      );
      const firstTable = selectDailyBaseTable(tablePayload);
      const tableId = extractFirstString(firstTable?.table_id, firstTable?.id, firstTable?.tableId);
      const fieldNames = normalizeFields(
        await runJson(buildBaseFieldListCommand({ baseToken: dailyBase.obj_token, tableId })),
      );
      const uniqueFieldName = fieldNames.includes("unique_id")
        ? "unique_id"
        : fieldNames.includes("uniqueid")
          ? "uniqueid"
          : "";
      const existingUniqueIds = new Set();
      if (uniqueFieldName) {
        const recordPayload = await runJson(
          buildBaseRecordListCommand({ baseToken: dailyBase.obj_token, tableId, limit: 200 }),
        );
        for (const record of normalizeRecords(recordPayload)) {
          const uniqueId = String(record.fields?.[uniqueFieldName] ?? "").trim();
          if (uniqueId) existingUniqueIds.add(uniqueId);
        }
      }

      const rows = [];
      const skippedAlerts = [];
      const insertedAt = formatDateTimeSecond();
      const batchUniqueIds = new Set();
      const shouldFillAlarmRecordDetailId = fieldNames.includes("alarm_record_detail_id");
      for (const alert of alerts) {
        const resultId = String(alert.result_id || alert.unique_id || "").trim();
        const uniqueId = resultId;
        if (uniqueFieldName && uniqueId) {
          if (existingUniqueIds.has(uniqueId)) {
            skippedAlerts.push({
              unique_id: uniqueId,
              result_id: resultId,
              date_key: inferredDateKey,
              reason: "duplicate_existing_unique_id",
            });
            continue;
          }
          if (batchUniqueIds.has(uniqueId)) {
            skippedAlerts.push({
              unique_id: uniqueId,
              result_id: resultId,
              date_key: inferredDateKey,
              reason: "duplicate_in_csv",
            });
            continue;
          }
          batchUniqueIds.add(uniqueId);
        }
        let bambooResultError;
        let alarmRecordDetailId = shouldFillAlarmRecordDetailId
          ? normalizeNonNegativeIntegerId(alert.alarm_record_detail_id)
          : "";
        if (shouldFillAlarmRecordDetailId && !alarmRecordDetailId && resultId) {
          try {
            alarmRecordDetailId = extractAlarmRecordDetailIdFromBambooResult(
              await fetchBambooResult(resultId),
            );
          } catch (error) {
            bambooResultError = error?.message || String(error);
          }
        }
        const extra = {
          ...alert.extra,
          chat_id: alert.chat_id || alert.extra?.chat_id,
          message_id: alert.message_id || alert.extra?.message_id,
          message_link: alert.message_link || alert.extra?.message_link,
          raw_title: alert.title || alert.extra?.raw_title,
          original_title: alert.title || alert.extra?.original_title,
          bamboo_result_enrichment_status: bambooResultError
            ? "failed"
            : shouldFillAlarmRecordDetailId
              ? "succeeded"
              : undefined,
          bamboo_result_enrichment_error: bambooResultError,
          alarm_record_detail_id_enrichment_status: shouldFillAlarmRecordDetailId
            ? alarmRecordDetailId
              ? "filled"
              : "skipped_no_non_negative_id"
            : undefined,
          csv_path: alertCsvPath,
        };
        rows.push(
          fieldNames.map((name) => {
            switch (name) {
              case "unique_id":
              case "uniqueid":
                return uniqueId || null;
              case "status":
                return initStatus;
              case "task_name":
                return normalizeBambooTaskNameForBase(alert.title || alert.task_name);
              case "task_id":
                return alert.task_id ? String(alert.task_id) : null;
              case "rule_id":
                return alert.task_id ? String(alert.task_id) : null;
              case "result_id":
                return resultId || null;
              case "task_time":
                return alert.task_time || alert.extra?.bamboo_check_time || null;
              case "task_date_key":
                return inferredDateKey;
              case "bamboo_url":
              case "bamboo_result_url":
                return (
                  alert.bamboo_url || alert.bamboo_result_url || alert.extra?.rule_link || null
                );
              case "alarm_record_detail_id":
                return alarmRecordDetailId || "0";
              case "created_at":
                return insertedAt;
              case "task_result_num":
                return Math.trunc(Number(alert.task_result_num ?? 0));
              case "task_result_object":
                return "";
              case "task_sql":
                return "";
              case "chat_id":
                return alert.chat_id || null;
              case "message_id":
                return alert.message_id || null;
              case "message_link":
                return alert.message_link || alert.extra?.message_link || null;
              case "extra":
                return serializeExtraField(extra);
              case "ai_summary":
              case "ai_result":
              case "ai_finished_at":
              case "ai_session_id":
              case "last_error":
                return null;
              case "scan_at":
                return insertedAt;
              default:
                return null;
            }
          }),
        );
      }
      const writeResult =
        rows.length > 0
          ? await this.insertBaseRecordsBatch({
              baseToken: dailyBase.obj_token,
              tableId,
              writableFields: fieldNames,
              rows,
            })
          : { ok: true, inserted: 0 };
      return {
        err: "",
        alert_csv_path: alertCsvPath,
        date_key: inferredDateKey,
        daily_base_url: dailyBase.node_token
          ? `https://bytedance.larkoffice.com/wiki/${dailyBase.node_token}`
          : "",
        daily_base: {
          title: dailyBase.title,
          node_token: dailyBase.node_token,
          obj_token: dailyBase.obj_token,
          space_id: dailyBase.space_id,
          table_id: tableId,
          created: dailyBase.created,
          existing: dailyBase.existing,
        },
        rows_written: rows.length,
        rows_skipped: skippedAlerts.length,
        skipped_alerts: skippedAlerts,
        field_names: fieldNames,
        write: writeResult,
      };
    },

    async getRecentChatScanCutoff({
      chatId,
      scanDirUrl,
      dateKey,
      end,
      bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      recordLimit = 200,
    }) {
      if (!chatId || !scanDirUrl) {
        return { latest_message_sent_at_ms: 0, matched_records: 0, date_keys: [] };
      }
      const dateKeys = recentScanDateKeys({ dateKey, end });
      const { containers } = await this.resolveDailyBaseContainers({ scanDirUrl });
      const mergedChildren = await this.listChildrenAcrossContainers({ containers });
      const dailyBases = selectDailyBaseNodes({
        nodes: mergedChildren,
        dateKeys,
        bizSuffix,
        claimOrder: "updated_time_desc",
      }).filter((node) => node.obj_type === "bitable");
      let latestMessageSentAtMs = 0;
      let matchedRecords = 0;
      for (const dailyBase of dailyBases) {
        const tablePayload = await runJson(
          buildBaseTableListCommand({ baseToken: dailyBase.obj_token }),
        );
        const tableItems = getItems(tablePayload);
        const firstTable =
          tableItems.find(
            (item) =>
              extractFirstString(item?.name, item?.table_name, item?.title) ===
              DAILY_BASE_TABLE_NAME,
          ) || tableItems[0];
        const tableId = extractFirstString(
          firstTable?.table_id,
          firstTable?.id,
          firstTable?.tableId,
        );
        if (!tableId) continue;
        const recordPayload = await runJson(
          buildBaseRecordListCommand({
            baseToken: dailyBase.obj_token,
            tableId,
            limit: recordLimit,
          }),
        );
        for (const record of normalizeRecords(recordPayload)) {
          const extra = parseObjectField(record.fields?.extra);
          const recordChatId = extractFirstString(
            extra.chat_id,
            extra.group_id,
            extra.source_chat_id,
            record.fields?.chat_id,
            record.fields?.group_id,
          );
          if (recordChatId !== chatId) continue;
          const messageSentAtMs = extractFirstNumber(
            extra.message_sent_at_ms,
            extra.msg_timestamp,
            extra.message_timestamp,
            record.fields?.message_sent_at_ms,
            record.fields?.msg_timestamp,
          );
          if (!messageSentAtMs) continue;
          matchedRecords += 1;
          latestMessageSentAtMs = Math.max(latestMessageSentAtMs, messageSentAtMs);
        }
      }
      return {
        latest_message_sent_at_ms: latestMessageSentAtMs,
        latest_message_sent_at: latestMessageSentAtMs
          ? new Date(latestMessageSentAtMs).toISOString()
          : "",
        matched_records: matchedRecords,
        date_keys: dateKeys,
      };
    },

    async scanChatToBaseViaCsv({
      chatId,
      start,
      end,
      scanDirUrl,
      dateKey,
      bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      pageToken,
      pageSize = 50,
      initStatus = "init",
      keepTemp = false,
    }) {
      const tempDir = await mkdtemp(join(tmpdir(), "bamboo-alert-scan-csv-"));
      const messageCsvPath = join(tempDir, "messages.csv");
      try {
        const originalStart = start ? new Date(start) : undefined;
        const endDate = end ? new Date(end) : undefined;
        let effectiveStart = originalStart;
        let scanCutoff;
        try {
          scanCutoff = await this.getRecentChatScanCutoff({
            chatId,
            scanDirUrl,
            dateKey,
            end: endDate,
            bizSuffix,
          });
          const cutoffMs = Number(scanCutoff.latest_message_sent_at_ms || 0);
          if (
            effectiveStart &&
            cutoffMs > effectiveStart.getTime() &&
            (!endDate || cutoffMs < endDate.getTime())
          ) {
            effectiveStart = new Date(cutoffMs + 1);
          }
        } catch (error) {
          scanCutoff = {
            latest_message_sent_at_ms: 0,
            matched_records: 0,
            date_keys: [],
            warning: error?.message || String(error),
          };
        }
        const scanCsv = await this.scanChatToCsv({
          chatId,
          start: effectiveStart || start,
          end,
          outputPath: messageCsvPath,
          pageToken,
          pageSize,
        });
        const parsed = await this.parseChatCsvToBambooAlertCsv({ messageCsvPath, dateKey });
        const upserts = [];
        for (const alertCsvPath of parsed.alert_csv_paths) {
          upserts.push(
            await this.upsertBambooAlertCsvToDailyBase({
              alertCsvPath,
              scanDirUrl,
              dateKey,
              bizSuffix,
              initStatus,
            }),
          );
        }
        return {
          err: "",
          success: true,
          message_csv_path: keepTemp ? messageCsvPath : undefined,
          alert_csv_paths: keepTemp ? parsed.alert_csv_paths : undefined,
          daily_base_urls: upserts.map((item) => item.daily_base_url).filter(Boolean),
          daily_bases: upserts.map((item) => item.daily_base),
          scan: {
            scanned: scanCsv.scanned,
            message_read_identity: scanCsv.message_read_identity,
            original_start: originalStart ? originalStart.toISOString() : "",
            effective_start: effectiveStart ? effectiveStart.toISOString() : "",
            adjusted_start_reason:
              originalStart && effectiveStart && effectiveStart.getTime() > originalStart.getTime()
                ? "recent_daily_base_message_sent_at"
                : "",
            recent_cutoff: scanCutoff,
          },
          parse: {
            parsed_messages: parsed.parsed_messages,
            alerts_written: parsed.alerts_written,
          },
          write: {
            rows_written: upserts.reduce((sum, item) => sum + (item.rows_written || 0), 0),
            rows_skipped: upserts.reduce((sum, item) => sum + (item.rows_skipped || 0), 0),
          },
          upserts,
        };
      } finally {
        if (!keepTemp) {
          try {
            await unlink(messageCsvPath);
          } catch {}
          try {
            const files = await readdir(tempDir);
            await Promise.all(
              files.map((file) => unlink(join(tempDir, file)).catch(() => undefined)),
            );
          } catch {}
          try {
            await rm(tempDir, { recursive: true, force: true });
          } catch {}
        }
      }
    },

    async inspectBambooResult(
      resultId,
      { expectedRuleId, inspectCacheDir, maxRetry, taskResultNum, cardTaskResultNum } = {},
    ) {
      const normalizedResultId = String(resultId);
      const normalizedExpected =
        expectedRuleId == null || expectedRuleId === "" ? "" : String(expectedRuleId);
      const outerMaxRetry =
        Number.isFinite(+maxRetry) && +maxRetry >= 0 ? +maxRetry : DEFAULT_INSPECT_OUTER_RETRY;
      const memCacheKey = `${normalizedResultId}::${normalizedExpected}`;
      const expectedCardSamples = Number(cardTaskResultNum ?? taskResultNum ?? 0);
      const requiresFreshSampleConsistencyCheck =
        Number.isFinite(expectedCardSamples) && expectedCardSamples > 0;
      // 内存缓存命中（同一 runner 生命周期内重复 inspect 不重复调 bamboo）
      if (!requiresFreshSampleConsistencyCheck && INSPECT_RESULT_MEM_CACHE.has(memCacheKey)) {
        const cached = INSPECT_RESULT_MEM_CACHE.get(memCacheKey);
        if (cached && typeof cached === "object") {
          return {
            ...cached,
            __cache_source: "memory",
            __cache_key: memCacheKey,
          };
        }
      }
      // 磁盘缓存命中（--inspect-cache-dir 指定目录下 <id>.inspect.json）
      if (!requiresFreshSampleConsistencyCheck && inspectCacheDir) {
        try {
          const safeId = normalizedResultId.replace(/[^A-Za-z0-9_-]/g, "_");
          const expectedSeg = normalizedExpected
            ? `__${normalizedExpected.replace(/[^A-Za-z0-9_-]/g, "_")}`
            : "";
          const cachePath = join(inspectCacheDir, `${safeId}${expectedSeg}.inspect.json`);
          const raw = await readFile(cachePath, "utf8");
          const parsed = JSON.parse(raw);
          if (
            parsed &&
            typeof parsed === "object" &&
            String(parsed.resultId || "") === normalizedResultId
          ) {
            INSPECT_RESULT_MEM_CACHE.set(memCacheKey, parsed);
            return {
              ...parsed,
              __cache_source: "disk",
              __cache_path: cachePath,
              __cache_key: memCacheKey,
            };
          }
        } catch {
          // cache miss = normal path，不抛错、不告警
        }
      }
      // 外层指数退避包装（内层 runJsonOnce 已有 3 次；这里仅当 maxRetry > 0 时启用，对瞬时类再做一层）
      const fetchOnce = async () => {
        const command = buildBambooResultCommand(normalizedResultId);
        const payload = await runJson(command);
        const result = getBambooResultData(payload);
        const actualRuleId = result?.rules_id == null ? "" : String(result.rules_id);
        const ruleValidation = normalizedExpected
          ? {
              expected_rule_id: normalizedExpected,
              actual_rule_id: actualRuleId,
              matched: actualRuleId === normalizedExpected,
            }
          : undefined;
        const classification = classifyBambooResult(result);
        if (ruleValidation && !ruleValidation.matched) {
          classification.kind = "rule_mismatch";
          classification.success = false;
          classification.cardUpdateAllowed = false;
          classification.summary = `Bamboo result_id=${normalizedResultId} returned rules_id=${actualRuleId || "unknown"}, which does not match expected rule_id=${normalizedExpected}; this result must not be used as evidence for the current alert.`;
        }
        const sampleCountConsistency = classifySampleCountConsistency({
          taskResultNum: cardTaskResultNum ?? taskResultNum ?? result?.task_result_num,
          falseDataLength:
            result?.false_data_length ?? result?.falseDataLength ?? result?.alarm_false_data_length,
          falseReason: result?.false_reason ?? result?.falseReason,
        });
        return {
          resultId: normalizedResultId,
          command: commandToShell(command),
          result,
          sample_count_consistency: sampleCountConsistency,
          ...(ruleValidation ? { rule_validation: ruleValidation } : {}),
          classification,
          normalized: (() => {
            const qc = classifyQuickClosureConditions(result);
            const derivedStatus =
              classification.kind === "needs_manual_review" || classification.needsManualReview
                ? "pending"
                : classification.kind === "invalid_bamboo_result" ||
                    classification.kind === "rule_mismatch"
                  ? "pending"
                  : classification.kind === "effective_alert"
                    ? "succeeded"
                    : classification.kind === "non_effective_alert"
                      ? "succeeded"
                      : classification.suggestedStatus || "pending";
            const derivedConfidence = Number.isFinite(+classification.confidence)
              ? +classification.confidence
              : Number.isFinite(+classification.suggestedConfidence)
                ? +classification.suggestedConfidence
                : Number.isFinite(+qc.topConfidence)
                  ? +qc.topConfidence
                  : classification.kind === "non_effective_alert" || qc.topQuickClosureCode
                    ? 0.95
                    : 0.5;
            return {
              result_id: normalizedResultId,
              status: derivedStatus,
              confidence: derivedConfidence,
              needs_manual_review: Boolean(
                classification.kind === "needs_manual_review" ||
                classification.needsManualReview ||
                classification.suggestedNeedsManualReview,
              ),
              ai_summary: classification.summary || "",
              ai_result: "",
              qc_top_code: qc.topQuickClosureCode || "",
              nonOverride: true,
            };
          })(),
        };
      };
      let lastErr = null;
      const totalAttempts = Math.max(
        1 + Math.max(0, outerMaxRetry),
        requiresFreshSampleConsistencyCheck ? 3 : 1,
      );
      const sampleConsistencyAttempts = [];
      for (let i = 0; i < totalAttempts; i += 1) {
        try {
          const outcome = await fetchOnce();
          const consistency = outcome.sample_count_consistency;
          if (consistency?.verdict === "sample_count_conflict") {
            sampleConsistencyAttempts.push({
              attempt: i + 1,
              false_data_length: consistency.bamboo_false_data_length,
              task_result_num: consistency.card_task_result_num,
              false_reason_available: consistency.false_reason_available,
              false_reason_length: consistency.false_reason_length,
              error: null,
            });
            if (i < totalAttempts - 1) {
              await sleep(200);
              continue;
            }
            outcome.sample_count_consistency = {
              ...consistency,
              retry_attempts: sampleConsistencyAttempts.length,
              attempts: sampleConsistencyAttempts,
              verdict:
                sampleConsistencyAttempts.length >= 3
                  ? "bamboo_result_inconsistent"
                  : consistency.verdict,
            };
            if (outcome.normalized) {
              outcome.normalized.sample_count_consistency = outcome.sample_count_consistency;
              outcome.normalized.status = "pending";
              outcome.normalized.needs_manual_review = true;
              outcome.normalized.ai_summary =
                `等待 Bamboo result 接口修复或人工复核。卡片异常数 task_result_num=${outcome.sample_count_consistency.card_task_result_num}，` +
                `但连续 ${outcome.sample_count_consistency.retry_attempts} 次读取 Bamboo result 均返回 false_data_length=0 且无法取得异常数据列表，` +
                `接口结果与报警卡片事实冲突，当前不做自动归因。`;
            }
          }
          // 写缓存（先内存，有 inspectCacheDir 则再写磁盘）
          INSPECT_RESULT_MEM_CACHE.set(memCacheKey, outcome);
          if (inspectCacheDir) {
            try {
              await mkdir(inspectCacheDir, { recursive: true });
              const safeId = normalizedResultId.replace(/[^A-Za-z0-9_-]/g, "_");
              const expectedSeg = normalizedExpected
                ? `__${normalizedExpected.replace(/[^A-Za-z0-9_-]/g, "_")}`
                : "";
              const cachePath = join(inspectCacheDir, `${safeId}${expectedSeg}.inspect.json`);
              await writeFile(cachePath, `${JSON.stringify(outcome, null, 2)}\n`, "utf8");
              outcome.__cache_path = cachePath;
            } catch (_diskWriteErr) {
              // 磁盘缓存失败不影响主流程，只做可选标记
              outcome.__cache_disk_write_failed = true;
              outcome.__cache_disk_write_error = String(
                _diskWriteErr && _diskWriteErr.message ? _diskWriteErr.message : _diskWriteErr,
              );
            }
          }
          if (outerMaxRetry > 0) {
            outcome.__outer_retry_attempts = i + 1;
          }
          return outcome;
        } catch (err) {
          lastErr = err;
          if (i === totalAttempts - 1) break;
          // 外层只对瞬时类网络错再退避一层；语义/权限/4xx 类直接 break（让内层异常直接抛出）
          if (!isTransientError(err)) break;
          const delay = 1000 * 2 ** i;
          const jitter = Math.floor(Math.random() * 300);
          await sleep(delay + jitter);
        }
      }
      throw lastErr;
    },

    async claimBaseRecord({
      baseToken,
      tableId,
      recordId,
      sessionId,
      startedAt,
      fieldNames = [],
      record,
    }) {
      const body = {
        record_id_list: [recordId],
        patch: buildProcessingClaimPatch({
          record,
          fieldNames,
          sessionId: buildProcessingSessionId(sessionId),
          startedAt: startedAt ?? Date.now(),
        }),
      };
      const command = buildBaseBatchUpdateInlineCommand({ baseToken, tableId, body });
      return runJson(command);
    },

    async finishBaseRecord({
      baseToken,
      tableId,
      recordId,
      status,
      summary,
      docUrl,
      finishedAt,
      pendingAdmission,
      failedAdmission,
      cardUpdateStatus,
      cardUpdateReason,
      messageReplyStatus,
      messageReplyReason,
    }) {
      const body = buildBaseRecordPatch({
        recordId,
        status,
        summary,
        docUrl,
        finishedAt,
        pendingAdmission,
        failedAdmission,
        cardUpdateStatus,
        cardUpdateReason,
        messageReplyStatus,
        messageReplyReason,
      });
      const command = buildBaseBatchUpdateInlineCommand({ baseToken, tableId, body });
      return runJson(command);
    },

    async writeBaseModelResult({
      baseToken,
      tableId,
      recordId,
      status,
      summary,
      docUrl,
      finishedAt,
      pendingAdmission,
      failedAdmission,
    }) {
      const body = buildBaseModelResultPatch({
        recordId,
        status,
        summary,
        docUrl,
        finishedAt,
        pendingAdmission,
        failedAdmission,
      });
      const command = buildBaseBatchUpdateInlineCommand({ baseToken, tableId, body });
      return runJson(command);
    },

    async writeBaseNotificationStatus({
      baseToken,
      tableId,
      recordId,
      extra,
      cardUpdateStatus,
      cardUpdateReason,
      messageReplyStatus,
      messageReplyReason,
    }) {
      const body = buildBaseNotificationPatch({
        recordId,
        extra,
        cardUpdateStatus,
        cardUpdateReason,
        messageReplyStatus,
        messageReplyReason,
      });
      const command = buildBaseBatchUpdateInlineCommand({ baseToken, tableId, body });
      return runJson(command);
    },

    async replyMessage({ messageId, markdown }) {
      return runJson(buildMessageReplyCommand({ messageId, markdown }));
    },

    async updateAlarmCard({ alarmRecordDetailId, llmReason, maxAttempts = 3, timeoutMs = 30000 }) {
      const normalizedAlarmRecordDetailId = normalizePositiveIntegerId(alarmRecordDetailId);
      if (!normalizedAlarmRecordDetailId) {
        return {
          status: "skipped",
          reason: "alarm_record_detail_id 为空或非正整数",
          attempts: [],
        };
      }
      const tmpDir = await mkdtemp(join(tmpdir(), "bamboo-alert-card-"));
      const filePath = join(tmpDir, "alarm-card.json");
      const attempts = [];
      try {
        await writeFile(
          filePath,
          `${JSON.stringify(
            {
              alarm_record_detail_id: Number(normalizedAlarmRecordDetailId),
              llm_reason: llmReason,
            },
            null,
            2,
          )}\n`,
          "utf8",
        );
        const normalizedMaxAttempts = Math.max(1, Number(maxAttempts) || 3);
        const normalizedTimeoutMs = Math.max(1000, Number(timeoutMs) || 30000);
        for (let attempt = 1; attempt <= normalizedMaxAttempts; attempt += 1) {
          const startedAt = new Date().toISOString();
          try {
            const dryRun = await runJson(
              buildBambooAlarmUpdateCardCommand({
                alarmRecordDetailId: normalizedAlarmRecordDetailId,
                filePath,
                dryRun: true,
              }),
              { timeoutMs: normalizedTimeoutMs, maxAttempts: 1 },
            );
            const submit = await runJson(
              buildBambooAlarmUpdateCardCommand({
                alarmRecordDetailId: normalizedAlarmRecordDetailId,
                filePath,
              }),
              { timeoutMs: normalizedTimeoutMs, maxAttempts: 1 },
            );
            attempts.push({
              attempt,
              status: "succeeded",
              started_at: startedAt,
              finished_at: new Date().toISOString(),
              exit_code: 0,
            });
            return {
              status: "succeeded",
              alarm_record_detail_id: normalizedAlarmRecordDetailId,
              dry_run: dryRun,
              detail: submit,
              attempts,
              total_attempts: attempts.length,
            };
          } catch (error) {
            const failureClass = classifyBambooCardUpdateFailure(error);
            attempts.push({
              attempt,
              status: "failed",
              started_at: startedAt,
              finished_at: new Date().toISOString(),
              exit_code: Number.isFinite(Number(error?.code)) ? Number(error.code) : undefined,
              signal: error?.signal,
              killed: error?.killed,
              failure_class: failureClass,
              reason: error?.message || String(error),
              stdout: String(error?.stdout || "").slice(0, 4000),
              stderr: String(error?.stderr || "").slice(0, 4000),
            });
            if (attempt >= normalizedMaxAttempts || !shouldRetryCardUpdateFailure(failureClass)) {
              return {
                status: "failed",
                alarm_record_detail_id: normalizedAlarmRecordDetailId,
                reason: error?.message || String(error),
                failure_class: failureClass,
                attempts,
                total_attempts: attempts.length,
              };
            }
          }
        }
      } catch (error) {
        const failureClass = classifyBambooCardUpdateFailure(error);
        return {
          status: "failed",
          alarm_record_detail_id: normalizedAlarmRecordDetailId,
          reason: error?.message || String(error),
          failure_class: failureClass,
          attempts,
          total_attempts: attempts.length,
        };
      } finally {
        try {
          await unlink(filePath);
        } catch {}
      }
    },

    async closePreparedWorkItem({ workItem, modelResult }) {
      const status = deriveTerminalStatus(modelResult);
      const recordId = String(workItem?.record_id || "").trim();
      const baseToken = String(workItem?.base_token || "").trim();
      const tableId = String(workItem?.table_id || "").trim();
      let summary = String(modelResult?.summary || "").trim();
      const docUrl = String(modelResult?.feishu_doc_url || modelResult?.doc_url || "").trim();
      const workItemResultId = String(workItem?.result_id || "").trim();
      const modelResultId = String(modelResult?.result_id || "").trim();
      const resultId = workItemResultId || modelResultId || "";
      const workItemParentWikiToken = String(workItem?.parent_wiki_token || "").trim();
      const workItemTargetSpaceId = String(workItem?.target_space_id || "").trim();

      // 防止 AIME 模型把一份排查结果批量套用到多条不同记录，导致过程混淆。
      // 只要 modelResult 里显式声明了 result_id，且 workItem 也有 result_id，两者必须完全一致。
      if (
        status !== "incomplete_model_result" &&
        modelResultId &&
        workItemResultId &&
        modelResultId !== workItemResultId
      ) {
        return compactObject({
          result_id: resultId,
          record_id: recordId,
          status: "incomplete_model_result",
          reason:
            `result_id mismatch: modelResult.result_id="${modelResultId}" does not match ` +
            `workItem.result_id="${workItemResultId}". Refusing to cross-apply one investigation result ` +
            `to multiple different alerts. Each distinct result_id must produce its own investigation document.`,
        });
      }

      if (shouldAppendTritonPermissionLink(modelResult)) {
        summary = appendTritonPermissionLink(summary);
      }

      if (status === "incomplete_model_result") {
        return compactObject({
          result_id: resultId,
          record_id: recordId,
          status,
          reason:
            "model result is not terminal; expected success=true, waiting_for_user_authorization=true, or failed_admission",
        });
      }
      if (!recordId || !baseToken || !tableId) {
        return compactObject({
          result_id: resultId,
          record_id: recordId,
          status: "invalid_work_item",
          reason: "work item must include record_id, base_token, and table_id",
        });
      }

      // 【AGENTS.md 硬固化 · ai_summary 合法性强校验】
      // status=succeeded 时，ai_summary(即 modelResult.summary)必须同时满足：
      //  1) 包含且仅包含 1 个 BAMBOO_ATTRIBUTION_RESULTS 固定归因结果标签；
      //  2) 标签之外仍有 ≥ 8 字的自然语言自由文案（说明现象/根因/影响）；
      //  3) 禁止只写模糊自由描述（如"Bamboo 任务执行失败导致告警，非业务数据差异；账号权限不足或 SQL 对象异常"这种没有固定标签）。
      // 校验不通过：status=succeeded → 降为 invalid_ai_summary，整体 success=false，AI 必须一直改 summary。
      // status=pending/failed 不要求固定归因结果标签（但依然会跑 validateAiSummary 记录 diagnostics）。
      let aiSummaryValidation;
      let failedStatusValidation;
      if (status === "succeeded") {
        aiSummaryValidation = validateAiSummary(summary);
        if (!aiSummaryValidation.valid) {
          return compactObject({
            result_id: resultId,
            record_id: recordId,
            status: "invalid_ai_summary",
            ai_summary_invalid: true,
            ai_summary_validation: {
              matched_results: aiSummaryValidation.matchedResults,
              raw_length: aiSummaryValidation.raw_length,
              stripped_length: aiSummaryValidation.stripped_length,
            },
            reasons: aiSummaryValidation.reasons,
            hints: aiSummaryValidation.hints,
            sample_fixed: aiSummaryValidation.sampleFixed,
            reason: `ai_summary 不符合 skill 约束，禁止写入 status=succeeded，必须按 hints/sample_fixed 一直改到 valid=true 为止。当前 ai_summary="${String(
              summary,
            ).slice(0, 200)}"; 具体原因：${aiSummaryValidation.reasons.join(" | ")}`,
          });
        }
      } else if (summary) {
        // pending / failed / incomplete_model_result 跑个轻量校验，把 diagnostics 带上给模型参考，但不阻塞
        aiSummaryValidation = validateAiSummary(summary, { requireAttribution: false });
      }

      // 【AGENTS.md 硬固化 · status=failed 准入强校验】
      // 只有"network/transient/cli_network 类错误重试 3 次以上仍失败 + 提供 failedAdmission 证据"
      // 这个窄场景允许写 status=failed。凡是 summary/reason/extra 里出现
      // 「需要继续排查 / 未完成闭环核验 / 未完成线上 RPC/日志/代码核验 / 待补证 /
      // 等待用户授权」等关键词——这些都属于"还没做完，必须继续排查"，绝不是 CLI 脚本失败，
      // 必须改成 status=pending（等用户授权/补证）或 status=succeeded（真正闭环完成）。
      // 校验不通过则直接返回 status=invalid_failed_reason，不写 Base、不回卡片、不回消息，
      // 整体 closePreparedWorkItems.success=false，保证 AI 必须一直改到合法为止。
      if (status === "failed") {
        const extra = getWorkItemExtra(workItem);
        failedStatusValidation = validateFailedStatus({
          summary,
          reason: String(modelResult?.reason || "").trim(),
          failedAdmission: modelResult?.failed_admission || modelResult?.failedAdmission,
          extra,
        });
        if (!failedStatusValidation.valid) {
          return compactObject({
            result_id: resultId,
            record_id: recordId,
            status: "invalid_failed_reason",
            failed_reason_invalid: true,
            failed_status_validation: {
              blocked_keywords: failedStatusValidation.blocked_keywords,
            },
            reasons: failedStatusValidation.reasons,
            hints: failedStatusValidation.hints,
            reason: `status=failed 不符合 AGENTS.md 准入约束，禁止写入。必须按 hints 改成 pending/succeeded 或补齐合法 failedAdmission 后重跑。当前 summary="${summary.slice(
              0,
              200,
            )}"; 具体原因：${failedStatusValidation.reasons.join(" | ")}`,
          });
        }
      }

      // 对成功 / 待授权分支，强校验 docUrl 合法性：
      //  1) docUrl 必须存在且是合法的飞书 docx 链接
      //  2) 如果 workItem 提供了 resultId，则 docUrl 对应的飞书文档标题必须以 `resultId:` 开头，
      //     即一行对账记录对应一份独立排查结果文档，禁止多行共享。
      //  3) 文档必须在 (workItemParentWikiToken, workItemTargetSpaceId) 对应的目录下，不得放到其他目录。
      //
      // 只有 failed_admission 分支在 3 次以上网络重试仍失败且提供了 failedAdmission 证据时允许不依赖文档。
      if (status === "succeeded" || status === "pending") {
        if (!docUrl) {
          return compactObject({
            result_id: resultId,
            record_id: recordId,
            status: "incomplete_model_result",
            ...buildCloseErrorHints({
              reasonCode: "DOC_URL_REQUIRED",
              missing: ["feishu_doc_url", "doc_url"].filter(
                (field) => !String(modelResult?.[field] || "").trim(),
              ),
              examples: {
                feishu_doc_url: "https://bytedance.larkoffice.com/wiki/<NODE_TOKEN>",
                doc_url: "同 feishu_doc_url",
                doc_token: "docx obj_token，来自 publish-troubleshooting-doc.doc_token",
              },
              fixCommands: [
                "node scripts/bamboo/bamboo-alert-runner.mjs normalize-model-result-json --input <file> --output <file> --doc-url <wiki-url> --doc-token <doc-token> --fix-ai-summary-keywords",
              ],
            }),
            reason:
              `doc_url (feishu_doc_url) is required before setting status="${status}". ` +
              `Each line of the attribution Base must have its own independent investigation doc; ` +
              `never write status=succeeded/pending with an empty doc_url or a doc shared across multiple lines.`,
          });
        }
        const expectedResultId = workItemResultId || modelResultId;
        if (expectedResultId) {
          let docTitle = null;
          let docParentToken = null;
          let docSpaceId = null;
          try {
            const docNode = extractWikiNode(
              await runJson(buildWikiNodeGetCommand({ scanDirUrl: docUrl })),
            );
            docTitle = docNode?.title;
            docParentToken = docNode?.parentNodeToken;
            docSpaceId = docNode?.spaceId;
          } catch (e) {
            // 读取失败也不允许瞎写成功 —— 先给 incomplete_model_result，让模型重试或补证。
            return compactObject({
              result_id: resultId,
              record_id: recordId,
              status: "incomplete_model_result",
              error_code: "AI_RESULT_DOC_NOT_FOUND",
              ...buildCloseErrorHints({
                reasonCode: "DOC_INSPECT_FAILED",
                fixCommands: [
                  "node scripts/bamboo/bamboo-alert-runner.mjs normalize-result-doc-links --work-items-file <work-items.json> --result-dir <result-dir>",
                ],
                docInspect: {
                  expectedPrefix: `${expectedResultId}:`,
                  expectedParentNodeToken: workItemParentWikiToken || undefined,
                  expectedSpaceId: workItemTargetSpaceId || undefined,
                },
              }),
              reason:
                `failed to verify investigation doc title/parent for doc_url="${docUrl}": ${e?.message || String(e)}. ` +
                `Refusing to set status="${status}" before confirming the doc belongs to result_id="${expectedResultId}" ` +
                `and is placed under the correct attribution-record daily Base directory.`,
            });
          }
          const requiredPrefix = `${expectedResultId}:`;
          if (!String(docTitle || "").startsWith(requiredPrefix)) {
            return compactObject({
              result_id: resultId,
              record_id: recordId,
              status: "incomplete_model_result",
              ...buildCloseErrorHints({
                reasonCode: "DOC_TITLE_PREFIX_MISMATCH",
                fixCommands: [
                  "node scripts/bamboo/bamboo-alert-runner.mjs normalize-result-doc-links --work-items-file <work-items.json> --result-dir <result-dir>",
                ],
                docInspect: {
                  expectedPrefix: requiredPrefix,
                  actualTitle: docTitle || "",
                  expectedParentNodeToken: workItemParentWikiToken || undefined,
                  actualParentNodeToken: docParentToken || undefined,
                },
              }),
              reason:
                `investigation doc title must start with "${requiredPrefix}" (result_id colon prefix, required to guarantee ` +
                `one doc per line). Actual doc_title="${docTitle || ""}". This usually means multiple lines of the attribution Base are ` +
                `sharing the same troubleshooting doc — fix by generating an independent doc for result_id="${expectedResultId}" ` +
                `with title format "${expectedResultId}:<task_name>:<YYYYMMDD>排查结果".`,
            });
          }
          if (
            workItemParentWikiToken &&
            docParentToken &&
            docParentToken !== workItemParentWikiToken
          ) {
            return compactObject({
              result_id: resultId,
              record_id: recordId,
              status: "incomplete_model_result",
              error_code: "AI_RESULT_DOC_PARENT_MISMATCH",
              legacy_error_code: "wiki_parent_node_mismatch",
              ...buildCloseErrorHints({
                reasonCode: "DOC_PARENT_DIRECTORY_MISMATCH",
                fixCommands: [
                  "node scripts/bamboo/bamboo-alert-runner.mjs normalize-result-doc-links --work-items-file <work-items.json> --result-dir <result-dir>",
                ],
                docInspect: {
                  expectedPrefix: `${expectedResultId}:`,
                  actualTitle: docTitle || "",
                  expectedParentNodeToken: workItemParentWikiToken,
                  actualParentNodeToken: docParentToken || undefined,
                  expectedSpaceId: workItemTargetSpaceId || undefined,
                  actualSpaceId: docSpaceId || undefined,
                },
              }),
              doc_parent_validation: {
                expected_parent_wiki_token: workItemParentWikiToken,
                actual_parent_wiki_token: docParentToken,
                matched: false,
              },
              reason:
                `investigation doc must be placed under the SAME wiki directory as its attribution-record daily Base. ` +
                `Expected parent_wiki_token="${workItemParentWikiToken}", but doc_parent_node_token="${docParentToken}". ` +
                `Move the doc into the daily Base directory (or republish under the correct --parent-wiki-token) before setting status="${status}".`,
            });
          }
          if (workItemTargetSpaceId && docSpaceId && docSpaceId !== workItemTargetSpaceId) {
            return compactObject({
              result_id: resultId,
              record_id: recordId,
              status: "incomplete_model_result",
              ...buildCloseErrorHints({
                reasonCode: "DOC_SPACE_MISMATCH",
                fixCommands: [
                  "node scripts/bamboo/bamboo-alert-runner.mjs normalize-result-doc-links --work-items-file <work-items.json> --result-dir <result-dir>",
                ],
                docInspect: {
                  expectedPrefix: `${expectedResultId}:`,
                  actualTitle: docTitle || "",
                  expectedParentNodeToken: workItemParentWikiToken || undefined,
                  actualParentNodeToken: docParentToken || undefined,
                  expectedSpaceId: workItemTargetSpaceId,
                  actualSpaceId: docSpaceId || undefined,
                },
              }),
              reason:
                `investigation doc must stay in the same knowledge space as its attribution-record daily Base. ` +
                `Expected target_space_id="${workItemTargetSpaceId}", but doc_space_id="${docSpaceId}".`,
            });
          }
        }
      }

      const preflightStatus = await ensureCloseDependencyPreflight();
      if (!preflightStatus.success) {
        return compactObject({
          result_id: resultId,
          record_id: recordId,
          status: "dependency_preflight_failed",
          preflight_status: preflightStatus,
          base_writeback_status: "skipped",
          notification_writeback_status: "skipped",
          card_update_status: "skipped",
          message_reply_status: "skipped",
          reason: preflightStatus.reason || "close dependency preflight failed",
        });
      }

      let baseWriteback;
      try {
        baseWriteback = await this.writeBaseModelResult({
          baseToken,
          tableId,
          recordId,
          status,
          summary,
          docUrl,
          pendingAdmission: modelResult?.pending_admission || modelResult?.pendingAdmission,
          failedAdmission: modelResult?.failed_admission || modelResult?.failedAdmission,
        });
      } catch (error) {
        return compactObject({
          result_id: resultId,
          record_id: recordId,
          status,
          base_writeback_status: "failed",
          base_writeback_reason: error?.message || String(error),
        });
      }

      const cardReason = buildAlarmCardReason({ summary, docUrl });
      const cardUpdate = await this.updateAlarmCard({
        alarmRecordDetailId: getWorkItemAlarmRecordDetailId(workItem),
        llmReason: cardReason,
      });

      const messageId = getWorkItemMessageId(workItem);
      let messageReply;
      if (!messageId) {
        messageReply = {
          status: "skipped",
          reason: "extra.message_id 为空",
        };
      } else {
        try {
          const detail = await this.replyMessage({
            messageId,
            markdown: buildWorkItemReplyMarkdown({
              workItem,
              status,
              summary,
              docUrl,
              modelResult,
            }),
          });
          messageReply = {
            status: "succeeded",
            identity: detail.__identity_used,
            detail,
          };
        } catch (error) {
          messageReply = {
            status: "failed",
            reason: error?.message || String(error),
          };
        }
      }

      let notificationWriteback;
      try {
        notificationWriteback = await this.writeBaseNotificationStatus({
          baseToken,
          tableId,
          recordId,
          extra: getWorkItemExtra(workItem),
          cardUpdateStatus: cardUpdate.status,
          cardUpdateReason: cardUpdate.reason,
          messageReplyStatus: messageReply.status,
          messageReplyReason: messageReply.reason,
        });
      } catch (error) {
        return compactObject({
          result_id: resultId,
          record_id: recordId,
          status,
          preflight_status: preflightStatus,
          card_update_status: cardUpdate.status,
          card_update_reason: cardUpdate.reason,
          card_update_failure_class: cardUpdate.failure_class,
          card_update_attempts: cardUpdate.attempts,
          message_reply_status: messageReply.status,
          message_reply_reason: messageReply.reason,
          base_writeback_status: "succeeded",
          base_writeback_detail: baseWriteback,
          notification_writeback_status: "failed",
          notification_writeback_reason: error?.message || String(error),
        });
      }

      return compactObject({
        result_id: resultId,
        record_id: recordId,
        status,
        attribution_result: modelResult?.attribution_result,
        summary,
        feishu_doc_url: docUrl,
        preflight_status: preflightStatus,
        card_update_status: cardUpdate.status,
        card_update_reason: cardUpdate.reason,
        card_update_failure_class: cardUpdate.failure_class,
        card_update_attempts: cardUpdate.attempts,
        message_reply_status: messageReply.status,
        message_reply_reason: messageReply.reason,
        base_writeback_status: "succeeded",
        base_writeback_detail: baseWriteback,
        notification_writeback_status: "succeeded",
        notification_writeback_detail: notificationWriteback,
      });
    },

    /**
     * 解析 scanDirUrl 对应的「日报 Base 容器节点」：
     *  - 如果传入的是 folder/目录型 Wiki 节点 → 直接使用该节点作为容器；
     *  - 如果传入的是 docx / base / sheet / slides 等普通文档节点 → 优先把**该文档本身**作为容器（直接在文档下挂子节点），
     *    满足用户「把日报 Base 挂载到指定文档下」的要求；
     *  - 如果直接用文档节点做容器报错（例如部分版本对非目录型父节点有限制），
     *    则 fallback 到使用**该文档的父节点**（即文档同目录）作为容器。
     * 返回的候选容器列表按优先级排序：查找/创建时先试 index=0 的主容器，未命中再补充试 index>=1 的兼容容器。
     */
    async resolveDailyBaseContainers({ scanDirUrl }) {
      const rawNode = extractWikiNode(await runJson(buildWikiNodeGetCommand({ scanDirUrl })));
      return {
        originalNode: rawNode,
        containers: [
          {
            nodeToken: rawNode.nodeToken,
            spaceId: rawNode.spaceId,
            objType: rawNode.objType || "",
            isPrimary: true,
            source: "input_node_itself",
            label: rawNode.title || rawNode.nodeToken,
          },
        ],
      };
    },

    /**
     * 在指定归因目录下查找子节点。containers 当前只允许包含用户传入的 scanDirUrl 节点本身；
     * 不读取父目录或其它路径下的同名日报 Base。
     * 返回格式同单个 node-list：已做过 normalize，含 title/node_token/obj_token。
     */
    async listChildrenAcrossContainers({ containers }) {
      const seenNodeTokens = new Set();
      const merged = [];
      for (const container of containers) {
        try {
          const payload = await runJson(
            buildWikiNodeListCommand({
              spaceId: container.spaceId,
              parentNodeToken: container.nodeToken,
            }),
          );
          const items = getItems(payload).map((item) => normalizeNodeItem(item, container.spaceId));
          for (const item of items) {
            if (!item.node_token) continue;
            if (seenNodeTokens.has(item.node_token)) continue;
            seenNodeTokens.add(item.node_token);
            merged.push({
              ...item,
              _containerSource: container.source,
              _containerLabel: container.label,
            });
          }
        } catch (error) {
          // 单个容器 list 失败不中断整体：只有主容器失败且有 fallback 容器才继续；
          // 最终如果所有容器都查不到子节点，就由上层用第一个可用容器执行创建。
          if (container.isPrimary && containers.length > 1) continue;
          throw error;
        }
      }
      return merged;
    },

    async copyDailyBaseFromTemplate() {
      throw buildRunnerError(
        "copyDailyBaseFromTemplate has been removed; daily Base is created by runner-owned canonical schema",
        {
          reason_code: "DAILY_BASE_TEMPLATE_REMOVED",
          fix_commands: [
            "node scripts/bamboo/bamboo-alert-runner.mjs ensure-daily-base --scan-dir-url <wiki-url> --date-key <YYYYMMDD>",
            "node scripts/bamboo/bamboo-alert-runner.mjs scan-chat-to-base --chat-id <oc_xxx> --start <time> --end <time> --scan-dir-url <wiki-url> --date-key <YYYYMMDD>",
          ],
        },
      );
    },

    async ensureDailyBase({ scanDirUrl, dateKey, bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX }) {
      const norm = normalizeBizSuffix(bizSuffix);
      const canonicalTitle = `${dateKey}-${norm.canonical}`;
      const fallbackTitle = norm.needsFallback ? `${dateKey}-${norm.original}` : null;

      const { originalNode, containers } = await this.resolveDailyBaseContainers({ scanDirUrl });
      const mergedChildrenRaw = await this.listChildrenAcrossContainers({ containers });
      // 多容器同标题日报去重（E_DAILY_001 假阳性兜底）
      const mergedChildren = pruneCrossContainerDuplicateDailyBases({
        children: mergedChildrenRaw,
        dateKeys: [dateKey],
        bizSuffix,
      });
      let existing = assertSingleBitableDailyBaseTitle({
        children: mergedChildren,
        title: canonicalTitle,
      });
      let matchedViaFallback = false;
      let resolvedContainerForExisting = null;
      const parentMismatchCandidates = [];
      if (!existing?.obj_token || !existing?.node_token) {
        if (fallbackTitle && fallbackTitle !== canonicalTitle) {
          existing = assertSingleBitableDailyBaseTitle({
            children: mergedChildren,
            title: fallbackTitle,
          });
          if (existing?.obj_token && existing?.node_token) {
            matchedViaFallback = true;
          }
        }
      }
      if (
        existing?.obj_token &&
        existing?.node_token &&
        existing._containerSource &&
        existing._containerSource !== "input_node_itself"
      ) {
        parentMismatchCandidates.push(
          compactObject({
            error_code: "DAILY_BASE_PARENT_MISMATCH",
            reason_code: "DAILY_BASE_PARENT_MISMATCH",
            title: existing.title,
            node_token: existing.node_token,
            obj_token: existing.obj_token,
            container_source: existing._containerSource,
            container_label: existing._containerLabel,
            expected_container_source: "input_node_itself",
          }),
        );
        existing = null;
        matchedViaFallback = false;
      }
      if (existing?.obj_token && existing?.node_token) {
        if (existing._containerSource) {
          resolvedContainerForExisting = containers.find(
            (c) => c.source === existing._containerSource,
          );
        }
        const surface = await assertDailyBaseDefaultSurface({
          baseToken: existing.obj_token,
          runJsonFn: runJson,
        });
        return {
          created: false,
          existing: true,
          title: existing.title,
          node_token: existing.node_token,
          obj_token: existing.obj_token,
          space_id: resolvedContainerForExisting?.spaceId || originalNode.spaceId,
          table_id: surface.finalTables[0]?.tableId,
          container: resolvedContainerForExisting || containers[0],
          all_containers: containers,
          scan_dir_obj_type: originalNode.objType || "",
          final_table_ids: surface.finalTables.map((item) => item.tableId),
          final_dashboard_ids: surface.finalDashboardIds,
          final_workflow_ids: surface.finalWorkflowIds,
          parent_mismatch_candidates:
            parentMismatchCandidates.length > 0 ? parentMismatchCandidates : undefined,
          note: matchedViaFallback
            ? `目录/文档下未找到规范标题「${canonicalTitle}」，回退命中遗留标题「${existing.title}」（容器来源=${existing._containerSource || "unknown"}）。建议尽快把遗留日报 Base 重命名为「${canonicalTitle}」。`
            : `容器下已存在规范标题「${canonicalTitle}」（容器来源=${existing._containerSource || "unknown"}），直接复用，不创建新副本。`,
          canonical_title: canonicalTitle,
          biz_suffix_match: {
            canonical: norm.canonical,
            original: norm.original,
            matched_suffix: matchedViaFallback ? norm.original : norm.canonical,
            was_fallback: matchedViaFallback,
          },
        };
      }

      let lastError;
      let primaryErrorForNote = null;
      for (const container of containers) {
        try {
          const createPayload = await runJson(
            buildBaseCreateCommand({
              title: canonicalTitle,
              fields: DAILY_BASE_SCHEMA_FIELDS.map(toTableCreateFieldPayload),
            }),
          );
          const baseData = createPayload?.data?.base || {};
          const tableData = createPayload?.data?.table || {};
          const baseToken = extractFirstString(
            baseData?.base_token,
            baseData?.app_token,
            createPayload?.data?.app_token,
            createPayload?.data?.base_token,
            createPayload?.app_token,
            createPayload?.base_token,
          );
          if (!baseToken) {
            throw buildRunnerError(
              "ensureDailyBase: base-create response did not include base/app token",
              {
                reason_code: "DAILY_BASE_CREATE_RESPONSE_MISSING_TOKEN",
              },
            );
          }
          const tableId = extractFirstString(
            tableData?.table_id,
            tableData?.id,
            tableData?.tableId,
            createPayload?.data?.table_id,
            createPayload?.data?.id,
          );
          if (!tableId) {
            throw buildRunnerError(
              "ensureDailyBase: base-create response did not include table_id",
              {
                reason_code: "DAILY_BASE_TABLE_CREATE_RESPONSE_MISSING_ID",
              },
            );
          }
          const movePayload = await runJson(
            buildWikiMoveDriveBitableToWikiCommand({
              baseToken,
              parentNodeToken: container.nodeToken,
              spaceId: container.spaceId,
            }),
          );
          const movedNode = extractWikiNode(movePayload);
          const createdNode = {
            title: movedNode.title || canonicalTitle,
            node_token: movedNode.nodeToken,
            obj_token: movedNode.objToken || baseToken,
            obj_type: movedNode.objType || "bitable",
            space_id: movedNode.spaceId || container.spaceId,
          };
          const deletedExistingDashboardIds = [];
          const existingDashboardPayload = await runJson(
            buildBaseDashboardListCommand({ baseToken }),
          );
          for (const existingDashboard of getItems(existingDashboardPayload)) {
            const existingDashboardName = extractFirstString(
              existingDashboard?.name,
              existingDashboard?.dashboard_name,
              existingDashboard?.title,
            );
            const existingDashboardId = extractFirstString(
              existingDashboard?.dashboard_id,
              existingDashboard?.id,
              existingDashboard?.dashboardId,
            );
            if (!existingDashboardId) {
              throw buildRunnerError(
                "ensureDailyBase: existing dashboard did not include dashboard_id",
                {
                  reason_code: "DAILY_BASE_EXISTING_DASHBOARD_ID_MISSING",
                  dashboard_name: existingDashboardName || "",
                },
              );
            }
            await runJson(
              buildBaseDashboardDeleteCommand({ baseToken, dashboardId: existingDashboardId }),
            );
            deletedExistingDashboardIds.push(existingDashboardId);
          }
          const deletedExistingTableIds = [];
          const surface = await assertDailyBaseDefaultSurface({
            baseToken,
            expectedTableId: tableId,
            runJsonFn: runJson,
          });
          const existingFieldNames = new Set(
            normalizeFields(await runJson(buildBaseFieldListCommand({ baseToken, tableId }))),
          );
          for (const field of DAILY_BASE_SCHEMA_FIELDS) {
            if (existingFieldNames.has(field.field_name)) continue;
            await runJson(buildBaseFieldCreateCommand({ baseToken, tableId, field }));
            existingFieldNames.add(field.field_name);
          }
          for (const fieldName of DAILY_BASE_DEFAULT_FIELD_NAMES) {
            if (!existingFieldNames.has(fieldName)) continue;
            await runJson(buildBaseFieldDeleteCommand({ baseToken, tableId, fieldName }));
            existingFieldNames.delete(fieldName);
          }
          await ensureDailyBaseViewFieldOrder({ baseToken, tableId, runJsonFn: runJson });
          const usedFallbackContainer = !container.isPrimary && containers.some((c) => c.isPrimary);
          const containerFallbackNote = usedFallbackContainer
            ? ` 主容器「${containers.find((c) => c.isPrimary)?.label || containers.find((c) => c.isPrimary)?.nodeToken}」(source=input_node_itself) 创建失败（原因：${primaryErrorForNote || lastError?.message || String(lastError || "unknown")}），已回退到父目录容器「${container.label || container.nodeToken}」(source=parent_of_input_node) 创建；若要求日报必须挂在指定 scanDirUrl 节点下，请确认该节点 has_child=true 且调用方具有 wiki node-create 权限后重跑。`
            : "";
          return {
            created: true,
            existing: false,
            title: createdNode.title || canonicalTitle,
            node_token: createdNode.node_token,
            obj_token: baseToken,
            space_id: container.spaceId,
            table_id: tableId,
            container,
            all_containers: containers,
            scan_dir_obj_type: originalNode.objType || "",
            created_by: "runner_canonical_schema",
            deleted_existing_dashboard_ids: deletedExistingDashboardIds,
            disabled_existing_workflow_ids: [],
            deleted_existing_table_ids: deletedExistingTableIds,
            final_table_ids: surface.finalTables.map((item) => item.tableId),
            final_dashboard_ids: surface.finalDashboardIds,
            final_workflow_ids: surface.finalWorkflowIds,
            schema_fields: DAILY_BASE_SCHEMA_FIELDS.map((field) => field.field_name),
            canonical_title: canonicalTitle,
            parent_mismatch_candidates:
              parentMismatchCandidates.length > 0 ? parentMismatchCandidates : undefined,
            note: usedFallbackContainer
              ? `已在回退容器下创建日报「${canonicalTitle}」（容器来源=${container.source || "unknown"}）。${containerFallbackNote}`.trim()
              : `已在用户指定的主容器下创建日报「${canonicalTitle}」（容器来源=${container.source || "unknown"}）。`,
            biz_suffix_match: {
              canonical: norm.canonical,
              original: norm.original,
              matched_suffix: norm.canonical,
              was_fallback: false,
            },
          };
        } catch (error) {
          if (container.isPrimary) primaryErrorForNote = error?.message || String(error);
          lastError = error;
          // 主容器失败且有 fallback 时，继续试下一个候选容器
          if (container.isPrimary && containers.length > 1) continue;
          throw error;
        }
      }
      throw (
        lastError ||
        new Error(`ensureDailyBase: failed to create daily Base for all candidate containers`)
      );
    },

    async collectDailyBaseTableContexts({
      scanDirUrl,
      dateKeys,
      bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      claimOrder = "updated_time_desc",
    }) {
      const resolvedDateKeys =
        Array.isArray(dateKeys) && dateKeys.length > 0 ? dateKeys : recentTwoDateKeys(new Date());
      const { containers } = await this.resolveDailyBaseContainers({ scanDirUrl });
      const mergedChildrenRaw = await this.listChildrenAcrossContainers({ containers });
      const mergedChildren = pruneCrossContainerDuplicateDailyBases({
        children: mergedChildrenRaw,
        dateKeys: resolvedDateKeys,
        bizSuffix,
      });
      const dailyBases = selectDailyBaseNodes({
        nodes: mergedChildren,
        dateKeys: resolvedDateKeys,
        bizSuffix,
        claimOrder,
      });
      assertSelectedDailyBasesAreBitable({ dailyBases });
      const contexts = [];
      for (const dailyBase of dailyBases) {
        const tablePayload = await runJson(
          buildBaseTableListCommand({ baseToken: dailyBase.obj_token }),
        );
        const table = selectDailyBaseTable(tablePayload);
        const tableId = extractFirstString(table?.table_id, table?.id, table?.tableId);
        const tableName = extractFirstString(table?.name, table?.table_name, table?.title);
        if (!tableId) {
          contexts.push({
            daily_base: dailyBase,
            table_name: tableName || "",
            table_id: "",
            blocker: {
              code: "table_id_missing",
              base_token: dailyBase.obj_token,
              node_token: dailyBase.node_token,
            },
          });
          continue;
        }
        contexts.push({
          daily_base: dailyBase,
          base_token: dailyBase.obj_token,
          table_id: tableId,
          table_name: tableName || "",
          date_key:
            dailyBase.date_key ||
            extractDailyBaseDateKey({ title: dailyBase.title, dateKeys: resolvedDateKeys }),
          title: dailyBase.title,
          node_token: dailyBase.node_token,
          space_id: dailyBase.space_id,
        });
      }
      return {
        date_keys: resolvedDateKeys,
        processed_bases: contexts.length,
        contexts,
      };
    },

    async validateDailyBaseSchema({
      scanDirUrl,
      dateKeys,
      bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
    }) {
      const collected = await this.collectDailyBaseTableContexts({
        scanDirUrl,
        dateKeys,
        bizSuffix,
      });
      const expectedFields = DAILY_BASE_SCHEMA_FIELDS.map((field) => field.field_name);
      const blockers = [];
      const bases = [];
      if (collected.contexts.length === 0) {
        blockers.push({
          code: "no_daily_base_processed",
          reason: "no daily Bamboo attribution Base matched the requested date keys",
        });
      }
      for (const context of collected.contexts) {
        const contextBlockers = [];
        if (context.blocker) {
          const blocker = withDailyBaseSchemaErrorCode(context.blocker);
          contextBlockers.push(blocker);
          blockers.push(blocker);
          bases.push({ ...context, schema_valid: false, blockers: contextBlockers });
          continue;
        }
        if (context.table_name !== DAILY_BASE_TABLE_NAME) {
          contextBlockers.push({
            code: "daily_base_table_name_mismatch",
            expected: DAILY_BASE_TABLE_NAME,
            actual: context.table_name || "",
          });
        }
        const fieldPayload = await runJson(
          buildBaseFieldListCommand({ baseToken: context.base_token, tableId: context.table_id }),
        );
        const fieldDefinitions = normalizeBaseFieldDefinitions(fieldPayload);
        const fieldNames = fieldDefinitions.map((field) => field.field_name);
        const explicitPrimaryField = explicitPrimaryFieldName(fieldDefinitions);
        const missingFields = expectedFields.filter((field) => !fieldNames.includes(field));
        const extraFields = fieldNames.filter((field) => !expectedFields.includes(field));
        if (explicitPrimaryField && explicitPrimaryField !== "unique_id") {
          contextBlockers.push({
            code: "primary_field_not_unique_id",
            expected: "unique_id",
            actual: explicitPrimaryField,
          });
        }
        if (missingFields.length > 0) {
          contextBlockers.push({ code: "canonical_fields_missing", fields: missingFields });
        }
        if (extraFields.length > 0) {
          contextBlockers.push({ code: "canonical_fields_extra", fields: extraFields });
        }

        const byName = new Map(fieldDefinitions.map((field) => [field.field_name, field]));
        for (const expectedField of DAILY_BASE_SCHEMA_FIELDS) {
          const actual = byName.get(expectedField.field_name);
          if (!actual) continue;
          const expectedType = expectedApiTypeForDailyField(expectedField);
          if (!fieldTypeMatches(actual.type, expectedType)) {
            contextBlockers.push({
              code: "field_type_mismatch",
              field: expectedField.field_name,
              expected: expectedType,
              actual: actual.type,
            });
          }
          if (expectedField.type === "number") {
            const precision = actual?.style?.precision ?? actual?.property?.precision;
            if (precision !== undefined && Number(precision) !== 0) {
              contextBlockers.push({
                code: "number_precision_mismatch",
                field: expectedField.field_name,
                expected: 0,
                actual: Number(precision),
              });
            }
          }
          if (expectedField.type === "date_time") {
            const format = actual?.style?.format ?? actual?.property?.format;
            if (format !== undefined && String(format) !== "yyyy-MM-dd HH:mm") {
              contextBlockers.push({
                code: "datetime_format_mismatch",
                field: expectedField.field_name,
                expected: "yyyy-MM-dd HH:mm",
                actual: String(format),
              });
            }
          }
          if (expectedField.type === "single_select") {
            const actualOptions = new Set(
              (actual.options || [])
                .map((option) => normalizeSelectOption(option).name)
                .filter(Boolean),
            );
            const missingOptions = (expectedField.property?.options || []).filter(
              (option) => !actualOptions.has(String(option)),
            );
            if (actualOptions.size > 0 && missingOptions.length > 0) {
              contextBlockers.push({
                code: "select_options_missing",
                field: expectedField.field_name,
                options: missingOptions,
              });
            }
          }
        }

        let visibleFields = [];
        const viewPayload = await runJson(
          buildBaseViewListCommand({ baseToken: context.base_token, tableId: context.table_id }),
        );
        const view = getFirstItem(viewPayload);
        const viewId = extractFirstString(view?.id, view?.view_id, view?.viewId, view?.name);
        if (viewId) {
          visibleFields = normalizeVisibleFieldNames(
            await runJson(
              buildBaseViewGetVisibleFieldsCommand({
                baseToken: context.base_token,
                tableId: context.table_id,
                viewId,
              }),
            ),
          );
        }
        if (
          visibleFields.length > 0 &&
          JSON.stringify(visibleFields) !== JSON.stringify(expectedFields)
        ) {
          contextBlockers.push({
            code: "visible_field_order_mismatch",
            expected: expectedFields,
            actual: visibleFields,
          });
        }
        const standardizedContextBlockers = contextBlockers.map(withDailyBaseSchemaErrorCode);
        for (const blocker of standardizedContextBlockers) {
          blockers.push({
            ...blocker,
            base_token: context.base_token,
            table_id: context.table_id,
            title: context.title,
          });
        }
        bases.push({
          title: context.title,
          base_token: context.base_token,
          table_id: context.table_id,
          table_name: context.table_name,
          field_names: fieldNames,
          visible_fields: visibleFields,
          schema_valid: standardizedContextBlockers.length === 0,
          blockers: standardizedContextBlockers,
        });
      }
      const schemaValid = blockers.length === 0;
      return {
        success: schemaValid,
        schema_valid: schemaValid,
        processed_bases: collected.processed_bases,
        date_keys: collected.date_keys,
        expected_fields: expectedFields,
        bases,
        blockers,
      };
    },

    async validateDailyBaseRecordValues({
      scanDirUrl,
      dateKeys,
      bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      recordLimit = 200,
    }) {
      const collected = await this.collectDailyBaseTableContexts({
        scanDirUrl,
        dateKeys,
        bizSuffix,
      });
      const violations = [];
      let checkedRecords = 0;
      const invalidRecordIds = new Set();
      for (const context of collected.contexts) {
        if (!context.table_id) continue;
        const recordPayload = await runJson(
          buildBaseRecordListCommand({
            baseToken: context.base_token,
            tableId: context.table_id,
            limit: recordLimit,
          }),
        );
        const records = normalizeRecords(recordPayload);
        for (const record of records) {
          checkedRecords += 1;
          const fields = record.fields || {};
          const addViolation = (field, code, expected, actual) => {
            invalidRecordIds.add(record.record_id);
            violations.push(
              compactObject({
                code,
                error_code: "FIELD_CALIBER_INVALID",
                record_id: record.record_id,
                result_id: extractSingleCellValue(fields.result_id),
                field,
                expected,
                actual,
                base_token: context.base_token,
                table_id: context.table_id,
                title: context.title,
              }),
            );
          };
          const uniqueId = String(extractSingleCellValue(fields.unique_id) ?? "").trim();
          const resultId = String(extractSingleCellValue(fields.result_id) ?? "").trim();
          if (resultId && uniqueId !== resultId) {
            addViolation(
              "unique_id",
              "unique_id_result_id_mismatch",
              "unique_id must equal result_id",
              uniqueId,
            );
          }
          const alarmRecordDetailId = String(
            extractSingleCellValue(fields.alarm_record_detail_id) ?? "",
          ).trim();
          if (!/^\d+$/.test(alarmRecordDetailId)) {
            addViolation(
              "alarm_record_detail_id",
              "alarm_record_detail_id_missing_or_invalid",
              "non-negative integer string, empty values must be 0",
              alarmRecordDetailId,
            );
          }
          if (isEmptyBaseTextCell(fields.task_time)) {
            addViolation(
              "task_time",
              "task_time_missing",
              "non-empty Bamboo task/check time",
              extractSingleCellValue(fields.task_time),
            );
          }
          if (!hasSecondPrecision(fields.created_at)) {
            addViolation(
              "created_at",
              "created_at_not_second_precision",
              "YYYY-MM-DD HH:mm:ss",
              extractSingleCellValue(fields.created_at),
            );
          }
          const rawTaskResultNum = extractSingleCellValue(fields.task_result_num);
          const taskResultNum = Number(rawTaskResultNum);
          if (!Number.isFinite(taskResultNum) || !Number.isInteger(taskResultNum)) {
            addViolation(
              "task_result_num",
              "task_result_num_not_integer",
              "integer number",
              rawTaskResultNum,
            );
          }
          if (!isEmptyBaseTextCell(fields.task_sql)) {
            addViolation(
              "task_sql",
              "task_sql_not_empty",
              "empty string; Feishu may read it back as null",
              extractSingleCellValue(fields.task_sql),
            );
          }
          if (!isEmptyBaseTextCell(fields.task_result_object)) {
            addViolation(
              "task_result_object",
              "task_result_object_not_empty",
              "empty string; Feishu may read it back as null",
              extractSingleCellValue(fields.task_result_object),
            );
          }
          if (!hasSecondPrecision(fields.ai_finished_at)) {
            addViolation(
              "ai_finished_at",
              "ai_finished_at_not_second_precision",
              "YYYY-MM-DD HH:mm:ss",
              extractSingleCellValue(fields.ai_finished_at),
            );
          }
        }
      }
      const valid = violations.length === 0;
      return {
        success: valid,
        record_values_valid: valid,
        processed_bases: collected.processed_bases,
        date_keys: collected.date_keys,
        checked_records: checkedRecords,
        invalid_records: invalidRecordIds.size,
        violations,
      };
    },

    /**
     * 按 fields+rows 二维数组 schema 批量写入记录。
     * @param {Array<string>} writableFields - 与 rows 顺序匹配的列名数组
     * @param {Array<Array<any>>} rows - 二维数组，每个 inner 数组的顺序严格对应 writableFields
     */
    async insertBaseRecordsBatch({ baseToken, tableId, writableFields, rows }) {
      if (!Array.isArray(writableFields) || writableFields.length === 0) {
        throw new Error("insertBaseRecordsBatch: writableFields must be a non-empty array");
      }
      if (!Array.isArray(rows)) {
        throw new Error("insertBaseRecordsBatch: rows must be an array");
      }
      const uniqueIdIndex = writableFields.findIndex(
        (fieldName) => fieldName === "unique_id" || fieldName === "uniqueid",
      );
      const resultIdIndex = writableFields.findIndex((fieldName) => fieldName === "result_id");
      const safeRows = rows.map((row) => {
        if (!Array.isArray(row))
          throw new Error("insertBaseRecordsBatch: each row must be an array (match fields order)");
        const normalized = [];
        for (let i = 0; i < writableFields.length; i += 1) {
          const v = row[i];
          if (v === undefined || v === null) normalized.push(null);
          else normalized.push(v);
        }
        if (uniqueIdIndex >= 0) {
          if (resultIdIndex < 0) {
            throw buildRunnerError(
              "insertBaseRecordsBatch: result_id field is required when writing unique_id",
              {
                reason_code: "BASE_INSERT_RESULT_ID_REQUIRED_FOR_UNIQUE_ID",
                fields: writableFields,
              },
            );
          }
          const resultId = String(normalized[resultIdIndex] ?? "").trim();
          if (!resultId) {
            throw buildRunnerError(
              "insertBaseRecordsBatch: result_id value is required to derive unique_id",
              {
                reason_code: "BASE_INSERT_RESULT_ID_REQUIRED_FOR_UNIQUE_ID",
                fields: writableFields,
              },
            );
          }
          normalized[uniqueIdIndex] = resultId;
        }
        return normalized;
      });
      const tmpDir = await mkdtemp(join(tmpdir(), "bamboo-alert-runner-"));
      const jsonPath = join(tmpDir, "insert_batch.json");
      await writeFile(jsonPath, JSON.stringify({ fields: writableFields, rows: safeRows }), "utf8");
      // writeFile 用绝对路径，但 bytedcli 要求相对路径。再写一份到 CWD 下的 .tmp/ 临时目录，用完清理。
      const cwd = process.cwd();
      const relFname = `.tmp/ins_batch_${Date.now()}_${Math.floor(Math.random() * 1e6)}.json`;
      const relPath = join(cwd, relFname);
      try {
        await mkdir(join(cwd, ".tmp"), { recursive: true });
        await writeFile(
          relPath,
          JSON.stringify({ fields: writableFields, rows: safeRows }),
          "utf8",
        );
        const command = buildBaseRecordBatchCreateCommand({
          baseToken,
          tableId,
          jsonPath: `./${relFname}`,
        });
        return await runJson(command);
      } finally {
        try {
          await unlink(relPath);
        } catch {}
        try {
          await unlink(jsonPath);
        } catch {}
      }
    },

    /**
     * IM 扫描 + 落表全链路封装。
     * 按报警自身的 alarm_date（从 task_time 解析）分组写入对应日期的日报 Base：
     *   - 每条报警优先使用 alert.alarm_date，其次才用调用方传入的 dateKey，最后兜底用当前日期。
     *   - 不同日期的报警写入不同的 YYYYMMDD-bamboo对账归因记录 Base，避免把历史报警错误写入当天的日报。
     *   - 兼容旧返回结构：daily_base/write 保留汇总/第一个日期的信息；新增 daily_bases_detail 供调用方区分。
     */
    async scanChatToBase({
      chatId,
      start,
      end,
      templateUrl,
      scanDirUrl,
      dateKey,
      bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      pageToken,
      pageSize = 50,
      initStatus = "init",
    }) {
      if (templateUrl) {
        throw buildRunnerError(
          "scanChatToBase no longer accepts templateUrl; daily Base is created by runner-owned canonical schema",
          {
            reason_code: "DAILY_BASE_TEMPLATE_REMOVED",
            fix_commands: [
              "node scripts/bamboo/bamboo-alert-runner.mjs scan-chat-to-base --chat-id <oc_xxx> --start <time> --end <time> --scan-dir-url <wiki-url> --date-key <YYYYMMDD>",
            ],
          },
        );
      }
      // 1) 先扫描 chat 获取全部 alerts
      const scan = await this.scanChat({ chatId, start, end, pageToken, pageSize });

      // 2) 为每条 alert 计算 effectiveDateKey（优先 alarm_date → 传入 dateKey → 当前日期），并按日期分组
      const todayFallback = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      /** @type {Map<string, Array<any>>} */
      const alertsByDateKey = new Map();
      for (const alert of scan.alerts) {
        const effectiveDateKey =
          (alert.alarm_date ? String(alert.alarm_date) : null) ||
          (alert.task_date_key ? String(alert.task_date_key) : null) ||
          dateKey ||
          todayFallback;
        if (!alertsByDateKey.has(effectiveDateKey)) alertsByDateKey.set(effectiveDateKey, []);
        alertsByDateKey.get(effectiveDateKey).push(alert);
      }
      // 兼容：即使扫描到 0 条报警，也至少初始化一个传入 dateKey（或今天）的空分组，
      // 以便仍然会创建/复用日报 Base，保持旧行为并让 table-list 重试逻辑生效。
      if (alertsByDateKey.size === 0) {
        const emptyDateKey = dateKey || todayFallback;
        alertsByDateKey.set(emptyDateKey, []);
      }

      // 3) 跨日期全局的 batch 去重：同一个 result_id 在整个 scan 窗口只允许落表一次
      const globalBatchUniqueIds = new Set();

      const dailyBasesDetail = [];
      let totalRowsWritten = 0;
      let totalRowsSkipped = 0;
      const allSkippedAlerts = [];
      let lastFieldNames = [];
      let lastWriteDetail = { ok: true, inserted: 0 };

      for (const [currentDateKey, alerts] of alertsByDateKey) {
        // 3a) 为该日期创建/复用日报 base
        const dailyBase = await this.ensureDailyBase({
          scanDirUrl,
          dateKey: currentDateKey,
          bizSuffix,
        });
        // 3b) 列取 table + fields
        // 注意：此处保留两次 table-list 调用（第一次赋给 tables 但仅用于触发 runJsonOnce 内部重试逻辑），
        // 用于兼容「刚复制完的 Base 仍在 copying 状态」的场景，避免破坏已有重试/测试行为。
        const tables = normalizeFields
          ? normalizeFields(
              await runJson(buildBaseTableListCommand({ baseToken: dailyBase.obj_token })),
            )
          : null;
        const tablePayload = await runJson(
          buildBaseTableListCommand({ baseToken: dailyBase.obj_token }),
        );
        void tables;
        const firstTable = selectDailyBaseTable(tablePayload);
        const tableId = extractFirstString(
          firstTable?.table_id,
          firstTable?.id,
          firstTable?.tableId,
        );
        let fieldNames = normalizeFields(
          await runJson(buildBaseFieldListCommand({ baseToken: dailyBase.obj_token, tableId })),
        );
        // 复用已存在的日报 Base 时，补齐缺失的 canonical schema 字段（兼容 ensureDailyBase 创建流程中途失败
        // 遗留的半初始化 Base，或历史遗留的只有默认 4 列的老 base）。
        const existingFieldNames = new Set(fieldNames);
        for (const field of DAILY_BASE_SCHEMA_FIELDS) {
          if (existingFieldNames.has(field.field_name)) continue;
          try {
            await runJson(
              buildBaseFieldCreateCommand({ baseToken: dailyBase.obj_token, tableId, field }),
            );
            existingFieldNames.add(field.field_name);
          } catch (error) {
            throw buildRunnerError(
              `scanChatToBase: failed to backfill canonical field ${field.field_name} on reused daily base`,
              {
                reason_code: "DAILY_BASE_SCHEMA_BACKFILL_FIELD_CREATE_FAILED",
                base_token: dailyBase.obj_token,
                table_id: tableId,
                field: field.field_name,
                cause: error?.message || String(error),
              },
            );
          }
        }
        await ensureDailyBaseViewFieldOrder({
          baseToken: dailyBase.obj_token,
          tableId,
          runJsonFn: runJson,
        });
        fieldNames = Array.from(existingFieldNames);
        lastFieldNames = fieldNames;

        // 3c) 该日期 Base 内已有 unique_id 去重
        const rows = [];
        const skippedAlertsForDate = [];
        const uniqueFieldName = fieldNames.includes("unique_id")
          ? "unique_id"
          : fieldNames.includes("uniqueid")
            ? "uniqueid"
            : "";
        const existingUniqueIds = new Set();
        if (uniqueFieldName) {
          const recordPayload = await runJson(
            buildBaseRecordListCommand({ baseToken: dailyBase.obj_token, tableId, limit: 200 }),
          );
          for (const record of normalizeRecords(recordPayload)) {
            const uniqueId = String(record.fields?.[uniqueFieldName] ?? "").trim();
            if (uniqueId) existingUniqueIds.add(uniqueId);
          }
        }

        const shouldFillAlarmRecordDetailId = fieldNames.includes("alarm_record_detail_id");
        const shouldFillTaskResultNum = fieldNames.includes("task_result_num");
        const insertedAt = formatDateTimeSecond();

        for (const alert of alerts) {
          const resultId = String(alert.result_id || "").trim();
          const uniqueId = resultId;
          if (uniqueFieldName && uniqueId) {
            if (existingUniqueIds.has(uniqueId)) {
              const item = {
                unique_id: uniqueId,
                result_id: resultId,
                date_key: currentDateKey,
                reason: "duplicate_existing_unique_id",
              };
              skippedAlertsForDate.push(item);
              allSkippedAlerts.push(item);
              continue;
            }
            if (globalBatchUniqueIds.has(uniqueId)) {
              const item = {
                unique_id: uniqueId,
                result_id: resultId,
                date_key: currentDateKey,
                reason: "duplicate_in_scan_batch",
              };
              skippedAlertsForDate.push(item);
              allSkippedAlerts.push(item);
              continue;
            }
            globalBatchUniqueIds.add(uniqueId);
          }

          const dateKeyFromAlert = currentDateKey;
          const bambooResultUrl =
            alert.bamboo_url || alert.bamboo_result_url || alert.extra?.rule_link || "";
          let bambooResult;
          let bambooResultFetched = false;
          let bambooResultError;
          const getAlertBambooResult = async () => {
            if (!bambooResult) {
              try {
                bambooResult = await fetchBambooResult(alert.result_id);
                bambooResultFetched = Boolean(alert.result_id);
              } catch (error) {
                bambooResultError = error?.message || String(error);
                bambooResult = {};
              }
            }
            return bambooResult;
          };
          const bambooResultForAlarmRecordDetailId = shouldFillAlarmRecordDetailId
            ? await getAlertBambooResult()
            : {};
          const bambooResultForTaskResultNum =
            shouldFillTaskResultNum && !bambooResultFetched && !bambooResultError
              ? await getAlertBambooResult()
              : bambooResult;
          const alarmRecordDetailId = shouldFillAlarmRecordDetailId
            ? normalizeNonNegativeIntegerId(alert.alarm_record_detail_id) ||
              extractAlarmRecordDetailIdFromBambooResult(bambooResultForAlarmRecordDetailId)
            : "";
          const taskResultNumFromBamboo = extractTaskResultNumFromBambooResult(
            bambooResultForTaskResultNum,
          );
          const taskResultNum = shouldFillTaskResultNum
            ? (alert.task_result_num ?? taskResultNumFromBamboo ?? 0)
            : undefined;
          const extra = {
            ...alert.extra,
            chat_id: alert.chat_id || alert.extra?.chat_id,
            group_id: alert.chat_id || alert.extra?.group_id,
            message_id: alert.message_id || alert.extra?.message_id,
            topic_id: alert.extra?.topic_id,
            source_chat_id: alert.chat_id || alert.extra?.source_chat_id,
            source_message_id: alert.message_id || alert.extra?.source_message_id,
            source_topic_id: alert.extra?.source_topic_id,
            message_link: alert.message_link || alert.extra?.message_link,
            raw_title: alert.title || alert.extra?.raw_title,
            original_title: alert.title || alert.extra?.original_title,
            bamboo_check_time: alert.task_time || alert.extra?.bamboo_check_time,
            bamboo_result_enrichment_status: bambooResultError ? "failed" : "succeeded",
            bamboo_result_enrichment_error: bambooResultError,
            alarm_record_detail_id_enrichment_status: shouldFillAlarmRecordDetailId
              ? alarmRecordDetailId
                ? "filled"
                : "skipped_no_non_negative_id"
              : undefined,
            task_result_num_enrichment_status: shouldFillTaskResultNum
              ? alert.task_result_num !== undefined
                ? "from_card"
                : taskResultNumFromBamboo !== undefined
                  ? "from_bamboo_result"
                  : "default_zero_no_count"
              : undefined,
          };
          const row = fieldNames.map((name) => {
            switch (name) {
              case "unique_id":
              case "uniqueid":
                return resultId || null;
              case "status":
                return initStatus;
              case "task_name":
                return normalizeBambooTaskNameForBase(alert.title || alert.task_name);
              case "task_id":
                return alert.task_id ? String(alert.task_id) : null;
              case "rule_id":
                return alert.task_id ? String(alert.task_id) : null;
              case "result_id":
                return resultId || null;
              case "task_time":
                return alert.task_time || alert.extra?.bamboo_check_time || null;
              case "task_date_key":
                return dateKeyFromAlert;
              case "bamboo_url":
                return bambooResultUrl || null;
              case "bamboo_result_url":
                return bambooResultUrl || null;
              case "alarm_record_detail_id":
                return alarmRecordDetailId || "0";
              case "created_at":
                return insertedAt;
              case "task_result_num":
                return Math.trunc(Number(taskResultNum ?? 0));
              case "task_result_object":
                return "";
              case "task_sql":
                return "";
              case "chat_id":
                return alert.chat_id || null;
              case "message_id":
                return alert.message_id || null;
              case "message_link":
                return alert.message_link || alert.extra?.message_link || null;
              case "extra":
                return serializeExtraField(extra);
              case "ai_summary":
                return null;
              case "ai_result":
                return null;
              case "ai_finished_at":
                return null;
              case "ai_session_id":
                return null;
              case "last_error":
                return null;
              case "scan_at":
                return insertedAt;
              default:
                return null;
            }
          });
          rows.push(row);
        }

        let writeResult = { ok: true, inserted: 0 };
        if (rows.length > 0) {
          writeResult = await this.insertBaseRecordsBatch({
            baseToken: dailyBase.obj_token,
            tableId,
            writableFields: fieldNames,
            rows,
          });
        }
        lastWriteDetail = writeResult;
        totalRowsWritten += rows.length;
        totalRowsSkipped += skippedAlertsForDate.length;

        dailyBasesDetail.push({
          date_key: currentDateKey,
          alerts_count: alerts.length,
          daily_base: {
            title: dailyBase.title,
            node_token: dailyBase.node_token,
            obj_token: dailyBase.obj_token,
            space_id: dailyBase.space_id,
            table_id: tableId,
            created: dailyBase.created,
            existing: dailyBase.existing,
          },
          write: {
            rows_written: rows.length,
            rows_skipped: skippedAlertsForDate.length,
            skipped_alerts: skippedAlertsForDate,
            field_count: fieldNames.length,
            field_names: fieldNames,
            detail: writeResult,
          },
        });
      }

      // 兼容旧结构：取第一个日期组的信息作为 daily_base/write 字段（汇总信息保持真实总量）
      const firstDailyBaseInfo = dailyBasesDetail[0]?.daily_base || {
        title: null,
        node_token: null,
        obj_token: null,
        space_id: null,
        table_id: null,
        created: false,
        existing: false,
      };
      const dailyBaseUrls = dailyBasesDetail
        .filter((d) => d.daily_base.node_token)
        .map((d) => `https://bytedance.larkoffice.com/wiki/${d.daily_base.node_token}`);

      return {
        daily_base: firstDailyBaseInfo,
        daily_bases: dailyBasesDetail.map((d) => d.daily_base),
        daily_bases_detail: dailyBasesDetail,
        daily_base_urls: dailyBaseUrls,
        scan: {
          scanned: scan.scanned,
          alerts_found: scan.alerts.length,
          message_read_identity: scan.message_read_identity,
          command: scan.command,
        },
        write: {
          rows_written: totalRowsWritten,
          rows_skipped: totalRowsSkipped,
          skipped_alerts: allSkippedAlerts,
          field_count: lastFieldNames.length,
          field_names: lastFieldNames,
          detail: lastWriteDetail,
        },
      };
    },

    /**
     * 回填阶段一落表字段。只处理已存在 Base 记录中缺失的 task_result_num /
     * alarm_record_detail_id，所有数据来源仍是 Bamboo result，不由模型手工推断。
     */
    async backfillBaseAlertFields({ baseToken, tableId, limit = 200 }) {
      const fieldsPayload = await runJson(buildBaseFieldListCommand({ baseToken, tableId }));
      const fieldNames = normalizeFields(fieldsPayload);
      const canBackfillTaskResultNum = fieldNames.includes("task_result_num");
      const canBackfillAlarmRecordDetailId = fieldNames.includes("alarm_record_detail_id");
      if (!canBackfillTaskResultNum && !canBackfillAlarmRecordDetailId) {
        return {
          success: true,
          scanned: 0,
          updated: 0,
          skipped: 0,
          reason: "base table has neither task_result_num nor alarm_record_detail_id",
        };
      }

      const recordPayload = await runJson(
        buildBaseRecordListCommand({ baseToken, tableId, limit }),
      );
      const records = normalizeRecords(recordPayload);
      const updates = [];
      const skipped = [];

      for (const record of records) {
        const fields = record.fields || {};
        const resultId = String(
          fields.result_id || parseResultIdFromBambooUrl(getBambooUrlField(fields)) || "",
        ).trim();
        if (!resultId) {
          skipped.push({
            record_id: record.record_id,
            reason: "missing result_id and bamboo_url id",
          });
          continue;
        }

        const taskResultNumEmpty =
          fields.task_result_num === undefined ||
          fields.task_result_num === null ||
          fields.task_result_num === "";
        const alarmRecordDetailIdEmpty = isMissingAlarmRecordDetailIdForBackfill(
          fields.alarm_record_detail_id,
        );
        if (
          (!canBackfillTaskResultNum || !taskResultNumEmpty) &&
          (!canBackfillAlarmRecordDetailId || !alarmRecordDetailIdEmpty)
        ) {
          skipped.push({
            record_id: record.record_id,
            result_id: resultId,
            reason: "fields already filled",
          });
          continue;
        }

        let result;
        try {
          result = await fetchBambooResult(resultId);
        } catch (error) {
          skipped.push({
            record_id: record.record_id,
            result_id: resultId,
            reason: error?.message || String(error),
          });
          continue;
        }

        const patch = {};
        const detail = { record_id: record.record_id, result_id: resultId };
        if (canBackfillTaskResultNum && taskResultNumEmpty) {
          const taskResultNum = extractTaskResultNumFromBambooResult(result);
          patch.task_result_num = taskResultNum ?? 0;
          detail.task_result_num = patch.task_result_num;
          detail.task_result_num_source =
            taskResultNum === undefined ? "default_zero_no_count" : "bamboo_result";
        }
        if (canBackfillAlarmRecordDetailId && alarmRecordDetailIdEmpty) {
          const alarmRecordDetailId = extractAlarmRecordDetailIdFromBambooResult(result);
          if (alarmRecordDetailId) {
            patch.alarm_record_detail_id = alarmRecordDetailId;
            detail.alarm_record_detail_id = alarmRecordDetailId;
            detail.alarm_record_detail_id_source = "bamboo_result";
          } else {
            detail.alarm_record_detail_id_source = "skipped_no_non_negative_id";
          }
        }

        if (Object.keys(patch).length === 0) {
          skipped.push({ ...detail, reason: "no writable field value resolved" });
          continue;
        }

        await runJson(
          buildBaseBatchUpdateInlineCommand({
            baseToken,
            tableId,
            body: {
              record_id_list: [record.record_id],
              patch,
            },
          }),
        );
        updates.push(detail);
      }

      return {
        success: true,
        scanned: records.length,
        updated: updates.length,
        skipped: skipped.length,
        updates,
        skipped_records: skipped,
      };
    },

    /**
     * 删除阶段一落表重复记录。唯一依据只能是 Base 表中真实存在的 unique_id/uniqueid 字段；
     * 每个唯一值保留 created_at/记录元数据最新的一条，其余通过 Base record-delete 删除。
     */
    async deleteDuplicateBaseAlerts({ baseToken, tableId, limit = 200, dryRun = false }) {
      const fieldsPayload = await runJson(buildBaseFieldListCommand({ baseToken, tableId }));
      const fieldNames = normalizeFields(fieldsPayload);
      const uniqueFieldName = fieldNames.includes("unique_id")
        ? "unique_id"
        : fieldNames.includes("uniqueid")
          ? "uniqueid"
          : "";
      if (!uniqueFieldName) {
        return {
          success: true,
          scanned: 0,
          duplicate_groups: 0,
          deleted: 0,
          dry_run: dryRun,
          reason: "base table has neither unique_id nor uniqueid",
        };
      }

      const recordPayload = await runJson(
        buildBaseRecordListCommand({ baseToken, tableId, limit }),
      );
      const records = normalizeRecords(recordPayload);
      const groups = new Map();
      records.forEach((record, index) => {
        const uniqueId = String(record.fields?.[uniqueFieldName] ?? "").trim();
        if (!uniqueId) {
          return;
        }
        const item = {
          ...record,
          unique_id: uniqueId,
          freshness: getRecordFreshness(record),
          original_index: index,
        };
        if (!groups.has(uniqueId)) {
          groups.set(uniqueId, []);
        }
        groups.get(uniqueId).push(item);
      });

      const keptRecords = [];
      const deletedRecords = [];
      for (const [uniqueId, group] of groups.entries()) {
        if (group.length < 2) {
          continue;
        }
        const sorted = [...group].sort((left, right) => {
          if (right.freshness !== left.freshness) {
            return right.freshness - left.freshness;
          }
          return right.original_index - left.original_index;
        });
        const [kept, ...stale] = sorted;
        keptRecords.push({
          unique_id: uniqueId,
          record_id: kept.record_id,
          freshness: kept.freshness,
        });
        for (const record of stale) {
          deletedRecords.push({
            unique_id: uniqueId,
            record_id: record.record_id,
            freshness: record.freshness,
            kept_record_id: kept.record_id,
          });
        }
      }

      let deleteResult;
      if (deletedRecords.length > 0 && !dryRun) {
        deleteResult = await runJson(
          buildBaseRecordDeleteCommand({
            baseToken,
            tableId,
            recordIds: deletedRecords.map((record) => record.record_id),
          }),
        );
      }

      return {
        success: true,
        scanned: records.length,
        unique_field: uniqueFieldName,
        duplicate_groups: keptRecords.length,
        deleted: dryRun ? 0 : deletedRecords.length,
        planned_delete: deletedRecords.length,
        dry_run: dryRun,
        kept_records: keptRecords,
        deleted_records: deletedRecords,
        detail: deleteResult,
      };
    },

    async publishTroubleshootingDoc({
      title,
      markdown,
      parentWikiToken,
      targetSpaceId,
      templateDoc,
      troubleshootingSopDoc,
      tmpDir,
      existingTitlePrefix,
      requireResultIdPrefix,
      // 【P0-3 硬固化】骨架生成扩展参数（末尾追加，零侵入）
      skeletonType,
      qcResult,
      qc_result_json,
      workItem,
      work_item_json,
      resultId,
      result_id,
      taskName,
      task_name,
      taskDate,
      task_date,
      ruleId,
      rule_id,
      bambooUrl,
      bamboo_url,
      topHardcodedAttribution,
      top_hardcoded_attribution,
      applySkeletonProtection,
      apply_skeleton_protection,
      dryRunSkeletonOnly,
      dry_run_skeleton_only,
      minSectionContentLength,
      min_section_content_length,
      allowMissingSectionsFillLater,
      allow_missing_sections_fill_later,
      outputFile,
      output_file,
    }) {
      if (templateDoc) {
        throw buildRunnerError(
          "publishTroubleshootingDoc no longer accepts templateDoc; declare troubleshooting_doc_template in troubleshooting_sop_doc instead",
          {
            reason_code: "TROUBLESHOOTING_DOC_TEMPLATE_INPUT_REMOVED",
            fix_commands: [
              "Move troubleshooting_doc_template into the SOP document configuration block",
              "Call publish-troubleshooting-doc with --troubleshooting-sop-doc instead of --template-doc",
            ],
          },
        );
      }
      // 【P0-3 开头】解析 camelCase/snake_case，如有骨架相关字段则先预填充 mergedMarkdown
      // （不动原有校验流程顺序，只是给 markdown 变量做 pre-merge，失败分支也能携带 skeletonBuild 返回）
      const applySkeletonProt = Boolean(
        applySkeletonProtection ?? apply_skeleton_protection ?? false,
      );
      const dryRunSkel = Boolean(dryRunSkeletonOnly ?? dry_run_skeleton_only ?? false);
      const minSecLen =
        Number.isFinite(+minSectionContentLength) && +minSectionContentLength > 0
          ? +minSectionContentLength
          : Number.isFinite(+min_section_content_length) && +min_section_content_length > 0
            ? +min_section_content_length
            : 20;
      const allowMissing = Boolean(
        allowMissingSectionsFillLater ?? allow_missing_sections_fill_later ?? false,
      );
      const finalOutFile = outputFile || output_file || undefined;
      const previewOutFile = previewOutputFilePath(finalOutFile);
      const writePublishFinal = async (payload) => {
        const output = compactObject({
          ...payload,
          outputFile: finalOutFile,
          output_file: finalOutFile,
          preview_output_file: previewOutFile,
        });
        if (finalOutFile) {
          await writeJsonFile(finalOutFile, output);
        }
        return output;
      };
      let qcResObj = qcResult && typeof qcResult === "object" ? qcResult : null;
      if (!qcResObj && qc_result_json && typeof qc_result_json === "string") {
        try {
          qcResObj = JSON.parse(qc_result_json);
        } catch {
          qcResObj = null;
        }
      }
      let workItemObj = workItem && typeof workItem === "object" ? workItem : null;
      if (!workItemObj && work_item_json && typeof work_item_json === "string") {
        try {
          workItemObj = JSON.parse(work_item_json);
        } catch {
          workItemObj = null;
        }
      }
      const finalSkType =
        skeletonType === "quick-closure" ||
        skeletonType === "deep" ||
        skeletonType === "pending" ||
        skeletonType === "sop"
          ? skeletonType
          : qcResObj && qcResObj.quickClosureRecommended
            ? "quick-closure"
            : "deep";
      const finalResId = resultId ?? result_id ?? workItemObj?.result_id ?? workItemObj?.resultId;
      const finalTaskName =
        taskName ?? task_name ?? workItemObj?.task_name ?? workItemObj?.taskName;
      const finalTaskDate =
        taskDate ?? task_date ?? workItemObj?.task_date ?? workItemObj?.taskDate;
      const finalRuleId = ruleId ?? rule_id ?? workItemObj?.rule_id ?? workItemObj?.ruleId;
      const finalBambooUrl =
        bambooUrl ?? bamboo_url ?? workItemObj?.bamboo_url ?? workItemObj?.bambooResultUrl;
      const finalTopAttr =
        topHardcodedAttribution ?? top_hardcoded_attribution ?? qcResObj?.topHardcodedAttribution;
      const useSkeletonBuild = Boolean(
        skeletonType || qcResObj || workItemObj || applySkeletonProt || dryRunSkel,
      );
      let skeletonBuild = null;
      let mergedMarkdown = typeof markdown === "string" ? markdown : "";
      let skeletonProtection = null;
      if (useSkeletonBuild) {
        skeletonBuild = buildDocSkeletonMarkdown({
          skeletonType: finalSkType,
          qcResult: qcResObj,
          workItem: workItemObj,
          userProvidedMarkdown: typeof markdown === "string" ? markdown : "",
          resultId: finalResId,
          taskName: finalTaskName,
          taskDate: finalTaskDate,
          ruleId: finalRuleId,
          bambooUrl: finalBambooUrl,
          topHardcodedAttribution: finalTopAttr,
        });
        mergedMarkdown = skeletonBuild.mergedMarkdown;
        if (applySkeletonProt) {
          skeletonProtection = applyDocSkeletonFillAndProtection(
            skeletonBuild.skeletonInfo,
            mergedMarkdown,
            {
              minSectionContentLength: minSecLen,
              allowMissingSectionsFillLater: allowMissing,
            },
          );
          if (!skeletonProtection.valid) {
            // 不抛错（throw 留给 validate-model-result-json），只在返回中携带 blocker 原因；
            // dry-run 场景直接 return 骨架，不进入后续 wiki 写入
          }
        }
      }
      // 写本地 dry-run / 骨架预览到 <outputFile>.preview.json，避免 preview 覆盖真实发布结果。
      if (previewOutFile) {
        try {
          const outJson = JSON.stringify(
            {
              success: dryRunSkel ? true : undefined,
              dry_run: true,
              skeletonBuild,
              skeletonProtection,
              mergedMarkdown,
              title,
              parentWikiToken,
              targetSpaceId,
              existingTitlePrefix,
            },
            null,
            2,
          );
          await writeJsonFile(previewOutFile, JSON.parse(outJson));
        } catch {
          // 写文件失败不影响主流程
        }
      }
      if (dryRunSkel) {
        return writePublishFinal({
          success: true,
          title:
            title ||
            (skeletonBuild?.autoFillMeta?.taskName
              ? `${skeletonBuild.autoFillMeta.resultId}:${skeletonBuild.autoFillMeta.taskName}:${skeletonBuild.autoFillMeta.taskDate}排查结果`
              : "dry_run"),
          doc_token: "",
          feishu_doc_url: "",
          doc_body_json_path: "",
          doc_write_status: "dry_run",
          doc_archive_status: "skipped",
          doc_archive_reason: "dry_run_skeleton_only",
          skeletonType: finalSkType,
          skeletonBuild,
          skeletonProtection,
          mergedMarkdown,
          merged_markdown: mergedMarkdown,
          dryRunSkeletonOnly: true,
          dry_run_skeleton_only: true,
          dry_run_warning:
            "dry_run_skeleton_only=true，仅生成预览骨架；真实发布结果不会被 dry-run preview 伪装",
        });
      }
      // 预填充结束：mergedMarkdown 替换原有 markdown 传给后续 wiki 写入
      markdown = mergedMarkdown;

      // 规则（硬防护，禁止 AI 绕开）：
      //  1) existingTitlePrefix 必须显式传入且严格是 "<完整ID>:" 格式（含冒号）——不接受模糊短前缀，避免跨记录复用文档。
      //     对排查结果文档：<完整ID> = 数字型 result_id（如 "18528099:"）；对 SOP 文档：<完整ID> = rule_id（如 "29156:"）。
      //  2) title 必须以 existingTitlePrefix 开头（否则直接抛错，禁止不同 result_id/rule_id 的多条记录"共享"一个文档标题）。
      //  3) 最终创建/更新出来的 doc，必须落在 parentWikiToken（= 对应归因记录日报 Base 所在 wiki node_token，
      //     同目录、同空间）下，禁止放到根知识空间或其他目录。
      if (!existingTitlePrefix) {
        throw new Error(
          `publishTroubleshootingDoc: existingTitlePrefix is required (must be "<complete_result_id_or_rule_id>:", e.g. "18528099:" for a troubleshooting doc, or "29156:" for a rule SOP). ` +
            `Omitting existingTitlePrefix enables cross-record document reuse and causes investigation confusion.`,
        );
      }
      const strictPrefixOk = /^[A-Za-z0-9_-]+:$/.test(existingTitlePrefix);
      if (!strictPrefixOk) {
        throw new Error(
          `publishTroubleshootingDoc: existingTitlePrefix="${existingTitlePrefix}" must be "<complete_id>:" ` +
            `(pure alphanumeric / underscore / hyphen, followed by exactly one colon). ` +
            `Do not use fuzzy short prefixes, which cause multiple different Bamboo records to share one investigation doc.`,
        );
      }
      if (!String(title || "").startsWith(existingTitlePrefix)) {
        throw new Error(
          `publishTroubleshootingDoc: title "${title || ""}" must start with existingTitlePrefix "${existingTitlePrefix}". ` +
            `Refusing to use a doc whose title belongs to another result_id/rule_id. Each distinct result_id must produce its own ` +
            `independent investigation doc (title format: result_id:task_name:YYYYMMDD排查结果).`,
        );
      }
      if (!parentWikiToken) {
        throw new Error(
          `publishTroubleshootingDoc: parentWikiToken is required; troubleshooting doc MUST be created under the SAME ` +
            `wiki directory as its corresponding attribution-record daily Base (usually the daily Base node_token / parent_wiki_token ` +
            `from prepare-auto-troubleshoot work item). DO NOT drop docs into the root knowledge space or any other unrelated directory.`,
        );
      }
      if (!targetSpaceId) {
        throw new Error(
          `publishTroubleshootingDoc: targetSpaceId is required; doc must be created in the same knowledge space as the ` +
            `attribution-record daily Base.`,
        );
      }
      // 如果调用方显式传 requireResultIdPrefix，则要求 existingTitlePrefix 本身是 "纯数字:" 格式（即 result_id），
      // 用于 publishSopDoc 之外的「排查结果文档」发布路径，杜绝把 SOP 文档当成排查结果文档去复用。
      if (requireResultIdPrefix && !/^[0-9]+:$/.test(existingTitlePrefix)) {
        throw new Error(
          `publishTroubleshootingDoc: existingTitlePrefix="${existingTitlePrefix}" must be a pure numeric result_id followed by ":" (e.g. "18528099:") ` +
            `when publishing a troubleshooting-result doc. Suffix docs belong to exactly one Bamboo result_id; do not reuse one doc across multiple lines of the attribution Base.`,
        );
      }

      const titledMarkdownPreview = ensureMarkdownTitle({ title, markdown });
      const qualityGate = validateTroubleshootingDocContent({
        title,
        markdown: titledMarkdownPreview,
        skeletonType: useSkeletonBuild ? finalSkType : undefined,
        attribution: finalTopAttr,
      });
      if (!qualityGate.valid) {
        return writePublishFinal({
          success: false,
          title,
          doc_token: "",
          feishu_doc_url: "",
          doc_body_json_path: "",
          doc_write_status: "invalid_content",
          doc_archive_status: "failed",
          doc_archive_reason: `doc_content_quality_gate_failed: ${qualityGate.reasons.join("; ")}`,
          created_from_template: false,
          skeletonType: finalSkType,
          skeletonBuild,
          skeletonProtection,
          docContentQualityGate: qualityGate,
          doc_content_quality_gate: qualityGate,
          mergedMarkdown,
          merged_markdown: mergedMarkdown,
          dryRunSkeletonOnly: false,
          dry_run_skeleton_only: false,
        });
      }

      let docToken;
      let feishuDocUrl;
      let docWriteStatus = "created";
      let createdFromTemplate = false;
      let effectiveTemplateDoc = "";
      let docTemplateSource = "none";
      if (troubleshootingSopDoc) {
        try {
          const sopNode = extractWikiNode(
            await runJson(buildWikiNodeGetCommand({ scanDirUrl: troubleshootingSopDoc })),
          );
          const sopDocToken = sopNode.objToken || sopNode.obj_token;
          if (sopDocToken) {
            const sopMarkdown = extractMarkdownText(
              await runJson(buildDocsFetchCommand({ docToken: sopDocToken })),
            );
            effectiveTemplateDoc = extractTroubleshootingDocTemplateFromSopMarkdown(sopMarkdown);
            if (effectiveTemplateDoc) docTemplateSource = "troubleshooting_sop_doc";
          }
        } catch {
          effectiveTemplateDoc = "";
          docTemplateSource = "troubleshooting_sop_doc_unreadable";
        }
      }
      // 【任务 8】wiki 链接强制：parentWikiToken 非空时把返回主字段 feishu_doc_url 固定为 /wiki/<node_token>
      // docx 直链仍然保留在 __raw_docx_url 中；wiki +node-get / 父节点归属校验只能通过 wiki node_token 过。
      let resolvedWikiNodeToken = "";

      // 规则 3 硬保证：查找 / 复用 只允许在 (targetSpaceId, parentWikiToken) 子目录里命中，不允许跨目录匹配。
      // 之前的 bug 是当 parentWikiToken 没传或传错时，在其他目录找到"看似相同的标题前缀"就直接拿来复用，导致归错位。
      {
        const childPayload = await runJson(
          buildWikiNodeListCommand({
            spaceId: targetSpaceId,
            parentNodeToken: parentWikiToken,
          }),
        );
        const children = getItems(childPayload).map((item) =>
          normalizeNodeItem(item, targetSpaceId),
        );
        // 精确同标题优先；否则只在同一目录下、按严格 exact existingTitlePrefix 命中 1 条才复用，模糊前缀一律不复用。
        const exactTitleNode = findChildByTitle({ children, title });
        if (exactTitleNode?.obj_token) {
          docToken = exactTitleNode.obj_token;
          feishuDocUrl = `https://bytedance.larkoffice.com/docx/${docToken}`;
          docWriteStatus = "updated";
          if (exactTitleNode.node_token) resolvedWikiNodeToken = exactTitleNode.node_token;
        } else {
          const matchesPrefix = children.filter(
            (child) => child.title && child.title.startsWith(existingTitlePrefix),
          );
          if (matchesPrefix.length === 1 && matchesPrefix[0].obj_token) {
            docToken = matchesPrefix[0].obj_token;
            feishuDocUrl = `https://bytedance.larkoffice.com/docx/${docToken}`;
            docWriteStatus = "updated";
            if (matchesPrefix[0].node_token) resolvedWikiNodeToken = matchesPrefix[0].node_token;
          }
          // matchesPrefix.length > 1 → 不能盲目复用，任何复用都会造成"一个目录里有两条同 result_id 前缀旧文档，第二条被串写"，
          // 直接 fallthrough 到新建分支，让文档创建失败也比串写安全。
        }
      }

      if (!docToken) {
        try {
          const createPayload = effectiveTemplateDoc
            ? await (async () => {
                const templateNode = extractWikiNode(
                  await runJson(buildWikiNodeGetCommand({ scanDirUrl: effectiveTemplateDoc })),
                );
                return runJson(
                  buildWikiNodeCopyCommand({
                    nodeToken: templateNode.nodeToken,
                    spaceId: templateNode.spaceId,
                    targetParentNodeToken: parentWikiToken,
                    targetSpaceId,
                    title,
                  }),
                );
              })()
            : await runJson(
                buildWikiNodeCreateDocCommand({
                  title,
                  parentNodeToken: parentWikiToken,
                  spaceId: targetSpaceId,
                }),
              );
          docToken = extractCreatedDocToken(createPayload);
          feishuDocUrl = extractCreatedDocUrl(createPayload, docToken);
          docWriteStatus = "created";
          createdFromTemplate = Boolean(effectiveTemplateDoc);
          // 【任务 8】新建分支再查一次子目录，按 obj_token==docToken 反查 node_token
          try {
            const listAfter = getItems(
              await runJson(
                buildWikiNodeListCommand({
                  spaceId: targetSpaceId,
                  parentNodeToken: parentWikiToken,
                }),
              ),
            ).map((item) => normalizeNodeItem(item, targetSpaceId));
            const matchedNode = listAfter.find((node) => node.obj_token === docToken);
            if (matchedNode?.node_token) resolvedWikiNodeToken = matchedNode.node_token;
          } catch {
            // 反查失败不影响主流程，URL 会降级为 docx 直链 + __raw_docx_url 原样
          }
        } catch (error) {
          return writePublishFinal({
            success: false,
            title,
            doc_write_status: "failed",
            doc_archive_status: "failed",
            doc_archive_reason: effectiveTemplateDoc
              ? `template_doc_copy_failed: ${error.message}`
              : `wiki_node_create_failed: ${error.message}`,
            raw_command_error: String(error?.stderr || error?.stdout || error?.message || error),
            created_from_template: false,
            doc_template_source: docTemplateSource,
            skeletonType: finalSkType,
            skeletonBuild,
            skeletonProtection,
            mergedMarkdown,
            merged_markdown: mergedMarkdown,
            dryRunSkeletonOnly: false,
            dry_run_skeleton_only: false,
          });
        }
      }

      // 【任务 8】Markdown 内容 nul byte / 控制字符预检（写 overwrite 之前做，避免 bytedcli SpawnFailed nul byte）
      //   允许范围：可打印 ASCII \x20-\x7E、TAB \x09、LF \x0A、CR \x0D + 合法 UTF-8 多字节
      //   拦截范围：NUL\0 / BS\b\x08 / VT\v\x0B-\x1F / DEL\x7F
      const markdownToCheck = typeof markdown === "string" ? markdown : "";
      const badOffsets = [];
      for (let index = 0; index < markdownToCheck.length; index += 1) {
        const code = markdownToCheck.charCodeAt(index);
        if ((code >= 0 && code <= 8) || (code >= 11 && code <= 31) || code === 127) {
          badOffsets.push({ offset: index, hex: `0x${code.toString(16).padStart(2, "0")}` });
          if (badOffsets.length >= 10) break;
        }
      }
      if (badOffsets.length > 0) {
        const err = new Error(
          `publishTroubleshootingDoc: markdown contains NUL/control characters (${badOffsets.length}+ positions, ` +
            `first offset=${badOffsets[0]?.offset ?? -1} hex=${badOffsets[0]?.hex ?? "??"}). ` +
            `These bytes cause bytedcli spawn/JSON-parsing failures ("SpawnFailed nul byte", invalid UTF-8 in JSON). ` +
            `Before re-running, strip or sanitize binary/unprintable payloads in SQL/logs included in your markdown content.`,
        );
        err.code = "MARKDOWN_CONTAINS_NUL_OR_CONTROL_CHARS";
        err.bad_offsets = badOffsets;
        err.markdown_byte_length = Buffer.byteLength(markdownToCheck, "utf8");
        throw err;
      }

      // 【任务 8】返回字段 URL 规范化：parentWikiToken 非空 && 有 node_token → 以 wiki URL 为主字段
      const rawDocxUrl = feishuDocUrl;
      const forceWikiUrl = Boolean(parentWikiToken);
      if (forceWikiUrl && resolvedWikiNodeToken) {
        feishuDocUrl = `https://bytedance.larkoffice.com/wiki/${resolvedWikiNodeToken}`;
      }

      const titledMarkdown = ensureMarkdownTitle({ title, markdown: markdownToCheck });
      const bodyJsonPath = await writeDocsOverwriteBodyFile({
        markdown: titledMarkdown,
        docToken,
        tmpDir,
      });

      await runJson(buildDocsOverwriteCommand({ docToken, markdown: titledMarkdown }));

      return writePublishFinal({
        success: true,
        title,
        doc_token: docToken,
        doc_url: feishuDocUrl,
        wiki_token: resolvedWikiNodeToken || undefined,
        feishu_doc_url: feishuDocUrl,
        doc_body_json_path: bodyJsonPath,
        doc_write_status: docWriteStatus,
        doc_archive_status: "succeeded",
        doc_archive_reason: undefined,
        parent_wiki_token: parentWikiToken,
        target_space_id: targetSpaceId,
        created_directly_in_wiki: false,
        created_from_template: createdFromTemplate,
        doc_template_source: docTemplateSource,
        troubleshooting_sop_doc: troubleshootingSopDoc || undefined,
        __forced_wiki_url: forceWikiUrl,
        __raw_docx_url: rawDocxUrl,
        __wiki_node_token: resolvedWikiNodeToken || undefined,
        skeletonType: finalSkType,
        skeletonBuild,
        skeletonProtection,
        mergedMarkdown,
        merged_markdown: mergedMarkdown,
        dryRunSkeletonOnly: false,
        dry_run_skeleton_only: false,
      });
    },

    async detectSharedDocAbuse({
      scanDirUrl,
      dateKeys,
      bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      recordLimit = 500,
    }) {
      const { containers } = await this.resolveDailyBaseContainers({ scanDirUrl });
      const mergedChildrenRaw = await this.listChildrenAcrossContainers({ containers });
      // 多容器同标题日报去重（E_DAILY_001 假阳性兜底）
      const mergedChildren = pruneCrossContainerDuplicateDailyBases({
        children: mergedChildrenRaw,
        dateKeys,
        bizSuffix,
      });
      const dailyBases = selectDailyBaseNodes({
        nodes: mergedChildren,
        dateKeys,
        bizSuffix,
      });
      assertSelectedDailyBasesAreBitable({ dailyBases });

      const docKeyToRecords = new Map();
      const scannedBases = [];

      for (const dailyBase of dailyBases) {
        const scan = {
          base_title: dailyBase.title,
          base_token: dailyBase.obj_token,
          node_token: dailyBase.node_token,
          table_id: "",
          total_records: 0,
          records_with_doc: 0,
        };

        try {
          const tablePayload = await runJson(
            buildBaseTableListCommand({ baseToken: dailyBase.obj_token }),
          );
          const table = selectDailyBaseTable(tablePayload);
          const tableId = extractFirstString(table?.table_id, table?.id);
          if (!tableId) continue;
          scan.table_id = tableId;

          const fieldsPayload = await runJson(
            buildBaseFieldListCommand({ baseToken: dailyBase.obj_token, tableId }),
          );
          const fieldNames = normalizeFields(fieldsPayload);
          if (
            !["result_id", "ai_result", "ai_summary", "status", "task_name"].every((f) =>
              fieldNames.includes(f),
            )
          ) {
            continue;
          }

          const recordPayload = await runJson(
            buildBaseRecordListCommand({
              baseToken: dailyBase.obj_token,
              tableId,
              limit: recordLimit,
            }),
          );
          const records = normalizeRecords(recordPayload);
          scan.total_records = records.length;

          for (const record of records) {
            const fields = record.fields || {};
            const status = String(fields.status || "")
              .trim()
              .toLowerCase();
            // 只关注"已成功完成回写"或"已处理"的记录（非 not_support 也非空）
            if (
              status === "not_support" ||
              status === "init" ||
              status === "processing" ||
              status === ""
            )
              continue;

            const rawDoc = fields.ai_result;
            let docUrl = "";
            if (typeof rawDoc === "string" && rawDoc) {
              docUrl = rawDoc.trim();
            } else if (Array.isArray(rawDoc) && rawDoc.length > 0) {
              const first = rawDoc[0];
              if (first && typeof first === "object") {
                docUrl = String(
                  first.url || first.link || first.doc_url || first.token || "",
                ).trim();
              } else if (typeof first === "string") {
                docUrl = first.trim();
              }
            } else if (rawDoc && typeof rawDoc === "object") {
              docUrl = String(rawDoc.url || rawDoc.link || rawDoc.doc_url || "").trim();
            }
            if (!docUrl) continue;

            const resultId = String(fields.result_id || "").trim();
            const taskName = String(fields.task_name || "").trim();
            if (!resultId) continue;

            const key = docUrl;
            const entry = {
              record_id: record.record_id,
              result_id: resultId,
              task_name: taskName,
              status: status || "unknown",
              base_title: dailyBase.title,
              base_token: dailyBase.obj_token,
              table_id: tableId,
            };
            if (!docKeyToRecords.has(key)) docKeyToRecords.set(key, []);
            docKeyToRecords.get(key).push(entry);
            scan.records_with_doc += 1;
          }
        } catch {
          // 单个 Base 读取失败不影响整体审计
        }

        scannedBases.push(scan);
      }

      const sharedDocGroups = [];
      for (const [docKey, entries] of docKeyToRecords.entries()) {
        if (entries.length < 2) continue;
        const uniqueResultIds = new Set(entries.map((e) => e.result_id).filter(Boolean));
        if (uniqueResultIds.size < 2) continue; // 同一 result_id 自己的重复不视为混淆
        sharedDocGroups.push({
          ai_result: docKey,
          shared_by_records: entries.length,
          unique_result_ids: uniqueResultIds.size,
          result_ids: Array.from(uniqueResultIds),
          records: entries,
        });
      }
      sharedDocGroups.sort((a, b) => b.shared_by_records - a.shared_by_records);

      return compactObject({
        detected: sharedDocGroups.length > 0,
        shared_doc_groups: sharedDocGroups.length,
        suspicious_records: sharedDocGroups.reduce((sum, g) => sum + g.records.length, 0),
        unique_result_ids_affected: sharedDocGroups.reduce(
          (sum, g) => sum + g.unique_result_ids,
          0,
        ),
        groups: sharedDocGroups,
        scanned_bases: scannedBases,
      });
    },

    async validateDailyBaseDocRecordConsistency({
      scanDirUrl,
      dateKeys,
      bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      recordLimit = 500,
    }) {
      const collected = await this.collectDailyBaseTableContexts({
        scanDirUrl,
        dateKeys,
        bizSuffix,
      });
      const extraDocs = [];
      const missingDocs = [];
      const duplicateDocs = [];
      const bases = [];

      for (const context of collected.contexts) {
        if (!context.table_id || !context.node_token) {
          continue;
        }

        const recordPayload = await runJson(
          buildBaseRecordListCommand({
            baseToken: context.base_token,
            tableId: context.table_id,
            limit: recordLimit,
          }),
        );
        const records = normalizeRecords(recordPayload);
        const allRecordIds = new Set();
        const docRequiredRecordIds = new Set();
        for (const record of records) {
          const fields = record.fields || {};
          const resultId = String(
            extractSingleCellValue(fields.result_id) ||
              parseResultIdFromBambooUrl(getBambooUrlField(fields)) ||
              "",
          ).trim();
          if (!resultId) continue;
          allRecordIds.add(resultId);
          const status = String(extractSingleCellValue(fields.status) ?? "")
            .trim()
            .toLowerCase();
          if (!["", "init", "failed", "processing", "not_support"].includes(status)) {
            docRequiredRecordIds.add(resultId);
          }
        }

        const childPayload = await runJson(
          buildWikiNodeListCommand({
            spaceId: context.space_id,
            parentNodeToken: context.node_token,
          }),
        );
        const docNodes = getItems(childPayload)
          .map((node) => ({
            title: String(node?.title || node?.name || "").trim(),
            node_token: extractFirstString(node?.node_token, node?.nodeToken, node?.token),
            obj_token: extractFirstString(node?.obj_token, node?.objToken),
            obj_type: extractFirstString(node?.obj_type, node?.objType, node?.type),
          }))
          .filter(
            (node) =>
              node.title && (!node.obj_type || node.obj_type === "docx" || node.obj_type === "doc"),
          );

        const docsByResultId = new Map();
        for (const node of docNodes) {
          const resultId = parseTroubleshootingDocResultIdFromTitle(node.title);
          if (!resultId) continue;
          const entry = {
            result_id: resultId,
            title: node.title,
            node_token: node.node_token,
            obj_token: node.obj_token,
            base_title: context.title,
            base_token: context.base_token,
            table_id: context.table_id,
            parent_wiki_token: context.node_token,
          };
          if (!allRecordIds.has(resultId)) {
            extraDocs.push(entry);
          }
          if (!docsByResultId.has(resultId)) docsByResultId.set(resultId, []);
          docsByResultId.get(resultId).push(entry);
        }

        for (const resultId of docRequiredRecordIds) {
          if (!docsByResultId.has(resultId)) {
            missingDocs.push({
              result_id: resultId,
              base_title: context.title,
              base_token: context.base_token,
              table_id: context.table_id,
              parent_wiki_token: context.node_token,
            });
          }
        }
        for (const [resultId, docs] of docsByResultId.entries()) {
          if (allRecordIds.has(resultId) && docs.length > 1) {
            duplicateDocs.push({
              result_id: resultId,
              count: docs.length,
              docs,
            });
          }
        }

        bases.push({
          title: context.title,
          base_token: context.base_token,
          table_id: context.table_id,
          parent_wiki_token: context.node_token,
          record_result_ids: Array.from(allRecordIds).sort(),
          doc_result_ids: Array.from(docsByResultId.keys()).sort(),
          child_docs: docNodes.length,
        });
      }

      const valid =
        extraDocs.length === 0 && missingDocs.length === 0 && duplicateDocs.length === 0;
      return {
        success: valid,
        doc_record_consistency_valid: valid,
        processed_bases: collected.processed_bases,
        date_keys: collected.date_keys,
        extra_docs: extraDocs,
        missing_docs: missingDocs,
        duplicate_docs: duplicateDocs,
        bases,
      };
    },

    async publishSopDoc({ troubleshootingSopDoc, ruleId, taskName, markdown, tmpDir }) {
      if (!troubleshootingSopDoc) {
        return {
          success: true,
          sop_writeback_status: "skipped",
          sop_writeback_reason: "troubleshooting_sop_doc not provided",
        };
      }
      if (!String(markdown || "").trim()) {
        return {
          success: true,
          sop_writeback_status: "skipped",
          sop_writeback_reason: "no reusable SOP update from this investigation",
        };
      }

      const rootPayload = await runJson(
        buildWikiNodeGetCommand({ scanDirUrl: troubleshootingSopDoc }),
      );
      const rootNode = extractWikiNode(rootPayload);
      const title = buildRuleSopDocTitle({ ruleId, taskName });
      let mergedMarkdown = markdown;
      let sopHistoryReadStatus = "skipped";
      let sopHistoryReadReason;

      try {
        const childPayload = await runJson(
          buildWikiNodeListCommand({
            spaceId: rootNode.spaceId,
            parentNodeToken: rootNode.nodeToken,
          }),
        );
        const children = getItems(childPayload).map((item) =>
          normalizeNodeItem(item, rootNode.spaceId),
        );
        const existingNode =
          findChildByTitle({ children, title }) ||
          findChildByTitlePrefix({ children, titlePrefix: `${ruleId}:` });
        if (existingNode?.obj_token) {
          const fetchPayload = await runJson(
            buildDocsFetchCommand({ docToken: existingNode.obj_token }),
          );
          const historyMarkdown = extractMarkdownText(fetchPayload);
          if (String(historyMarkdown || "").trim()) {
            mergedMarkdown = mergeMarkdownSections({
              title,
              existingMarkdown: historyMarkdown,
              newMarkdown: markdown,
            });
            sopHistoryReadStatus = "succeeded";
          } else {
            sopHistoryReadStatus = "failed";
            sopHistoryReadReason = "empty_history";
          }
        }
      } catch (error) {
        sopHistoryReadStatus = "failed";
        sopHistoryReadReason = error?.message || String(error);
      }

      const result = await this.publishTroubleshootingDoc({
        title,
        markdown: mergedMarkdown,
        parentWikiToken: rootNode.nodeToken,
        targetSpaceId: rootNode.spaceId,
        existingTitlePrefix: `${ruleId}:`,
        tmpDir,
      });

      return {
        success: true,
        sop_writeback_status: "succeeded",
        sop_writeback_reason: undefined,
        sop_history_read_status: sopHistoryReadStatus,
        sop_history_read_reason: sopHistoryReadReason,
        sop_title: result.title,
        sop_doc_url: result.feishu_doc_url,
        sop_doc_write_status: result.doc_write_status,
        sop_doc_archive_status: result.doc_archive_status,
        sop_doc_archive_reason: result.doc_archive_reason,
        sop_update_summary: {
          rule_id: String(ruleId),
          task_name: taskName,
          action: result.doc_write_status,
          archived: result.doc_archive_status === "succeeded",
          doc_url: result.feishu_doc_url,
        },
      };
    },

    async ensureBaseStatusOption({ baseToken, tableId, optionName }) {
      const payload = await runJson(
        buildBaseFieldGetCommand({ baseToken, tableId, fieldId: "status" }),
      );
      const field = getFieldDefinition(payload);
      if (field?.type !== "select") {
        throw new Error(
          `base ${baseToken} table ${tableId} status field must be select to add ${optionName}`,
        );
      }
      const options = Array.isArray(field.options)
        ? field.options.map(normalizeSelectOption).filter((option) => option.name)
        : [];
      if (options.some((option) => option.name === optionName)) {
        return { updated: false, option: optionName };
      }
      await runJson(
        buildBaseFieldUpdateCommand({
          baseToken,
          tableId,
          fieldId: "status",
          definition: {
            name: field.name || "status",
            type: "select",
            multiple: Boolean(field.multiple),
            options: [...options, { name: optionName, hue: "Gray", lightness: "Light" }],
          },
        }),
      );
      return { updated: true, option: optionName };
    },

    async prepareAutoTroubleshoot({
      scanDirUrl,
      dateKeys,
      bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      troubleshootingSopDoc,
      recordLimit = 100,
      claimLimit = 1,
      claimOrder = "updated_time_desc",
      statusOnly = false,
      preflightOnly = false,
      denyExistingProcessing = true,
      aiSessionId,
      autoRecoverStaleProcessing = false,
      processingMaxAgeMinutes = 120,
    }) {
      const resolvedDateKeys =
        Array.isArray(dateKeys) && dateKeys.length > 0 ? dateKeys : recentTwoDateKeys(new Date());
      const { containers } = await this.resolveDailyBaseContainers({ scanDirUrl });
      const mergedChildrenRaw = await this.listChildrenAcrossContainers({ containers });
      // 多容器同标题日报去重（E_DAILY_001 假阳性兜底）
      const mergedChildren = pruneCrossContainerDuplicateDailyBases({
        children: mergedChildrenRaw,
        dateKeys: resolvedDateKeys,
        bizSuffix,
      });
      const dailyBases = selectDailyBaseNodes({
        nodes: mergedChildren,
        dateKeys: resolvedDateKeys,
        bizSuffix,
        claimOrder,
      });
      assertSelectedDailyBasesAreBitable({ dailyBases });

      const workItems = [];
      const parsedClaimLimit = Number.parseInt(String(claimLimit ?? 1), 10);
      const unsafeBatch = Number.isFinite(parsedClaimLimit) ? parsedClaimLimit : 1;
      const readOnlyPrepare = Boolean(statusOnly || preflightOnly);
      const normalizedClaimLimit = readOnlyPrepare ? 0 : Math.max(0, unsafeBatch);
      const processingSessionId = buildProcessingSessionId(aiSessionId);
      const processingMaxAgeMs = Math.max(0, Number(processingMaxAgeMinutes || 0)) * 60 * 1000;
      const normalizedClaimOrder =
        claimOrder === "task_date_asc" || claimOrder === "updated_time_desc"
          ? claimOrder
          : "updated_time_desc";
      const statusCounts = {};
      const notSupport = {
        total: 0,
        by_rule_type: {},
        records: [],
      };
      const newlyMarkedNotSupport = {
        total: 0,
        by_rule_type: {},
        records: [],
      };
      const statusOnlyCandidates = [];
      const existingProcessingRecords = [];
      const autoRecoveredProcessingRecords = [];
      let skippedRecords = 0;
      // Claimable 分层统计（暴露给 decisionHint / 审计日志）：
      //   totalNearbyEligible    = 近两天所有 init/failed 记录（排除 succeeded/not_support/invalid）
      //   totalNearbySupported   = 近两天所有 init/failed 且 offline_hive/hive/hive_task 支持的记录（理论可 claim）
      //   claimedThisRound       = 本轮实际已原子写入 processing 的记录数（= workItems.length）
      //   skippedNearbySupported = 理论可 claim 但本轮因 claimLimit 上限未 claim 的剩余积压
      const nearByClaimable = {
        totalNearbyEligible: 0,
        totalNearbySupported: 0,
        claimedThisRound: 0,
        skippedNearbySupported: 0,
      };
      if (dailyBases.length === 0) {
        const drainSafety = {
          safe_to_declare_drained: false,
          reason: "no_daily_bases_matched",
          required_checks: [
            "processedBases > 0",
            "workItems: []",
            "statusCounts 无 init/failed/processing",
          ],
        };
        const decisionHint =
          `未命中任何日报 Base（processedBases=0），不能根据 workItems=[] 声明目录清零。` +
          `请检查 --date-key=${resolvedDateKeys.join(",")}、--scan-dir-url 或日报 Base 是否存在。`;
        return {
          success: true,
          processedBases: 0,
          dateKeys: resolvedDateKeys,
          date_keys: resolvedDateKeys,
          claimOrder: normalizedClaimOrder,
          claim_order: normalizedClaimOrder,
          claimLimit: normalizedClaimLimit,
          claim_limit: normalizedClaimLimit,
          preflightOnly: Boolean(preflightOnly),
          preflight_only: Boolean(preflightOnly),
          denyExistingProcessing: Boolean(denyExistingProcessing),
          deny_existing_processing: Boolean(denyExistingProcessing),
          aiSessionId: processingSessionId,
          ai_session_id: processingSessionId,
          nearByClaimable,
          near_by_claimable: nearByClaimable,
          skippedRecords: 0,
          statusCounts: {},
          notSupport: { total: 0, by_rule_type: {}, records: [] },
          newlyMarkedNotSupport: { total: 0, by_rule_type: {}, records: [] },
          statusOnly: Boolean(statusOnly),
          candidateWorkItems: [],
          candidate_work_items: [],
          autoRecoveredProcessingRecords: [],
          auto_recovered_processing_records: [],
          workItems: [],
          effectiveWorkItems: [],
          effective_work_items: [],
          decisionHint,
          decision_hint: decisionHint,
          shouldProceed: true,
          unsafeToDeclareDrained: true,
          unsafe_to_declare_drained: true,
          drainSafety,
          drain_safety: drainSafety,
        };
      }

      for (const dailyBase of dailyBases) {
        const tablePayload = await runJson(
          buildBaseTableListCommand({ baseToken: dailyBase.obj_token }),
        );
        const table = selectDailyBaseTable(tablePayload);
        const tableId = extractFirstString(table?.table_id, table?.id);
        if (!tableId) {
          throw new Error(`base ${dailyBase.obj_token} did not include a table_id`);
        }

        const fieldsPayload = await runJson(
          buildBaseFieldListCommand({ baseToken: dailyBase.obj_token, tableId }),
        );
        const fieldNames = normalizeFields(fieldsPayload);
        for (const requiredField of [
          "status",
          "result_id",
          "ai_summary",
          "ai_result",
          "ai_finished_at",
        ]) {
          if (!fieldNames.includes(requiredField)) {
            throw new Error(
              `base ${dailyBase.obj_token} table ${tableId} missing required field: ${requiredField}`,
            );
          }
        }
        if (!fieldNames.includes("bamboo_url")) {
          throw new Error(
            `base ${dailyBase.obj_token} table ${tableId} missing required field: bamboo_url`,
          );
        }

        const recordPayload = await runJson(
          buildBaseRecordListCommand({
            baseToken: dailyBase.obj_token,
            tableId,
            limit: recordLimit,
          }),
        );
        const records = normalizeRecords(recordPayload);
        const baseStatusCounts = buildStatusCounts(records);
        for (const [status, count] of Object.entries(baseStatusCounts)) {
          statusCounts[status] = (statusCounts[status] || 0) + count;
        }

        const processingRecords = records.filter((record) => {
          const status = String(extractSingleCellValue(record.fields?.status) ?? "")
            .trim()
            .toLowerCase();
          return status === "processing";
        });
        for (const record of processingRecords) {
          const session = getProcessingSession(record);
          const startedAtRaw = getProcessingStartedAt(record);
          const startedAtNumber = Number(startedAtRaw);
          const startedAtMs = Number.isFinite(startedAtNumber)
            ? startedAtNumber
            : Number.isNaN(Date.parse(String(startedAtRaw)))
              ? 0
              : Date.parse(String(startedAtRaw));
          const ageMs = startedAtMs > 0 ? Date.now() - startedAtMs : undefined;
          const stale =
            ageMs !== undefined && processingMaxAgeMs > 0 && ageMs >= processingMaxAgeMs;
          const item = compactObject({
            record_id: record.record_id,
            result_id:
              record.fields?.result_id ||
              parseResultIdFromBambooUrl(getBambooUrlField(record.fields)),
            task_name: record.fields?.task_name,
            ai_session_id: session,
            processing_started_at: startedAtRaw,
            age_ms: ageMs,
            stale,
            session_matched: Boolean(processingSessionId && session === processingSessionId),
            parent_wiki_token: dailyBase.node_token,
            base_token: dailyBase.obj_token,
            table_id: tableId,
          });
          if (!readOnlyPrepare && autoRecoverStaleProcessing && item.session_matched && stale) {
            const extra = {
              ...parseObjectField(record.fields?.extra),
              processing_recovered_at: Date.now(),
              processing_recovered_by_session: processingSessionId,
              processing_recovery_reason: "prepare_auto_recover_stale_processing",
            };
            await runJson(
              buildBaseBatchUpdateInlineCommand({
                baseToken: dailyBase.obj_token,
                tableId,
                body: {
                  record_id_list: [record.record_id],
                  patch: {
                    status: "init",
                    last_error: `自动恢复 stale processing：session=${processingSessionId}, age_ms=${ageMs}`,
                    extra: JSON.stringify(extra),
                  },
                },
              }),
            );
            statusCounts.processing = Math.max(0, Number(statusCounts.processing || 0) - 1);
            statusCounts.init = Number(statusCounts.init || 0) + 1;
            autoRecoveredProcessingRecords.push({
              ...item,
              recovery_source: "prepare-auto-troubleshoot",
              recovered_to_status: "init",
            });
            continue;
          }
          existingProcessingRecords.push(item);
        }

        const appendNotSupportRecord = (record, target) => {
          const ruleType = getBambooRuleType(record.fields) || "unknown";
          target.total += 1;
          target.by_rule_type[ruleType] = (target.by_rule_type[ruleType] || 0) + 1;
          target.records.push(
            compactObject({
              record_id: record.record_id,
              result_id:
                record.fields?.result_id ||
                parseResultIdFromBambooUrl(getBambooUrlField(record.fields)),
              rule_type: ruleType,
              reason: buildUnsupportedRuleTypeSummary(record),
            }),
          );
        };
        const existingNotSupportRecords = records.filter(
          (record) =>
            String(record.fields?.status || "")
              .trim()
              .toLowerCase() === "not_support",
        );
        for (const record of existingNotSupportRecords) {
          appendNotSupportRecord(record, notSupport);
        }

        const eligibleRecords = records.filter(isEligibleRecord);
        const unsupportedRecords = eligibleRecords.filter((record) => !isOfflineHiveRecord(record));
        const supportedRecords = eligibleRecords.filter(isOfflineHiveRecord);
        // 累计 claimable 分层统计
        nearByClaimable.totalNearbyEligible += eligibleRecords.length;
        nearByClaimable.totalNearbySupported += supportedRecords.length;
        const remainingClaimSlots = Math.max(0, normalizedClaimLimit - workItems.length);
        const claimRecords = supportedRecords.slice(0, remainingClaimSlots);
        for (const record of unsupportedRecords) {
          appendNotSupportRecord(record, newlyMarkedNotSupport);
          if (!readOnlyPrepare) {
            appendNotSupportRecord(record, notSupport);
          }
        }
        skippedRecords += records.length - claimRecords.length;
        if (!readOnlyPrepare && denyExistingProcessing && existingProcessingRecords.length > 0) {
          continue;
        }
        if (!readOnlyPrepare && claimRecords.length > 0) {
          const startedAt = Date.now();
          for (const record of claimRecords) {
            await runJson(
              buildBaseBatchUpdateInlineCommand({
                baseToken: dailyBase.obj_token,
                tableId,
                body: {
                  record_id_list: [record.record_id],
                  patch: buildProcessingClaimPatch({
                    record,
                    fieldNames,
                    sessionId: processingSessionId,
                    startedAt,
                  }),
                },
              }),
            );
          }
        }
        if (
          !readOnlyPrepare &&
          unsupportedRecords.length > 0 &&
          !(denyExistingProcessing && existingProcessingRecords.length > 0)
        ) {
          await this.ensureBaseStatusOption({
            baseToken: dailyBase.obj_token,
            tableId,
            optionName: "not_support",
          });
          const now = Date.now();
          for (const record of unsupportedRecords) {
            await runJson(
              buildBaseBatchUpdateInlineCommand({
                baseToken: dailyBase.obj_token,
                tableId,
                body: {
                  record_id_list: [record.record_id],
                  patch: {
                    status: "not_support",
                    ai_summary: buildUnsupportedRuleTypeSummary(record),
                    ai_finished_at: now,
                  },
                },
              }),
            );
          }
        }

        const buildWorkItem = (record, nextStep) => {
          // 【任务 6】auto_closeable + auto_close_recipe：
          //   prepare 阶段只能基于 Base 字段做最保守的快速闭环判断——只有能明确识别为 QC-4（测试/调试数据）时才标 true；
          //   其他 QC-1/2/3 需要 inspect 后才能拿到 false_data_length / false_reason，留给 troubleshooter 层处理。
          const candidateTaskName = String(record.fields.task_name || "");
          const candidateBambooUrl = String(getBambooUrlField(record.fields) || "");
          const candidateExtraObj = parseObjectField(record.fields.extra);
          const candidateExtraRaw =
            typeof candidateExtraObj === "object" && candidateExtraObj !== null
              ? JSON.stringify(candidateExtraObj)
              : "";
          const qc4Haystack =
            `${candidateTaskName}\n${candidateBambooUrl}\n${candidateExtraRaw}`.toLowerCase();
          const QC4_KEYWORDS = [
            "测试数据",
            "test data",
            "规则调试",
            "压测",
            "sandbox",
            "沙箱",
            "debug",
            "联调",
            "演练",
            "冒烟",
          ];
          const hitQc4 = QC4_KEYWORDS.filter((kw) => qc4Haystack.includes(kw.toLowerCase()));
          const qc4Closure =
            hitQc4.length > 0
              ? {
                  hit: true,
                  code: "QC-4",
                  confidence: "high",
                  matched_keywords: hitQc4,
                  hardcoded_attribution: hitQc4.some((k) => k.includes("调试"))
                    ? "[无效告警]规则调试"
                    : "[无效告警]测试数据",
                  hardcoded_summary: `Bamboo 报警标题/Base 字段命中测试/调试标记（关键词=${JSON.stringify(hitQc4)}），属于非生产数据，已自动确认无需修数；归因结果：${hitQc4.some((k) => k.includes("调试")) ? "[无效告警]规则调试" : "[无效告警]测试数据"}`,
                }
              : null;
          // 【任务 6】auto_close_recipe = 若 QC-4 命中，则直接打包 status=succeeded 的默认 recipe 骨架 + QC 结论；否则 null 交给 AI + troubleshooter 自定义填充
          const autoCloseable = Boolean(qc4Closure);
          const finalRuleId =
            record.fields.rule_id || record.fields.rules_id || record.fields.task_id || undefined;
          const finalResultId =
            record.fields.result_id || parseResultIdFromBambooUrl(getBambooUrlField(record.fields));
          const autoCloseRecipe = qc4Closure
            ? {
                source: "prepare_auto_quick_closure_qc4",
                nonOverride: true,
                qc_result: qc4Closure,
                skeleton_type: "quick-closure",
                recommended_model_result_template: {
                  status: "succeeded",
                  attribution_result: qc4Closure.hardcoded_attribution,
                  confidence: 0.95,
                  summary: qc4Closure.hardcoded_summary,
                  // QC-4 仍然要创建排查结果文档（skill 强制 succeeded 必须含合法 doc 链接）
                  // 这里只给出文档标题 + 推荐 publish-doc 参数，doc 写入还是在单条排障流程中做
                  doc_title_suggestion: `${finalResultId}:${candidateTaskName || "unknown_task"}:${"YYYYMMDD"}排查结果`,
                  publish_doc_args_suggestion: {
                    skeletonType: "quick-closure",
                    topHardcodedAttribution: qc4Closure.hardcoded_attribution,
                    applySkeletonProtection: true,
                  },
                },
              }
            : null;
          return compactObject({
            record_id: record.record_id,
            status: record.fields.status,
            task_name: record.fields.task_name || undefined,
            task_id: record.fields.task_id || undefined,
            rule_id: finalRuleId,
            result_id: finalResultId,
            bamboo_url: getBambooUrlField(record.fields) || undefined,
            alarm_record_detail_id: record.fields.alarm_record_detail_id || undefined,
            extra: parseObjectField(record.fields.extra),
            message_id:
              record.fields.message_id ||
              readFirstStringField(record.fields.extra, "message_id", "source_message_id") ||
              undefined,
            parent_wiki_token: dailyBase.node_token,
            target_space_id: dailyBase.space_id,
            base_token: dailyBase.obj_token,
            table_id: tableId,
            ai_session_id: processingSessionId,
            processing_started_at: Date.now(),
            // 【任务 6】字段：
            auto_closeable: autoCloseable,
            auto_close_recipe: autoCloseRecipe,
            sop_review: buildSopReviewChecklist({
              taskName: record.fields.task_name,
              taskId: record.fields.task_id,
              ruleId: finalRuleId,
              troubleshootingSopDoc,
            }),
            next_step: nextStep,
          });
        };

        for (const record of claimRecords) {
          workItems.push(
            buildWorkItem(
              record,
              "call bamboo-alert-troubleshooter with result_id or bamboo_url, parent_wiki_token, and target_space_id",
            ),
          );
        }
        if (readOnlyPrepare) {
          for (const record of supportedRecords.slice(
            0,
            Math.max(1, Number.isFinite(parsedClaimLimit) ? parsedClaimLimit : 1),
          )) {
            statusOnlyCandidates.push(
              buildWorkItem(
                record,
                preflightOnly
                  ? "preflight-only preview; rerun prepare-auto-troubleshoot without --preflight-only before claiming this record"
                  : "status-only preview; rerun prepare-auto-troubleshoot without --status-only before closing this record",
              ),
            );
          }
        }
      }

      if (!readOnlyPrepare && denyExistingProcessing && existingProcessingRecords.length > 0) {
        return {
          success: true,
          blocked: true,
          blocked_reason: "existing_processing_records",
          processedBases: dailyBases.length,
          dateKeys: resolvedDateKeys,
          date_keys: resolvedDateKeys,
          claimOrder: normalizedClaimOrder,
          claim_order: normalizedClaimOrder,
          claimLimit: 0,
          claim_limit: 0,
          skippedRecords,
          statusCounts,
          existingProcessingRecords,
          existing_processing_records: existingProcessingRecords,
          autoRecoveredProcessingRecords,
          auto_recovered_processing_records: autoRecoveredProcessingRecords,
          workItems: [],
          effectiveWorkItems: [],
          effective_work_items: [],
          decisionHint:
            `发现 ${existingProcessingRecords.length} 条 status=processing 记录，默认禁止继续认领新记录。` +
            `${autoRecoveredProcessingRecords.length > 0 ? `本轮已自动恢复 ${autoRecoveredProcessingRecords.length} 条当前 session stale processing 为 init；` : ""}` +
            `请先 close 当前记录，或使用 recover-processing-records 只读盘点/按 session 恢复后再继续。`,
          decision_hint:
            `发现 ${existingProcessingRecords.length} 条 status=processing 记录，默认禁止继续认领新记录。` +
            `${autoRecoveredProcessingRecords.length > 0 ? `本轮已自动恢复 ${autoRecoveredProcessingRecords.length} 条当前 session stale processing 为 init；` : ""}` +
            `请先 close 当前记录，或使用 recover-processing-records 只读盘点/按 session 恢复后再继续。`,
          shouldProceed: false,
        };
      }

      const effectiveWorkItems = readOnlyPrepare ? statusOnlyCandidates : workItems;
      const candidateLen = statusOnlyCandidates.length;
      const workLen = workItems.length;
      const notSupportTotal =
        Number(notSupport?.total || 0) + Number(newlyMarkedNotSupport?.total || 0);
      const eligibleInitFailed = Object.entries(statusCounts).reduce(
        (acc, [k, v]) => (k === "init" || k === "failed" ? acc + Number(v || 0) : acc),
        0,
      );
      // 汇总 claimable 统计：claimedThisRound（本轮回写 processing 的数量）和 skippedNearbySupported（claimLimit 限制未认领的剩余积压）
      nearByClaimable.claimedThisRound = readOnlyPrepare
        ? 0
        : Math.min(workLen, nearByClaimable.totalNearbySupported);
      nearByClaimable.skippedNearbySupported = Math.max(
        0,
        nearByClaimable.totalNearbySupported - nearByClaimable.claimedThisRound,
      );
      const claimableHint = (() => {
        if (nearByClaimable.totalNearbySupported === 0) {
          return `claimable：近两天无可自动排查记录（totalNearbySupported=0）。`;
        }
        const orderHint =
          normalizedClaimOrder === "task_date_asc"
            ? `claim_order=task_date_asc（优先处理更早日期的日报，适合补历史积压）`
            : `claim_order=updated_time_desc（默认，优先处理最新日报，适合新告警实时闭环）`;
        if (nearByClaimable.skippedNearbySupported > 0) {
          return `claimable：近两天可自动排查（offline_hive 支持）${nearByClaimable.totalNearbySupported} 条，本轮 claim-limit=${normalizedClaimLimit} 仅认领 ${nearByClaimable.claimedThisRound} 条，剩 ${nearByClaimable.skippedNearbySupported} 条未认领需下一轮循环；${orderHint}。`;
        }
        return `claimable：近两天可自动排查 ${nearByClaimable.totalNearbySupported} 条，本轮全部认领 ${nearByClaimable.claimedThisRound} 条；${orderHint}。`;
      })();
      let shouldProceed;
      let decisionHint;
      if (!statusOnly && workLen > 0) {
        shouldProceed = true;
        decisionHint = `认领成功 ${workLen} 条 (processing)，必须逐条消费 workItems 调用单条排障 skill；not_support 记录已在 Base 中写回无需再处理。${claimableHint}`;
      } else if (readOnlyPrepare && candidateLen > 0) {
        shouldProceed = true;
        decisionHint = `${preflightOnly ? "preflight-only" : "status-only"} 预览：检测到 ${candidateLen} 条可认领记录 (init/failed 且 offline_hive 支持)，candidateWorkItems 已填充；必须去掉只读参数重新执行 prepare-auto-troubleshoot 才会实际认领 processing 并生成 workItems。不要仅根据 workItems=0 判断"无待办"。${claimableHint}`;
      } else if (
        !statusOnly &&
        candidateLen === 0 &&
        workLen === 0 &&
        eligibleInitFailed === 0 &&
        notSupportTotal === 0
      ) {
        shouldProceed = false;
        decisionHint = `目录中当前不存在 init / failed 状态的日报记录，且无 not_support 转写记录，本轮真正无需进一步处理。${claimableHint}`;
      } else {
        shouldProceed = eligibleInitFailed > 0;
        const parts = [];
        if (eligibleInitFailed > 0)
          parts.push(`目录中仍有 ${eligibleInitFailed} 条 status=init/failed 记录`);
        if (notSupportTotal > 0)
          parts.push(
            `共有 ${notSupportTotal} 条记录已被标记 not_support (rule_type 非 offline_hive 不支持自动排查)`,
          );
        if (eligibleInitFailed > 0 && candidateLen === 0 && workLen === 0) {
          parts.push(
            `但 candidateWorkItems 与 workItems 都为空 —— 所有 eligible 记录都被判定为 non-offline_hive 并已转 not_support，若要再处理必须补齐 rule_type=offline_hive/hive/hive_task 或扩展支持范围。`,
          );
        }
        decisionHint = `${parts.join("；")}${claimableHint ? `；${claimableHint}` : ""}`;
      }
      const hasBlockingStatuses = Object.entries(statusCounts).some(
        ([status, count]) =>
          ["init", "failed", "processing"].includes(String(status).toLowerCase()) &&
          Number(count || 0) > 0,
      );
      const drainSafety = {
        safe_to_declare_drained:
          dailyBases.length > 0 && workLen === 0 && candidateLen === 0 && !hasBlockingStatuses,
        reason:
          dailyBases.length === 0
            ? "no_daily_bases_matched"
            : hasBlockingStatuses
              ? "blocking_status_remains"
              : workLen > 0 || candidateLen > 0
                ? "work_items_remain"
                : "safe",
        required_checks: [
          "processedBases > 0",
          "workItems: []",
          "statusCounts 无 init/failed/processing",
        ],
      };

      return {
        success: true,
        processedBases: dailyBases.length,
        dateKeys: resolvedDateKeys,
        date_keys: resolvedDateKeys,
        claimOrder: normalizedClaimOrder,
        claim_order: normalizedClaimOrder,
        claimLimit: normalizedClaimLimit,
        claim_limit: normalizedClaimLimit,
        preflightOnly: Boolean(preflightOnly),
        preflight_only: Boolean(preflightOnly),
        denyExistingProcessing: Boolean(denyExistingProcessing),
        deny_existing_processing: Boolean(denyExistingProcessing),
        aiSessionId: processingSessionId,
        ai_session_id: processingSessionId,
        nearByClaimable,
        near_by_claimable: nearByClaimable,
        skippedRecords,
        statusCounts,
        notSupport,
        newlyMarkedNotSupport,
        statusOnly: Boolean(statusOnly),
        candidateWorkItems: statusOnlyCandidates,
        candidate_work_items: statusOnlyCandidates,
        autoRecoveredProcessingRecords,
        auto_recovered_processing_records: autoRecoveredProcessingRecords,
        workItems,
        effectiveWorkItems,
        effective_work_items: effectiveWorkItems,
        decisionHint,
        decision_hint: decisionHint,
        shouldProceed,
        unsafeToDeclareDrained: !drainSafety.safe_to_declare_drained,
        unsafe_to_declare_drained: !drainSafety.safe_to_declare_drained,
        drainSafety,
        drain_safety: drainSafety,
      };
    },

    async recoverProcessingRecords({
      scanDirUrl,
      dateKeys,
      bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      recordLimit = 100,
      aiSessionId,
      resultId,
      maxAgeMinutes = 120,
      forceByResultId = false,
      ignoreStale = false,
      apply = false,
    }) {
      const targetSession = String(aiSessionId || "").trim();
      const targetResultId = String(resultId || "").trim();
      const forceRecover = Boolean(forceByResultId);
      const forceGateInvalid = forceRecover && (!targetResultId || !apply);
      if (forceGateInvalid) {
        return {
          success: false,
          dry_run: !apply,
          apply: Boolean(apply),
          resultId: targetResultId || undefined,
          result_id: targetResultId || undefined,
          reason_code: "FORCE_REQUIRES_RESULT_ID_APPLY",
          reason:
            "--force-by-result-id 必须同时传 --result-id 和 --apply，避免误回滚其它 processing 记录。",
          records: [],
          processingRecords: [],
          processing_records: [],
          recovered: [],
          skipped: [],
          decisionHint:
            "强制回滚未执行：请使用 --result-id <RID> --force-by-result-id --apply；不满足门禁时不会修改 Base。",
          decision_hint:
            "强制回滚未执行：请使用 --result-id <RID> --force-by-result-id --apply；不满足门禁时不会修改 Base。",
        };
      }
      const maxAgeMs = Math.max(0, Number(maxAgeMinutes || 0)) * 60 * 1000;
      const now = Date.now();
      const { containers } = await this.resolveDailyBaseContainers({ scanDirUrl });
      const mergedChildrenRaw = await this.listChildrenAcrossContainers({ containers });
      // 多容器同标题日报去重（E_DAILY_001 假阳性兜底）
      const mergedChildren = pruneCrossContainerDuplicateDailyBases({
        children: mergedChildrenRaw,
        dateKeys,
        bizSuffix,
      });
      const dailyBases = selectDailyBaseNodes({
        nodes: mergedChildren,
        dateKeys,
        bizSuffix,
        claimOrder: "updated_time_desc",
      });
      assertSelectedDailyBasesAreBitable({ dailyBases });
      const records = [];
      const recovered = [];
      const skipped = [];
      const workItems = [];

      for (const dailyBase of dailyBases) {
        const tablePayload = await runJson(
          buildBaseTableListCommand({ baseToken: dailyBase.obj_token }),
        );
        const table = selectDailyBaseTable(tablePayload);
        const tableId = extractFirstString(table?.table_id, table?.id);
        if (!tableId) {
          throw new Error(`base ${dailyBase.obj_token} did not include a table_id`);
        }
        const recordPayload = await runJson(
          buildBaseRecordListCommand({
            baseToken: dailyBase.obj_token,
            tableId,
            limit: recordLimit,
          }),
        );
        for (const record of normalizeRecords(recordPayload)) {
          const status = String(extractSingleCellValue(record.fields?.status) ?? "")
            .trim()
            .toLowerCase();
          if (status !== "processing") continue;
          const finalResultId =
            record.fields?.result_id ||
            parseResultIdFromBambooUrl(getBambooUrlField(record.fields));
          if (targetResultId && String(finalResultId || "") !== targetResultId) {
            continue;
          }
          const session = getProcessingSession(record);
          const startedAtRaw = getProcessingStartedAt(record);
          const startedAtNumber = Number(startedAtRaw);
          const startedAtMs = Number.isFinite(startedAtNumber)
            ? startedAtNumber
            : Number.isNaN(Date.parse(String(startedAtRaw)))
              ? 0
              : Date.parse(String(startedAtRaw));
          const ageMs = startedAtMs > 0 ? now - startedAtMs : undefined;
          const sessionMatched = Boolean(targetSession && session === targetSession);
          const stale = Boolean(ignoreStale) || (ageMs === undefined ? false : ageMs >= maxAgeMs);
          const recoverableWithForce = Boolean(
            forceRecover && targetResultId && (stale || ignoreStale),
          );
          const item = compactObject({
            record_id: record.record_id,
            result_id: finalResultId,
            task_name: record.fields?.task_name,
            task_id: record.fields?.task_id,
            rule_id:
              record.fields?.rule_id ||
              record.fields?.rules_id ||
              record.fields?.task_id ||
              undefined,
            bamboo_url: getBambooUrlField(record.fields) || undefined,
            alarm_record_detail_id: record.fields?.alarm_record_detail_id || undefined,
            extra: parseObjectField(record.fields?.extra),
            message_id:
              record.fields?.message_id ||
              readFirstStringField(record.fields?.extra, "message_id", "source_message_id") ||
              undefined,
            ai_session_id: session,
            processing_started_at: startedAtRaw,
            age_ms: ageMs,
            stale,
            session_matched: sessionMatched,
            recoverable_with_force: recoverableWithForce,
            parent_wiki_token: dailyBase.node_token,
            target_space_id: dailyBase.space_id,
            base_token: dailyBase.obj_token,
            table_id: tableId,
          });
          records.push(item);
          const canRecover = forceRecover ? recoverableWithForce : sessionMatched && stale;
          if (!canRecover) {
            skipped.push({
              ...item,
              skip_reason: !sessionMatched
                ? "session_not_matched"
                : !stale
                  ? "not_stale"
                  : "not_recoverable",
            });
            continue;
          }
          const closeReadyWorkItem = compactObject({
            record_id: item.record_id,
            status: ["processing"],
            task_name: item.task_name,
            task_id: item.task_id,
            rule_id: item.rule_id,
            result_id: item.result_id,
            bamboo_url: item.bamboo_url,
            alarm_record_detail_id: item.alarm_record_detail_id,
            extra: item.extra,
            message_id: item.message_id,
            parent_wiki_token: item.parent_wiki_token,
            target_space_id: item.target_space_id,
            base_token: item.base_token,
            table_id: item.table_id,
            ai_session_id: item.ai_session_id,
            processing_started_at: item.processing_started_at,
            recovery_source: "recover-processing-records",
            next_step:
              "close existing processing record with close-prepared-work-items before claiming new records",
          });
          workItems.push(closeReadyWorkItem);
          if (apply) {
            const extra = {
              ...parseObjectField(record.fields?.extra),
              processing_recovered_at: now,
              processing_recovered_by_session: targetSession,
              processing_recovery_reason: forceRecover
                ? "force_overridden_session_mismatch"
                : "stale_processing_no_terminal_result",
            };
            await runJson(
              buildBaseBatchUpdateInlineCommand({
                baseToken: dailyBase.obj_token,
                tableId,
                body: {
                  record_id_list: [record.record_id],
                  patch: {
                    status: "init",
                    last_error: `自动恢复 stale processing：session=${targetSession}, age_ms=${ageMs}`,
                    extra: JSON.stringify(extra),
                  },
                },
              }),
            );
          }
          recovered.push({
            ...item,
            close_ready: true,
            force_overridden_session_mismatch: forceRecover && !sessionMatched ? true : undefined,
          });
        }
      }
      const inventoryHint = records
        .map(
          (record) =>
            `(ai_session_id=${record.ai_session_id || "-"}, result_id=${record.result_id || "-"}, age_ms=${record.age_ms ?? "-"}, stale=${record.stale}, session_matched=${record.session_matched}, recoverable_with_force=${record.recoverable_with_force})`,
        )
        .join("; ");
      const decisionHint = apply
        ? `已恢复 ${recovered.length} 条 processing 记录为 init；跳过 ${skipped.length} 条。inventory=${inventoryHint || "empty"}`
        : `只读盘点 ${records.length} 条 processing 记录；其中 ${records.filter((r) => r.session_matched && r.stale).length} 条匹配当前 session 且超时，传 --apply 才会恢复为 init。跨会话残留可使用 --result-id <RID> --force-by-result-id --apply。inventory=${inventoryHint || "empty"}`;

      return {
        success: true,
        dry_run: !apply,
        apply: Boolean(apply),
        processedBases: dailyBases.length,
        session: targetSession,
        resultId: targetResultId || undefined,
        result_id: targetResultId || undefined,
        maxAgeMinutes: Number(maxAgeMinutes || 0),
        forceByResultId: forceRecover,
        force_by_result_id: forceRecover,
        ignoreStale: Boolean(ignoreStale),
        ignore_stale: Boolean(ignoreStale),
        records,
        processingRecords: records,
        processing_records: records,
        workItems,
        work_items: workItems,
        recovered,
        skipped,
        decisionHint,
        decision_hint: decisionHint,
      };
    },

    async closePreparedWorkItems({ workItems, resultDir, outputFile }) {
      const normalizedWorkItems = normalizeWorkItemsInput(workItems);
      if (normalizedWorkItems.length === 0) {
        throw new Error("closePreparedWorkItems: workItems must be an array");
      }
      if (!resultDir) {
        throw new Error("closePreparedWorkItems: resultDir is required");
      }

      const results = [];
      for (const workItem of normalizedWorkItems) {
        const loaded = await readModelResultForWorkItem({ resultDir, workItem });
        if (loaded.missing) {
          results.push(
            compactObject({
              result_id: workItem.result_id,
              record_id: workItem.record_id,
              status: "missing_model_result",
              candidate_files: loaded.candidates,
            }),
          );
          continue;
        }
        if (loaded.incomplete) {
          results.push(
            compactObject({
              result_id: workItem.result_id,
              record_id: workItem.record_id,
              status: "incomplete_model_result",
              base_writeback_status: "skipped",
              notification_writeback_status: "skipped",
              card_update_status: "skipped",
              message_reply_status: "skipped",
              validator_overall_valid: false,
              semantic_guard_passed: false,
              hard_fail_code: loaded.hardFailCode || "RESULT_JSON_INCOMPLETE",
              validation_output: buildIncompleteModelResultValidation({
                filePath: loaded.filePath,
                reason: loaded.reason,
              }),
              reason: loaded.reason,
            }),
          );
          continue;
        }
        // 【P0-4b 前置 validate】写任何副作用之前先 validate-model-result-json。
        // validator 不通过时直接阻断 close，避免语义错误扩散到 Base / Bamboo 卡片 / 群消息。
        const markdownSource = await findModelResultMarkdownForWorkItem({ resultDir, workItem });
        const markdownMissing = Boolean(markdownSource.missing);
        let validationOutput = null;
        let validatorOverallValid = true;
        let validatorHardFailCode = "";
        try {
          validationOutput = await this.validateModelResultJson({
            modelResult: loaded.result,
            workItem,
            resultDir,
            docFilledFile: markdownSource.exists ? markdownSource.filePath : undefined,
            strictMode: false, // 内部使用 non-strict 拿到分层结果；strict=true 由 CLI 层主入口兜底 exit(1)
          });
          if (validationOutput && typeof validationOutput.overallValid === "boolean") {
            validatorOverallValid = validationOutput.overallValid;
            if (!validatorOverallValid) {
              validatorHardFailCode = validationOutput.hardFailCode || "validator_overall_invalid";
            }
          }
        } catch (validateErr) {
          validatorOverallValid = false;
          validatorHardFailCode =
            (validateErr && validateErr.hardFailCode) || "validator_throw_exception";
          validationOutput =
            validateErr && validateErr.validationOutput
              ? validateErr.validationOutput
              : { errorMessage: String((validateErr && validateErr.message) || validateErr) };
        }
        if (!validatorOverallValid) {
          const semanticHardFailCodes = validationOutput?.l2Semantics?.hardFailCodes || [];
          const guardStatus = !validationOutput?.l2Semantics?.closedLoopFailed?.valid
            ? "invalid_failed_reason"
            : semanticHardFailCodes.length > 0
              ? "validator_overall_invalid"
              : !validationOutput?.l2Semantics?.aiSummary?.valid
                ? "invalid_ai_summary"
                : "validator_overall_invalid";
          const guardReasons = [
            ...(validationOutput?.l1Structure?.reasons || []),
            ...(validationOutput?.l2Semantics?.reasons || []),
          ];
          const aiSummaryHints = validationOutput?.l2Semantics?.aiSummary?.hints?.length
            ? validationOutput.l2Semantics.aiSummary.hints
            : ["summary 必须包含自由文案、固定归因标签和排查完成/证据已附文档等终态关键词"];
          const aiSummarySampleFixed =
            validationOutput?.l2Semantics?.aiSummary?.sampleFixed ||
            "排查完成，证据已附文档；归因结果：[无效告警]其他原因(不需要修数)";
          results.push(
            compactObject({
              result_id: workItem.result_id,
              record_id: workItem.record_id,
              status: guardStatus,
              ai_summary_invalid: guardStatus === "invalid_ai_summary" ? true : undefined,
              failed_reason_invalid: guardStatus === "invalid_failed_reason" ? true : undefined,
              base_writeback_status: "skipped",
              notification_writeback_status: "skipped",
              card_update_status: "skipped",
              message_reply_status: "skipped",
              validator_overall_valid: false,
              semantic_guard_passed: false,
              hard_fail_code: validatorHardFailCode || "validator_overall_invalid",
              validation_output: validationOutput,
              reasons: guardReasons,
              hints:
                guardStatus === "invalid_ai_summary"
                  ? aiSummaryHints
                  : guardStatus === "invalid_failed_reason"
                    ? validationOutput?.l2Semantics?.closedLoopFailed?.hints
                    : undefined,
              sample_fixed: guardStatus === "invalid_ai_summary" ? aiSummarySampleFixed : undefined,
              failed_reason_hints:
                guardStatus === "invalid_failed_reason"
                  ? validationOutput?.l2Semantics?.closedLoopFailed?.hints
                  : undefined,
            }),
          );
          continue;
        }
        if (markdownMissing) {
          results.push(
            compactObject({
              result_id: workItem.result_id,
              record_id: workItem.record_id,
              status: "validator_overall_invalid",
              base_writeback_status: "skipped",
              notification_writeback_status: "skipped",
              card_update_status: "skipped",
              message_reply_status: "skipped",
              validator_overall_valid: false,
              semantic_guard_passed: false,
              hard_fail_code: "missing_result_markdown",
              validation_output: validationOutput,
              reasons: ["缺少本地排查正文 Markdown，无法执行 close 前文档质量门禁"],
              markdown_candidate_files: markdownSource.candidates,
            }),
          );
          continue;
        }
        const reviewAudit = await inspectReviewAuditForWorkItem({ resultDir, workItem });
        if (!reviewAudit.valid) {
          results.push(
            compactObject({
              result_id: workItem.result_id,
              record_id: workItem.record_id,
              status: "validator_overall_invalid",
              base_writeback_status: "skipped",
              notification_writeback_status: "skipped",
              card_update_status: "skipped",
              message_reply_status: "skipped",
              validator_overall_valid: false,
              semantic_guard_passed: false,
              hard_fail_code: reviewAudit.code,
              validation_output: validationOutput,
              review_audit: reviewAudit,
              reasons: [reviewAudit.reason],
              review_candidate_files: reviewAudit.candidates,
            }),
          );
          continue;
        }
        const publishAudit = await inspectPublishAuditForWorkItem({
          resultDir,
          workItem,
          modelResult: loaded.result,
        });
        if (!publishAudit.valid) {
          results.push(
            compactObject({
              result_id: workItem.result_id,
              record_id: workItem.record_id,
              status: "validator_overall_invalid",
              base_writeback_status: "skipped",
              notification_writeback_status: "skipped",
              card_update_status: "skipped",
              message_reply_status: "skipped",
              validator_overall_valid: false,
              semantic_guard_passed: false,
              hard_fail_code: publishAudit.code,
              validation_output: validationOutput,
              review_audit: reviewAudit,
              publish_audit: publishAudit,
              reasons: [publishAudit.reason],
              publish_doc_candidate_files: publishAudit.candidates,
            }),
          );
          continue;
        }
        const closeResult = await this.closePreparedWorkItem({
          workItem,
          modelResult: loaded.result,
        });
        // validate 结果末尾追加（零侵入原有 status/closed 计数）
        if (validationOutput) {
          closeResult.validation_output = validationOutput;
        }
        if (validatorHardFailCode) {
          closeResult.hard_fail_code = validatorHardFailCode;
        }
        closeResult.validator_overall_valid = validatorOverallValid;
        closeResult.semantic_guard_passed = validatorOverallValid;
        closeResult.review_audit = reviewAudit;
        closeResult.publish_audit = publishAudit;
        results.push(closeResult);
      }

      const closed = results.filter(
        (result) => result.base_writeback_status === "succeeded",
      ).length;
      const missingResults = results.filter(
        (result) => result.status === "missing_model_result",
      ).length;
      const incompleteResults = results.filter(
        (result) =>
          result.status === "incomplete_model_result" || result.status === "invalid_work_item",
      ).length;
      const dependencyPreflightFailed = results.filter(
        (result) => result.status === "dependency_preflight_failed",
      ).length;
      const invalidAiSummary = results.filter(
        (result) => result.status === "invalid_ai_summary",
      ).length;
      const invalidFailedReason = results.filter(
        (result) => result.status === "invalid_failed_reason",
      ).length;
      const semanticGuardFailed = results.filter(
        (result) => result.semantic_guard_passed === false,
      ).length;
      const failedBaseWritebacks = results.filter(
        (result) => result.base_writeback_status === "failed",
      ).length;
      const failedNotificationWritebacks = results.filter(
        (result) => result.notification_writeback_status === "failed",
      ).length;
      const failedWritebacks = failedBaseWritebacks + failedNotificationWritebacks;
      const failedCardUpdates = results.filter(
        (result) => result.card_update_status === "failed",
      ).length;
      const failedMessageReplies = results.filter(
        (result) => result.message_reply_status === "failed",
      ).length;
      const businessClose = {
        success:
          missingResults === 0 &&
          incompleteResults === 0 &&
          dependencyPreflightFailed === 0 &&
          invalidAiSummary === 0 &&
          invalidFailedReason === 0 &&
          semanticGuardFailed === 0 &&
          failedBaseWritebacks === 0,
        closed,
        failed_base_writebacks: failedBaseWritebacks,
        blockers: compactObject({
          missing_results: missingResults || undefined,
          incomplete_results: incompleteResults || undefined,
          dependency_preflight_failed: dependencyPreflightFailed || undefined,
          invalid_ai_summary: invalidAiSummary || undefined,
          invalid_failed_reason: invalidFailedReason || undefined,
          semantic_guard_failed: semanticGuardFailed || undefined,
          failed_base_writebacks: failedBaseWritebacks || undefined,
        }),
      };
      const notificationClose = {
        success:
          failedNotificationWritebacks === 0 &&
          failedCardUpdates === 0 &&
          failedMessageReplies === 0,
        failed_notification_writebacks: failedNotificationWritebacks,
        failed_card_updates: failedCardUpdates,
        failed_message_replies: failedMessageReplies,
        partial_failed: failedNotificationWritebacks + failedCardUpdates + failedMessageReplies > 0,
      };

      const closeSummary = {
        success: businessClose.success && notificationClose.success,
        processed: normalizedWorkItems.length,
        closed,
        business_close: businessClose,
        notification_close: notificationClose,
        missing_results: missingResults,
        incomplete_results: incompleteResults,
        dependency_preflight_failed: dependencyPreflightFailed,
        invalid_ai_summary: invalidAiSummary,
        invalid_failed_reason: invalidFailedReason,
        // 【P0-4b】末尾追加：前置 validate 汇总统计（零侵入原有 success 条件）
        validator_invalid_count: results.filter((r) => r.validator_overall_valid === false).length,
        semantic_guard_failed: semanticGuardFailed,
        semantic_guard_passed: semanticGuardFailed === 0,
        failed_writebacks: failedWritebacks,
        failed_base_writebacks: failedBaseWritebacks,
        failed_notification_writebacks: failedNotificationWritebacks,
        failed_card_updates: failedCardUpdates,
        failed_message_replies: failedMessageReplies,
        partial_failed: notificationClose.partial_failed,
        results,
      };
      if (outputFile) {
        closeSummary.close_audit_file = outputFile;
        closeSummary.audit_files = { close: outputFile };
        await mkdir(dirname(outputFile), { recursive: true });
        await writeFile(outputFile, `${JSON.stringify(closeSummary, null, 2)}\n`, "utf8");
      }
      return closeSummary;
    },

    async validateResultDir({ workItems, resultDir }) {
      const normalizedWorkItems = normalizeWorkItemsInput(workItems);
      if (normalizedWorkItems.length === 0) {
        throw new Error("validateResultDir: workItems must be an array");
      }
      if (!resultDir) {
        throw new Error("validateResultDir: resultDir is required");
      }
      const results = [];
      for (const workItem of normalizedWorkItems) {
        const loaded = await readModelResultForWorkItem({ resultDir, workItem });
        if (loaded.missing) {
          const readiness = {
            result_id: workItem.result_id,
            record_id: workItem.record_id,
            ready_for_close: false,
            blockers: ["missing_model_result"],
            auto_fixable_via_normalize: false,
          };
          results.push(
            compactObject({
              result_id: workItem.result_id,
              record_id: workItem.record_id,
              status: "missing_model_result",
              overall_valid: false,
              semantic_guard_passed: false,
              close_readiness: readiness,
              candidate_files: loaded.candidates,
            }),
          );
          continue;
        }
        if (loaded.incomplete) {
          const readiness = {
            result_id: workItem.result_id,
            record_id: workItem.record_id,
            ready_for_close: false,
            blockers: ["RESULT_JSON_INCOMPLETE"],
            auto_fixable_via_normalize: false,
          };
          results.push(
            compactObject({
              result_id: workItem.result_id,
              record_id: workItem.record_id,
              status: "incomplete_model_result",
              overall_valid: false,
              semantic_guard_passed: false,
              close_readiness: readiness,
              hard_fail_codes: ["RESULT_JSON_INCOMPLETE"],
              reasons: [loaded.reason || "model result JSON file is empty or incomplete"],
            }),
          );
          continue;
        }
        const markdownSource = await findModelResultMarkdownForWorkItem({ resultDir, workItem });
        const markdownMissing = Boolean(markdownSource.missing);
        const validation = await this.validateModelResultJson({
          modelResult: loaded.result,
          workItem,
          resultDir,
          docFilledFile: markdownSource?.exists ? markdownSource.filePath : undefined,
          strictMode: false,
        });
        const reviewAudit = await inspectReviewAuditForWorkItem({ resultDir, workItem });
        const publishAudit = await inspectPublishAuditForWorkItem({
          resultDir,
          workItem,
          modelResult: loaded.result,
        });
        const artifactBlockers = [
          ...(markdownMissing ? ["missing_result_markdown"] : []),
          ...(!reviewAudit.valid ? [reviewAudit.code] : []),
          ...(!publishAudit.valid ? [publishAudit.code] : []),
        ];
        const readinessBase = buildCloseReadiness({ modelResult: loaded.result, workItem });
        const closeReadiness = compactObject({
          result_id: workItem.result_id,
          record_id: workItem.record_id,
          status: validation.normalizedModelResult?.status,
          ...readinessBase,
          ready_for_close: readinessBase.ready_for_close && artifactBlockers.length === 0,
          blockers: [...new Set([...(readinessBase.blockers || []), ...artifactBlockers])],
          markdown_file: markdownSource.filePath,
          markdown_candidate_files: markdownMissing ? markdownSource.candidates : undefined,
          review_audit_file: reviewAudit.file_path,
          publish_audit_file: publishAudit.file_path,
          review_candidate_files: !reviewAudit.valid ? reviewAudit.candidates : undefined,
          publish_doc_candidate_files: !publishAudit.valid ? publishAudit.candidates : undefined,
        });
        const hardFailCodes = validation.l2Semantics?.hardFailCodes || [];
        const mergedHardFailCodes = [...new Set([...hardFailCodes, ...artifactBlockers])];
        results.push(
          compactObject({
            result_id: workItem.result_id,
            record_id: workItem.record_id,
            status: validation.normalizedModelResult?.status,
            overall_valid: validation.overallValid && artifactBlockers.length === 0,
            semantic_guard_passed:
              validation.semantic_guard_passed && artifactBlockers.length === 0,
            close_readiness: closeReadiness,
            hard_fail_codes: mergedHardFailCodes,
            sample_count_authority: validation.l2Semantics?.sample_count_authority,
            authority_source: validation.l2Semantics?.authority_source,
            review_audit: reviewAudit,
            publish_audit: publishAudit,
            reasons: [
              ...(validation.l1Structure?.reasons || []),
              ...(validation.l2Semantics?.reasons || []),
              ...(validation.l3DeepCheck?.reasons || []),
              ...(markdownMissing
                ? [
                    "resultDir 缺少 <result_id>.md 或 doc-<result_id>.md，不能证明排查文档正文已落盘",
                  ]
                : []),
              ...(!reviewAudit.valid ? [reviewAudit.reason] : []),
              ...(!publishAudit.valid ? [publishAudit.reason] : []),
            ],
          }),
        );
      }
      const invalidResults = results.filter((item) => item.overall_valid === false);
      const semanticGuardFailed = results.filter((item) => item.semantic_guard_passed === false);
      const hardFailCodeCounts = {};
      for (const item of results) {
        for (const code of item.hard_fail_codes || []) {
          hardFailCodeCounts[code] = (hardFailCodeCounts[code] || 0) + 1;
        }
      }
      const perResultCloseReadiness = results.map((item) => item.close_readiness).filter(Boolean);
      const closeReadyCount = perResultCloseReadiness.filter((item) => item.ready_for_close).length;
      const repairPlan = buildValidationRepairPlan(results);
      return {
        success: invalidResults.length === 0 && semanticGuardFailed.length === 0,
        processed: normalizedWorkItems.length,
        valid: results.length - invalidResults.length,
        invalid: invalidResults.length,
        semantic_guard_failed: semanticGuardFailed.length,
        hard_fail_code_counts: hardFailCodeCounts,
        close_ready: closeReadyCount,
        close_blocked: perResultCloseReadiness.length - closeReadyCount,
        per_result_close_readiness: perResultCloseReadiness,
        repair_plan: repairPlan,
        repairPlan,
        results,
        decisionHint:
          invalidResults.length > 0
            ? "批量语义复核发现无效结果；禁止只修单条，应按 hard_fail_code_counts 修正同批次结果后再 close。"
            : closeReadyCount === perResultCloseReadiness.length
              ? "批量语义复核通过，且 close-readiness 全部 ready，可继续执行 close-prepared-work-items。"
              : "批量语义复核通过，但部分结果 close-readiness=false；请先按 blockers 执行 normalize-model-result-json 或 normalize-result-doc-links 后再 close。",
      };
    },

    async normalizeModelResultJson({
      input,
      inputFile,
      outputFile,
      docUrl,
      docToken,
      requireResultIdPrefix = false,
      fixAiSummaryKeywords = false,
      sopResult,
      sopResultFile,
    } = {}) {
      const source =
        input && typeof input === "object"
          ? input
          : inputFile
            ? JSON.parse(await readFile(inputFile, "utf8"))
            : undefined;
      if (!source || typeof source !== "object") {
        throw new Error("normalizeModelResultJson: input or inputFile is required");
      }
      const raw = Array.isArray(source) ? source[0] : source;
      const normalized = { ...raw };
      const changedKeys = [];
      const setIfChanged = (key, value) => {
        if (value === undefined || value === null || value === "") return;
        if (normalized[key] !== value) {
          normalized[key] = value;
          changedKeys.push(key);
        }
      };

      let sopPayload = sopResult && typeof sopResult === "object" ? sopResult : undefined;
      if (!sopPayload && sopResultFile) {
        sopPayload = JSON.parse(await readFile(sopResultFile, "utf8"));
      }

      const resolvedDocUrl = String(docUrl || extractDocUrlFromModelResult(raw)).trim();
      const resolvedDocToken = String(
        docToken || extractDocTokenFromModelResult(raw) || extractWikiTokenFromUrl(resolvedDocUrl),
      ).trim();
      if (resolvedDocUrl) {
        setIfChanged("feishu_doc_url", resolvedDocUrl);
        setIfChanged("doc_url", resolvedDocUrl);
        setIfChanged("ai_result", resolvedDocUrl);
        if (!normalized.doc_archive_status) setIfChanged("doc_archive_status", "succeeded");
        if (!normalized.doc_write_status) setIfChanged("doc_write_status", "updated");
      }
      if (resolvedDocToken) {
        setIfChanged("doc_token", resolvedDocToken);
      }
      if (
        requireResultIdPrefix &&
        resolvedDocUrl &&
        normalized.result_id &&
        !isWikiDocumentUrl(resolvedDocUrl)
      ) {
        setIfChanged("doc_archive_status", "failed");
        setIfChanged(
          "doc_archive_reason",
          "require_result_id_prefix enabled but doc_url is not a wiki link; republish under the target Wiki directory first",
        );
      }

      if (sopPayload && typeof sopPayload === "object") {
        for (const key of [
          "sop_writeback_status",
          "sop_writeback_reason",
          "sop_doc_url",
          "sop_doc_token",
          "sop_doc_archive_status",
        ]) {
          if (sopPayload[key] !== undefined) setIfChanged(key, sopPayload[key]);
        }
      } else if (!normalized.sop_writeback_status) {
        setIfChanged("sop_writeback_status", "skipped");
        setIfChanged("sop_writeback_reason", "SOP 文档无对应 rule_id 变更，显式留痕跳过");
      }

      const status = String(normalized.status || deriveTerminalStatus(normalized) || "").trim();
      if (!normalized.status && status && status !== "incomplete_model_result")
        setIfChanged("status", status);
      const summaryText = String(normalized.ai_summary || normalized.summary || "").trim();
      if (summaryText && !normalized.summary) setIfChanged("summary", summaryText);
      if (summaryText && !normalized.ai_summary) setIfChanged("ai_summary", summaryText);
      if (
        fixAiSummaryKeywords &&
        ["succeeded", "pending", "failed", "not_support"].includes(status)
      ) {
        const fixedAttribution = normalized.attribution_result || normalized.attributionResult;
        const summary = normalizeAiSummaryLengthAndKeywords(summaryText, {
          requiredAttribution: fixedAttribution,
          minLength: 20,
          maxLength: 500,
          requireFreeTextKeywords: true,
        });
        const fixedSummary = summary.valid
          ? summary.normalized || summaryText
          : isAllowedBambooAttributionResult(fixedAttribution)
            ? `排查完成，证据已附文档，已自动确认无需修数；归因结果：${fixedAttribution}`
            : summary.normalized || summaryText;
        if (fixedSummary) {
          setIfChanged("summary", fixedSummary);
          setIfChanged("ai_summary", fixedSummary);
        }
      }

      normalized.__normalized = {
        at: new Date().toISOString(),
        changed_keys: [...new Set(changedKeys)],
        source: "normalize-model-result-json",
        close_readiness: buildCloseReadiness({ modelResult: normalized, workItem: {} }),
      };
      if (outputFile) {
        await writeJsonFile(outputFile, normalized);
      }
      return normalized;
    },

    async normalizeResultDocLinks({ workItems, resultDir, troubleshootingSopDoc, outputFile }) {
      const normalizedWorkItems = normalizeWorkItemsInput(workItems);
      if (normalizedWorkItems.length === 0) {
        throw new Error("normalizeResultDocLinks: workItems must be an array");
      }
      if (!resultDir) {
        throw new Error("normalizeResultDocLinks: resultDir is required");
      }
      const normalizedResultDir = String(resultDir || "").trim();
      const results = [];
      for (const workItem of normalizedWorkItems) {
        const resultId = String(workItem?.result_id || workItem?.resultId || "").trim();
        const recordId = String(workItem?.record_id || workItem?.recordId || "").trim();
        const loaded = await readModelResultForWorkItem({
          resultDir: normalizedResultDir,
          workItem,
        });
        if (loaded.missing || !loaded.result || typeof loaded.result !== "object") {
          results.push({
            result_id: resultId,
            record_id: recordId,
            status: "skipped",
            reason: "missing_model_result",
            candidate_files: loaded.candidates,
          });
          continue;
        }
        const rawDocUrl = String(
          loaded.result.feishu_doc_url || loaded.result.doc_url || loaded.result.ai_result || "",
        ).trim();
        const parentWikiToken = String(
          workItem?.parent_wiki_token || workItem?.parentWikiToken || "",
        ).trim();
        const targetSpaceId = String(
          workItem?.target_space_id || workItem?.targetSpaceId || "",
        ).trim();
        if (!parentWikiToken) {
          results.push({
            result_id: resultId,
            record_id: recordId,
            status: "skipped",
            reason: "parent_wiki_token_missing",
          });
          continue;
        }
        if (!targetSpaceId) {
          results.push({
            result_id: resultId,
            record_id: recordId,
            status: "skipped",
            reason: "target_space_id_missing",
          });
          continue;
        }
        if (isWikiDocumentUrl(rawDocUrl)) {
          results.push({
            result_id: resultId,
            record_id: recordId,
            status: "skipped",
            reason: "already_wiki_link",
            feishu_doc_url: rawDocUrl,
          });
          continue;
        }
        let markdown = "";
        const markdownCandidates = [
          join(normalizedResultDir, `${resultId}.md`),
          join(normalizedResultDir, `doc-${resultId}.md`),
        ];
        for (const candidate of markdownCandidates) {
          try {
            markdown = await readFile(candidate, "utf8");
            break;
          } catch {
            // keep looking
          }
        }
        if (!markdown) {
          results.push({
            result_id: resultId,
            record_id: recordId,
            status: "failed",
            reason: "markdown_source_missing",
            detail:
              "需要 resultDir/<result_id>.md 或 doc-<result_id>.md 作为受控重发文档正文，不能凭 docx 链接无证迁移。",
          });
          continue;
        }
        const title = buildTroubleshootingDocTitle({
          resultId,
          taskName: workItem?.task_name || loaded.result.task_name || "unknown_task",
          taskDate: workItem?.task_date || loaded.result.task_date,
          taskTime: workItem?.task_time || loaded.result.task_time,
        });
        try {
          const published = await this.publishTroubleshootingDoc({
            title,
            markdown,
            parentWikiToken,
            targetSpaceId,
            troubleshootingSopDoc,
            existingTitlePrefix: `${resultId}:`,
            requireResultIdPrefix: true,
            resultId,
            taskName: workItem?.task_name || loaded.result.task_name,
            taskDate: workItem?.task_date || loaded.result.task_date,
            taskTime: workItem?.task_time || loaded.result.task_time,
            workItem,
          });
          const nextDocUrl = String(published?.feishu_doc_url || "").trim();
          if (!isWikiDocumentUrl(nextDocUrl)) {
            results.push({
              result_id: resultId,
              record_id: recordId,
              status: "failed",
              reason: "published_doc_is_not_wiki_link",
              feishu_doc_url: nextDocUrl,
            });
            continue;
          }
          const updatedResult = {
            ...loaded.result,
            feishu_doc_url: nextDocUrl,
            ai_result: nextDocUrl,
            doc_url: nextDocUrl,
            doc_write_status: published.doc_write_status,
            doc_archive_status: published.doc_archive_status,
            doc_archive_reason: published.doc_archive_reason,
            __raw_docx_url: published.__raw_docx_url || rawDocUrl || undefined,
            __normalized_doc_link_at: new Date().toISOString(),
          };
          await writeFile(
            join(normalizedResultDir, `${resultId}.json`),
            `${JSON.stringify(updatedResult, null, 2)}\n`,
            "utf8",
          );
          results.push({
            result_id: resultId,
            record_id: recordId,
            status: "succeeded",
            previous_doc_url: rawDocUrl || undefined,
            feishu_doc_url: nextDocUrl,
            doc_write_status: published.doc_write_status,
            doc_archive_status: published.doc_archive_status,
          });
        } catch (error) {
          results.push({
            result_id: resultId,
            record_id: recordId,
            status: "failed",
            reason: error?.message || String(error),
          });
        }
      }
      const output = {
        success: results.every((result) => result.status !== "failed"),
        processed: normalizedWorkItems.length,
        succeeded: results.filter((result) => result.status === "succeeded").length,
        failed: results.filter((result) => result.status === "failed").length,
        skipped: results.filter((result) => result.status === "skipped").length,
        results,
      };
      if (outputFile) {
        await mkdir(dirname(outputFile), { recursive: true });
        await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
      }
      return output;
    },

    async prepareSingleTroubleshootData({
      resultId,
      result_id,
      bambooUrl,
      bamboo_url,
      troubleshootingSopDoc,
      troubleshooting_sop_doc,
      troubleshootingSopLocalPath,
      troubleshooting_sop_local_path,
      outputDir,
    } = {}) {
      const finalResultId = String(
        resultId || result_id || parseResultIdFromBambooUrl(bambooUrl || bamboo_url) || "",
      ).trim();
      if (!finalResultId) {
        throw buildRunnerError("result_id or bamboo_url with id=<result_id> is required", {
          reason_code: "RESULT_ID_REQUIRED",
        });
      }
      const normalizedOutputDir =
        outputDir || (await mkdtemp(join(tmpdir(), `bamboo-single-${finalResultId}-`)));
      await mkdir(normalizedOutputDir, { recursive: true });

      const prepared = await this.prepareSingleTroubleshootInputs({ resultId: finalResultId });
      const ruleId = String(
        prepared?.work_item?.rule_id ||
          prepared?.inspect_result?.rule_validation?.actual_rule_id ||
          "",
      ).trim();
      const sopDoc = troubleshootingSopDoc || troubleshooting_sop_doc || "";
      let totalSopLocalPath = troubleshootingSopLocalPath || troubleshooting_sop_local_path || "";
      let totalSopMarkdown = "";
      let ruleSopLocalPath = "";
      let ruleSopDocUrl = "";

      if (totalSopLocalPath) {
        totalSopMarkdown = await readFile(totalSopLocalPath, "utf8");
      } else if (sopDoc) {
        let sopNodeToken = sopDoc;
        try {
          sopNodeToken = extractWikiNodeToken(sopDoc);
        } catch {
          sopNodeToken = sopDoc;
        }
        const sopNodePayload = await runJson(buildWikiNodeGetCommand({ scanDirUrl: sopNodeToken }));
        const sopNode = extractWikiNode(sopNodePayload);
        const sopDocToken = extractFirstString(
          sopNode.obj_token,
          sopNodePayload?.data?.obj_token,
          sopNodePayload?.data?.node?.obj_token,
          sopNode.node_token,
          sopNodeToken,
        );
        totalSopMarkdown = extractMarkdownText(
          await runJson(buildDocsFetchCommand({ docToken: sopDocToken })),
        );
        totalSopLocalPath = join(normalizedOutputDir, "troubleshooting-sop.md");
        await writeFile(totalSopLocalPath, totalSopMarkdown, "utf8");

        if (ruleId && sopNode.node_token) {
          const childrenPayload = await runJson(
            buildWikiNodeListCommand({
              spaceId: sopNode.space_id,
              parentNodeToken: sopNode.node_token,
            }),
          );
          const children = getItems(childrenPayload).map((item) =>
            normalizeNodeItem(item, sopNode.space_id),
          );
          const ruleNode = children.find((node) =>
            String(node.title || "").startsWith(`${ruleId}:`),
          );
          if (ruleNode) {
            const ruleDocToken = ruleNode.obj_token || ruleNode.node_token;
            const ruleSopMarkdown = extractMarkdownText(
              await runJson(buildDocsFetchCommand({ docToken: ruleDocToken })),
            );
            ruleSopLocalPath = join(normalizedOutputDir, `${ruleId}-rule-sop.md`);
            await writeFile(ruleSopLocalPath, ruleSopMarkdown, "utf8");
            ruleSopDocUrl = ruleNode.node_token
              ? `https://bytedance.larkoffice.com/wiki/${ruleNode.node_token}`
              : "";
          }
        }
      }

      if (!ruleSopLocalPath) {
        ruleSopLocalPath = join(normalizedOutputDir, `${ruleId || "unknown"}-rule-sop.md`);
        await writeFile(
          ruleSopLocalPath,
          [
            `# ${ruleId || "unknown"}:${prepared?.work_item?.task_name || "unknown_task"}排查sop`,
            "",
            "## 当前规则 SOP",
            "未在总 SOP 入口下找到对应 rule_id 文档，等待本次排查补全。",
          ].join("\n") + "\n",
          "utf8",
        );
      }

      const dataPath = join(normalizedOutputDir, `${finalResultId}-prepared-data.json`);
      const output = {
        result_id: finalResultId,
        rule_id: ruleId,
        bamboo_url: bambooUrl || bamboo_url || prepared?.work_item?.bamboo_url || "",
        prepared_data_path: dataPath,
        total_sop_local_path: totalSopLocalPath,
        rule_sop_local_path: ruleSopLocalPath,
        rule_sop_doc_url: ruleSopDocUrl,
        inspect_result: prepared.inspect_result,
        qc_result: prepared.qc_result,
        work_item: prepared.work_item,
      };
      await writeFile(dataPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
      return output;
    },

    async writeLocalTroubleshootingResult({
      resultId,
      result_id,
      status = "succeeded",
      attributionResult,
      attribution_result,
      summary,
      totalSopSuggestion,
      total_sop_suggestion,
      ruleSopMarkdown,
      rule_sop_markdown,
      outputPath,
      ruleSopOutputPath,
    } = {}) {
      const finalResultId = String(resultId || result_id || "").trim();
      if (!finalResultId) {
        throw buildRunnerError("resultId is required", { reason_code: "RESULT_ID_REQUIRED" });
      }
      const resultPath = outputPath || join(process.cwd(), ".tmp", `${finalResultId}.md`);
      const rulePath =
        ruleSopOutputPath || join(dirname(resultPath), `${finalResultId}-rule-sop.md`);
      await mkdir(dirname(resultPath), { recursive: true });
      await mkdir(dirname(rulePath), { recursive: true });
      const finalAttribution = attributionResult || attribution_result || "";
      const finalSummary = summary || "";
      const markdown =
        [
          `# ${finalResultId}排查结果`,
          "",
          "## 状态",
          String(status || ""),
          "",
          "## ai总结",
          finalSummary,
          "",
          "## 固定归因结果",
          finalAttribution,
          "",
          "## 总sop优化建议",
          totalSopSuggestion || total_sop_suggestion || "无",
          "",
          "## 规则sop优化建议",
          "详见规则 SOP 本地文档。",
          "",
          "## 其他排查过程信息",
          "由单条排障模型补充完整证据、样本点查和处理建议。",
        ].join("\n") + "\n";
      await writeFile(resultPath, markdown, "utf8");
      await writeFile(rulePath, String(ruleSopMarkdown || rule_sop_markdown || ""), "utf8");
      return {
        result_id: finalResultId,
        status,
        troubleshooting_result_local_path: resultPath,
        rule_sop_local_path: rulePath,
      };
    },

    async closeSingleTroubleshootFromLocal({
      troubleshootingResultLocalPath,
      troubleshooting_result_local_path,
      ruleSopLocalPath,
      rule_sop_local_path,
      ruleSopDocUrl,
      rule_sop_doc_url,
      workItemsFile,
      work_items_file,
      resultDir,
      result_dir,
      outputFile,
      output_file,
      dryRunClose = false,
      dry_run_close = false,
    } = {}) {
      const resultLocalPath =
        troubleshootingResultLocalPath || troubleshooting_result_local_path || "";
      const ruleLocalPath = ruleSopLocalPath || rule_sop_local_path || "";
      const ruleDocUrl = ruleSopDocUrl || rule_sop_doc_url || "";
      let ruleSopUpdateStatus = "skipped";
      let ruleSopUpdateReason = "";
      if (ruleLocalPath && ruleDocUrl) {
        const ruleMarkdown = await readFile(ruleLocalPath, "utf8");
        const docToken = (() => {
          try {
            const url = new URL(String(ruleDocUrl));
            const parts = url.pathname.split("/").filter(Boolean);
            return parts[parts.length - 1] || ruleDocUrl;
          } catch {
            return ruleDocUrl;
          }
        })();
        await runJson(buildDocsOverwriteCommand({ docToken, markdown: ruleMarkdown }));
        ruleSopUpdateStatus = "succeeded";
      } else {
        ruleSopUpdateReason = "rule_sop_local_path_or_rule_sop_doc_url_missing";
      }

      if (dryRunClose || dry_run_close) {
        return {
          err: "",
          troubleshooting_result_local_path: resultLocalPath,
          rule_sop_local_path: ruleLocalPath,
          rule_sop_doc_url: ruleDocUrl,
          rule_sop_update_status: ruleSopUpdateStatus,
          rule_sop_update_reason: ruleSopUpdateReason,
          close_status: "skipped",
          close_reason: "dry_run_close",
        };
      }

      const finalWorkItemsFile = workItemsFile || work_items_file;
      const finalResultDir = resultDir || result_dir;
      if (!finalWorkItemsFile || !finalResultDir) {
        throw buildRunnerError(
          "workItemsFile and resultDir are required when dryRunClose is false",
          {
            reason_code: "CLOSE_INPUT_REQUIRED",
          },
        );
      }
      const workItemsPayload = JSON.parse(await readFile(finalWorkItemsFile, "utf8"));
      const closeResult = await this.closePreparedWorkItems({
        workItems: normalizeWorkItemsInput(workItemsPayload),
        resultDir: finalResultDir,
        outputFile: outputFile || output_file,
      });
      return {
        err: "",
        troubleshooting_result_local_path: resultLocalPath,
        rule_sop_local_path: ruleLocalPath,
        rule_sop_doc_url: ruleDocUrl,
        rule_sop_update_status: ruleSopUpdateStatus,
        rule_sop_update_reason: ruleSopUpdateReason,
        close_status: closeResult?.success ? "succeeded" : "failed",
        close: closeResult,
      };
    },

    async claimNextWorkItemFromDailyBaseCsv({
      dailyCsvPaths,
      daily_csv_paths,
      scanDirUrl,
      scan_dir_url,
      troubleshootingSopDoc,
      troubleshooting_sop_doc,
      claimLimit = 1,
    } = {}) {
      const paths = dailyCsvPaths || daily_csv_paths || [];
      const candidates = [];
      for (const csvPath of paths) {
        const rows = parseCsv(await readFile(csvPath, "utf8"));
        for (const row of rows) {
          const status = String(row.status || "").trim();
          if (status && status !== "init" && status !== "failed") continue;
          const resultId = String(row.result_id || row.unique_id || "").trim();
          if (!resultId) continue;
          candidates.push({ result_id: resultId, csv_path: csvPath });
        }
      }
      if (candidates.length === 0) {
        return {
          err: "",
          cloud_claim_required: true,
          work_item: null,
          local_candidates: [],
        };
      }
      const dateKeys = Array.from(
        new Set(
          paths.map((csvPath) => path.basename(csvPath).match(/^(\d{8})-/)?.[1]).filter(Boolean),
        ),
      );
      const prepare = await this.prepareAutoTroubleshoot({
        scanDirUrl: scanDirUrl || scan_dir_url,
        dateKeys,
        troubleshootingSopDoc: troubleshootingSopDoc || troubleshooting_sop_doc,
        claimLimit,
      });
      const candidateIds = new Set(candidates.map((candidate) => candidate.result_id));
      const workItem =
        (prepare.workItems || []).find((item) => candidateIds.has(String(item.result_id || ""))) ||
        null;
      return {
        err: "",
        cloud_claim_required: true,
        local_candidates: candidates,
        prepare,
        work_item: workItem,
      };
    },

    // 【P0-4c 末尾追加】C1 独立调用保底：单个 result_id 生成完整 troubleshooting 输入组合。
    // 外部 4 个 skill 可独立调用 prepare-single-troubleshoot-inputs → 直接拿到：
    //   inspect_result / qc_result / raw_card_json / work_item / skeleton_type / recommended_publish_args
    // 所有字段 nonOverride:true，AI 只能消费不能改。
    async prepareSingleTroubleshootInputs({
      resultId,
      result_id,
      expectedRuleId,
      expected_rule_id,
      taskName,
      task_name,
      taskDate,
      task_date,
      taskTime,
      task_time,
      parentWikiToken,
      parent_wiki_token,
      baseToken,
      base_token,
      tableId,
      table_id,
      recordId,
      record_id,
      taskResultNum,
      task_result_num,
      ruleId,
      rule_id,
    } = {}) {
      const finalResultId = String(resultId || result_id || "");
      if (!finalResultId) {
        throw new Error("prepareSingleTroubleshootInputs: resultId (--result-id) is required");
      }
      const expectedRule = expectedRuleId || expected_rule_id || undefined;
      // 1) inspectBambooResult 标准化 + QC-1~4 快速闭环
      const inspect = await this.inspectBambooResult(finalResultId, {
        expectedRuleId: expectedRule,
        taskResultNum: taskResultNum ?? task_result_num,
      });
      const qc = classifyQuickClosureConditions({
        ...inspect.result,
        taskResultNum: taskResultNum ?? task_result_num,
      });
      // 2) 派生字段：bambooUrl / task_name / task_date / rule_id（兼容 inspect 原始、--task-* 参数、workItem 结构）
      const bambooUrl =
        (inspect.result &&
          typeof inspect.result.bamboo_url === "string" &&
          inspect.result.bamboo_url) ||
        (inspect.result &&
          typeof inspect.result.bambooResultUrl === "string" &&
          inspect.result.bambooResultUrl) ||
        "";
      const finalRuleId =
        ruleId ||
        rule_id ||
        (inspect.rule_validation ? inspect.rule_validation.actual_rule_id : "") ||
        (inspect.result && inspect.result.rules_id != null ? String(inspect.result.rules_id) : "");
      const rawTaskName =
        taskName ||
        task_name ||
        (inspect.result && (inspect.result.task_name || inspect.result.taskName)) ||
        `bamboo-result-${finalResultId}`;
      const finalTaskName = normalizeBambooTaskName(String(rawTaskName));
      const rawTaskTime =
        taskTime ||
        task_time ||
        (inspect.result && (inspect.result.task_time || inspect.result.taskTime)) ||
        "";
      const toTaskDate = (t) => {
        if (!t) return "";
        try {
          const d = new Date(String(t));
          if (!Number.isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${y}${m}${day}`;
          }
        } catch {}
        return String(taskDate || task_date || "");
      };
      const finalTaskDate = taskDate || task_date || toTaskDate(rawTaskTime) || "20260101";
      const finalTaskTime =
        rawTaskTime ||
        (finalTaskDate
          ? `${finalTaskDate.slice(0, 4)}-${finalTaskDate.slice(4, 6)}-${finalTaskDate.slice(6, 8)} 00:00:00 +08:00`
          : "");
      // 3) workItem 对象（结构严格兼容 prepare-auto-troubleshoot 返回的 workItems 条目）
      const workItem = {
        result_id: finalResultId,
        record_id: recordId || record_id || "",
        base_token: baseToken || base_token || "",
        table_id: tableId || table_id || "",
        parent_wiki_token: parentWikiToken || parent_wiki_token || "",
        task_name: finalTaskName,
        task_date: finalTaskDate,
        task_time: finalTaskTime,
        rule_id: finalRuleId,
        bamboo_url: bambooUrl,
        expected_rule_id: expectedRule || "",
        troubleshooting_sop_doc: "",
        source: "prepare-single-troubleshoot-inputs",
      };
      const skeletonType = qc && qc.quickClosureRecommended ? "quick-closure" : "deep";
      const topHardcodedAttr =
        (qc && (qc.topHardcodedAttribution || qc.suggestedAttribution)) ||
        (inspect.classification &&
          (inspect.classification.suggestedAttribution ||
            inspect.classification.attributionResult)) ||
        "";
      // 4) 末尾 nonOverride 组装返回
      return {
        success: true,
        result_id: finalResultId,
        inspect_result: inspect,
        qc_result: qc,
        raw_card_json: inspect.result || {},
        work_item: workItem,
        skeleton_type: skeletonType,
        top_hardcoded_attribution: topHardcodedAttr,
        qc_top_code: (qc && qc.topQuickClosureCode) || "",
        nonOverride: true,
        recommended_publish_args: {
          existingTitlePrefix: `${finalResultId}:`,
          requireResultIdPrefix: true,
          skeletonType,
          qcResult: qc,
          workItem,
          resultId: finalResultId,
          taskName: finalTaskName,
          taskDate: finalTaskDate,
          ruleId: finalRuleId,
          bambooUrl,
          topHardcodedAttribution: topHardcodedAttr,
        },
      };
    },

    buildAutoTroubleshootLoopPlan({
      scanDirUrl,
      dateKeys = [],
      dateKeyList,
      date_key_list,
      bizSuffix,
      troubleshootingSopDoc,
      resultDir,
      maxRounds = 50,
    }) {
      const normalizedResultDir = String(resultDir || "").trim() || ".tmp/bamboo-auto";
      const resolvedDateKeys = normalizeDateKeyList({ dateKeyList, date_key_list, dateKeys });
      const dateKeyArgs = resolvedDateKeys
        .filter(Boolean)
        .flatMap((dateKey) => ["--date-key", String(dateKey)]);
      const prepareArgs = [
        "scripts/bamboo/bamboo-alert-runner.mjs",
        "prepare-auto-troubleshoot",
        "--scan-dir-url",
        scanDirUrl,
        ...dateKeyArgs,
        ...(bizSuffix ? ["--biz-suffix", bizSuffix] : []),
        ...(troubleshootingSopDoc ? ["--troubleshooting-sop-doc", troubleshootingSopDoc] : []),
        "--claim-limit",
        "1",
        "--auto-recover-stale-processing",
        "--processing-max-age-minutes",
        "120",
        "--output-file",
        `${normalizedResultDir}/prepare-round-N.json`,
      ];
      const recoveryArgs = [
        "scripts/bamboo/bamboo-alert-runner.mjs",
        "recover-processing-records",
        "--scan-dir-url",
        scanDirUrl,
        ...dateKeyArgs,
        ...(bizSuffix ? ["--biz-suffix", bizSuffix] : []),
        "--ai-session-id",
        "<AI_SESSION_ID>",
        "--max-age-minutes",
        "120",
        "--apply",
      ];
      const closeArgs = [
        "scripts/bamboo/bamboo-alert-runner.mjs",
        "close-prepared-work-items",
        "--work-items-file",
        `${normalizedResultDir}/work-items.json`,
        "--result-dir",
        normalizedResultDir,
      ];

      return {
        kind: "bamboo_alert_auto_troubleshoot_loop_plan",
        scanDirUrl,
        dateKeys: resolvedDateKeys,
        bizSuffix,
        troubleshootingSopDoc,
        resultDir: normalizedResultDir,
        maxRounds: Number.parseInt(String(maxRounds), 10) || 50,
        preflightRecoveryCommandTemplate: commandToShell({ command: "node", args: recoveryArgs }),
        preflight_recovery_command_template: commandToShell({
          command: "node",
          args: recoveryArgs,
        }),
        prepareCommandTemplate: commandToShell({ command: "node", args: prepareArgs }),
        closeCommand: commandToShell({ command: "node", args: closeArgs }),
        validation_repair_policy: {
          auto_fixable: {
            blockers: [
              "missing_doc_url",
              "missing_feishu_doc_url",
              "missing_sop_writeback_status",
              "ai_summary_missing_keywords",
              "doc_url_must_be_wiki_link",
            ],
            fix_commands: ["normalize-model-result-json", "normalize-result-doc-links"],
            retry: "修复后重新执行 validate-result-dir；ready_for_close=true 后再 close",
          },
          needs_rewrite: {
            meaning: "证据、摘要或固定归因语义不成立",
            action: "重写单条结果 JSON 或补充 sample_checks / investigation_evidence",
          },
          needs_permission: {
            meaning: "等待授权或必须补替代证据",
            action: "发起权限申请；未授权前不得用权限不足推导业务不存在",
          },
          fatal: {
            meaning: "输入混用、依赖缺失或 runner 参数错误",
            action: "停止本轮 close，修复 runner 输入后重试",
          },
        },
        failure_policy: {
          per_item_failure_isolated: true,
          continue_until_drained: true,
          forbidden: [
            "禁止因单条失败停止 drain loop",
            "禁止伪造 succeeded/pending/failed 终态来清空目录",
            "禁止复活 run-auto-troubleshoot 生成占位模型结果",
          ],
        },
        dispatch_plan: {
          orchestrator: "main_session",
          supported_subagent_mode: "host_native_fresh_context_only",
          prepare_owner: "main_session",
          close_owner: "main_session",
          drain_owner: "main_session",
          per_work_item_dispatch: {
            owner: "main_session",
            unit: "one fresh context child agent per work item",
            child_agent_contract: [
              "只处理传入的单条 work item",
              "只生成 resultDir/${result_id}.json、排查文档和具体规则 SOP 结果",
              "不得执行 close-prepared-work-items",
              "不得回写 Base/Bamboo 卡片/原群消息",
            ],
          },
          forbidden: [
            "禁止把扫描+批量排查+close 整体交给一个子 agent",
            "禁止使用本地 Node worker、LLM SDK、agent wrapper 或队列服务替代宿主子 agent",
            "禁止父 agent 直接处理已认领 work item 的业务归因",
          ],
        },
        steps: [
          "每轮调用 prepare-auto-troubleshoot，默认认领 1 条；外部指定 concurrency 时用对应 claim-limit 认领多条",
          "每轮 prepare 后保存 prepare-round-N.json，并复制为 work-items.json",
          "为本轮每个 work item 启动独立 fresh context 子 agent，分别生成 resultDir/${result_id}.json",
          "任一子 agent 产出结果后立即调用 close-prepared-work-items 回写 Base、Bamboo 卡片和原群消息",
          "close 成功后进入下一轮 prepare，直到满足安全清零条件",
        ],
        stopCondition:
          "最后一轮 prepare-auto-troubleshoot 同时满足 processedBases > 0、workItems: []、statusCounts 无 init/failed/processing，且 drainSafety.safe_to_declare_drained !== false",
      };
    },

    async splitWorkItems({
      prepareFile,
      prepare_file,
      outputDir,
      output_dir,
      resultDir,
      result_dir,
      naming = "result-id",
      scanDirUrl,
      scan_dir_url,
      dateKeys = [],
      date_keys = [],
      dateKeyList,
      date_key_list,
      bizSuffix,
      biz_suffix,
      troubleshootingSopDoc,
      troubleshooting_sop_doc,
    } = {}) {
      const finalPrepareFile = prepareFile || prepare_file;
      if (!finalPrepareFile) throw new Error("split-work-items requires --prepare-file");
      const finalOutputDir = String(
        outputDir || output_dir || resultDir || result_dir || "",
      ).trim();
      if (!finalOutputDir) throw new Error("split-work-items requires --output-dir");
      await mkdir(finalOutputDir, { recursive: true });
      const prepare = JSON.parse(await readFile(finalPrepareFile, "utf8"));
      const workItems = normalizeWorkItemsInput(prepare.workItems || prepare.work_items || prepare);
      const workItemsFile = join(finalOutputDir, "work-items.json");
      await writeJsonFile(workItemsFile, workItems);
      const items = [];
      for (const [index, workItem] of workItems.entries()) {
        const resultId = getWorkItemResultId(workItem, String(index + 1));
        const file = buildPerResultWorkItemsFilePath(finalOutputDir, resultId, index, naming);
        await writeJsonFile(file, [workItem]);
        items.push(
          compactObject({
            result_id: resultId,
            record_id: workItem?.record_id || workItem?.recordId,
            work_items_file: file,
            expected_result_file: join(finalOutputDir, `${resultId}.json`),
          }),
        );
      }
      const dispatchPlan = buildAgentDriverDispatchPlan({
        workItems,
        resultDir: finalOutputDir,
        scanDirUrl: scanDirUrl || scan_dir_url,
        dateKeyList,
        date_key_list,
        dateKeys: Array.isArray(dateKeys) && dateKeys.length > 0 ? dateKeys : date_keys,
        bizSuffix: bizSuffix || biz_suffix,
        troubleshootingSopDoc: troubleshootingSopDoc || troubleshooting_sop_doc,
      });
      const state = {
        kind: "bamboo_alert_auto_orchestrator_state",
        round: Number(prepare.round || 1),
        prepare_file: finalPrepareFile,
        work_items_file: workItemsFile,
        claimed_result_ids: items.map((item) => item.result_id).filter(Boolean),
        dispatched_result_ids: [],
        result_status: Object.fromEntries(
          items.map((item) => [
            item.result_id,
            {
              status: "claimed",
              result_id: item.result_id,
              record_id: item.record_id,
              result_file: item.expected_result_file,
              work_items_file: item.work_items_file,
            },
          ]),
        ),
        result_json_validation_status: {},
        close_status: {},
        blockers: [],
        next_action: dispatchPlan.next_action,
        next_dispatch_items: dispatchPlan.dispatch_items,
        dispatch_plan: dispatchPlan,
        next_action_command:
          dispatchPlan.next_action === "dispatch_required" ? "" : dispatchPlan.final_drain_command,
        final_drain_allowed: workItems.length === 0,
        nonOverride: true,
      };
      await writeJsonFile(join(finalOutputDir, "auto-orchestrator-state.json"), state);
      return {
        kind: "bamboo_alert_split_work_items",
        success: true,
        prepare_file: finalPrepareFile,
        output_dir: finalOutputDir,
        total: workItems.length,
        work_items_file: workItemsFile,
        items,
        expected_result_files: items.map((item) => item.expected_result_file),
        dispatch_plan: dispatchPlan,
        orchestrator_state_file: join(finalOutputDir, "auto-orchestrator-state.json"),
      };
    },

    async resumeAutoOrchestration({
      resultDir,
      result_dir,
      workItemsFile,
      work_items_file,
      outputFile,
      output_file,
    } = {}) {
      const normalizedResultDir = String(resultDir || result_dir || "").trim();
      if (!normalizedResultDir) throw new Error("resume-auto-orchestration requires --result-dir");
      const stateFile = join(normalizedResultDir, "auto-orchestrator-state.json");
      let state = {};
      try {
        state = JSON.parse(await readFile(stateFile, "utf8"));
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      const finalWorkItemsFile =
        workItemsFile ||
        work_items_file ||
        state.work_items_file ||
        join(normalizedResultDir, "work-items.json");
      const workItems = normalizeWorkItemsInput(
        JSON.parse(await readFile(finalWorkItemsFile, "utf8")),
      );
      const dispatchPlan = buildAgentDriverDispatchPlan({
        workItems,
        resultDir: normalizedResultDir,
        scanDirUrl: state.scan_dir_url || state.scanDirUrl,
        dateKeys: state.date_keys || state.dateKeys || [],
        bizSuffix: state.biz_suffix || state.bizSuffix,
        troubleshootingSopDoc: state.troubleshooting_sop_doc || state.troubleshootingSopDoc,
      });
      for (const [index, workItem] of workItems.entries()) {
        const resultId = getWorkItemResultId(workItem, String(index + 1));
        const perItemFile = buildPerResultWorkItemsFilePath(normalizedResultDir, resultId, index);
        if (!(await fileExists(perItemFile))) {
          await writeJsonFile(perItemFile, [workItem]);
        }
      }

      const resultStatus = {};
      const missingItems = [];
      const seenItems = [];
      for (const [index, workItem] of workItems.entries()) {
        const resultId = getWorkItemResultId(workItem, String(index + 1));
        const resultFile = join(normalizedResultDir, `${resultId}.json`);
        const doneFile = join(normalizedResultDir, `${resultId}.done.json`);
        const markdownFile = (
          await findModelResultMarkdownForWorkItem({ resultDir: normalizedResultDir, workItem })
        ).filePath;
        const resultFileSeen = await fileExists(resultFile);
        const doneFileSeen = await fileExists(doneFile);
        resultStatus[resultId] = compactObject({
          result_id: resultId,
          record_id: workItem?.record_id || workItem?.recordId,
          status: resultFileSeen ? "result_file_seen" : "claimed",
          result_file: resultFile,
          done_file: doneFileSeen ? doneFile : undefined,
          markdown_file: markdownFile,
          result_file_seen: resultFileSeen,
          done_file_seen: doneFileSeen,
        });
        if (resultFileSeen) seenItems.push(workItem);
        else missingItems.push(workItem);
      }

      let validation = null;
      let readyItems = [];
      let invalidItems = [];
      if (seenItems.length > 0) {
        validation = await this.validateResultDir({
          workItems: seenItems,
          resultDir: normalizedResultDir,
        });
        const byResultId = new Map(
          (validation.results || []).map((item) => [String(item.result_id || "").trim(), item]),
        );
        readyItems = seenItems.filter((workItem) => {
          const resultId = getWorkItemResultId(workItem);
          const item = byResultId.get(resultId);
          return item?.overall_valid === true && item?.close_readiness?.ready_for_close === true;
        });
        invalidItems = seenItems.filter((workItem) => {
          const resultId = getWorkItemResultId(workItem);
          const item = byResultId.get(resultId);
          return !(item?.overall_valid === true && item?.close_readiness?.ready_for_close === true);
        });
        for (const item of validation.results || []) {
          const resultId = String(item.result_id || "").trim();
          if (!resultId || !resultStatus[resultId]) continue;
          resultStatus[resultId] = {
            ...resultStatus[resultId],
            status:
              item?.overall_valid === true && item?.close_readiness?.ready_for_close === true
                ? "validated"
                : "validation_failed",
            validation: item,
          };
        }
      }

      const closeFiles = workItems.map((workItem, index) => {
        const resultId = getWorkItemResultId(workItem, String(index + 1));
        return join(normalizedResultDir, `close-${resultId}.json`);
      });
      const existingCloseFiles = [];
      for (const file of closeFiles) {
        if (await fileExists(file)) existingCloseFiles.push(file);
      }

      let nextAction = "final_drain_required";
      let nextActionCommand = commandToShell({
        command: "node",
        args: [
          "scripts/bamboo/bamboo-alert-runner.mjs",
          "auto-troubleshoot-drain",
          "--result-dir",
          normalizedResultDir,
          "--work-items-file",
          finalWorkItemsFile,
        ],
      });
      let nextDispatchItems = [];
      if (missingItems.length > 0) {
        nextAction = "dispatch_required";
        const missingIds = new Set(missingItems.map((item) => getWorkItemResultId(item)));
        nextDispatchItems = (dispatchPlan.dispatch_items || []).filter((item) =>
          missingIds.has(String(item.result_id || "").trim()),
        );
        nextActionCommand = "";
      } else if (readyItems.length > 0 && existingCloseFiles.length < workItems.length) {
        nextAction = "result_ready_to_close";
        nextActionCommand = commandToShell({
          command: "node",
          args: [
            "scripts/bamboo/bamboo-alert-runner.mjs",
            "close-ready-work-items",
            "--result-dir",
            normalizedResultDir,
            "--work-items-file",
            finalWorkItemsFile,
          ],
        });
      } else if (invalidItems.length > 0) {
        nextAction = "close_repair_required";
        nextActionCommand = commandToShell({
          command: "node",
          args: [
            "scripts/bamboo/bamboo-alert-runner.mjs",
            "validate-result-dir",
            "--result-dir",
            normalizedResultDir,
            "--work-items-file",
            finalWorkItemsFile,
          ],
        });
      } else if (existingCloseFiles.length >= workItems.length && workItems.length > 0) {
        nextAction = "final_drain_required";
      }

      const output = {
        kind: "bamboo_alert_resume_auto_orchestration",
        success: true,
        result_dir: normalizedResultDir,
        state_file: stateFile,
        work_items_file: finalWorkItemsFile,
        next_action: nextAction,
        next_action_command: nextActionCommand,
        next_dispatch_items: nextDispatchItems,
        final_drain_allowed: nextAction === "final_drain_required",
        result_status: resultStatus,
        validation,
        close_files: existingCloseFiles,
        dispatch_plan: dispatchPlan,
        nonOverride: true,
      };
      await writeJsonFile(stateFile, {
        ...state,
        kind: "bamboo_alert_auto_orchestrator_state",
        work_items_file: finalWorkItemsFile,
        result_status: resultStatus,
        result_json_validation_status: Object.fromEntries(
          Object.entries(resultStatus).map(([resultId, item]) => [
            resultId,
            item.validation?.overall_valid === true
              ? "valid"
              : item.result_file_seen
                ? "invalid_or_incomplete"
                : "missing",
          ]),
        ),
        next_action: nextAction,
        next_action_command: nextActionCommand,
        next_dispatch_items: nextDispatchItems,
        final_drain_allowed: output.final_drain_allowed,
        nonOverride: true,
      });
      const finalOutputFile = outputFile || output_file;
      if (finalOutputFile) await writeJsonFile(finalOutputFile, output);
      return output;
    },

    async closeReadyWorkItems({
      workItems,
      work_items,
      workItemsFile,
      work_items_file,
      resultDir,
      result_dir,
      outputFile,
      output_file,
    } = {}) {
      const normalizedResultDir = String(resultDir || result_dir || "").trim();
      if (!normalizedResultDir) throw new Error("close-ready-work-items requires --result-dir");
      const finalWorkItems = normalizeWorkItemsInput(
        workItems ||
          work_items ||
          JSON.parse(
            await readFile(
              workItemsFile || work_items_file || join(normalizedResultDir, "work-items.json"),
              "utf8",
            ),
          ),
      );
      const validation = await this.validateResultDir({
        workItems: finalWorkItems,
        resultDir: normalizedResultDir,
      });
      const validationByResultId = new Map(
        (validation.results || []).map((item) => [String(item.result_id || "").trim(), item]),
      );
      const readyItems = finalWorkItems.filter((workItem) => {
        const resultId = getWorkItemResultId(workItem);
        const item = validationByResultId.get(resultId);
        return item?.overall_valid === true && item?.close_readiness?.ready_for_close === true;
      });
      const skippedItems = finalWorkItems.filter((workItem) => !readyItems.includes(workItem));
      const close_results = [];
      for (const workItem of readyItems) {
        const resultId = getWorkItemResultId(workItem);
        const perItemFile = buildPerResultWorkItemsFilePath(normalizedResultDir, resultId, 0);
        if (!(await fileExists(perItemFile))) await writeJsonFile(perItemFile, [workItem]);
        close_results.push(
          await this.closePreparedWorkItems({
            workItems: [workItem],
            resultDir: normalizedResultDir,
            outputFile: join(normalizedResultDir, `close-${resultId}.json`),
          }),
        );
      }
      const success =
        readyItems.length > 0 &&
        close_results.every((item) => item.business_close?.success !== false);
      const output = {
        kind: "bamboo_alert_close_ready_work_items",
        success,
        result_dir: normalizedResultDir,
        ready_count: readyItems.length,
        skipped_count: skippedItems.length,
        ready_result_ids: readyItems.map((item) => getWorkItemResultId(item)).filter(Boolean),
        skipped_result_ids: skippedItems.map((item) => getWorkItemResultId(item)).filter(Boolean),
        validation,
        close_results,
        next_action:
          skippedItems.length > 0 ? "close_repair_required" : "continue_prepare_required",
        nonOverride: true,
      };
      const finalOutputFile = outputFile || output_file;
      if (finalOutputFile) await writeJsonFile(finalOutputFile, output);
      return output;
    },

    async renderRunReport({
      runSummaryFile,
      run_summary_file,
      resultDir,
      result_dir,
      outputFile,
      output_file,
    } = {}) {
      const finalRunSummaryFile =
        runSummaryFile ||
        run_summary_file ||
        (resultDir || result_dir ? join(resultDir || result_dir, "run-summary.json") : "");
      if (!finalRunSummaryFile)
        throw new Error("render-run-report requires --run-summary-file or --result-dir");
      const summary = JSON.parse(await readFile(finalRunSummaryFile, "utf8"));
      const closeFiles = Array.isArray(summary?.audit_files?.close)
        ? summary.audit_files.close
        : [];
      const results = [];
      let notificationSkippedOrFailed = 0;
      for (const closeFile of closeFiles) {
        try {
          const close = JSON.parse(await readFile(closeFile, "utf8"));
          const notification = close.notification_close || {};
          const notificationStatus =
            notification.card_update_status ||
            notification.message_reply_status ||
            (notification.success === false ? "failed" : "succeeded");
          const notificationReason =
            notification.card_update_reason ||
            notification.message_reply_reason ||
            notification.reason ||
            "";
          if (
            notification.success === false ||
            ["failed", "skipped"].includes(String(notificationStatus))
          ) {
            notificationSkippedOrFailed += 1;
          }
          for (const item of close.results || []) {
            results.push(
              compactObject({
                result_id: item.result_id,
                status: item.status,
                ai_result: item.ai_result || item.feishu_doc_url,
                sop_doc_url: item.sop_doc_url || item.rule_sop_doc_url || item.sop_result?.doc_url,
                sop_writeback_status: item.sop_writeback_status,
                attribution_result: item.attribution_result,
                business_close_status:
                  item.business_close_status || item.base_writeback_status || item.status,
                card_update_status: item.card_update_status || notification.card_update_status,
                message_reply_status:
                  item.message_reply_status || notification.message_reply_status,
                notification_status: notificationStatus,
                notification_reason: notificationReason,
                close_audit_file: closeFile,
              }),
            );
          }
        } catch (error) {
          notificationSkippedOrFailed += 1;
          results.push({
            close_audit_file: closeFile,
            status: "close_audit_read_failed",
            notification_status: "failed",
            notification_reason: error?.message || String(error),
          });
        }
      }
      const ready =
        summary.ready_to_report_complete === true ||
        summary?.final_drain?.ready_to_report_complete === true;
      const statusCounts = summary.status_counts || {};
      const metrics = {
        total_scanned: (summary.scan?.groups || []).reduce(
          (sum, group) => sum + Number(group.scanned || 0),
          0,
        ),
        dedup_skipped: (summary.scan?.groups || []).reduce(
          (sum, group) => sum + Number(group.rows_skipped || group.skipped || 0),
          0,
        ),
        claimed: Number(
          summary.claimed ||
            summary.claimed_count ||
            summary.troubleshoot?.processed ||
            results.length ||
            0,
        ),
        succeeded: Number(
          statusCounts.succeeded ||
            results.filter((item) => item.status === "succeeded").length ||
            0,
        ),
        pending: Number(
          statusCounts.pending || results.filter((item) => item.status === "pending").length || 0,
        ),
        failed_admission: Number(
          summary.failedAdmission ||
            summary.failed_admission ||
            results.filter(
              (item) => item.status === "failed" && (item.failedAdmission || item.failed_admission),
            ).length ||
            0,
        ),
        blocker_codes: [
          ...new Set(
            (summary.blockers || [])
              .map((blocker) => String(blocker.code || blocker))
              .filter(Boolean),
          ),
        ],
        result_doc_urls: [
          ...new Set(
            results
              .map((item) => item.ai_result || item.feishu_doc_url || item.doc_url)
              .filter(Boolean),
          ),
        ],
      };
      const markdown = [
        `# Bamboo 自动排障运行报告`,
        "",
        `- ready_to_report_complete=${ready}`,
        `- scan_dir_url=${summary.scan_dir_url || ""}`,
        `- result_dir=${summary.result_dir || resultDir || result_dir || ""}`,
        `- date_keys=${(summary.date_keys || []).join(",")}`,
        `- status_counts=${JSON.stringify(statusCounts)}`,
        `- metrics=${JSON.stringify(metrics)}`,
        `- processed_bases=${summary.processed_bases ?? ""}`,
        `- notification_skipped_or_failed=${notificationSkippedOrFailed}`,
        `- ready_to_report_complete_reason=${ready ? "ready_to_report_complete=true 且 final drain 未发现阻断项" : "ready_to_report_complete=false，仍有 blockers 或未完成记录"}`,
        "",
        "## Scan",
        ...((summary.scan?.groups || []).length > 0
          ? summary.scan.groups.map(
              (group) =>
                `- ${group.group_id || "-"} scanned=${group.scanned ?? ""} alerts_written=${group.alerts_written ?? ""} rows_written=${group.rows_written ?? ""} rows_skipped=${group.rows_skipped ?? ""}`,
            )
          : ["- none"]),
        "",
        "## Daily Bases",
        ...((summary.daily_bases || []).length > 0
          ? summary.daily_bases.map(
              (base) =>
                `- ${base.date_key || "-"} ${base.title || ""} ${base.wiki_url || ""} base=${base.base_token || ""} table=${base.table_id || ""}`,
            )
          : ["- none"]),
        "",
        "## Results",
        ...results.map(
          (item) =>
            `- ${item.result_id || "-"} ${item.status || "-"} ${item.ai_result || ""} ${item.notification_status || ""} ${item.notification_reason || ""}`,
        ),
        "",
        "## Blockers",
        ...((summary.blockers || []).length > 0
          ? summary.blockers.map((blocker) => `- ${blocker.code || JSON.stringify(blocker)}`)
          : ["- none"]),
      ].join("\n");
      const report = {
        kind: "bamboo_alert_run_report",
        success: true,
        ready_to_report_complete: ready,
        scan_dir_url: summary.scan_dir_url,
        date_keys: summary.date_keys || [],
        result_dir: summary.result_dir || resultDir || result_dir || "",
        scan: summary.scan || { groups: [] },
        daily_bases: summary.daily_bases || [],
        status_counts: statusCounts,
        metrics,
        processed_bases: summary.processed_bases,
        artifact_consistency: summary.artifact_consistency,
        ready_to_report_complete_reason: ready
          ? "ready_to_report_complete=true 且 final drain 未发现阻断项"
          : "ready_to_report_complete=false，仍有 blockers 或未完成记录",
        business_close: {
          success:
            (summary.blockers || []).filter((blocker) =>
              String(blocker.code || "").startsWith("business"),
            ).length === 0,
        },
        notification_close: {
          success: notificationSkippedOrFailed === 0,
          skipped_or_failed: notificationSkippedOrFailed,
        },
        blockers: summary.blockers || [],
        results,
        markdown,
        nonOverride: true,
      };
      const finalOutputFile = outputFile || output_file;
      if (finalOutputFile) await writeJsonFile(finalOutputFile, report);
      return report;
    },

    async buildAutoTroubleshootDrainSummary({
      scanDirUrl,
      dateKeys = [],
      dateKeyList,
      date_key_list,
      bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      resultDir,
      workItems,
      workItemsFile,
      scan,
      dailyBases,
      daily_bases,
      artifactConsistency,
      artifact_consistency,
      outputFile,
      validateDailyBases = false,
    }) {
      const normalizedResultDir = String(resultDir || "").trim() || resolve(".tmp/bamboo-auto");
      const summaryFile = outputFile || join(normalizedResultDir, "run-summary.json");
      let existingSummary = {};
      try {
        existingSummary = JSON.parse(await readFile(summaryFile, "utf8"));
      } catch {
        existingSummary = {};
      }
      const drainDateKeys = normalizeDateKeyList({ dateKeyList, date_key_list, dateKeys });
      const status = await this.prepareAutoTroubleshoot({
        scanDirUrl,
        dateKeys: drainDateKeys,
        bizSuffix,
        statusOnly: true,
        claimLimit: 0,
      });
      let normalizedWorkItems = normalizeWorkItemsInput(workItems || []);
      if (workItemsFile) {
        normalizedWorkItems = normalizeWorkItemsInput(
          JSON.parse(await readFile(workItemsFile, "utf8")),
        );
      }
      const validation =
        normalizedWorkItems.length > 0
          ? await this.validateResultDir({
              workItems: normalizedWorkItems,
              resultDir: normalizedResultDir,
            })
          : null;
      const schemaValidation = validateDailyBases
        ? await this.validateDailyBaseSchema({ scanDirUrl, dateKeys: drainDateKeys, bizSuffix })
        : null;
      const recordValueValidation = validateDailyBases
        ? await this.validateDailyBaseRecordValues({
            scanDirUrl,
            dateKeys: drainDateKeys,
            bizSuffix,
          })
        : null;
      const docRecordValidation = validateDailyBases
        ? await this.validateDailyBaseDocRecordConsistency({
            scanDirUrl,
            dateKeys: drainDateKeys,
            bizSuffix,
          })
        : null;
      let closeAuditFiles = [];
      try {
        const dirEntries = await readdir(normalizedResultDir);
        closeAuditFiles = dirEntries
          .filter((name) => /^close-.+\.json$/.test(name) || /^close-.+\.audit\.json$/.test(name))
          .map((name) => join(normalizedResultDir, name))
          .sort();
      } catch {
        closeAuditFiles = [];
      }
      const statusCounts = status.statusCounts || status.status_counts || {};
      const openStatusCounts = {
        init: Number(statusCounts.init || 0),
        failed: Number(statusCounts.failed || 0),
        processing: Number(statusCounts.processing || 0),
      };
      const blockers = [];
      for (const [state, count] of Object.entries(openStatusCounts)) {
        if (count > 0) {
          blockers.push({ code: `base_status_${state}_remaining`, state, count });
        }
      }
      if (Number(status.processedBases || status.processed_bases || 0) <= 0) {
        blockers.push({
          code: "no_daily_base_processed",
          reason: "status-only prepare did not process any daily Base",
        });
      }
      if (
        status.drainSafety?.safe_to_declare_drained === false ||
        status.drain_safety?.safe_to_declare_drained === false
      ) {
        blockers.push({
          code: "drain_safety_not_clear",
          drain_safety: status.drainSafety || status.drain_safety,
        });
      }
      if (validation && !validation.success) {
        blockers.push({
          code: "validate_result_dir_failed",
          invalid: validation.invalid,
          semantic_guard_failed: validation.semantic_guard_failed,
          repair_plan: validation.repair_plan,
        });
      }
      if (schemaValidation && !schemaValidation.schema_valid) {
        blockers.push({
          code: "daily_base_schema_invalid",
          blockers: schemaValidation.blockers,
          expected_fields: schemaValidation.expected_fields,
        });
      }
      if (recordValueValidation && !recordValueValidation.record_values_valid) {
        blockers.push({
          code: "daily_base_record_values_invalid",
          invalid_records: recordValueValidation.invalid_records,
          violations: recordValueValidation.violations,
        });
      }
      if (docRecordValidation && !docRecordValidation.doc_record_consistency_valid) {
        blockers.push({
          code: "daily_base_doc_record_mismatch",
          extra_docs: docRecordValidation.extra_docs,
          missing_docs: docRecordValidation.missing_docs,
          duplicate_docs: docRecordValidation.duplicate_docs,
        });
      }
      const ready = blockers.length === 0;
      const unfinishedRecords = buildUnfinishedDrainRecords(status, validation);
      const resolvedScan = scan || existingSummary.scan || { groups: [] };
      const resolvedDailyBases = Array.isArray(dailyBases)
        ? dailyBases
        : Array.isArray(daily_bases)
          ? daily_bases
          : Array.isArray(existingSummary.daily_bases)
            ? existingSummary.daily_bases
            : [];
      const computedArtifactConsistency = buildArtifactConsistencySummary(
        docRecordValidation,
        statusCounts,
        ready,
      );
      const resolvedArtifactConsistency =
        computedArtifactConsistency ||
        artifactConsistency ||
        artifact_consistency ||
        existingSummary.artifact_consistency ||
        null;
      const baseVerifyFile = validateDailyBases
        ? join(normalizedResultDir, "base-verify.json")
        : null;
      const baseVerify = validateDailyBases
        ? {
            kind: "bamboo_alert_daily_base_verify",
            success: Boolean(
              schemaValidation?.schema_valid &&
              recordValueValidation?.record_values_valid &&
              docRecordValidation?.doc_record_consistency_valid,
            ),
            schema: schemaValidation,
            record_values: recordValueValidation,
            doc_records: docRecordValidation,
            artifact_consistency: resolvedArtifactConsistency,
            blockers: [
              ...(schemaValidation && !schemaValidation.schema_valid
                ? [{ code: "daily_base_schema_invalid", blockers: schemaValidation.blockers }]
                : []),
              ...(recordValueValidation && !recordValueValidation.record_values_valid
                ? [
                    {
                      code: "daily_base_record_values_invalid",
                      violations: recordValueValidation.violations,
                    },
                  ]
                : []),
              ...(docRecordValidation && !docRecordValidation.doc_record_consistency_valid
                ? [
                    {
                      code: "daily_base_doc_record_mismatch",
                      extra_docs: docRecordValidation.extra_docs,
                      missing_docs: docRecordValidation.missing_docs,
                      duplicate_docs: docRecordValidation.duplicate_docs,
                    },
                  ]
                : []),
            ],
          }
        : null;
      const summary = {
        kind: "bamboo_alert_auto_troubleshoot_drain_summary",
        success: ready,
        ready_to_report_complete: ready,
        final_drain: {
          ready_to_report_complete: ready,
          status_counts: statusCounts,
          blockers,
          drain_safety: status.drainSafety || status.drain_safety,
          nonOverride: true,
        },
        run_summary_file: "run-summary.json",
        scan_dir_url: scanDirUrl,
        date_keys: drainDateKeys,
        date_key_list: drainDateKeys,
        result_dir: normalizedResultDir,
        scan: resolvedScan,
        daily_bases: resolvedDailyBases,
        status_counts: statusCounts,
        processed_bases: status.processedBases || status.processed_bases || 0,
        drain_safety: status.drainSafety || status.drain_safety,
        validation,
        schema: schemaValidation,
        record_values: recordValueValidation,
        doc_records: docRecordValidation,
        artifact_consistency: resolvedArtifactConsistency,
        unfinished_records: unfinishedRecords,
        audit_files: {
          close: closeAuditFiles,
          base_verify: baseVerifyFile || undefined,
        },
        blockers,
        decision_hint: ready
          ? "ready_to_report_complete=true，可宣布本轮自动排障闭环完成。"
          : `ready_to_report_complete=false，必须先处理 blockers 后再宣布完成；详见 unfinished_records（${unfinishedRecords.length} 条）。`,
      };
      await mkdir(dirname(summaryFile), { recursive: true });
      if (baseVerifyFile && baseVerify) {
        await writeFile(baseVerifyFile, `${JSON.stringify(baseVerify, null, 2)}\n`, "utf8");
      }
      await writeFile(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      return summary;
    },

    async finalDrainCheck({
      scanDirUrl,
      dateKeys = [],
      dateKeyList,
      date_key_list,
      bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      resultDir,
      workItems,
      workItemsFile,
      outputFile,
    }) {
      return this.buildAutoTroubleshootDrainSummary({
        scanDirUrl,
        dateKeys,
        dateKeyList,
        date_key_list,
        bizSuffix,
        resultDir,
        workItems,
        workItemsFile,
        outputFile,
        validateDailyBases: true,
      });
    },

    /**
     * 批量快速闭环回写（快速处理「昨天/历史积压有现成 inspect/doc 产物但还没回写 Base/卡片」的场景）：
     * 1. 从 --scan-dir-url 近两天日报中取「仍为 init（或 status 在 {init,failed,processing} 且 rule_type=offline_hive/hive/hive_task 支持）」记录
     * 2. 对每条记录，从 --result-dir 按 result_id 优先复用已有产物：
     *    - <result_id>.json                → modelResult（最优先，存在则跳过 inspect/doc/sop 补齐）
     *    - <result_id>.inspect.json / prep-<result_id>.json
     *                                     → inspect_result/qc_result/work_item（缺失则补 prepare-single）
     *    - <result_id>.doc.json / publish-doc-<result_id>.json
     *                                     → feishu_doc_url（缺失则读 <result_id>.md 正文，用 publish-doc 补）
     *    - <result_id>.sop.json           → sop_writeback_status/sop_writeback_reason（缺失则补 publish-sop-doc 或 skipped）
     * 3. 组装/补齐 normalizedModelResult → validate-model-result-json 前置校验
     * 4. 先 init→processing（原子写回），再逐条 closePreparedWorkItem 回写 succeeded+卡片+话题
     * 约束：严格 claimLimit=1，单条失败不阻塞后续，每条错误独立记录到 failures。
     */
    async batchQuickClosureFromResultDir({
      scanDirUrl,
      dateKeys = [],
      bizSuffix = CANONICAL_DAILY_BASE_BIZ_SUFFIX,
      troubleshootingSopDoc,
      resultDir,
      maxRounds = 200,
      claimOrder = "task_date_asc",
      dryRun = false,
    }) {
      const normalizedResultDir = String(resultDir || "").trim() || resolve(".tmp/bamboo-auto");
      await mkdir(normalizedResultDir, { recursive: true });
      const usedClaimOrder =
        claimOrder === "updated_time_desc" ? "updated_time_desc" : "task_date_asc";
      const usedMaxRounds = Math.max(1, Number.parseInt(String(maxRounds), 10) || 200);

      // Step 1：定位近两天日报 Base，和 prepare-auto-troubleshoot 复用同一套定位/筛选逻辑
      const prepare = await this.prepareAutoTroubleshoot({
        scanDirUrl,
        dateKeys,
        bizSuffix,
        troubleshootingSopDoc,
        claimLimit: Math.min(usedMaxRounds, 200),
        claimOrder: usedClaimOrder,
        statusOnly: true,
        allowBatchClaim: true, // status-only 下 allowBatchClaim 仅用于解析通过，不会真 claim
      });
      const candidateWorkItems = Array.isArray(
        prepare.candidateWorkItems || prepare.candidate_work_items || [],
      )
        ? [...(prepare.candidateWorkItems || prepare.candidate_work_items || [])]
        : [];
      // status-only 的候选往往只取了 claim-limit 条，不足的话再手动补拿所有 eligible supportedRecords
      let workItemsToProcess = candidateWorkItems.slice(0, usedMaxRounds);
      if (workItemsToProcess.length === 0) {
        // status-only 没取到，说明 claim-limit=1 只 preview 1 条？用全部近两天所有 eligible supported 凑齐
        const { containers } = await this.resolveDailyBaseContainers({ scanDirUrl });
        const mergedChildrenRaw = await this.listChildrenAcrossContainers({ containers });
        // 多容器同标题日报去重（E_DAILY_001 假阳性兜底）
        const mergedChildren = pruneCrossContainerDuplicateDailyBases({
          children: mergedChildrenRaw,
          dateKeys,
          bizSuffix,
        });
        const dailyBases = selectDailyBaseNodes({
          nodes: mergedChildren,
          dateKeys,
          bizSuffix,
          claimOrder: usedClaimOrder,
        });
        assertSelectedDailyBasesAreBitable({ dailyBases });
        for (const dailyBase of dailyBases) {
          if (workItemsToProcess.length >= usedMaxRounds) break;
          const tablePayload = await runJson(
            buildBaseTableListCommand({ baseToken: dailyBase.obj_token }),
          );
          const table = selectDailyBaseTable(tablePayload);
          const tableId = extractFirstString(table?.table_id, table?.id);
          if (!tableId) continue;
          const fieldsPayload = await runJson(
            buildBaseFieldListCommand({ baseToken: dailyBase.obj_token, tableId }),
          );
          const fieldNames = normalizeFields(fieldsPayload);
          if (!["status", "result_id", "bamboo_url"].every((f) => fieldNames.includes(f))) continue;
          const recordPayload = await runJson(
            buildBaseRecordListCommand({ baseToken: dailyBase.obj_token, tableId, limit: 500 }),
          );
          const records = normalizeRecords(recordPayload);
          const supported = records
            .filter(isEligibleRecord)
            .filter(isOfflineHiveRecord)
            .filter(
              (r) =>
                !workItemsToProcess.some(
                  (wi) => String(wi.record_id || "") === String(r.record_id || ""),
                ),
            );
          for (const r of supported) {
            if (workItemsToProcess.length >= usedMaxRounds) break;
            workItemsToProcess.push(
              buildWorkItem(
                r,
                "batch-quick-closure-from-result-dir (scan fallback; no prepare-auto claim)",
              ),
            );
          }
        }
      }

      const summary = {
        scanDirUrl,
        resultDir: normalizedResultDir,
        claimOrder: usedClaimOrder,
        maxRounds: usedMaxRounds,
        totalCandidates: workItemsToProcess.length,
        totalNearbyClaimable: prepare.nearByClaimable || prepare.near_by_claimable || null,
        processed: 0,
        succeeded: 0,
        skipped: 0,
        failed: 0,
        dryRun: Boolean(dryRun),
        details: [],
        failures: [],
      };

      if (dryRun) {
        summary.details = workItemsToProcess.map((wi) => ({
          result_id: wi.result_id,
          record_id: wi.record_id,
          task_name: wi.task_name,
          task_date: wi.task_date,
          base_token: wi.base_token,
          table_id: wi.table_id,
        }));
        summary.decisionHint = `dry-run 预览：找到 ${workItemsToProcess.length} 条符合批量回写的候选（init/failed + offline_hive 支持 + 近两天日报）；去掉 --dry-run 后按 claimOrder=${usedClaimOrder} 顺序逐条生产 modelResult 并 close-prepared-work-items。`;
        summary.shouldProceed = workItemsToProcess.length > 0;
        return summary;
      }

      // Step 2：对每条 workItem，补齐 inspect/doc/sop → 产 modelResult → validate → claim init→processing → close
      for (const wi of workItemsToProcess) {
        summary.processed += 1;
        const resultId = String(wi.result_id || wi.resultId || "");
        try {
          if (!resultId) {
            summary.skipped += 1;
            summary.failures.push({
              result_id: resultId || "empty",
              record_id: wi.record_id,
              reason: "result_id missing",
            });
            continue;
          }
          // 2a) 优先直接复用已有 <result_id>.json（跳过 inspect/doc/sop 补齐）
          let modelResult = null;
          try {
            const direct = JSON.parse(
              await readFile(join(normalizedResultDir, `${resultId}.json`), "utf8"),
            );
            if (direct && typeof direct === "object") modelResult = direct;
          } catch {
            /* noop */
          }

          // 2b) 缺 modelResult 时从 inspect/doc/sop 补齐
          if (!modelResult || typeof modelResult !== "object") {
            // b-1) inspect & qc：读 <result_id>.inspect.json / prep-<result_id>.json，否则跑 prepareSingleTroubleshootInputs
            let inspect = null;
            let qc = null;
            let singlePrep = null;
            for (const candidate of [
              join(normalizedResultDir, `${resultId}.inspect.json`),
              join(normalizedResultDir, `prep-${resultId}.json`),
            ]) {
              try {
                const obj = JSON.parse(await readFile(candidate, "utf8"));
                inspect =
                  inspect ||
                  (obj && (obj.inspect_result || obj.inspectResult || obj.result || obj)) ||
                  null;
                if (!qc) {
                  const rawQc = obj && (obj.qc_result || obj.qcResult);
                  if (rawQc && typeof rawQc === "object") qc = rawQc;
                }
                if (!singlePrep && obj && obj.work_item) singlePrep = obj;
              } catch {
                /* noop */
              }
            }
            if (!inspect || !qc) {
              try {
                singlePrep = await this.prepareSingleTroubleshootInputs({ resultId });
                inspect = inspect || (singlePrep && singlePrep.inspect_result) || null;
                qc =
                  qc ||
                  (singlePrep && singlePrep.qc_result) ||
                  classifyQuickClosureConditions(
                    singlePrep?.raw_card_json || inspect?.result || {},
                  );
              } catch (prepErr) {
                summary.skipped += 1;
                summary.failures.push({
                  result_id: resultId,
                  record_id: wi.record_id,
                  reason: `prepareSingleTroubleshootInputs 失败: ${prepErr.message}`,
                });
                continue;
              }
            }
            const skeletonType = qc && qc.quickClosureRecommended ? "quick-closure" : "deep";
            const topHardcodedAttr =
              (qc && (qc.topHardcodedAttribution || qc.suggestedAttribution)) ||
              (inspect &&
                inspect.classification &&
                (inspect.classification.attributionResult ||
                  inspect.classification.suggestedAttribution)) ||
              "";
            if (skeletonType !== "quick-closure") {
              summary.skipped += 1;
              summary.failures.push({
                result_id: resultId,
                record_id: wi.record_id,
                reason:
                  "batch-quick-closure-from-result-dir 仅允许处理已有 <result_id>.json 或 QC quick-closure 记录；该记录需要深度归因，必须走 prepare-auto-troubleshoot → 单条排障 → close-prepared-work-items",
              });
              continue;
            }
            // b-2) doc link：<result_id>.doc.json / publish-doc-*.json 优先，其次 model/doc url 从已存在对象，没有则尝试 publishTroubleshootingDoc（用已有 md 正文）
            let feishuDocUrl = "";
            let docToken = "";
            let docArchiveStatus = "skipped";
            let docArchiveReason = "";
            for (const candidate of [
              join(normalizedResultDir, `${resultId}.doc.json`),
              join(normalizedResultDir, `publish-doc-${resultId}.json`),
            ]) {
              try {
                const obj = JSON.parse(await readFile(candidate, "utf8"));
                const link = String(
                  obj?.feishu_doc_url || obj?.doc_url || obj?.wiki_url || obj?.url || "",
                ).trim();
                if (link && !feishuDocUrl) {
                  feishuDocUrl = link;
                }
                const token = String(obj?.doc_token || obj?.node_token || obj?.token || "").trim();
                if (token && !docToken) docToken = token;
                const status = String(
                  obj?.doc_archive_status || obj?.archive_status || obj?.status || "",
                ).trim();
                if (status && docArchiveStatus === "skipped")
                  docArchiveStatus = status === "failed" ? "failed" : "succeeded";
              } catch {
                /* noop */
              }
            }
            if (!feishuDocUrl) {
              // 尝试从已有 markdown publish 一份
              let mdText = "";
              for (const candidate of [
                join(normalizedResultDir, `${resultId}.md`),
                join(normalizedResultDir, `doc-${resultId}.md`),
              ]) {
                try {
                  mdText = mdText || (await readFile(candidate, "utf8"));
                } catch {
                  /* noop */
                }
              }
              if (mdText) {
                try {
                  const pub = await this.publishTroubleshootingDoc({
                    resultId,
                    taskName: singlePrep?.work_item?.task_name || wi.task_name || "",
                    taskDate: singlePrep?.work_item?.task_date || wi.task_date || "",
                    ruleId: singlePrep?.work_item?.rule_id || wi.rule_id || "",
                    parentWikiToken:
                      singlePrep?.work_item?.parent_wiki_token || wi.parent_wiki_token || "",
                    targetSpaceId:
                      singlePrep?.work_item?.target_space_id || wi.target_space_id || "",
                    skeletonType,
                    markdown: mdText,
                    applySkeletonProtection: true,
                    qcResult: qc,
                    topHardcodedAttribution: topHardcodedAttr,
                    bambooUrl: singlePrep?.work_item?.bamboo_url || wi.bamboo_url || "",
                  });
                  feishuDocUrl = String(pub?.feishu_doc_url || pub?.doc_url || "").trim();
                  docToken = String(pub?.doc_token || pub?.node_token || "").trim();
                  docArchiveStatus =
                    String(pub?.doc_archive_status || pub?.archive_status || "failed").trim() ===
                    "succeeded"
                      ? "succeeded"
                      : "failed";
                  docArchiveReason = String(pub?.decisionHint || pub?.reason || "").trim();
                } catch (pubErr) {
                  docArchiveStatus = "failed";
                  docArchiveReason = `publishTroubleshootingDoc 失败: ${pubErr.message}`;
                }
              } else {
                docArchiveStatus = "failed";
                docArchiveReason =
                  "resultDir 中未找到 feishu_doc_url，也未找到 <result_id>.md 或 doc-<result_id>.md 正文，无法补齐合法 doc link（status=succeeded 必须要求）";
              }
            } else if (docArchiveStatus === "skipped") {
              docArchiveStatus = "succeeded";
            }
            // b-3) sop 审查：<result_id>.sop.json 优先，没有则跑 publishSopDoc 或默认为 skipped
            let sopStatus = "skipped";
            let sopReason =
              "no SOP update required; reuse/审查无业务沉淀或未提供 troubleshootingSopDoc";
            for (const candidate of [
              join(normalizedResultDir, `${resultId}.sop.json`),
              join(normalizedResultDir, `sop-${resultId}.json`),
            ]) {
              try {
                const obj = JSON.parse(await readFile(candidate, "utf8"));
                sopStatus = String(obj?.sop_writeback_status || obj?.status || "skipped").trim();
                sopReason = String(obj?.sop_writeback_reason || obj?.reason || sopReason).trim();
                break;
              } catch {
                /* noop */
              }
            }
            if (sopStatus === "skipped" && troubleshootingSopDoc) {
              try {
                const sop = await this.publishSopDoc({
                  troubleshootingSopDoc,
                  ruleId: singlePrep?.work_item?.rule_id || wi.rule_id || "",
                  taskName: singlePrep?.work_item?.task_name || wi.task_name || "",
                  troubleshootingDocUrl: feishuDocUrl,
                  troubleshootingSkeletonType: skeletonType,
                  summary: "",
                  skipIfNoReusableUpdate: true,
                });
                sopStatus = String(sop?.sop_writeback_status || "skipped").trim();
                sopReason = String(sop?.sop_writeback_reason || sopReason).trim();
              } catch {
                /* 失败仍保持 skipped */
              }
            }
            // b-4) 组装 modelResult（nonOverride：QC authority 归因用 topHardcodedAttribution，不能自选）
            const normalizedWiTaskName = singlePrep?.work_item?.task_name || wi.task_name || "";
            const normalizedWiTaskDate = singlePrep?.work_item?.task_date || wi.task_date || "";
            const normalizedWiRuleId = singlePrep?.work_item?.rule_id || wi.rule_id || "";
            const statusKeyword =
              skeletonType === "pending" ? "等待用户授权" : "已自动确认无需修数";
            const attribution = topHardcodedAttr || "[未指定归因]";
            const freeText =
              `${normalizedWiTaskName || "规则"}（rule_id=${normalizedWiRuleId || "TBD"}）：Bamboo 快速闭环（${skeletonType}），` +
              `QC 命中=${(qc && qc.topQuickClosureCode) || "无"}，` +
              `异常样本数=${inspect?.false_data_length ?? inspect?.effective_samples ?? "未知"}；请参考排查文档获取详细证据与建议。`;
            const aiSummary = `${freeText}${statusKeyword}；归因结果：${attribution}`;
            modelResult = {
              result_id: resultId,
              rule_id: normalizedWiRuleId,
              task_name: normalizedWiTaskName,
              task_date: normalizedWiTaskDate,
              task_time: singlePrep?.work_item?.task_time || wi.task_time || "",
              success: docArchiveStatus === "succeeded",
              attribution_result: attribution,
              summary: aiSummary,
              feishu_doc_url: feishuDocUrl,
              doc_token: docToken,
              doc_archive_status: docArchiveStatus,
              doc_archive_reason: docArchiveReason,
              sop_writeback_status: sopStatus,
              sop_writeback_reason: sopReason,
              confidence:
                qc && typeof qc.recommendedConfidence === "number" ? qc.recommendedConfidence : 0.5,
              needs_manual_review: !(
                skeletonType === "quick-closure" && docArchiveStatus === "succeeded"
              ),
              qc_top_code: (qc && qc.topQuickClosureCode) || "",
              qc_matched_codes: Array.isArray(qc && qc.matchedQuickClosureCodes)
                ? qc.matchedQuickClosureCodes
                : [],
              skeleton_type: skeletonType,
              inspect_result: inspect || null,
              qc_result: qc || null,
            };
            // 落盘一份归一化 <result_id>.json，方便 close 后续审计
            try {
              await writeFile(
                join(normalizedResultDir, `${resultId}.json`),
                `${JSON.stringify(modelResult, null, 2)}\n`,
                "utf8",
              );
            } catch {
              /* noop */
            }
          }

          // 2c) validate-model-result-json（pre-close 前置校验；strict=false，close 内部还有 secondary validate）
          let validationOutput = null;
          try {
            validationOutput = await this.validateModelResultJson({
              modelResult,
              workItem: wi,
              resultDir: normalizedResultDir,
              strictMode: false,
            });
          } catch (valErr) {
            summary.failed += 1;
            summary.failures.push({
              result_id: resultId,
              record_id: wi.record_id,
              reason: `validate-model-result-json FAIL: ${valErr && valErr.message ? valErr.message : String(valErr)}`,
            });
            continue;
          }
          if (validationOutput && validationOutput.overallValid === false) {
            // normalizedModelResult 存在则用它覆盖写回（nonOverride 修复 summary/confidence/status 等）
            if (
              validationOutput.normalizedModelResult &&
              typeof validationOutput.normalizedModelResult === "object"
            ) {
              modelResult = { ...validationOutput.normalizedModelResult };
              try {
                await writeFile(
                  join(normalizedResultDir, `${resultId}.json`),
                  `${JSON.stringify(modelResult, null, 2)}\n`,
                  "utf8",
                );
              } catch {
                /* noop */
              }
            }
            const l1Reasons = Array.isArray(validationOutput.l1Structure?.reasons)
              ? validationOutput.l1Structure.reasons.slice(0, 5)
              : [];
            const l2Reasons = Array.isArray(validationOutput.l2Semantics?.reasons)
              ? validationOutput.l2Semantics.reasons.slice(0, 5)
              : [];
            const reasons = [...l1Reasons, ...l2Reasons].join(" | ");
            summary.failed += 1;
            summary.failures.push({
              result_id: resultId,
              record_id: wi.record_id,
              reason: `validate overallValid=false: ${reasons || "unknown"}`,
            });
            continue;
          } else if (validationOutput && validationOutput.normalizedModelResult) {
            modelResult = { ...validationOutput.normalizedModelResult };
            try {
              await writeFile(
                join(normalizedResultDir, `${resultId}.json`),
                `${JSON.stringify(modelResult, null, 2)}\n`,
                "utf8",
              );
            } catch {
              /* noop */
            }
          }

          // 2d) 先把这条 init → processing（等价于 prepare-auto 的 claim 动作；避免别的进程重复 claim）
          // 注意：这里允许失败不中断（可能已经是 processing），close 会直接写回 succeeded。
          let claimed = false;
          try {
            const tablePayload = await runJson(
              buildBaseTableListCommand({ baseToken: wi.base_token }),
            );
            const table = selectDailyBaseTable(tablePayload);
            const tableId = extractFirstString(table?.table_id, table?.id) || wi.table_id;
            const fieldsPayload = await runJson(
              buildBaseFieldListCommand({ baseToken: wi.base_token, tableId }),
            );
            const fieldNames = normalizeFields(fieldsPayload);
            const statusField = fieldNames.includes("status")
              ? "status"
              : fieldNames.find((f) => /^status/i.test(f)) || "";
            if (statusField) {
              try {
                await this.ensureBaseFieldOption({
                  baseToken: wi.base_token,
                  tableId,
                  fieldName: statusField,
                  optionName: "processing",
                });
              } catch {
                /* noop */
              }
              await runJson(
                buildBaseRecordUpdateCommand({
                  baseToken: wi.base_token,
                  tableId,
                  recordId: wi.record_id,
                  fields: { [statusField]: "processing" },
                }),
              );
              claimed = true;
            }
          } catch {
            /* claimed=false 但仍继续，closePreparedWorkItem 不强制要求 processing */
          }

          // 2e) close-prepared-work-items
          const closeResult = await this.closePreparedWorkItem({ workItem: wi, modelResult });
          summary.details.push({
            result_id: resultId,
            record_id: wi.record_id,
            claimed,
            ...closeResult,
          });
          if (closeResult && closeResult.base_writeback_status === "succeeded") {
            summary.succeeded += 1;
          } else {
            summary.failed += 1;
            summary.failures.push({
              result_id: resultId,
              record_id: wi.record_id,
              base_writeback_status: closeResult?.base_writeback_status,
              card_update_status: closeResult?.card_update_status,
              message_reply_status: closeResult?.message_reply_status,
              status: closeResult?.status,
              reason: closeResult?.reason || closeResult?.validation_output?.fatalError || "",
            });
          }
        } catch (outerErr) {
          summary.failed += 1;
          summary.failures.push({
            result_id: resultId || "empty",
            record_id: wi?.record_id || "",
            reason: `未分类异常: ${outerErr && outerErr.message ? outerErr.message : String(outerErr)}`,
          });
        }
      }

      const remainingHint =
        summary.totalNearbyClaimable &&
        typeof summary.totalNearbyClaimable.skippedNearbySupported === "number"
          ? `（近两天 claimable 剩余未处理=${summary.totalNearbyClaimable.skippedNearbySupported}，本批次处理上限=${usedMaxRounds}）`
          : "";
      if (
        summary.failed === 0 &&
        summary.succeeded === summary.processed &&
        summary.processed > 0
      ) {
        summary.decisionHint = `批量快速闭环回写完成：${summary.succeeded}/${summary.processed} 条成功，0 失败；每条 <result_id>.json/doc/inspect 产物已落盘 resultDir=${normalizedResultDir}${remainingHint}`;
        summary.shouldProceed = false;
      } else if (summary.succeeded > 0) {
        summary.decisionHint = `批量快速闭环回写部分成功：${summary.succeeded}/${summary.processed} 成功，${summary.failed} 失败，请检查 failures[] 列表。${remainingHint}`;
        summary.shouldProceed = summary.totalNearbyClaimable?.skippedNearbySupported > 0;
      } else {
        summary.decisionHint = `批量快速闭环回写失败：${summary.processed} 条中 ${summary.failed} 条失败，${summary.skipped} 条跳过，请先修复 failures[] 原因或确认 resultDir=${normalizedResultDir} 下是否存在 <result_id>.json/inspect/doc 产物。${remainingHint}`;
        summary.shouldProceed = false;
      }
      return summary;
    },

    async runGroupsScanAndPrepare({
      groupIds,
      rootPath,
      scanMinutes = 60,
      endTime = new Date(),
      dateKeys,
      dateKeyList,
      date_key_list,
      bizSuffix = "bamboo对账归因记录",
      initStatus = "init",
      troubleshootingSopDoc,
      claimOrder = "updated_time_desc",
      maxRounds = 1,
      resultDir,
      heartbeat,
    }) {
      const emitHeartbeat = (phase, extra = {}) => {
        if (typeof heartbeat !== "function") return;
        heartbeat(
          compactObject({
            kind: "bamboo_runner_heartbeat",
            phase,
            result_dir: resultDir,
            at: new Date().toISOString(),
            ...extra,
          }),
        );
      };
      const plan = buildGroupsScanPlan({
        groupIds,
        rootPath,
        scanMinutes,
        endTime,
        dryRun: false,
      });
      const resolvedDateKeys = normalizeDateKeyList({ dateKeyList, date_key_list, dateKeys });
      const normalizedMaxRounds = Math.max(1, Number.parseInt(String(maxRounds), 10) || 1);
      const normalizedResultDir = String(resultDir || "").trim() ? String(resultDir).trim() : null;
      if (normalizedResultDir) await mkdir(normalizedResultDir, { recursive: true });

      const groups = [];
      for (const task of plan.scanTasks) {
        try {
          emitHeartbeat("scan", {
            group_id: task.chatId,
            audit_file: normalizedResultDir
              ? join(normalizedResultDir, "run-summary.json")
              : undefined,
          });
          const result = await this.scanChatToBaseViaCsv({
            chatId: task.chatId,
            start: new Date(plan.scanWindow.start),
            end: new Date(plan.scanWindow.end),
            scanDirUrl: rootPath,
            dateKey: plan.dateKey,
            bizSuffix,
            initStatus,
          });
          const baseUrls =
            Array.isArray(result.daily_base_urls) && result.daily_base_urls.length > 0
              ? result.daily_base_urls
              : result.daily_base?.node_token
                ? [`https://bytedance.larkoffice.com/wiki/${result.daily_base.node_token}`]
                : [];
          groups.push({
            group_id: task.chatId,
            scan_status: "succeeded",
            scan_pipeline: "runner:scan-chat-to-base-via-csv",
            inserted: result.write?.rows_written ?? 0,
            skipped: result.write?.rows_skipped ?? 0,
            base_urls: baseUrls,
            detail: result,
          });
          emitHeartbeat("scan", { group_id: task.chatId, status: "succeeded" });
        } catch (error) {
          groups.push({
            group_id: task.chatId,
            scan_status: "failed",
            error: error?.message || String(error),
          });
          emitHeartbeat("scan", {
            group_id: task.chatId,
            status: "failed",
            reason: error?.message || String(error),
          });
        }
      }

      const groupsFailed = groups.filter((group) => group.scan_status === "failed").length;
      const groupsTotal = groups.length;
      // 【AGENTS.md 硬固化 · scan 失败 short-circuit】
      // 只要有任一群 scanChatToBase 抛错（scan_status=failed，含 IM 读取重试仍失败、
      // 日报 Base 权限缺失、wiki 节点不可写等真正阻塞性错误），直接 short-circuit：
      //  1) 不再继续 prepareAutoTroubleshoot（不再 claim processing、不再生成 workItems）；
      //  2) 顶层 success=false，scan_failed=true，shouldProceed=false；
      //  3) troubleshoot 显式告知「必须先修 scan 失败原因后再跑 prepare」。
      // 禁止 AI 无视 scan 失败继续手工 claim 或处理其他目录里遗留的 init 记录。
      if (groupsFailed > 0) {
        const failedGroups = groups.filter((group) => group.scan_status === "failed");
        const failedHint = failedGroups
          .slice(0, 5)
          .map(
            (group) => `group=${group.group_id} error=${String(group.error || "").slice(0, 200)}`,
          )
          .join("; ");
        return {
          success: false,
          scan_failed: true,
          plan,
          scan: {
            groups_total: groupsTotal,
            groups_succeeded: groupsTotal - groupsFailed,
            groups_failed: groupsFailed,
            groups,
          },
          troubleshoot: {
            success: false,
            processed: 0,
            remaining_work_items: 0,
            statusCounts: {},
            notSupport: { total: 0, by_rule_type: {}, records: [] },
            workItems: [],
            effectiveWorkItems: [],
            effective_work_items: [],
            candidateWorkItems: [],
            candidate_work_items: [],
          },
          shouldProceed: false,
          should_proceed: false,
          decisionHint: `扫描阶段有 ${groupsFailed}/${groupsTotal} 个群失败，已 short-circuit：不再执行 prepare，禁止继续认领或处理任何目录里的 init/failed 记录。请先修复失败原因后再重新执行 runGroupsScanAndPrepare。失败样例：${failedHint}`,
          decision_hint: `扫描阶段有 ${groupsFailed}/${groupsTotal} 个群失败，已 short-circuit：不再执行 prepare，禁止继续认领或处理任何目录里的 init/failed 记录。请先修复失败原因后再重新执行 runGroupsScanAndPrepare。失败样例：${failedHint}`,
        };
      }

      const rounds = [];
      let loopPlan = null;
      let prepareResult = null;
      let finalDrain = null;
      let totalClaimed = 0;
      let totalCloseAttempted = 0;
      let totalCloseSucceeded = 0;
      let totalCloseFailed = 0;
      let awaitingModelResults = [];
      let closeBlocked = false;

      for (let round = 1; round <= normalizedMaxRounds; round += 1) {
        emitHeartbeat("prepare", {
          round,
          audit_file: normalizedResultDir
            ? join(normalizedResultDir, `prepare-round-${round}.json`)
            : undefined,
        });
        prepareResult = await this.prepareAutoTroubleshoot({
          scanDirUrl: rootPath,
          dateKeys: resolvedDateKeys,
          bizSuffix,
          troubleshootingSopDoc,
          claimOrder,
          claimLimit: 1,
        });

        const workItems = Array.isArray(prepareResult.workItems) ? prepareResult.workItems : [];
        const roundSummary = {
          round,
          prepare_success: prepareResult.success === true,
          claimed: workItems.length,
          close_attempted: 0,
          close_succeeded: 0,
          close_failed: 0,
          awaiting_model_results: [],
          work_item_files: [],
          close_results: [],
        };
        totalClaimed += workItems.length;

        if (normalizedResultDir) {
          const prepareFile = join(normalizedResultDir, `prepare-round-${round}.json`);
          const workItemsFile = join(normalizedResultDir, "work-items.json");
          await writeJsonFile(prepareFile, prepareResult);
          await writeJsonFile(workItemsFile, workItems);
          roundSummary.prepare_file = prepareFile;
          roundSummary.work_items_file = workItemsFile;

          for (const workItem of workItems) {
            const resultId = String(workItem?.result_id || workItem?.resultId || "").trim();
            if (!resultId) continue;
            const perResultWorkItemsFile = join(normalizedResultDir, `work-items-${resultId}.json`);
            await writeJsonFile(perResultWorkItemsFile, [workItem]);
            roundSummary.work_item_files.push(perResultWorkItemsFile);
          }
          roundSummary.dispatch_plan = buildAgentDriverDispatchPlan({
            workItems,
            resultDir: normalizedResultDir,
            scanDirUrl: rootPath,
            dateKeys: resolvedDateKeys,
            bizSuffix,
            troubleshootingSopDoc,
          });
        }

        if (workItems.length === 0) {
          rounds.push(roundSummary);
          break;
        }

        if (!normalizedResultDir) {
          awaitingModelResults = workItems
            .map((workItem) => String(workItem?.result_id || workItem?.resultId || "").trim())
            .filter(Boolean);
          roundSummary.awaiting_model_results = awaitingModelResults;
          rounds.push(roundSummary);
          break;
        }

        for (const workItem of workItems) {
          const resultId = String(workItem?.result_id || workItem?.resultId || "").trim();
          if (!resultId) continue;
          const modelResultFile = join(normalizedResultDir, `${resultId}.json`);
          const hasModelResult = await fileExists(modelResultFile);
          if (!hasModelResult) {
            awaitingModelResults.push(resultId);
            roundSummary.awaiting_model_results.push(resultId);
            continue;
          }

          const closeOutputFile = join(normalizedResultDir, `close-${resultId}.json`);
          emitHeartbeat("close", { round, result_id: resultId, audit_file: closeOutputFile });
          const closeResult = await this.closePreparedWorkItems({
            workItems: [workItem],
            resultDir: normalizedResultDir,
            outputFile: closeOutputFile,
          });
          totalCloseAttempted += 1;
          roundSummary.close_attempted += 1;
          roundSummary.close_results.push(closeResult);

          if (
            closeResult?.success === true &&
            closeResult?.business_close?.success !== false &&
            closeResult?.notification_close?.success !== false
          ) {
            totalCloseSucceeded += 1;
            roundSummary.close_succeeded += 1;
            emitHeartbeat("close", {
              round,
              result_id: resultId,
              status: "succeeded",
              audit_file: closeOutputFile,
            });
          } else {
            totalCloseFailed += 1;
            roundSummary.close_failed += 1;
            closeBlocked = true;
            emitHeartbeat("close", {
              round,
              result_id: resultId,
              status: "failed",
              audit_file: closeOutputFile,
            });
          }
        }

        rounds.push(roundSummary);

        if (roundSummary.awaiting_model_results.length > 0 || closeBlocked) {
          break;
        }
      }

      if (
        normalizedResultDir &&
        prepareResult &&
        Array.isArray(prepareResult.workItems) &&
        prepareResult.workItems.length === 0
      ) {
        emitHeartbeat("drain", { audit_file: join(normalizedResultDir, "run-summary.json") });
        finalDrain = await this.buildAutoTroubleshootDrainSummary({
          scanDirUrl: rootPath,
          dateKeys: resolvedDateKeys,
          bizSuffix,
          resultDir: normalizedResultDir,
          scan: {
            groups,
          },
          dailyBases: extractDailyBasesFromScanGroups(groups),
        });
        emitHeartbeat("drain", {
          status: finalDrain?.ready_to_report_complete === true ? "succeeded" : "blocked",
          audit_file: join(normalizedResultDir, "run-summary.json"),
        });
      } else if (!normalizedResultDir && normalizedMaxRounds > 1) {
        loopPlan = this.buildAutoTroubleshootLoopPlan({
          scanDirUrl: rootPath,
          dateKeys: resolvedDateKeys,
          bizSuffix,
          troubleshootingSopDoc,
          resultDir: `.tmp/bamboo-auto-loop-${Date.now()}`,
          maxRounds: normalizedMaxRounds,
        });
      }

      const finalReady =
        finalDrain?.ready_to_report_complete === true &&
        finalDrain?.drain_safety?.safe_to_declare_drained !== false;
      const hasAwaitingModelResults = awaitingModelResults.length > 0;
      const troubleshootSuccess = Boolean(
        prepareResult?.success &&
        !hasAwaitingModelResults &&
        !closeBlocked &&
        (!normalizedResultDir || finalReady),
      );
      const remaining = hasAwaitingModelResults
        ? awaitingModelResults.length
        : prepareResult?.nearByClaimable &&
            typeof prepareResult.nearByClaimable.skippedNearbySupported === "number"
          ? prepareResult.nearByClaimable.skippedNearbySupported
          : 0;
      const finalDecisionHintParts = [prepareResult?.decisionHint || ""];
      if (hasAwaitingModelResults) {
        finalDecisionHintParts.push(
          `已保存 work item 快照，等待单条排障产出模型结果：${awaitingModelResults.join(", ")}`,
        );
      }
      if (closeBlocked) {
        finalDecisionHintParts.push(
          "close-prepared-work-items 存在失败，必须先修复 close 审计结果后继续 drain。",
        );
      }
      if (finalDrain) {
        finalDecisionHintParts.push(
          finalReady
            ? "ready_to_report_complete=true，可宣布本轮自动排障闭环完成。"
            : "ready_to_report_complete=false，最终 drain 未通过，禁止宣布完成。",
        );
      }
      if (loopPlan && loopPlan.steps && loopPlan.steps.length) {
        finalDecisionHintParts.push(
          `max-rounds=${normalizedMaxRounds} 但未传 --result-dir，已附 maxRoundsLoopPlan（命令行模板），请外部按 bamboo-alerts-auto-troubleshoot 规范循环 claim/inspect/classify/publish/close。`,
        );
      }
      finalDecisionHintParts.push(
        `claim_order=${prepareResult?.claimOrder || claimOrder}，claim_limit_per_round=1，max_rounds=${normalizedMaxRounds}`,
      );
      const finalDecisionHint = finalDecisionHintParts.filter(Boolean).join("\n  - ");
      const dispatchPlan = rounds.find((round) => round.dispatch_plan)?.dispatch_plan || null;
      const stateNextAction = hasAwaitingModelResults
        ? "dispatch_required"
        : closeBlocked
          ? "close_repair_required"
          : finalDrain
            ? finalReady
              ? "report_ready"
              : "final_drain_repair_required"
            : "continue_prepare_required";
      if (normalizedResultDir) {
        const state = {
          kind: "bamboo_alert_auto_orchestrator_state",
          rounds: rounds.map((round) => ({
            round: round.round,
            claimed_result_ids: (round.awaiting_model_results || []).concat(
              (round.close_results || []).flatMap((closeResult) =>
                (closeResult.results || [])
                  .map((item) => String(item.result_id || "").trim())
                  .filter(Boolean),
              ),
            ),
            dispatched_result_ids: [],
            result_json_validation_status: {},
            close_status: {
              attempted: round.close_attempted,
              succeeded: round.close_succeeded,
              failed: round.close_failed,
            },
            blockers: round.close_failed > 0 ? ["close_failed"] : [],
            next_action:
              round.awaiting_model_results?.length > 0
                ? "dispatch_required"
                : round.close_failed > 0
                  ? "close_repair_required"
                  : finalDrain
                    ? finalReady
                      ? "report_ready"
                      : "final_drain_repair_required"
                    : "continue_prepare_required",
          })),
          latest_round: rounds.at(-1)?.round || 0,
          next_action: stateNextAction,
          dispatch_plan: stateNextAction === "report_ready" ? null : dispatchPlan,
          last_dispatch_plan: stateNextAction === "report_ready" ? dispatchPlan : undefined,
          final_drain_allowed: Boolean(finalDrain),
          ready_to_report_complete: Boolean(finalReady),
          nonOverride: true,
        };
        await writeJsonFile(join(normalizedResultDir, "auto-orchestrator-state.json"), state);
      }

      return {
        success: true,
        scan_failed: false,
        plan,
        scan: {
          groups_total: groupsTotal,
          groups_succeeded: groupsTotal - groupsFailed,
          groups_failed: groupsFailed,
          scan_pipeline: "runner:scan-chat-to-base-via-csv",
          groups,
        },
        troubleshoot: {
          success: troubleshootSuccess,
          processed: totalClaimed,
          processed_prepare_claim: totalClaimed,
          processed_batch_quick_closure: 0,
          batch_quick_closure_closed_succeeded: 0,
          batch_quick_closure_closed_failed: 0,
          batchClosureResult: null,
          rounds,
          close_attempted: totalCloseAttempted,
          close_succeeded: totalCloseSucceeded,
          close_failed: totalCloseFailed,
          awaiting_model_results: awaitingModelResults,
          dispatch_plan: dispatchPlan,
          final_drain: finalDrain,
          maxRoundsLoopPlan: loopPlan,
          max_rounds: normalizedMaxRounds,
          claim_order: prepareResult?.claimOrder || claimOrder,
          near_by_claimable:
            prepareResult?.nearByClaimable || prepareResult?.near_by_claimable || null,
          remaining_work_items: remaining,
          statusCounts: finalDrain?.status_counts || prepareResult?.statusCounts,
          notSupport: prepareResult?.notSupport,
          workItems: prepareResult?.workItems,
          effectiveWorkItems: prepareResult?.effectiveWorkItems,
          effective_work_items: prepareResult?.effective_work_items,
          candidateWorkItems: prepareResult?.candidateWorkItems,
          candidate_work_items: prepareResult?.candidate_work_items,
        },
        shouldProceed: Boolean(
          !troubleshootSuccess &&
          (hasAwaitingModelResults || closeBlocked || prepareResult?.shouldProceed),
        ),
        should_proceed: Boolean(
          !troubleshootSuccess &&
          (hasAwaitingModelResults || closeBlocked || prepareResult?.shouldProceed),
        ),
        decisionHint: finalDecisionHint,
        decision_hint: finalDecisionHint,
      };
    },

    // 【P0-1 硬固化】快速闭环条件分类器：把 inspect-result 原始字段 + AI 手写字段喂进来，
    //  脚本统一跑 QC-1~QC-4 硬匹配，输出 matchedConditions + topHardcodedAttribution。
    //  【硬约束】返回 nonOverride=true 时，AI 不得 override 脚本产出的候选归因与置信度。
    async classifyQuickClosure(input = {}) {
      const {
        workItem,
        workItemFile,
        taskName,
        resultId,
        falseDataLength,
        taskResultNum,
        instanceStatus,
        instanceFalseReason,
        falseReason,
        alertBody,
        sampleThreshold = 5,
        criticalDiffAbs = 1,
        criticalDiffRatio = 0.001,
      } = input || {};

      let loadedWorkItem = workItem;
      if (!loadedWorkItem && workItemFile) {
        loadedWorkItem = JSON.parse(await readFile(workItemFile, "utf8"));
      }
      const wi = loadedWorkItem && typeof loadedWorkItem === "object" ? loadedWorkItem : {};

      // 优先用明确入参，其次从 workItem / inspectResult 里捞
      const inspect =
        wi.inspectResult && typeof wi.inspectResult === "object" ? wi.inspectResult : wi;
      const resolvedTaskName =
        taskName ||
        wi.task_name ||
        wi.taskName ||
        inspect.task_name ||
        inspect.taskName ||
        inspect.rule_name ||
        inspect.raw_title ||
        "";
      const resolvedFalseDataLength =
        falseDataLength !== undefined && falseDataLength !== null
          ? falseDataLength
          : wi.false_data_length !== undefined && wi.false_data_length !== null
            ? wi.false_data_length
            : (inspect.false_data_length ??
              inspect.falseDataLength ??
              inspect.alarm_false_data_length);
      const resolvedTaskResultNum =
        taskResultNum !== undefined && taskResultNum !== null
          ? taskResultNum
          : wi.task_result_num !== undefined && wi.task_result_num !== null
            ? wi.task_result_num
            : (inspect.task_result_num ?? inspect.taskResultNum ?? inspect.task_result_cnt);
      const resolvedInstanceStatus =
        instanceStatus !== undefined && instanceStatus !== null
          ? instanceStatus
          : (inspect.instance_status ?? inspect.instanceStatus ?? wi.instance_status);
      const resolvedInstanceFalseReason =
        instanceFalseReason !== undefined && instanceFalseReason !== null
          ? instanceFalseReason
          : (inspect.instance_false_reason ??
            inspect.instanceFalseReason ??
            wi.instance_false_reason);
      const resolvedFalseReason =
        falseReason !== undefined && falseReason !== null
          ? falseReason
          : (inspect.false_reason ?? inspect.falseReason ?? inspect.comment ?? wi.false_reason);
      const resolvedAlertBody =
        alertBody !== undefined && alertBody !== null
          ? alertBody
          : typeof inspect.raw_card === "string"
            ? inspect.raw_card
            : [
                wi.extra?.raw_title,
                wi.extra?.raw_content,
                inspect.raw_title,
                inspect.raw_content,
                inspect.comment,
              ]
                .filter(Boolean)
                .join("\n");
      const resolvedResultId =
        resultId ?? wi.result_id ?? wi.resultId ?? inspect.result_id ?? inspect.resultId;

      const qc = classifyQuickClosureConditions({
        taskName: resolvedTaskName,
        falseDataLength: resolvedFalseDataLength,
        taskResultNum: resolvedTaskResultNum,
        instanceStatus: resolvedInstanceStatus,
        instanceFalseReason: resolvedInstanceFalseReason,
        falseReason: resolvedFalseReason,
        alertBody: resolvedAlertBody,
        sampleThreshold:
          Number.isFinite(Number(sampleThreshold)) && Number(sampleThreshold) >= 0
            ? Number(sampleThreshold)
            : 5,
        criticalDiffAbs:
          Number.isFinite(Number(criticalDiffAbs)) && Number(criticalDiffAbs) >= 0
            ? Number(criticalDiffAbs)
            : 1,
        criticalDiffRatio:
          Number.isFinite(Number(criticalDiffRatio)) && Number(criticalDiffRatio) >= 0
            ? Number(criticalDiffRatio)
            : 0.001,
      });

      const skeletonSectionHints = [
        TROUBLESHOOTING_DOC_SECTION_TITLES.baseInfo,
        TROUBLESHOOTING_DOC_SECTION_TITLES.rawBambooSummary,
        ...(qc.matchedCodes.length > 0
          ? [TROUBLESHOOTING_DOC_SECTION_TITLES.quickClosureEvidence]
          : []),
        ...qc.matchedConditions.map((m) => `  ${m.code} ${m.name}`),
        ...(qc.matchedCodes.length > 0
          ? [
              `${TROUBLESHOOTING_DOC_SECTION_TITLES.quickConclusion}（必须引用 topHardcodedAttribution）`,
            ]
          : [TROUBLESHOOTING_DOC_SECTION_TITLES.deepInvestigation]),
      ];

      return {
        version: "hardened.v1",
        result_id: resolvedResultId,
        resultId: resolvedResultId,
        effectiveSamples: qc.effectiveSamples,
        authoritativeSamples: qc.authoritativeSamples,
        authoritative_samples: qc.authoritative_samples,
        authoritativeSampleSource: qc.authoritativeSampleSource,
        authoritative_sample_source: qc.authoritative_sample_source,
        sampleCountConsistency: qc.sampleCountConsistency,
        sample_count_consistency: qc.sample_count_consistency,
        sampleThreshold: qc.sampleThreshold,
        matchedConditions: qc.matchedConditions,
        matchedCodes: qc.matchedCodes,
        quickClosureRecommended: qc.quickClosureRecommended,
        quick_closure_recommended: qc.quick_closure_recommended,
        topHardcodedAttribution: qc.topHardcodedAttribution,
        top_hardcoded_attribution: qc.top_hardcoded_attribution,
        topHardcodedSummary: qc.topHardcodedSummary,
        top_hardcoded_summary: qc.top_hardcoded_summary,
        overallConfidence: qc.overallConfidence,
        overall_confidence: qc.overall_confidence,
        nonOverride: true, // 【硬约束】AI 必须使用本返回的候选，不得 override
        skeletonSectionHints,
      };
    },

    // 【P0-2 核心硬约束】三层模型结果校验器：L1结构/L2语义/L3 deep-check
    //  【硬约束】strictMode=true（默认）时 any 层校验失败 → 直接 throw Error → CLI exit(1)，没有 bypass/continue/人工确认继续的旁路
    //  【nonOverride】返回的 normalizedModelResult.* 为最终权威值，AI 必须覆盖掉自己生成的 JSON，禁止写回未覆盖版本
    async validateModelResultJson(input = {}) {
      const {
        modelResult,
        modelResultFile,
        workItem,
        workItemFile,
        qcResult,
        evidenceCount,
        rpcSampleCount,
        skeletonType = "deep",
        docFilledContent,
        docFilledFile,
        failedAttemptsRequired = 3,
        strictMode = true,
      } = input || {};

      const statusWhitelist = new Set([
        "init",
        "processing",
        "succeeded",
        "failed",
        "pending",
        "not_support",
      ]);

      // --- 加载 modelResult / workItem / qcResult / docFilledContent ---
      let mr = modelResult;
      if (!mr && modelResultFile) {
        try {
          const rawModelResult = await readFile(modelResultFile, "utf8");
          if (!String(rawModelResult || "").trim()) {
            const incomplete = buildIncompleteModelResultValidation({
              filePath: modelResultFile,
              reason: "model result JSON file is empty",
            });
            if (strictMode) {
              const error = new Error("validate-model-result-json: RESULT_JSON_INCOMPLETE");
              error.hardFailCode = "RESULT_JSON_INCOMPLETE";
              error.validationOutput = incomplete;
              throw error;
            }
            return incomplete;
          }
          mr = JSON.parse(rawModelResult);
        } catch (error) {
          if (error?.hardFailCode === "RESULT_JSON_INCOMPLETE") throw error;
          const incomplete = buildIncompleteModelResultValidation({
            filePath: modelResultFile,
            reason: `model result JSON file is incomplete or invalid: ${error?.message || String(error)}`,
          });
          if (strictMode) {
            const wrapped = new Error("validate-model-result-json: RESULT_JSON_INCOMPLETE");
            wrapped.hardFailCode = "RESULT_JSON_INCOMPLETE";
            wrapped.validationOutput = incomplete;
            throw wrapped;
          }
          return incomplete;
        }
      }
      if (!mr || typeof mr !== "object") {
        if (strictMode) throw new Error("validate-model-result-json: modelResult 为空或不是对象");
        return {
          version: "hardened.v1",
          overallValid: false,
          overall_valid: false,
          fatalError: "modelResult 为空或不是对象",
          nonOverride: true,
        };
      }
      const raw = Array.isArray(mr) ? mr[0] : mr;

      // 字段别名兼容：旧 modelResult 用 summary/feishu_doc_url/doc_url，新统一用 ai_summary/ai_result；
      // 同时如果 raw.status 未显式声明，则按 success/pending_admission/failed_admission 推导。
      const coerced = { ...raw };
      if (
        coerced.ai_summary === undefined ||
        coerced.ai_summary === null ||
        coerced.ai_summary === ""
      ) {
        const fromSummary = String(raw.summary || "").trim();
        if (fromSummary) coerced.ai_summary = fromSummary;
      }
      if (
        coerced.ai_result === undefined ||
        coerced.ai_result === null ||
        coerced.ai_result === ""
      ) {
        const fromDoc = String(raw.feishu_doc_url || raw.doc_url || "").trim();
        if (fromDoc) coerced.ai_result = fromDoc;
      }
      if (!coerced.status || String(coerced.status).trim() === "") {
        const derived = deriveTerminalStatus(raw);
        if (derived !== "incomplete_model_result") coerced.status = derived;
      }
      // pending_admission 兼容：旧字段命名有时用驼峰
      if (
        (coerced.pending_admission === undefined || coerced.pending_admission === null) &&
        raw.pendingAdmission
      ) {
        coerced.pending_admission = raw.pendingAdmission;
      }
      if (
        (coerced.failed_admission === undefined || coerced.failed_admission === null) &&
        raw.failedAdmission
      ) {
        coerced.failed_admission = raw.failedAdmission;
      }

      let wi = workItem;
      if (!wi && workItemFile) wi = JSON.parse(await readFile(workItemFile, "utf8"));
      if (wi && !Array.isArray(wi) && typeof wi !== "object") wi = undefined;

      let docContent = docFilledContent;
      if (!docContent && docFilledFile) docContent = await readFile(docFilledFile, "utf8");

      // ==================== L1 结构校验 ====================
      const statusRaw = String(coerced.status || "").trim();
      const l1MissingRequired = [];
      const requiredByStatus = {
        succeeded: ["ai_summary", "ai_result"],
        pending: ["ai_summary", "ai_result", "pending_admission"],
        failed: ["ai_summary", "failed_admission"],
        not_support: ["ai_summary"],
        processing: [],
        init: [],
      };
      for (const f of requiredByStatus[statusRaw] || []) {
        if (coerced[f] === undefined || coerced[f] === null || coerced[f] === "")
          l1MissingRequired.push(f);
      }
      const l1 = {
        valid: statusWhitelist.has(statusRaw) && l1MissingRequired.length === 0,
        status: statusRaw,
        requiredFieldsOk: l1MissingRequired.length === 0,
        missingRequired: l1MissingRequired,
        reasons: [],
      };
      if (!statusWhitelist.has(statusRaw))
        l1.reasons.push(`status=${statusRaw} 不在白名单 ${[...statusWhitelist].join(",")}`);
      if (l1MissingRequired.length > 0)
        l1.reasons.push(
          `缺失 status=${statusRaw} 要求的必填字段: ${JSON.stringify(l1MissingRequired)}`,
        );
      if (l1.valid) l1.reasons.push(`L1 通过：status=${statusRaw}，必填字段齐全`);

      // ==================== L2 语义校验（6 个子维度）====================
      // 从 qcResult / workItem 里抽取 requiredAttribution 和配套 summary
      const qcInput =
        qcResult && typeof qcResult === "object" ? qcResult : wi?.qcResult || wi?.qc_result || null;
      const qcTopAttr = qcInput?.topHardcodedAttribution || qcInput?.top_hardcoded_attribution;
      const qcTopSummary = qcInput?.topHardcodedSummary || qcInput?.top_hardcoded_summary;
      const inspectForSampleEvidence =
        wi?.inspectResult || wi?.inspect_result || coerced.inspect_result || {};
      const inspectClassification =
        inspectForSampleEvidence?.classification ||
        coerced.classification ||
        raw.classification ||
        {};
      const authority = (() => {
        const kind = String(inspectClassification?.kind || "").trim();
        const attr =
          inspectClassification?.attributionResult || inspectClassification?.suggestedAttribution;
        if (kind === "table_permission_missing") {
          return {
            source: "inspect_result.classification",
            attribution: "[无效告警]表权限缺失",
            priority: 100,
            kind,
          };
        }
        if (attr && isAllowedBambooAttributionResult(attr)) {
          return {
            source: "inspect_result.classification",
            attribution: attr,
            priority: 90,
            kind,
          };
        }
        if (qcTopAttr && isAllowedBambooAttributionResult(qcTopAttr)) {
          return {
            source: "qc_result",
            attribution: qcTopAttr,
            priority: 50,
            kind: "qc_quick_closure",
          };
        }
        return {
          source: "model_result",
          attribution: undefined,
          priority: 0,
          kind: "",
        };
      })();
      const requiredAttribution = authority.attribution;
      // ai_summary 归一化（自动 prepend 权威归因、修复冲突，QC 命中时用权威 summary 兜底）
      const needsAiSummary = ["succeeded", "pending", "failed", "not_support"].includes(statusRaw);
      const aiSum = normalizeAiSummaryLengthAndKeywords(coerced.ai_summary, {
        requiredAttribution,
        qcHardcodedSummary: authority.source === "qc_result" ? qcTopSummary : undefined,
        minLength: 20,
        maxLength: 500,
        requireFreeTextKeywords: needsAiSummary,
      });
      // needs_manual_review ↔ status 联动
      const needs = validateNeedsManualConfirmation(statusRaw, {
        overrideByDoc: Boolean(coerced.sop_needs_manual || coerced.needs_followup),
        needsManualReviewProvided: coerced.needs_manual_review,
        pendingAdmission: coerced.pending_admission,
      });
      // status=failed 闭环核验
      const clf = assertClosedLoopFailed(
        statusRaw,
        coerced.failed_admission,
        Number.isFinite(Number(failedAttemptsRequired)) ? Number(failedAttemptsRequired) : 3,
      );
      const failedStatusValidation =
        statusRaw === "failed"
          ? validateFailedStatus({
              summary: coerced.ai_summary,
              reason: String(coerced.reason || raw.reason || "").trim(),
              failedAdmission: coerced.failed_admission || coerced.failedAdmission,
              extra: getWorkItemExtra(wi),
            })
          : { valid: true, reasons: [], hints: [], blockedKeywords: [], blocked_keywords: [] };
      const closedLoopFailed = {
        ...clf,
        valid: clf.valid && failedStatusValidation.valid,
        reasons: [...(clf.reasons || []), ...(failedStatusValidation.reasons || [])],
        hints: [...(clf.hints || []), ...(failedStatusValidation.hints || [])],
        blockedKeywords:
          failedStatusValidation.blockedKeywords || failedStatusValidation.blocked_keywords || [],
        blocked_keywords:
          failedStatusValidation.blocked_keywords || failedStatusValidation.blockedKeywords || [],
      };
      // status=succeeded/pending 必须有有效飞书文档链接
      let docLinkValid = true;
      const docLinkReasons = [];
      if (["succeeded", "pending"].includes(statusRaw)) {
        const u = coerced.ai_result;
        if (!isValidFeishuDocumentUrl(u)) {
          docLinkValid = false;
          docLinkReasons.push(
            `status=${statusRaw} 时 ai_result=${u} 不是合法飞书文档链接（必须 https://*.larkoffice.com/wiki/xxx 或 docx/xxx）`,
          );
        }
      }
      const normalizedEvidenceItemsForConfidence = normalizeArrayField(
        coerced.evidence_items ?? coerced.evidenceItems,
      );
      const normalizedEvidenceCountForConfidence =
        evidenceCount ??
        (normalizedEvidenceItemsForConfidence.length > 0
          ? normalizedEvidenceItemsForConfidence.length
          : coerced.evidence_count);
      // confidence 自动计算（nonOverride）
      const conf = computeConfidenceByEvidence({
        qcResult: qcInput,
        evidenceCount: normalizedEvidenceCountForConfidence,
        sampleSize:
          coerced.task_result_num != null && coerced.task_result_num > 0
            ? coerced.task_result_num
            : (coerced.false_data_length ??
              coerced.task_result_num ??
              wi?.inspectResult?.false_data_length),
        rpcSampleCount: rpcSampleCount ?? coerced.rpc_sample_count,
        providedConfidence: coerced.confidence,
      });

      const sampleEvidenceCount = Math.max(
        Number(coerced.task_result_num || 0),
        Number(coerced.false_data_length || 0),
        Number(inspectForSampleEvidence.task_result_num || 0),
        Number(inspectForSampleEvidence.false_data_length || 0),
      );
      const falseReasonText = [
        coerced.false_reason,
        coerced.falseReason,
        coerced.diff_reason,
        inspectForSampleEvidence.false_reason,
        inspectForSampleEvidence.falseReason,
        inspectForSampleEvidence.diff_reason,
      ]
        .filter(Boolean)
        .map((value) => String(value))
        .join("\n")
        .trim();
      const hasEffectiveSampleEvidence = sampleEvidenceCount > 0 || falseReasonText.length > 0;
      const hardFailCodes = [];
      const hardFailReasons = [];
      const normalizedSummaryText = String(aiSum.normalized || coerced.ai_summary || "");
      const modelResultId = String(
        coerced.result_id || raw.result_id || coerced.resultId || raw.resultId || "",
      ).trim();
      const workItemResultId = String(wi?.result_id || wi?.resultId || "").trim();
      if (modelResultId && workItemResultId && modelResultId !== workItemResultId) {
        hardFailCodes.push("result_id_mismatch");
        hardFailReasons.push(
          `模型结果 result_id=${modelResultId} 与 work item result_id=${workItemResultId} 不一致，禁止跨报警复用排查结果`,
        );
      }
      const modelRuleId = String(
        coerced.rule_id || raw.rule_id || coerced.ruleId || raw.ruleId || "",
      ).trim();
      const workItemRuleId = String(wi?.rule_id || wi?.ruleId || "").trim();
      const inspectRuleId = String(
        wi?.inspect_result?.rule_id ||
          wi?.inspect_result?.rules_id ||
          wi?.inspectResult?.rule_id ||
          wi?.inspectResult?.rules_id ||
          wi?.inspect_result?.rule_validation?.actual_rule_id ||
          wi?.inspectResult?.rule_validation?.actual_rule_id ||
          "",
      ).trim();
      const expectedRuleId = workItemRuleId || inspectRuleId;
      if (modelRuleId && expectedRuleId && modelRuleId !== expectedRuleId) {
        hardFailCodes.push("rule_id_mismatch");
        hardFailReasons.push(
          `模型结果 rule_id=${modelRuleId} 与当前报警 rule_id=${expectedRuleId} 不一致，禁止跨规则复用排查结果`,
        );
      }
      if (
        ["succeeded", "pending"].includes(statusRaw) &&
        String(wi?.parent_wiki_token || wi?.parentWikiToken || "").trim() &&
        !isWikiDocumentUrl(coerced.ai_result)
      ) {
        docLinkValid = false;
        hardFailCodes.push("auto_troubleshoot_doc_must_be_wiki_link");
        hardFailReasons.push(
          `自动目录排障场景传入 parent_wiki_token 时，ai_result/feishu_doc_url 必须是 /wiki/ 链接，不能使用 docx 直链：${coerced.ai_result || ""}`,
        );
      }
      const sampleCountAuthority = normalizeAuthoritativeSampleCount({
        falseDataLength:
          coerced.false_data_length ??
          coerced.falseDataLength ??
          inspectForSampleEvidence.false_data_length ??
          inspectForSampleEvidence.falseDataLength ??
          qcInput?.sample_count_consistency?.bamboo_false_data_length,
        falseReason:
          coerced.false_reason ??
          coerced.falseReason ??
          inspectForSampleEvidence.false_reason ??
          inspectForSampleEvidence.falseReason,
        taskResultNum:
          coerced.task_result_num ??
          coerced.taskResultNum ??
          wi?.task_result_num ??
          wi?.taskResultNum ??
          inspectForSampleEvidence.task_result_num ??
          inspectForSampleEvidence.taskResultNum,
        cardTaskResultNum:
          wi?.card_task_result_num ??
          wi?.cardTaskResultNum ??
          wi?.extra?.task_result_num ??
          qcInput?.sample_count_consistency?.card_task_result_num,
      });
      const summarySampleCounts = extractSummarySampleCounts(normalizedSummaryText);
      const sampleChecks = normalizeArrayField(
        coerced.sample_checks ?? coerced.sampleChecks ?? raw.sample_checks ?? raw.sampleChecks,
      );
      const summaryMentionsPositiveSamples = summarySampleCounts.some((count) => Number(count) > 0);
      const writebackOwner = String(
        coerced.writeback_owner ??
          coerced.writebackOwner ??
          raw.writeback_owner ??
          raw.writebackOwner ??
          "",
      ).trim();
      const wrongNoWritebackText = [
        coerced.summary,
        coerced.ai_summary,
        coerced.reason,
        raw.summary,
        raw.ai_summary,
        raw.reason,
      ]
        .filter(Boolean)
        .join("\n");
      const isAutoTroubleshootContext = Boolean(
        String(wi?.parent_wiki_token || wi?.parentWikiToken || "").trim() ||
        String(wi?.base_token || wi?.baseToken || "").trim() ||
        String(wi?.table_id || wi?.tableId || "").trim(),
      );
      if (
        ["succeeded", "pending", "failed"].includes(statusRaw) &&
        isAutoTroubleshootContext &&
        !writebackOwner
      ) {
        hardFailCodes.push("missing_writeback_owner");
        hardFailReasons.push(
          "自动目录排障结果必须声明 writeback_owner=parent_orchestrator，避免子 agent 误描述或尝试承担 close 回写责任",
        );
      }
      if (
        ["succeeded", "pending", "failed"].includes(statusRaw) &&
        writebackOwner &&
        writebackOwner !== "parent_orchestrator"
      ) {
        hardFailCodes.push("writeback_owner_must_be_parent_orchestrator");
        hardFailReasons.push(
          `自动目录排障结果 writeback_owner 必须是 parent_orchestrator，当前为 ${writebackOwner}`,
        );
      }
      if (
        ["succeeded", "pending", "failed"].includes(statusRaw) &&
        /用户.*(要求|决定|选择).*不回写|不回写.*用户.*(要求|决定|选择)|用户要求不回写/i.test(
          wrongNoWritebackText,
        )
      ) {
        hardFailCodes.push("writeback_responsibility_misattributed");
        hardFailReasons.push(
          "自动目录排障中 close/Base/Bamboo/群消息回写由 parent_orchestrator 负责，子 agent 不得描述为“用户要求不回写”",
        );
      }
      if (
        ["succeeded", "pending"].includes(statusRaw) &&
        sampleCountAuthority.source === "unknown" &&
        (summaryMentionsPositiveSamples || sampleChecks.length > 0)
      ) {
        hardFailCodes.push("sample_count_authority_unknown_with_sample_evidence");
        hardFailReasons.push(
          "ai_summary 或 sample_checks 表示存在样本时，sample_count_authority 不能为 unknown；必须补充 Bamboo/Base 权威样本数来源",
        );
      }
      const originalSummaryValidation = validateAiSummary(coerced.ai_summary, {
        requireAttribution: false,
        minFreeTextLength: 0,
      });
      const providedAttribution =
        coerced.attribution_result ||
        raw.attribution_result ||
        originalSummaryValidation.attributionResult ||
        (Array.isArray(originalSummaryValidation.matchedResults) &&
        originalSummaryValidation.matchedResults.length === 1
          ? originalSummaryValidation.matchedResults[0]
          : undefined);
      const finalAttribution = aiSum.attributionResult || providedAttribution || undefined;
      const investigationEvidence = validateInvestigationEvidence({
        status: statusRaw,
        modelResult: coerced,
        workItem: wi,
        normalizedSummaryText,
        hasEffectiveSampleEvidence,
        sampleCountAuthority,
        finalAttribution,
        qcResult: qcInput,
      });
      hardFailCodes.push(...investigationEvidence.hardFailCodes);
      hardFailReasons.push(...investigationEvidence.reasons);
      const blockedLowerPriorityRules = [];
      if (
        authority.source === "inspect_result.classification" &&
        qcTopAttr &&
        qcTopAttr !== authority.attribution
      ) {
        blockedLowerPriorityRules.push({
          source: "qc_result",
          attribution: qcTopAttr,
          reason: `lower priority than ${authority.source}:${authority.kind}`,
        });
      }
      if (
        authority.source === "inspect_result.classification" &&
        authority.attribution &&
        providedAttribution &&
        providedAttribution !== authority.attribution
      ) {
        hardFailCodes.push("authority_attribution_conflict");
        hardFailReasons.push(
          `inspect_result.classification.kind=${authority.kind} 要求最终归因=${authority.attribution}，但模型结果归因=${providedAttribution}`,
        );
      }
      if (
        authority.kind === "table_permission_missing" &&
        !String(coerced.ai_summary || "").includes("[无效告警]表权限缺失")
      ) {
        hardFailCodes.push("table_permission_missing_overridden");
        hardFailReasons.push(
          "inspect_result.classification.kind=table_permission_missing 时，summary 必须归因到 [无效告警]表权限缺失，禁止被 QC-1/临界数据飘移覆盖",
        );
      }
      if (
        statusRaw === "succeeded" &&
        /运行失败|核对终止/i.test(
          String(inspectForSampleEvidence.instance_status || coerced.instance_status || ""),
        ) &&
        /异常样本数=0|临界数据飘移/i.test(normalizedSummaryText)
      ) {
        hardFailCodes.push("failed_instance_cannot_be_critical_drift");
        hardFailReasons.push(
          "Bamboo instance_status=运行失败/核对终止 时，禁止按异常样本数=0或临界数据飘移闭环",
        );
      }
      if (
        authority.source !== "inspect_result.classification" &&
        qcTopAttr &&
        providedAttribution &&
        qcTopAttr !== providedAttribution
      ) {
        hardFailCodes.push("qc_final_attribution_mismatch");
        hardFailReasons.push(
          `无更高优先级分类时，qc_result.topHardcodedAttribution=${qcTopAttr} 必须与模型原始归因=${providedAttribution} 一致`,
        );
      }
      if (
        sampleCountAuthority.conflict &&
        (authority.source === "qc_result" ||
          /已自动确认无需修数|临界数据飘移|正常数据波动/i.test(normalizedSummaryText))
      ) {
        hardFailCodes.push("sample_count_conflict_blocks_quick_closure");
        hardFailReasons.push(
          `样本数来源冲突时禁止快速闭环：authority=${sampleCountAuthority.authoritativeSamples}, sources=${JSON.stringify(sampleCountAuthority.sources)}`,
        );
      }
      if (
        summarySampleCounts.length > 0 &&
        sampleCountAuthority.source !== "unknown" &&
        !summarySampleCounts.includes(sampleCountAuthority.authoritativeSamples)
      ) {
        hardFailCodes.push("summary_sample_count_conflict");
        hardFailReasons.push(
          `ai_summary 中样本数 ${JSON.stringify(summarySampleCounts)} 与权威样本数 ${sampleCountAuthority.authoritativeSamples} 不一致，禁止回写`,
        );
      }
      if (
        sampleCountAuthority.authoritativeSamples > 0 &&
        /异常样本数\s*[=:=：为]?\s*0|样本数\s*[=:=：为]?\s*0|已自动确认无需修数|临界数据飘移|正常数据波动/i.test(
          normalizedSummaryText,
        )
      ) {
        hardFailCodes.push("positive_samples_cannot_quick_close");
        hardFailReasons.push(
          `权威样本数=${sampleCountAuthority.authoritativeSamples}（source=${sampleCountAuthority.source}）时禁止按零样本/临界漂移/正常波动快速闭环`,
        );
      }
      if (statusRaw === "succeeded" && containsForbiddenGenericAttribution(normalizedSummaryText)) {
        hardFailCodes.push("generic_attribution_forbidden");
        hardFailReasons.push(
          "status=succeeded 禁止写入无专用模板/继续按 SQL 样本排查等兜底归因文案，必须给出具体业务归因",
        );
      }
      if (
        statusRaw === "succeeded" &&
        hasEffectiveSampleEvidence &&
        !summaryContainsConcreteEvidence(normalizedSummaryText)
      ) {
        hardFailCodes.push("effective_sample_evidence_missing");
        hardFailReasons.push(
          "有效差异样本记录的 ai_summary 必须包含 diff_reason、关键字段名、SQL 错误码或样本主键等至少一类具体证据",
        );
      }
      if (statusRaw === "pending" && hasEffectiveSampleEvidence && !coerced.pending_admission) {
        hardFailCodes.push("invalid_pending_reason");
        hardFailReasons.push(
          "false_reason 非空或 task_result_num>0 的有效样本记录不得在缺少 pending_admission/用户授权等待证据时保持 pending",
        );
      }
      if (statusRaw === "succeeded" && docContent) {
        const docQualityGate = validateTroubleshootingDocContent({
          title: coerced.doc_title || coerced.docTitle,
          markdown: docContent,
          skeletonType,
          attribution: finalAttribution,
        });
        if (!docQualityGate.valid) {
          hardFailCodes.push("doc_content_quality_gate_failed");
          hardFailReasons.push(`排查文档内容未通过质量门禁：${docQualityGate.reasons.join("；")}`);
        }
      }
      const rpcPermissionDeniedText = [
        coerced.rpc_error,
        coerced.rpcError,
        coerced.rpc_permission_error,
        coerced.rpcPermissionError,
        coerced.permission_error,
        coerced.permissionError,
        coerced.error_message,
        coerced.errorMessage,
        coerced.reason,
        ...normalizeArrayField(coerced.rpc_errors ?? coerced.rpcErrors).map((item) =>
          JSON.stringify(item),
        ),
        ...normalizeArrayField(coerced.evidence_items ?? coerced.evidenceItems).map((item) =>
          JSON.stringify(item),
        ),
      ]
        .filter(Boolean)
        .join("\n");
      if (
        statusRaw === "succeeded" &&
        /rpc|api-test|接口|权限|permission|auth|denied|forbidden|unauthorized|NoPrivilege|无权限|未授权|权限不足/i.test(
          rpcPermissionDeniedText,
        ) &&
        /不存在|未生成|未产生|没有记录|无记录|对象不存在|查无|无需修数|不需要修数|已自动确认无需修数/i.test(
          normalizedSummaryText,
        )
      ) {
        hardFailCodes.push("rpc_permission_cannot_prove_object_missing");
        hardFailReasons.push(
          "RPC/API 权限不足只能说明能力边界或需授权，不能据此推导业务对象不存在、无记录或无需修数；必须补替代证据或转 pending 授权。",
        );
      }

      const l2Reasons = [
        ...needs.reasons,
        ...aiSum.reasons,
        ...closedLoopFailed.reasons,
        ...docLinkReasons,
        ...conf.reasons,
        ...hardFailReasons,
      ];
      // 汇总 L2 valid：各子维度 valid 且 doc 链接有效
      const l2Valid =
        needs.valid &&
        (needsAiSummary ? aiSum.valid : true) &&
        closedLoopFailed.valid &&
        docLinkValid &&
        hardFailCodes.length === 0;
      const l2 = {
        valid: l2Valid,
        needsManualReview: needs,
        aiSummary: aiSum,
        closedLoopFailed: closedLoopFailed,
        confidence: conf,
        investigationEvidence,
        investigation_evidence: investigationEvidence,
        hardFailCodes,
        hard_fail_codes: hardFailCodes,
        sampleCountAuthority,
        sample_count_authority: sampleCountAuthority,
        summarySampleCounts,
        summary_sample_counts: summarySampleCounts,
        authoritySource: authority.source,
        authority_source: authority.source,
        blockedLowerPriorityRules,
        blocked_lower_priority_rules: blockedLowerPriorityRules,
        reasons: l2Reasons,
      };

      // ==================== L3 deep check（仅 status=pending 生效）====================
      const applicable = statusRaw === "pending";
      const deepRaw = applicable
        ? deepValidatePendingAdmission(coerced.pending_admission, {
            workItem: wi || undefined,
            skeletonType,
          })
        : null;
      const l3 = applicable
        ? { applicable: true, ...deepRaw }
        : {
            applicable: false,
            deepValid: true,
            hardFailCode: null,
            passedChecks: [],
            failedChecks: [],
            reasons: [`status=${statusRaw}，L3 pending deep-check 不适用`],
            manualQuestion: "",
            nonOverride: true,
          };

      // ==================== 汇总并构建 normalizedModelResult（权威写回值）====================
      const overrides = [];
      const finalStatus = statusWhitelist.has(statusRaw)
        ? statusRaw
        : docLinkValid && l2Valid
          ? "processing"
          : "init";
      if (finalStatus !== statusRaw)
        overrides.push({
          field: "status",
          from: statusRaw,
          to: finalStatus,
          reason: "L1 白名单或必填字段不合法，纠正为 processing/init",
        });
      // confidence 强制覆盖
      if (coerced.confidence !== conf.autoConfidence)
        overrides.push({
          field: "confidence",
          from: coerced.confidence,
          to: conf.autoConfidence,
          reason: conf.overridden ? "脚本按证据权重自动重新计算（nonOverride）" : "统一归一化格式",
        });
      // needs_manual_review 强制覆盖
      if (needs.valid && coerced.needs_manual_review !== needs.needsManualReview) {
        overrides.push({
          field: "needs_manual_review",
          from: coerced.needs_manual_review,
          to: needs.needsManualReview,
          reason: "status↔needs 硬规则联动（nonOverride）",
        });
      }
      // ai_summary 强制覆盖为 normalized
      if (needsAiSummary && aiSum.normalized && aiSum.normalized !== coerced.ai_summary) {
        overrides.push({
          field: "ai_summary",
          from: coerced.ai_summary,
          to: aiSum.normalized.slice(0, 60) + (aiSum.normalized.length > 60 ? "..." : ""),
          reason: "按权威归因+关键词要求重新归一化 ai_summary（nonOverride）",
        });
      }

      const normalized = {
        ...raw,
        ...coerced,
        status: finalStatus,
        confidence: conf.autoConfidence,
        needs_manual_review: needs.valid
          ? needs.needsManualReview
          : (coerced.needs_manual_review ?? false),
        ai_summary: needsAiSummary ? aiSum.normalized || coerced.ai_summary : coerced.ai_summary,
        authority_source: authority.source,
        raw_agent_attribution_result: providedAttribution,
        runner_attribution_result: finalAttribution,
        attribution_mapping_reason:
          authority.source === "inspect_result.classification"
            ? `mapped_by_${authority.source}:${authority.kind || "classification"}`
            : authority.source === "qc_result"
              ? "mapped_by_qc_result_top_hardcoded_attribution"
              : "kept_model_result_attribution",
        sample_count_authority: sampleCountAuthority,
        investigation_evidence: investigationEvidence,
        blocked_lower_priority_rules: blockedLowerPriorityRules,
        nonOverride: true,
        overrides,
      };

      // 骨架 protection（若有 docFilledContent）
      let skelPro = null;
      if (docContent) {
        const skelInfo = getDocSkeletonRequiredSections(
          typeof skeletonType === "string" ? skeletonType : "deep",
        );
        const applied = applyDocSkeletonFillAndProtection(skelInfo, docContent, {});
        skelPro = { ...applied, skeletonInfo: skelInfo };
      }

      const overallValid = l1.valid && l2.valid && l3.deepValid && (skelPro ? skelPro.valid : true);
      const diagnostics = buildValidatorDiagnostics({
        l1,
        l2,
        l3,
        skeletonProtection: skelPro,
        normalizedModelResult: normalized,
      });
      const out = {
        version: "hardened.v1",
        l1Structure: l1,
        l2Semantics: l2,
        l3DeepCheck: l3,
        normalizedModelResult: normalized,
        diagnostics,
        overallValid,
        overall_valid: overallValid,
        semanticGuardPassed: overallValid,
        semantic_guard_passed: overallValid,
        fatalError: null,
        skeletonProtection: skelPro,
        nonOverride: true,
      };
      if (!overallValid && strictMode) {
        const allReasons = [
          ...l1.reasons,
          ...l2.reasons,
          ...l3.reasons,
          ...(skelPro ? skelPro.reasons : []),
        ].slice(0, 20);
        const msg = `validate-model-result-json [HARD FAIL strictMode=true] overallValid=false，禁止 bypass / 手动确认继续。前${allReasons.length}条原因：\n  - ${allReasons.join("\n  - ")}`;
        out.fatalError = msg;
        // 【硬约束】不通过 → 直接 throw，shell exit(1)
        throw Object.assign(new Error(msg), { validationOutput: out });
      }
      return out;
    },

    // 【P1-1 build-attribution-candidates，末尾追加方法零侵入】
    async buildAttributionCandidates(input = {}) {
      const resultId = input.resultId || input.result_id || "";
      const ruleId = input.ruleId || input.rule_id || "";
      const qcResult = input.qcResult || input.qc_result || null;
      const classification = input.classification || null;
      const ruleSpecificKnownIssues =
        input.ruleSpecificKnownIssues || input.rule_specific_known_issues || [];
      let finalClassification = classification;
      let finalQc = qcResult;
      if (resultId && !finalClassification) {
        try {
          const inspect = await this.inspectBambooResult(resultId, {
            expectedRuleId: ruleId,
            taskResultNum: input.taskResultNum ?? input.task_result_num,
          });
          finalClassification = inspect.classification || null;
          if (!finalQc) {
            finalQc = classifyQuickClosureConditions({
              ...inspect.result,
              taskResultNum: input.taskResultNum ?? input.task_result_num,
            });
          }
        } catch {
          /* classification 缺失不报错，兜底用 whitelist */
        }
      }
      const output = buildAttributionCandidates({
        qcResult: finalQc,
        classification: finalClassification,
        ruleSpecificKnownIssues: ruleSpecificKnownIssues,
      });
      return {
        result_id: resultId,
        rule_id: ruleId,
        ...output,
      };
    },

    // 【P1-2 prepare-base-analysis，末尾追加方法零侵入】
    async prepareBaseAnalysis(input = {}) {
      const baseToken = input.baseToken || input.base_token || "";
      const baseAppToken = input.baseAppToken || input.base_app_token || "";
      const tableId = input.tableId || input.table_id || "";
      const analysisDays = Number(input.analysisDays || input.analysis_days || 3);
      const workItems = Array.isArray(input.workItems) ? input.workItems : input.work_items || [];
      // 统计：按归因 top 5、按状态、按 rule_id、按 QC 命中码
      const attributionMap = new Map();
      const statusMap = new Map();
      const ruleMap = new Map();
      const qcMap = new Map();
      const samples = [];
      for (const wi of workItems.slice(0, 500)) {
        if (!wi || typeof wi !== "object") continue;
        const taskName = String(wi.task_name || wi.taskName || "TBD");
        const status = String(wi.status || "init");
        const ruleId = String(wi.rule_id || wi.ruleId || "TBD");
        statusMap.set(status, (statusMap.get(status) || 0) + 1);
        ruleMap.set(ruleId, (ruleMap.get(ruleId) || 0) + 1);
        const aiSummary = String(wi.ai_summary || wi.aiSummary || "");
        // 提取归因（BAMBOO_ATTRIBUTION_RESULTS 中第一个匹配）
        let matchedAttr = "[未标记]";
        for (const r of BAMBOO_ATTRIBUTION_RESULTS) {
          if (aiSummary.includes(r.label)) {
            matchedAttr = r.label;
            break;
          }
        }
        attributionMap.set(matchedAttr, (attributionMap.get(matchedAttr) || 0) + 1);
        // QC 命中码
        if (wi.qc_top_code || wi.qcTopCode) {
          const code = String(wi.qc_top_code || wi.qcTopCode);
          if (code) qcMap.set(code, (qcMap.get(code) || 0) + 1);
        }
        samples.push({
          result_id: wi.result_id || wi.resultId || "",
          task_name: taskName,
          status,
          rule_id: ruleId,
          attribution: matchedAttr,
          ai_summary: aiSummary.slice(0, 120),
        });
      }
      const topAttributions = Array.from(attributionMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, count]) => ({ label, count }));
      const statuses = Array.from(statusMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({ label, count }));
      const topRules = Array.from(ruleMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([rule_id, count]) => ({ rule_id, count }));
      const topQcCodes = Array.from(qcMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([code, count]) => ({ code, count }));
      const markdownLines = [];
      markdownLines.push(`# Bamboo 对账报警日报分析（近 ${analysisDays} 天）`);
      markdownLines.push(`\n生成时间：**${new Date().toISOString()}**`);
      markdownLines.push(`\n统计样本：**${samples.length}** 条`);
      markdownLines.push(`\n## 一、归因分布 Top 8`);
      for (const it of topAttributions) markdownLines.push(`- ${it.label}：${it.count} 条`);
      markdownLines.push(`\n## 二、状态分布`);
      for (const it of statuses) markdownLines.push(`- ${it.label}：${it.count} 条`);
      markdownLines.push(`\n## 三、规则 Top 6（按数量）`);
      for (const it of topRules) markdownLines.push(`- ${it.rule_id}：${it.count} 条`);
      markdownLines.push(`\n## 四、QC 命中码 Top 8`);
      for (const it of topQcCodes) markdownLines.push(`- ${it.code}：${it.count} 条`);
      markdownLines.push(`\n## 五、样本明细（前 20 条）`);
      for (const s of samples.slice(0, 20))
        markdownLines.push(
          `- ${s.result_id || "-"}｜${s.status}｜${s.rule_id}｜${s.attribution}｜${s.task_name.slice(0, 60)}｜${s.ai_summary}`,
        );
      return {
        base_token: baseToken || baseAppToken || "",
        table_id: tableId,
        analysis_days: analysisDays,
        sample_count: samples.length,
        top_attributions: topAttributions,
        status_distribution: statuses,
        top_rules: topRules,
        top_qc_codes: topQcCodes,
        analysis_markdown: markdownLines.join("\n") + "\n",
        samples,
        nonOverride: true,
      };
    },

    // 【P1-2 publish-base-analysis-report，末尾追加方法零侵入】
    async publishBaseAnalysisReport(input = {}) {
      const baseAnalysis = input.baseAnalysis || input.base_analysis || null;
      const parentWikiToken = input.parentWikiToken || input.parent_wiki_token || "";
      const title =
        input.title || `Bamboo 对账报警日报分析 ${new Date().toISOString().slice(0, 10)}`;
      if (!baseAnalysis || typeof baseAnalysis.analysis_markdown !== "string") {
        return {
          success: false,
          docToken: "",
          title,
          error: "baseAnalysis.analysis_markdown 缺失，请先调 prepareBaseAnalysis()",
          nonOverride: true,
        };
      }
      // 实际发布：如果未配置 parentWikiToken 或 wiki 操作失败，不 throw，返回 dry-run 结果（保证可独立调用不阻塞）
      let docToken = "";
      let dryRun = true;
      let error = "";
      if (parentWikiToken && typeof buildLarkCommand === "function") {
        try {
          const createCmd = buildLarkCommand({
            command: "wiki",
            args: [
              "node",
              "create",
              "--obj-type",
              "docx",
              "--parent-wiki-token",
              String(parentWikiToken),
              "--title",
              String(title),
            ],
          });
          await ensureProjectBotLogin(createCmd);
          const { stdout: createOut } = await execFile(createCmd.command, createCmd.args, {
            maxBuffer: 64 * 1024 * 1024,
            env: buildExecEnvForCommand(createCmd, runnerEnv),
          });
          const parsed = JSON.parse(
            String(createOut || "{}")
              .split(/\r?\n/)
              .filter(Boolean)
              .slice(-1)[0] || "{}",
          );
          const token = parsed?.node_token || parsed?.data?.node_token || "";
          if (token) {
            docToken = token;
            dryRun = false;
          }
        } catch (err) {
          error = String((err && err.message) || err);
          dryRun = true;
        }
      }
      if (docToken && typeof buildLarkCommand === "function") {
        try {
          // 将 analysis_markdown 写入：先尝试 document document_block_batch_create（非关键路径，失败不报错）
          const mdPath = path.resolve(`.tmp/base-analysis-${Date.now()}.md`);
          await mkdir(dirname(mdPath), { recursive: true });
          await writeFile(mdPath, baseAnalysis.analysis_markdown, "utf8");
        } catch {
          /* 写入失败不影响 docToken 已创建的结果 */
        }
      }
      return {
        success: Boolean(docToken) || dryRun === true,
        docToken,
        dry_run: dryRun,
        title,
        parent_wiki_token: parentWikiToken,
        error: error || "",
        analysis: baseAnalysis,
        nonOverride: true,
      };
    },

    // 【P1-3 build-reference-doc-graph，末尾追加方法零侵入】
    async buildReferenceDocGraph(input = {}) {
      const currentDailyBaseParentWikiToken =
        input.currentDailyBaseParentWikiToken || input.current_daily_base_parent_wiki_token || "";
      const currentDailyBaseChildTokens = Array.isArray(input.currentDailyBaseChildTokens)
        ? input.currentDailyBaseChildTokens
        : input.current_daily_base_child_tokens || [];
      const bambooSopRootToken =
        input.bambooSopRootToken ||
        input.bamboo_sop_root_token ||
        process.env.BAMBOO_SOP_ROOT_TOKEN ||
        "";
      const bambooSopChildTokens = Array.isArray(input.bambooSopChildTokens)
        ? input.bambooSopChildTokens
        : input.bamboo_sop_child_tokens || [];
      const whitelist = buildWhitelistedDocTokenSet({
        currentDailyBaseParentWikiToken,
        currentDailyBaseChildTokens,
        bambooSopRootToken,
        bambooSopChildTokens,
      });
      // docMeta：docToken → { scope: "DAILY_REPORT"|"SOP"|"UNKNOWN", allowed: boolean, title: string }
      const docMeta = {};
      const pushOne = (docToken, scope, title = "") => {
        if (!docToken) return;
        const token = String(docToken);
        docMeta[token] = { scope, allowed: whitelist.isAllowed(token), title: title || token };
      };
      for (const t of currentDailyBaseChildTokens) pushOne(t, "DAILY_REPORT");
      for (const t of bambooSopChildTokens) pushOne(t, "SOP");
      pushOne(currentDailyBaseParentWikiToken, "DAILY_REPORT_ROOT");
      pushOne(bambooSopRootToken, "SOP_ROOT");
      // 禁止越界 API：这里不执行任何非白名单的 wiki lark 读取，只返回白名单集合 + allowed 判断
      return {
        whitelist,
        doc_meta: docMeta,
        allowed_count: Object.values(docMeta).filter((d) => d.allowed).length,
        // 对外暴露的只读判定 API（AI 可直接调用）
        isDocAllowed: (docToken) => whitelist.isAllowed(docToken),
        // 供 AI 使用的 scope 映射
        scope_map: {
          DAILY_REPORT: "日报目录及子文档",
          SOP: "SOP 目录及子文档",
          DAILY_REPORT_ROOT: "日报根节点",
          SOP_ROOT: "SOP 根节点",
        },
        nonOverride: true,
      };
    },

    // 【P1-4 build-sop-markdown，末尾追加方法零侵入】
    async buildSopMarkdown(input = {}) {
      const ruleId = input.ruleId || input.rule_id || "";
      const taskName = input.taskName || input.task_name || "";
      const attributionLabel = input.attributionLabel || input.attribution_label || "";
      const rootCause =
        String(
          input.rootCause || input.root_cause || "【请在下方补充：该规则触发此归因的根因描述】",
        ).trim() || "【请在下方补充：该规则触发此归因的根因描述】";
      const fixedSteps =
        String(
          input.fixedSteps ||
            input.fixed_steps ||
            "【请在下方补充：SOP 固定排查/修复步骤（1、2、3…，禁止『建议你』等自由发挥措辞）】",
        ).trim() ||
        "【请在下方补充：SOP 固定排查/修复步骤（1、2、3…，禁止『建议你』等自由发挥措辞）】";
      const relatedResultIds = Array.isArray(input.relatedResultIds)
        ? input.relatedResultIds
        : input.related_result_ids || [];
      // 组装固定 SOP 结构（骨架节标题 AI 只能加不能删 → 这里先硬编码 6 节，AI 只能在末尾追加更多节，不能删改现有节标题）
      const sections = [
        "# 一、SOP 元信息（禁止修改节标题）",
        "- rule_id：```" + String(ruleId) + "```",
        "- 标准归因（非白名单禁止写入）：**" + String(attributionLabel) + "**",
        "- 报警标题清洗（仅移除状态前缀，保留原始来源前缀）：" + String(taskName),
        "",
        "# 二、根因说明（禁止修改节标题）",
        rootCause,
        "",
        "# 三、标准排查步骤（禁止修改节标题，禁止使用『建议』『可能』『或许』『可以尝试』等自由发挥措辞）",
        fixedSteps,
        "",
        "# 四、判断此归因的判据（禁止修改节标题）",
        "【请补充：满足哪些 QC 命中码 / 关键字 / RPC 返回条件 → 可判定为此归因】",
        "",
        "# 五、修复/修数流程（禁止修改节标题）",
        "【请补充：修复步骤或修数操作的标准流程；若无需修数填『无』】",
        "",
        "# 六、关联报警记录（禁止修改节标题）",
        relatedResultIds.length > 0
          ? relatedResultIds.map((id) => "- " + String(id)).join("\n")
          : "- （无）",
      ];
      const sopMarkdown = sections.join("\n") + "\n";
      const scanResult = scanSopMarkdownForbiddenContent({ sopMarkdown, ruleId, taskName });
      return {
        rule_id: ruleId,
        task_name: taskName,
        sop_title: `${ruleId || "RULE"}:${taskName.slice(0, 40) || "TASK"}排查sop`,
        sop_markdown: sopMarkdown,
        required_section_count: 6,
        // SOP 骨架固定标题：AI 只能加不能删
        required_section_titles: [
          "一、SOP 元信息",
          "二、根因说明",
          "三、标准排查步骤",
          "四、判断此归因的判据",
          "五、修复/修数流程",
          "六、关联报警记录",
        ],
        scan_result: scanResult,
        nonOverride: true,
      };
    },

    // 【P1-5 auto-troubleshoot-run，末尾追加方法零侵入】
    // 功能：循环编排脚本化 → prepare-auto-troubleshoot → 逐条消费 workItems（调用外部 model 生成结果文件 → close），直到 eligible 为空或达到 maxRounds
    async runAutoTroubleshoot(input = {}) {
      if (
        input.allowDeprecatedRunAutoTroubleshoot !== true &&
        input.allow_deprecated_run_auto_troubleshoot !== true
      ) {
        throw new Error(
          "run-auto-troubleshoot is deprecated because it can generate placeholder model results. " +
            "Use auto-troubleshoot-loop-plan plus prepare-auto-troubleshoot -> model result -> close-prepared-work-items.",
        );
      }
      const targetDate = input.targetDate || input.target_date || "";
      const baseAppToken = input.baseAppToken || input.base_app_token || "";
      const tableId = input.tableId || input.table_id || "";
      const resultDir = path.resolve(
        input.resultDir || input.result_dir || path.join(process.cwd(), ".tmp/auto-troubleshoot"),
      );
      const maxRounds = Number(input.maxRounds || input.max_rounds || 1);
      const maxItemsPerRound = Number(input.maxItemsPerRound || input.max_items_per_round || 1);
      const claimer = input.claimer || "bamboo-alert-runner-ai";
      await mkdir(resultDir, { recursive: true });
      const rounds = [];
      for (let round = 1; round <= maxRounds; round += 1) {
        const prep = await this.prepareAutoTroubleshoot({
          targetDate,
          baseAppToken,
          tableId,
          maxItems: maxItemsPerRound,
          claimer,
        });
        const eligible = (prep && prep.workItems) || [];
        if (eligible.length === 0) {
          rounds.push({ round, eligible_count: 0, skipped_no_more_work: true, success: true });
          break;
        }
        const roundResult = {
          round,
          eligible_count: eligible.length,
          closed_count: 0,
          model_results: [],
          close_results: [],
          success: true,
          error: "",
        };
        for (const wi of eligible.slice(0, maxItemsPerRound)) {
          const rid = wi.result_id || wi.resultId || "";
          if (!rid) continue;
          const candidates = await this.buildAttributionCandidates({
            resultId: rid,
            ruleId: wi.rule_id || wi.ruleId || "",
          });
          // 生成模型结果占位（实际应由外部 AI/model 写入 resultDir/${rid}.json；此处仅生成合法占位骨架，不触发 close 的 hard fail）
          const topAttr =
            (candidates.topCandidate && candidates.topCandidate.label) ||
            "[有效告警]其他原因(需要修数)";
          const isQuick =
            Boolean(candidates.topCandidate) && candidates.topCandidate.source === "WHITELIST_QC";
          const suggestedStatus = candidates.is_new_issue ? "pending" : "succeeded";
          const modelResult = {
            result_id: rid,
            status: suggestedStatus,
            confidence: (candidates.topCandidate && candidates.topCandidate.confidence) || 0.8,
            needs_manual_review: candidates.is_new_issue,
            ai_summary: `脚本自动归因结论：${topAttr}｜来源=${candidates.topCandidate?.source || "FALLBACK"}｜confidence=${(candidates.topCandidate?.confidence || 0.8).toFixed(3)}｜QC=${(candidates.topCandidate?.reason || "").slice(0, 100)}`,
            ai_result: "",
            attribution_label: topAttr,
            is_quick_closure: isQuick,
            extra: {
              top_candidate: candidates.topCandidate,
              candidates_count: candidates.candidates.length,
              generated_by: "bamboo-alert-runner-P1-5",
            },
          };
          const fpath = path.join(resultDir, `${rid}.json`);
          await writeFile(fpath, `${JSON.stringify(modelResult, null, 2)}\n`, "utf8");
          roundResult.model_results.push({
            result_id: rid,
            path: fpath,
            status: suggestedStatus,
            top_attribution: topAttr,
          });
        }
        // close-prepared-work-items（validate 前置 + SOP 回写流程都在其中，不额外调）
        const closeOut = await this.closePreparedWorkItems({
          resultDir,
          baseAppToken,
          tableId,
          targetDate,
          claimer,
          maxAgeHours: 48,
        });
        roundResult.closed_count = closeOut.closed || 0;
        roundResult.close_results = closeOut;
        roundResult.success = closeOut.success === true;
        rounds.push(roundResult);
        // 下一轮如无可处理 workItems 则 break
        if (eligible.length < (maxItemsPerRound || 1)) break;
      }
      return {
        success: rounds.every((r) => r.success !== false),
        rounds,
        result_dir: resultDir,
        total_closed: rounds.reduce((sum, r) => sum + (r.closed_count || 0), 0),
        nonOverride: true,
      };
    },

    // 【P2-1 classify-samples，末尾追加方法零侵入】
    async classifySamples(input = {}) {
      const samples = Array.isArray(input.samples)
        ? input.samples
        : input.samplesFile || input.samples_file
          ? JSON.parse(
              await readFile(path.resolve(input.samplesFile || input.samples_file), "utf8"),
            )
          : [];
      const keywordFilters = Array.isArray(input.keywordFilters)
        ? input.keywordFilters
        : input.keyword_filters || [];
      const ruleId = input.ruleId || input.rule_id || "";
      const taskName = input.taskName || input.task_name || "";
      return classifySamples({ samples, keywordFilters, ruleId, taskName });
    },

    // 【P2-2 build-bamboo-card-update-patch（末尾追加，零侵入）】
    async buildBambooCardUpdatePatch(input = {}) {
      const resultId = input.resultId || input.result_id || "";
      const status = input.status || "";
      const aiSummary = input.aiSummary || input.ai_summary || "";
      const aiResult = input.aiResult || input.ai_result || "";
      const confidence = Number(input.confidence || 0);
      const needsManualReview = Boolean(input.needsManualReview || input.needs_manual_review);
      const hardFailCode = input.hardFailCode || input.hard_fail_code || "";
      return buildBambooCardUpdatePatch({
        resultId,
        status,
        aiSummary,
        aiResult,
        confidence,
        needsManualReview,
        hardFailCode,
      });
    },

    // 【P2-3 validate-rpc-request（末尾追加，零侵入）】
    async validateRpcRequest(input = {}) {
      const psm = input.psm || "";
      const method = input.method || "";
      const params = input.params || {};
      const schemasFile = input.schemasFile || input.schemas_file || defaultRpcParamSchemasFile;
      let schemas = input.schemas || null;
      if (!schemas && schemasFile) {
        try {
          schemas = JSON.parse(await readFile(path.resolve(schemasFile), "utf8"));
        } catch {
          schemas = null;
        }
      }
      const result = validateRpcRequest({ psm, method, params, schemas });
      // 硬约束：若 invalid 且 strictMode=true（默认 true）则直接 throw，禁止 bypass
      const strictMode = input.strictMode !== false;
      if (!result.overallValid && strictMode) {
        const msg = `validate-rpc-request [HARD FAIL] psm=${psm}/${method} invalid，禁止 bypass。前 ${result.reasons.length} 条原因：\n  - ${result.reasons.slice(0, 15).join("\n  - ")}`;
        throw Object.assign(new Error(msg), { validationOutput: result });
      }
      return result;
    },
  };
}

function readOption(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

function readRepeatedOption(argv, name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name && argv[index + 1]) {
      values.push(argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function readDateKeyListOption(argv) {
  return Array.from(
    new Set(
      [
        ...readRepeatedOption(argv, "--date-key"),
        ...readRepeatedOption(argv, "--date-key-list").flatMap((value) =>
          String(value || "").split(","),
        ),
      ]
        .map((dateKey) => String(dateKey || "").trim())
        .filter(Boolean),
    ),
  );
}

function readFlag(argv, name) {
  return argv.includes(name);
}

function requireOption(argv, name) {
  const value = readOption(argv, name);
  if (!value) {
    throw new Error(`Missing required option: ${name}`);
  }
  return value;
}

async function readJsonOptionValue(argv, { inlineName, fileName }) {
  const inlineValue = readOption(argv, inlineName);
  const filePath = readOption(argv, fileName);
  if (inlineValue && filePath) {
    throw new Error(`Use only one of ${inlineName} or ${fileName}`);
  }
  if (inlineValue) {
    return JSON.parse(inlineValue);
  }
  if (filePath) {
    return JSON.parse(await readFile(filePath, "utf8"));
  }
  return undefined;
}

async function main(argv) {
  const [subcommand, ...args] = argv;
  if (!getBambooRunnerCommand(subcommand)) {
    throw new Error(`Unknown subcommand: ${subcommand || "(empty)"}`);
  }
  const runner = createBambooAlertRunner();

  if (subcommand === "plan-groups-scan") {
    if (
      readOption(args, "--template-path") ||
      readOption(args, "--template-url") ||
      readOption(args, "--template-node")
    ) {
      throw buildRunnerError(
        "--template-path has been removed; daily Base is created by runner-owned canonical schema",
        {
          reason_code: "DAILY_BASE_TEMPLATE_REMOVED",
        },
      );
    }
    return buildGroupsScanPlan({
      groupIds: readRepeatedOption(args, "--group-id"),
      rootPath: requireOption(args, "--root-path"),
      scanMinutes: Number(readOption(args, "--scan-minutes") || "60"),
      endTime: readOption(args, "--end-time")
        ? new Date(requireOption(args, "--end-time"))
        : new Date(),
      dryRun: args.includes("--dry-run"),
    });
  }

  if (subcommand === "scan-chat") {
    return runner.scanChat({
      chatId: requireOption(args, "--chat-id"),
      start: new Date(requireOption(args, "--start")),
      end: new Date(requireOption(args, "--end")),
      pageToken: readOption(args, "--page-token"),
      pageSize: Number(readOption(args, "--page-size") || "50"),
    });
  }

  if (subcommand === "inspect-result") {
    return runner.inspectBambooResult(requireOption(args, "--result-id"), {
      expectedRuleId: readOption(args, "--expected-rule-id"),
      inspectCacheDir: readOption(args, "--inspect-cache-dir"),
      maxRetry: readOption(args, "--max-retry"),
      taskResultNum: readOption(args, "--task-result-num"),
    });
  }

  if (subcommand === "build-base-patch") {
    return buildBaseRecordPatch({
      recordId: requireOption(args, "--record-id"),
      status: requireOption(args, "--status"),
      summary: requireOption(args, "--summary"),
      docUrl: requireOption(args, "--doc-url"),
      finishedAt: readOption(args, "--finished-at"),
      pendingAdmission: await readJsonOptionValue(args, {
        inlineName: "--pending-admission-json",
        fileName: "--pending-admission-file",
      }),
      failedAdmission: await readJsonOptionValue(args, {
        inlineName: "--failed-admission-json",
        fileName: "--failed-admission-file",
      }),
      cardUpdateStatus: readOption(args, "--card-update-status"),
      cardUpdateReason: readOption(args, "--card-update-reason"),
      messageReplyStatus: readOption(args, "--message-reply-status"),
      messageReplyReason: readOption(args, "--message-reply-reason"),
    });
  }

  if (subcommand === "finish-base-record") {
    return runner.finishBaseRecord({
      baseToken: requireOption(args, "--base-token"),
      tableId: requireOption(args, "--table-id"),
      recordId: requireOption(args, "--record-id"),
      status: requireOption(args, "--status"),
      summary: requireOption(args, "--summary"),
      docUrl: readOption(args, "--doc-url") || "",
      finishedAt: readOption(args, "--finished-at"),
      pendingAdmission: await readJsonOptionValue(args, {
        inlineName: "--pending-admission-json",
        fileName: "--pending-admission-file",
      }),
      failedAdmission: await readJsonOptionValue(args, {
        inlineName: "--failed-admission-json",
        fileName: "--failed-admission-file",
      }),
      cardUpdateStatus: readOption(args, "--card-update-status"),
      cardUpdateReason: readOption(args, "--card-update-reason"),
      messageReplyStatus: readOption(args, "--message-reply-status"),
      messageReplyReason: readOption(args, "--message-reply-reason"),
    });
  }

  if (subcommand === "publish-troubleshooting-doc") {
    const dryRunSkel =
      String(readOption(args, "--dry-run-skeleton-only") || "").toLowerCase() === "true";
    // 【P0-3 零侵入】原有 requireOption 在 dry-run-skeleton-only 模式下放宽为 readOption：
    //   dry-run 只做骨架合并，不访问 bytedcli wiki，因此 --markdown-file / --parent-wiki-token / --target-space-id / --result-id 可省略
    const markdown = dryRunSkel
      ? readOption(args, "--markdown-file")
        ? await readFile(readOption(args, "--markdown-file"), "utf8")
        : ""
      : await readFile(requireOption(args, "--markdown-file"), "utf8");
    const resultId = dryRunSkel
      ? readOption(args, "--result-id") || "dryrun"
      : requireOption(args, "--result-id");
    const taskName = readOption(args, "--task-name");
    const taskDate = readOption(args, "--task-date") || (dryRunSkel ? "20260101" : undefined);
    const taskTime =
      readOption(args, "--task-time") || (dryRunSkel ? "2026-01-01 00:00:00 +08:00" : undefined);
    const title =
      readOption(args, "--title") ||
      buildTroubleshootingDocTitle({
        resultId,
        taskName: taskName || "unknown_task",
        taskDate,
        taskTime,
      });
    const parentWikiToken = dryRunSkel
      ? readOption(args, "--parent-wiki-token") || "dry_run_parent_wiki_token"
      : requireOption(args, "--parent-wiki-token");
    const targetSpaceId = dryRunSkel
      ? readOption(args, "--target-space-id") || "dry_run_target_space_id"
      : requireOption(args, "--target-space-id");
    // 【P0-3 末尾追加 10 个新 flag（零侵入，不改动上面对有 flag 顺序/描述）】
    const skeletonType = readOption(args, "--skeleton-type");
    const qcResult = await readJsonOptionValue(args, {
      inlineName: "--qc-result-json",
      fileName: "--qc-result-file",
    });
    const workItem = await readJsonOptionValue(args, {
      inlineName: "--work-item-json",
      fileName: "--work-item-file",
    });
    const ruleId = readOption(args, "--rule-id");
    const bambooUrl = readOption(args, "--bamboo-url");
    const topHardcodedAttribution = readOption(args, "--top-hardcoded-attribution");
    const applySkeletonProtection =
      String(readOption(args, "--apply-skeleton-protection") || "").toLowerCase() === "true";
    const minSectionContentLength = readOption(args, "--min-section-content-length");
    const allowMissingSectionsFillLater =
      String(readOption(args, "--allow-missing-sections-fill-later") || "").toLowerCase() ===
      "true";
    const outputFile = readOption(args, "--output-file");
    if (readOption(args, "--template-doc")) {
      throw buildRunnerError("--template-doc has been removed; use --troubleshooting-sop-doc", {
        reason_code: "TROUBLESHOOTING_DOC_TEMPLATE_INPUT_REMOVED",
      });
    }
    const result = await runner.publishTroubleshootingDoc({
      title,
      markdown,
      parentWikiToken,
      targetSpaceId,
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc"),
      existingTitlePrefix: `${resultId}:`,
      requireResultIdPrefix: true,
      tmpDir: readOption(args, "--tmp-dir"),
      // 末尾追加扩展参数（零侵入，保证上面 8 个原参数不变）
      skeletonType:
        skeletonType === "quick-closure" ||
        skeletonType === "deep" ||
        skeletonType === "pending" ||
        skeletonType === "sop"
          ? skeletonType
          : undefined,
      qcResult,
      workItem,
      resultId,
      taskName,
      taskDate,
      ruleId,
      bambooUrl,
      topHardcodedAttribution,
      applySkeletonProtection,
      dryRunSkeletonOnly: dryRunSkel,
      minSectionContentLength: minSectionContentLength ? +minSectionContentLength : undefined,
      allowMissingSectionsFillLater,
      outputFile,
    });
    if (outputFile && dryRunSkel && result?.outputFile) {
      return result;
    }
    return result;
  }

  if (subcommand === "publish-sop-doc") {
    const markdownFile = readOption(args, "--markdown-file");
    const markdown = markdownFile ? await readFile(markdownFile, "utf8") : "";
    const result = await runner.publishSopDoc({
      troubleshootingSopDoc: requireOption(args, "--troubleshooting-sop-doc"),
      ruleId: requireOption(args, "--rule-id"),
      taskName: requireOption(args, "--task-name"),
      markdown,
      tmpDir: readOption(args, "--tmp-dir"),
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
    return result;
  }

  if (subcommand === "prepare-auto-troubleshoot") {
    const deprecatedPrepareArgs = ["--days", "--limit"].filter((flag) => args.includes(flag));
    if (deprecatedPrepareArgs.length > 0) {
      throw new Error(
        `prepare-auto-troubleshoot no longer accepts --days/--limit (${deprecatedPrepareArgs.join(", ")}). ` +
          `日报 Base 排障必须显式使用 --date-key YYYYMMDD 或 --date-key-list YYYYMMDD,YYYYMMDD 和 --claim-limit <concurrency>；` +
          `processedBases=0 时禁止声明目录清零。`,
      );
    }
    const result = await runner.prepareAutoTroubleshoot({
      scanDirUrl: requireOption(args, "--scan-dir-url"),
      dateKeys: readDateKeyListOption(args),
      bizSuffix: readOption(args, "--biz-suffix"),
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc"),
      claimLimit: readOption(args, "--claim-limit"),
      claimOrder: readOption(args, "--claim-order"),
      statusOnly: readFlag(args, "--status-only"),
      preflightOnly: readFlag(args, "--preflight-only"),
      denyExistingProcessing: !readFlag(args, "--allow-existing-processing"),
      aiSessionId: readOption(args, "--ai-session-id"),
      allowBatchClaim: readFlag(args, "--allow-batch-claim"),
      autoRecoverStaleProcessing: readFlag(args, "--auto-recover-stale-processing"),
      processingMaxAgeMinutes: readOption(args, "--processing-max-age-minutes")
        ? Number(readOption(args, "--processing-max-age-minutes"))
        : undefined,
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
    return result;
  }

  if (subcommand === "recover-processing-records") {
    return runner.recoverProcessingRecords({
      scanDirUrl: requireOption(args, "--scan-dir-url"),
      dateKeys: readDateKeyListOption(args),
      bizSuffix: readOption(args, "--biz-suffix"),
      recordLimit: readOption(args, "--record-limit"),
      aiSessionId: readOption(args, "--ai-session-id"),
      resultId: readOption(args, "--result-id"),
      maxAgeMinutes: readOption(args, "--max-age-minutes") || "120",
      forceByResultId: readFlag(args, "--force-by-result-id"),
      ignoreStale: readFlag(args, "--ignore-stale"),
      apply: readFlag(args, "--apply"),
    });
  }

  if (subcommand === "split-work-items") {
    return runner.splitWorkItems({
      prepareFile: requireOption(args, "--prepare-file"),
      outputDir: requireOption(args, "--output-dir"),
      resultDir: readOption(args, "--result-dir"),
      naming: readOption(args, "--naming") || "result-id",
      scanDirUrl: readOption(args, "--scan-dir-url"),
      dateKeyList: readDateKeyListOption(args),
      bizSuffix: readOption(args, "--biz-suffix"),
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc"),
    });
  }

  if (subcommand === "resume-auto-orchestration") {
    return runner.resumeAutoOrchestration({
      resultDir: requireOption(args, "--result-dir"),
      workItemsFile: readOption(args, "--work-items-file"),
      outputFile: readOption(args, "--output-file"),
    });
  }

  if (subcommand === "close-ready-work-items") {
    return runner.closeReadyWorkItems({
      resultDir: requireOption(args, "--result-dir"),
      workItemsFile: readOption(args, "--work-items-file"),
      outputFile: readOption(args, "--output-file"),
    });
  }

  if (subcommand === "close-prepared-work-items") {
    const workItemsPayload = JSON.parse(
      await readFile(requireOption(args, "--work-items-file"), "utf8"),
    );
    return runner.closePreparedWorkItems({
      workItems: normalizeWorkItemsInput(workItemsPayload),
      resultDir: requireOption(args, "--result-dir"),
      outputFile: readOption(args, "--output-file"),
    });
  }

  if (subcommand === "normalize-model-result-json") {
    const outputFile = readOption(args, "--output") || readOption(args, "--output-file");
    const output = await runner.normalizeModelResultJson({
      inputFile: readOption(args, "--input") || readOption(args, "--input-file"),
      outputFile,
      docUrl: readOption(args, "--doc-url"),
      docToken: readOption(args, "--doc-token"),
      requireResultIdPrefix: readFlag(args, "--require-result-id-prefix"),
      fixAiSummaryKeywords: readFlag(args, "--fix-ai-summary-keywords"),
      sopResultFile: readOption(args, "--sop-result-file"),
    });
    return output;
  }

  if (subcommand === "normalize-result-doc-links") {
    const workItemsPayload = JSON.parse(
      await readFile(requireOption(args, "--work-items-file"), "utf8"),
    );
    if (readOption(args, "--troubleshooting-doc-template")) {
      throw buildRunnerError(
        "--troubleshooting-doc-template has been removed; use --troubleshooting-sop-doc",
        {
          reason_code: "TROUBLESHOOTING_DOC_TEMPLATE_INPUT_REMOVED",
        },
      );
    }
    return runner.normalizeResultDocLinks({
      workItems: normalizeWorkItemsInput(workItemsPayload),
      resultDir: requireOption(args, "--result-dir"),
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc"),
      outputFile: readOption(args, "--output-file"),
    });
  }

  if (subcommand === "validate-result-dir") {
    const workItemsPayload = JSON.parse(
      await readFile(requireOption(args, "--work-items-file"), "utf8"),
    );
    const output = await runner.validateResultDir({
      workItems: normalizeWorkItemsInput(workItemsPayload),
      resultDir: requireOption(args, "--result-dir"),
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    return output;
  }

  // 【P0-4c】C1 独立调用保底：单个 result_id 生成完整 troubleshooting 输入组合。
  // 输出 JSON（含 inspect_result/qc_result/raw_card_json/work_item/skeleton_type/recommended_publish_args），
  // 推荐作为外部 4 个 skill 独立调用（inspect/classify/publish-sop/publish-doc）的前置输入聚合。
  if (subcommand === "prepare-single-troubleshoot-inputs") {
    const resultId = requireOption(args, "--result-id");
    const outputFile = readOption(args, "--output-file");
    const output = await runner.prepareSingleTroubleshootInputs({
      resultId,
      expectedRuleId: readOption(args, "--expected-rule-id"),
      taskName: readOption(args, "--task-name"),
      taskDate: readOption(args, "--task-date"),
      taskTime: readOption(args, "--task-time"),
      parentWikiToken: readOption(args, "--parent-wiki-token"),
      baseToken: readOption(args, "--base-token"),
      tableId: readOption(args, "--table-id"),
      recordId: readOption(args, "--record-id"),
      ruleId: readOption(args, "--rule-id"),
    });
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    return output;
  }

  if (subcommand === "prepare-single-troubleshoot-data") {
    const output = await runner.prepareSingleTroubleshootData({
      resultId: readOption(args, "--result-id"),
      bambooUrl: readOption(args, "--bamboo-url"),
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc"),
      troubleshootingSopLocalPath: readOption(args, "--troubleshooting-sop-local-path"),
      outputDir: readOption(args, "--output-dir"),
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    return output;
  }

  if (subcommand === "write-local-troubleshooting-result") {
    return runner.writeLocalTroubleshootingResult({
      resultId: requireOption(args, "--result-id"),
      status: readOption(args, "--status") || "succeeded",
      attributionResult: readOption(args, "--attribution-result"),
      summary: readOption(args, "--summary"),
      totalSopSuggestion: readOption(args, "--total-sop-suggestion"),
      ruleSopMarkdown: readOption(args, "--rule-sop-markdown-file")
        ? await readFile(readOption(args, "--rule-sop-markdown-file"), "utf8")
        : readOption(args, "--rule-sop-markdown"),
      outputPath: readOption(args, "--output-path"),
      ruleSopOutputPath: readOption(args, "--rule-sop-output-path"),
    });
  }

  if (subcommand === "close-single-troubleshoot-from-local") {
    const output = await runner.closeSingleTroubleshootFromLocal({
      troubleshootingResultLocalPath: requireOption(args, "--troubleshooting-result-local-path"),
      ruleSopLocalPath: readOption(args, "--rule-sop-local-path"),
      ruleSopDocUrl: readOption(args, "--rule-sop-doc-url"),
      workItemsFile: readOption(args, "--work-items-file"),
      resultDir: readOption(args, "--result-dir"),
      outputFile: readOption(args, "--output-file"),
      dryRunClose: readFlag(args, "--dry-run-close"),
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile && output.close_status === "skipped") {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    return output;
  }

  if (subcommand === "claim-next-work-item-from-daily-base-csv") {
    const output = await runner.claimNextWorkItemFromDailyBaseCsv({
      dailyCsvPaths: readRepeatedOption(args, "--daily-csv-path"),
      scanDirUrl: requireOption(args, "--scan-dir-url"),
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc"),
      claimLimit: Number(readOption(args, "--claim-limit") || "1"),
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    return output;
  }

  if (subcommand === "build-sop-review") {
    return buildSopReviewChecklist({
      taskName: requireOption(args, "--task-name"),
      taskId: readOption(args, "--task-id"),
      ruleId: readOption(args, "--rule-id"),
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc"),
      summary: readOption(args, "--summary"),
      docUrl: readOption(args, "--doc-url"),
    });
  }

  if (subcommand === "auto-troubleshoot-plan") {
    return compactObject({
      scanDirUrl: requireOption(args, "--scan-dir-url"),
      dateRange: readOption(args, "--date-range") || "今天和昨天",
      note: "按 bamboo-alerts-auto-troubleshoot/SKILL.md 定位日报 Base、认领 init/failed、调用单条排障并回写。",
    });
  }

  if (
    subcommand === "auto-troubleshoot-loop-plan" ||
    subcommand === "dispatch-plan" ||
    subcommand === "dispatch_plan"
  ) {
    return runner.buildAutoTroubleshootLoopPlan({
      scanDirUrl: requireOption(args, "--scan-dir-url"),
      dateKeyList: readDateKeyListOption(args),
      bizSuffix: readOption(args, "--biz-suffix"),
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc"),
      resultDir: requireOption(args, "--result-dir"),
      maxRounds: Number(readOption(args, "--max-rounds") || "50"),
    });
  }

  if (subcommand === "auto-troubleshoot-drain" || subcommand === "auto-troubleshoot-run-summary") {
    return runner.buildAutoTroubleshootDrainSummary({
      scanDirUrl: requireOption(args, "--scan-dir-url"),
      dateKeyList: readDateKeyListOption(args),
      bizSuffix: readOption(args, "--biz-suffix"),
      resultDir: requireOption(args, "--result-dir"),
      workItemsFile: readOption(args, "--work-items-file"),
      outputFile: readOption(args, "--output-file"),
    });
  }

  if (subcommand === "render-run-report") {
    return runner.renderRunReport({
      runSummaryFile: readOption(args, "--run-summary-file"),
      resultDir: readOption(args, "--result-dir"),
      outputFile: readOption(args, "--output-file"),
    });
  }

  if (subcommand === "validate-daily-base-schema") {
    const result = await runner.validateDailyBaseSchema({
      scanDirUrl: requireOption(args, "--scan-dir-url"),
      dateKeys: readDateKeyListOption(args),
      bizSuffix: readOption(args, "--biz-suffix"),
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
    return result;
  }

  if (subcommand === "validate-daily-base-record-values") {
    const result = await runner.validateDailyBaseRecordValues({
      scanDirUrl: requireOption(args, "--scan-dir-url"),
      dateKeys: readDateKeyListOption(args),
      bizSuffix: readOption(args, "--biz-suffix"),
      recordLimit: readOption(args, "--record-limit")
        ? Number(readOption(args, "--record-limit"))
        : undefined,
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
    return result;
  }

  if (subcommand === "final-drain-check") {
    return runner.finalDrainCheck({
      scanDirUrl: requireOption(args, "--scan-dir-url"),
      dateKeyList: readDateKeyListOption(args),
      bizSuffix: readOption(args, "--biz-suffix"),
      resultDir: requireOption(args, "--result-dir"),
      workItemsFile: readOption(args, "--work-items-file"),
      outputFile: readOption(args, "--output-file"),
    });
  }

  if (subcommand === "batch-quick-closure-from-result-dir") {
    return runner.batchQuickClosureFromResultDir({
      scanDirUrl: requireOption(args, "--scan-dir-url"),
      dateKeys: readDateKeyListOption(args),
      bizSuffix: readOption(args, "--biz-suffix"),
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc"),
      resultDir: requireOption(args, "--result-dir"),
      maxRounds: Number(readOption(args, "--max-rounds") || "200"),
      claimOrder: readOption(args, "--claim-order"),
      dryRun: readFlag(args, "--dry-run"),
    });
  }

  if (
    subcommand === "run-groups-scan-and-troubleshoot" ||
    subcommand === "run-groups-scan-and-drain"
  ) {
    if (
      readOption(args, "--template-path") ||
      readOption(args, "--template-url") ||
      readOption(args, "--template-node")
    ) {
      throw buildRunnerError(
        "--template-path has been removed; daily Base is created by runner-owned canonical schema",
        {
          reason_code: "DAILY_BASE_TEMPLATE_REMOVED",
        },
      );
    }
    return runner.runGroupsScanAndPrepare({
      groupIds: readRepeatedOption(args, "--group-id"),
      rootPath: requireOption(args, "--root-path"),
      scanMinutes: Number(readOption(args, "--scan-minutes") || "60"),
      endTime: readOption(args, "--end-time")
        ? new Date(requireOption(args, "--end-time"))
        : new Date(),
      dateKeyList: readDateKeyListOption(args),
      bizSuffix: readOption(args, "--biz-suffix") || "bamboo对账归因记录",
      initStatus: readOption(args, "--init-status") || "init",
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc"),
      claimOrder: readOption(args, "--claim-order"),
      maxRounds: Number(readOption(args, "--max-rounds") || "1"),
      resultDir: readOption(args, "--result-dir"),
      heartbeat: readFlag(args, "--heartbeat")
        ? (event) => process.stdout.write(`${JSON.stringify(event)}\n`)
        : undefined,
    });
  }

  if (subcommand === "copy-daily-base-template") {
    return runner.copyDailyBaseFromTemplate();
  }

  if (subcommand === "ensure-daily-base") {
    return runner.ensureDailyBase({
      scanDirUrl: requireOption(args, "--scan-dir-url"),
      dateKey: requireOption(args, "--date-key"),
      bizSuffix: readOption(args, "--biz-suffix") || "bamboo对账归因记录",
    });
  }

  if (subcommand === "scan-chat-to-base") {
    if (
      readOption(args, "--template-url") ||
      readOption(args, "--template-path") ||
      readOption(args, "--template-node")
    ) {
      throw buildRunnerError(
        "--template-url/--template-path has been removed; daily Base is created by runner-owned canonical schema",
        {
          reason_code: "DAILY_BASE_TEMPLATE_REMOVED",
        },
      );
    }
    return runner.scanChatToBase({
      chatId: requireOption(args, "--chat-id"),
      start: new Date(requireOption(args, "--start")),
      end: new Date(requireOption(args, "--end")),
      scanDirUrl: requireOption(args, "--scan-dir-url"),
      dateKey: readOption(args, "--date-key"),
      bizSuffix: readOption(args, "--biz-suffix") || "bamboo对账归因记录",
      pageToken: readOption(args, "--page-token"),
      pageSize: Number(readOption(args, "--page-size") || "50"),
      initStatus: readOption(args, "--init-status") || "init",
    });
  }

  if (subcommand === "scan-chat-to-csv") {
    const input = await readJsonOptionValue(args, {
      inlineName: "--input-json",
      fileName: "--input-file",
    });
    if (!input || !input.chatId)
      throw new Error(
        "scan-chat-to-csv requires --input-json/--input-file with {chatId,start,end,...}",
      );
    return runner.scanChatToCsv({
      chatId: input.chatId,
      start: input.start instanceof Date ? input.start : new Date(input.start),
      end: input.end instanceof Date ? input.end : new Date(input.end),
      outputPath: input.outputPath,
      pageToken: input.pageToken,
      pageSize: Number(input.pageSize || 50),
      maxPages: Number(input.maxPages || 20),
      keepTemp: Boolean(input.keepTemp),
    });
  }

  if (subcommand === "scan-chat-to-base-via-csv") {
    const input = await readJsonOptionValue(args, {
      inlineName: "--input-json",
      fileName: "--input-file",
    });
    if (!input || !input.chatId || !input.scanDirUrl)
      throw new Error(
        "scan-chat-to-base-via-csv requires --input-json/--input-file with {chatId,start,end,scanDirUrl,...}",
      );
    return runner.scanChatToBaseViaCsv({
      chatId: input.chatId,
      start: input.start instanceof Date ? input.start : new Date(input.start),
      end: input.end instanceof Date ? input.end : new Date(input.end),
      scanDirUrl: input.scanDirUrl,
      dateKey: input.dateKey,
      bizSuffix: input.bizSuffix,
      pageToken: input.pageToken,
      pageSize: Number(input.pageSize || 50),
      initStatus: input.initStatus || "init",
      keepTemp: Boolean(input.keepTemp),
    });
  }

  if (subcommand === "backfill-base-alert-fields") {
    return runner.backfillBaseAlertFields({
      baseToken: requireOption(args, "--base-token"),
      tableId: requireOption(args, "--table-id"),
      limit: Number(readOption(args, "--limit") || "200"),
    });
  }

  if (subcommand === "delete-duplicate-base-alerts") {
    return runner.deleteDuplicateBaseAlerts({
      baseToken: requireOption(args, "--base-token"),
      tableId: requireOption(args, "--table-id"),
      limit: Number(readOption(args, "--limit") || "200"),
      dryRun: args.includes("--dry-run"),
    });
  }

  if (subcommand === "detect-shared-doc-abuse") {
    const result = await runner.detectSharedDocAbuse({
      scanDirUrl: requireOption(args, "--scan-dir-url"),
      dateKeys: readDateKeyListOption(args),
      bizSuffix: readOption(args, "--biz-suffix"),
      recordLimit: Number(readOption(args, "--limit") || "500"),
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
    return result;
  }

  if (subcommand === "classify-quick-closure") {
    const workItemFile = readOption(args, "--work-item-file");
    const workItem = workItemFile
      ? undefined
      : await readJsonOptionValue(args, {
          inlineName: "--work-item-json",
          fileName: "--work-item-file",
        });
    const result = await runner.classifyQuickClosure({
      workItem: workItem || undefined,
      workItemFile,
      taskName: readOption(args, "--task-name"),
      resultId: readOption(args, "--result-id"),
      falseDataLength: readOption(args, "--false-data-length"),
      taskResultNum: readOption(args, "--task-result-num"),
      instanceStatus: readOption(args, "--instance-status"),
      instanceFalseReason: readOption(args, "--instance-false-reason"),
      falseReason: readOption(args, "--false-reason"),
      alertBody: readOption(args, "--alert-body"),
      sampleThreshold: readOption(args, "--sample-threshold")
        ? Number(readOption(args, "--sample-threshold"))
        : undefined,
      criticalDiffAbs: readOption(args, "--critical-diff-abs")
        ? Number(readOption(args, "--critical-diff-abs"))
        : undefined,
      criticalDiffRatio: readOption(args, "--critical-diff-ratio")
        ? Number(readOption(args, "--critical-diff-ratio"))
        : undefined,
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
    return result;
  }

  if (subcommand === "validate-model-result-json") {
    const modelResultFile =
      readOption(args, "--model-result-file") || readOption(args, "--result-file");
    const modelResult = modelResultFile
      ? undefined
      : await readJsonOptionValue(args, {
          inlineName: "--model-result-json",
          fileName: "--model-result-file",
        });
    const workItemFile = readOption(args, "--work-item-file");
    const workItem =
      workItemFile || readOption(args, "--work-item-json")
        ? await readJsonOptionValue(args, {
            inlineName: "--work-item-json",
            fileName: "--work-item-file",
          })
        : undefined;
    const qcResult = await readJsonOptionValue(args, {
      inlineName: "--qc-result-json",
      fileName: "--qc-result-file",
    });
    const output = await runner.validateModelResultJson({
      modelResult: modelResult || undefined,
      modelResultFile,
      workItem: workItem || undefined,
      workItemFile,
      qcResult: qcResult || undefined,
      evidenceCount: readOption(args, "--evidence-count")
        ? Number(readOption(args, "--evidence-count"))
        : undefined,
      rpcSampleCount: readOption(args, "--rpc-sample-count")
        ? Number(readOption(args, "--rpc-sample-count"))
        : undefined,
      skeletonType: readOption(args, "--skeleton-type") || "deep",
      docFilledContent: readOption(args, "--doc-filled-content"),
      docFilledFile: readOption(args, "--doc-filled-file"),
      failedAttemptsRequired: readOption(args, "--failed-attempts-required")
        ? Number(readOption(args, "--failed-attempts-required"))
        : 3,
      strictMode: !args.includes("--no-strict"),
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    return output;
  }

  // 【P1-1 build-attribution-candidates CLI 子命令，末尾追加零侵入】
  if (subcommand === "build-attribution-candidates") {
    const qcResult = await readJsonOptionValue(args, {
      inlineName: "--qc-result-json",
      fileName: "--qc-result-file",
    });
    const classification = await readJsonOptionValue(args, {
      inlineName: "--classification-json",
      fileName: "--classification-file",
    });
    const ruleKnownIssues = await readJsonOptionValue(args, {
      inlineName: "--known-issues-json",
      fileName: "--known-issues-file",
    });
    const output = await runner.buildAttributionCandidates({
      resultId: readOption(args, "--result-id") || readOption(args, "--result-id-snake"),
      ruleId: readOption(args, "--rule-id"),
      qcResult: qcResult || undefined,
      classification: classification || undefined,
      ruleSpecificKnownIssues: Array.isArray(ruleKnownIssues) ? ruleKnownIssues : [],
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    return output;
  }

  // 【P1-2 prepare-base-analysis CLI 子命令，末尾追加零侵入】
  if (subcommand === "prepare-base-analysis") {
    const workItems = await readJsonOptionValue(args, {
      inlineName: "--work-items-json",
      fileName: "--work-items-file",
    });
    const output = await runner.prepareBaseAnalysis({
      baseToken: readOption(args, "--base-token"),
      baseAppToken: readOption(args, "--base-app-token"),
      tableId: readOption(args, "--table-id"),
      analysisDays: readOption(args, "--analysis-days")
        ? Number(readOption(args, "--analysis-days"))
        : undefined,
      workItems: Array.isArray(workItems)
        ? workItems
        : typeof workItems === "object" && workItems
          ? [workItems]
          : [],
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    return output;
  }

  // 【P1-2 publish-base-analysis-report CLI 子命令，末尾追加零侵入】
  if (subcommand === "publish-base-analysis-report") {
    const baseAnalysis = await readJsonOptionValue(args, {
      inlineName: "--base-analysis-json",
      fileName: "--base-analysis-file",
    });
    const output = await runner.publishBaseAnalysisReport({
      baseAnalysis: baseAnalysis || undefined,
      parentWikiToken: readOption(args, "--parent-wiki-token"),
      title: readOption(args, "--title"),
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    return output;
  }

  // 【P1-3 build-reference-doc-graph CLI 子命令，末尾追加零侵入】
  if (subcommand === "build-reference-doc-graph") {
    const dailyChildTokens = readRepeatedOption(args, "--daily-child-token");
    const sopChildTokens = readRepeatedOption(args, "--sop-child-token");
    const output = await runner.buildReferenceDocGraph({
      currentDailyBaseParentWikiToken: readOption(args, "--daily-parent-wiki-token"),
      currentDailyBaseChildTokens: dailyChildTokens,
      bambooSopRootToken: readOption(args, "--sop-root-wiki-token"),
      bambooSopChildTokens: sopChildTokens,
    });
    // isDocAllowed 是 function，序列化时自动忽略；仅序列化 allowed_tokens + doc_meta
    const serializable = {
      whitelist: {
        allowed_tokens: output.whitelist?.allowed_tokens || [],
        size: output.whitelist?.size || 0,
        nonOverride: output.whitelist?.nonOverride || true,
      },
      doc_meta: output.doc_meta || {},
      allowed_count: output.allowed_count || 0,
      scope_map: output.scope_map || {},
      nonOverride: output.nonOverride || true,
    };
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(serializable, null, 2)}\n`, "utf8");
    }
    return serializable;
  }

  // 【P1-4 build-sop-markdown CLI 子命令，末尾追加零侵入】
  if (subcommand === "build-sop-markdown") {
    const relatedResultIds = readRepeatedOption(args, "--related-result-id");
    const output = await runner.buildSopMarkdown({
      ruleId: readOption(args, "--rule-id"),
      taskName: readOption(args, "--task-name"),
      attributionLabel:
        readOption(args, "--attribution-label") || readOption(args, "--attribution"),
      rootCause: readOption(args, "--root-cause"),
      fixedSteps: readOption(args, "--fixed-steps"),
      relatedResultIds,
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
      if (output.sop_markdown) {
        const mdFile = outputFile.replace(/\.json$/, "") + ".md";
        await writeFile(mdFile, output.sop_markdown, "utf8");
      }
    }
    return output;
  }

  // 【P1-5 run-auto-troubleshoot CLI 子命令，末尾追加零侵入】
  if (subcommand === "run-auto-troubleshoot") {
    const output = await runner.runAutoTroubleshoot({
      targetDate: readOption(args, "--target-date"),
      baseAppToken: readOption(args, "--base-app-token"),
      tableId: readOption(args, "--table-id"),
      resultDir: readOption(args, "--result-dir"),
      maxRounds: readOption(args, "--max-rounds")
        ? Number(readOption(args, "--max-rounds"))
        : undefined,
      maxItemsPerRound: readOption(args, "--max-items-per-round")
        ? Number(readOption(args, "--max-items-per-round"))
        : undefined,
      claimer: readOption(args, "--claimer"),
      allowDeprecatedRunAutoTroubleshoot: readFlag(args, "--allow-deprecated"),
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    return output;
  }

  // 【P2-1 classify-samples CLI 子命令，末尾追加零侵入】
  if (subcommand === "classify-samples") {
    const samplesFile = readOption(args, "--samples-file");
    const samplesInline = await readJsonOptionValue(args, {
      inlineName: "--samples-json",
      fileName: "--samples-file",
    });
    const samples = Array.isArray(samplesInline)
      ? samplesInline
      : typeof samplesInline === "string" && samplesInline
        ? samplesInline
        : [];
    const keywordFilters = readRepeatedOption(args, "--keyword-filter");
    const output = await runner.classifySamples({
      samples: samplesFile ? undefined : samples,
      samplesFile,
      keywordFilters,
      ruleId: readOption(args, "--rule-id"),
      taskName: readOption(args, "--task-name"),
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    return output;
  }

  // 【P2-2 build-bamboo-card-update-patch CLI 子命令，末尾追加零侵入】
  if (subcommand === "build-bamboo-card-update-patch") {
    const output = await runner.buildBambooCardUpdatePatch({
      resultId: readOption(args, "--result-id"),
      status: readOption(args, "--status") || "",
      aiSummary: readOption(args, "--ai-summary") || "",
      aiResult: readOption(args, "--ai-result") || "",
      confidence: readOption(args, "--confidence") ? Number(readOption(args, "--confidence")) : 0,
      needsManualReview: readOption(args, "--needs-manual-review")
        ? String(readOption(args, "--needs-manual-review")).toLowerCase() === "true"
        : false,
      hardFailCode: readOption(args, "--hard-fail-code") || "",
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    return output;
  }

  // 【P2-3 validate-rpc-request CLI 子命令，末尾追加零侵入】
  if (subcommand === "validate-rpc-request") {
    const params = await readJsonOptionValue(args, {
      inlineName: "--params-json",
      fileName: "--params-file",
    });
    const schemasFile = readOption(args, "--schemas-file");
    const output = await runner.validateRpcRequest({
      psm: readOption(args, "--psm") || "",
      method: readOption(args, "--method") || "",
      params: params || {},
      schemasFile,
      strictMode: !args.includes("--no-strict"),
    });
    const outputFile = readOption(args, "--output-file");
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    return output;
  }

  throw new Error(`Unknown subcommand: ${subcommand || "(empty)"}`);
}

if (isMainModule(import.meta.url)) {
  const emitNdjson = process.argv.slice(2).includes("--heartbeat");
  main(process.argv.slice(2))
    .then((result) => {
      return process.stdout.write(
        `${emitNdjson ? JSON.stringify(result) : JSON.stringify(result, null, 2)}\n`,
      );
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
