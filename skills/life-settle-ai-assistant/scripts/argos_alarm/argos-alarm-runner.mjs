#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import {
  buildArgosBaseRecord,
  extractArgosAlertFromMessage,
  isValidFeishuDocumentUrl
} from "./argos-alarm-workflow.mjs";
import { hasFeishuBotCredentials, preprocessArgosAlarmCommandEnv } from "./argos-alarm-preprocess.mjs";

const execFilePromise = promisify(execFileCallback);

export const DEFAULT_ARGOS_CHAT_ID = "oc_2aea267fe6e721607f906b14a69eb65b";
export const DEFAULT_ARGOS_SCAN_DIR_URL = "https://bytedance.larkoffice.com/wiki/ThOkwhi0HiChgWko6jhc74yen1d";
export const DEFAULT_ARGOS_ATTRIBUTION_TEMPLATE_URL = "https://bytedance.larkoffice.com/wiki/F1A7wG2LBioTKpkSDyCcBbjSnGd?table=tbldQBizC1CHaufL&view=vewA8GJz6L";
export const DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC = "https://bytedance.larkoffice.com/wiki/Xmw8wr79Cio6Fhkzn5NcBgdWnHh";
export const ARGOS_DAILY_BASE_BIZ_SUFFIX = "argos报警归因记录";
const ARGOS_DAILY_BASE_TABLE_NAME = "归因记录";

export const ARGOS_DAILY_BASE_FIELD_NAMES = [
  "unique_id",
  "result_id",
  "rule_id",
  "alarm_record_detail_id",
  "psm",
  "level",
  "rule_name",
  "result_time",
  "create_time",
  "result_url",
  "rule_url",
  "rule_content",
  "result_content",
  "extra",
  "status",
  "ai_session_id",
  "ai_summary",
  "ai_result",
  "ai_finished_at",
  "last_error"
];

const ARGOS_LEGACY_EXTRA_ONLY_FIELD_NAMES = [
  "total_sop_writeback_status",
  "total_sop_writeback_reason",
  "sop_writeback_status",
  "sop_writeback_reason",
  "sop_doc_url",
  "sop_doc_token",
  "card_update_status",
  "card_update_reason",
  "message_reply_status",
  "message_reply_reason"
];

export const ARGOS_STATUS_OPTIONS = ["init", "processing", "succeeded", "failed", "pending"];
export const ARGOS_ATTRIBUTION_RESULTS = [
  "[有效告警]消费积压-机房波动",
  "[有效告警]消费积压-消费能力不足",
  "[有效告警]上游流量波动",
  "[有效告警]下游依赖异常",
  "[无效告警]规则不合理",
  "[无效告警]通知频次不合理",
  "[待确认]证据不足",
  "[失败]排查基础设施失败"
];

const ARGOS_DAILY_BASE_SCHEMA_FIELDS = [
  { field_name: "unique_id", type: "text" },
  { field_name: "result_id", type: "text" },
  { field_name: "rule_id", type: "text" },
  { field_name: "alarm_record_detail_id", type: "text" },
  { field_name: "psm", type: "text" },
  { field_name: "level", type: "text" },
  { field_name: "rule_name", type: "text" },
  { field_name: "result_time", type: "date_time", style: { format: "yyyy-MM-dd HH:mm" } },
  { field_name: "create_time", type: "date_time", style: { format: "yyyy-MM-dd HH:mm" } },
  { field_name: "result_url", type: "text" },
  { field_name: "rule_url", type: "text" },
  { field_name: "rule_content", type: "text" },
  { field_name: "result_content", type: "text" },
  { field_name: "extra", type: "text" },
  { field_name: "status", type: "single_select", property: { options: ARGOS_STATUS_OPTIONS } },
  { field_name: "ai_session_id", type: "text" },
  { field_name: "ai_summary", type: "text" },
  { field_name: "ai_result", type: "text" },
  { field_name: "ai_finished_at", type: "date_time", style: { format: "yyyy-MM-dd HH:mm" } },
  { field_name: "last_error", type: "text" }
];

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function normalizeFilterList(value, { lower = false } = {}) {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean).map((item) => lower ? item.toLowerCase() : item))];
}

function buildArgosAlertFilter({ levels, psms } = {}) {
  return {
    levels: normalizeFilterList(levels, { lower: true }),
    psms: normalizeFilterList(psms)
  };
}

function matchesArgosAlertFilter(alert, filter) {
  if (filter.levels.length > 0 && !filter.levels.includes(String(alert?.level || "").trim().toLowerCase())) return false;
  if (filter.psms.length > 0 && !filter.psms.includes(String(alert?.psm || "").trim())) return false;
  return true;
}

function formatDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function safeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKeyListForWindow(start, end) {
  const result = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (cursor <= endDay) {
    result.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return [...new Set(result.reverse())];
}

function previousDateKeys(dateKey, count = 2) {
  const match = String(dateKey || "").match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return [];
  const cursor = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const result = [];
  for (let index = 0; index < Number(count || 0); index += 1) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    result.push(`${cursor.getUTCFullYear()}${String(cursor.getUTCMonth() + 1).padStart(2, "0")}${String(cursor.getUTCDate()).padStart(2, "0")}`);
  }
  return result;
}

function parseJsonOutput(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean).reverse();
    for (const line of lines) {
      if (!line.startsWith("{") && !line.startsWith("[")) continue;
      try {
        return JSON.parse(line);
      } catch {
        // try next line
      }
    }
  }
  throw new Error(`failed to parse JSON output: ${text.slice(0, 300)}`);
}

function getItems(payload) {
  const candidates = [
    payload?.data?.items,
    payload?.data?.nodes,
    payload?.data?.messages,
    payload?.data?.tables,
    payload?.data?.views,
    payload?.data?.fields,
    payload?.data?.records,
    payload?.data?.records,
    payload?.data?.data,
    payload?.items,
    payload?.nodes,
    payload?.messages,
    payload?.tables,
    payload?.views,
    payload?.fields,
    payload?.records,
    payload?.data
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractFirstString(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function parseObjectField(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeNodeItem(item, fallbackSpaceId) {
  return {
    title: extractFirstString(item?.title, item?.name),
    node_token: extractFirstString(item?.node_token, item?.nodeToken, item?.token, item?.wiki_token),
    obj_token: extractFirstString(item?.obj_token, item?.objToken, item?.object_token, item?.doc_token),
    obj_type: extractFirstString(item?.obj_type, item?.objType, item?.object_type),
    space_id: extractFirstString(item?.space_id, item?.spaceId, fallbackSpaceId)
  };
}

function extractMarkdownText(payload) {
  return extractFirstString(payload?.data?.markdown, payload?.data?.content, payload?.data?.text, payload?.markdown, payload?.content, payload?.text);
}

function ensureMarkdownTitle({ title, markdown }) {
  const body = String(markdown || "");
  if (!title) return body;
  if (/^#\s+.+$/m.test(body)) return body.replace(/^#\s+.+$/m, `# ${title}`);
  return `# ${title}\n\n${body}`;
}

function stripLeadingMarkdownTitle(markdown) {
  return String(markdown || "").replace(/^#\s+.*\n(?:\s*\n){0,2}/, "");
}

function parseMarkdownTopSections(markdown) {
  const sections = [];
  let current = { heading: "", lines: [] };
  for (const line of String(markdown || "").split(/\r?\n/)) {
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
  const merged = [];
  const byHeading = new Map();
  const keyOf = (heading) => String(heading || "").trim().toLowerCase();
  for (const section of parseMarkdownTopSections(existingBody)) {
    const entry = { heading: section.heading, lines: section.lines.slice() };
    merged.push(entry);
    byHeading.set(keyOf(section.heading), entry);
  }
  for (const section of parseMarkdownTopSections(newBody)) {
    const key = keyOf(section.heading);
    const target = byHeading.get(key);
    if (!target) {
      const entry = { heading: section.heading, lines: section.lines.slice() };
      merged.push(entry);
      byHeading.set(key, entry);
      continue;
    }
    const existingLines = new Set(target.lines.map((line) => String(line).trim()).filter(Boolean));
    for (const line of section.lines) {
      const normalized = String(line).trim();
      if (normalized && existingLines.has(normalized)) continue;
      if (normalized) existingLines.add(normalized);
      target.lines.push(line);
    }
  }
  const body = merged
    .map((section) => {
      const block = section.lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
      return section.heading ? [`## ${section.heading}`, block].filter(Boolean).join("\n") : block;
    })
    .filter((chunk) => String(chunk).trim())
    .join("\n\n");
  return ensureMarkdownTitle({ title, markdown: body });
}

function buildRuleSopDocTitle({ ruleId, ruleName }) {
  const id = String(ruleId || "").trim();
  const name = normalizeArgosRuleNameForSopTitle(ruleName);
  if (!id) throw new Error("rule_id is required to build Argos rule SOP title");
  if (!name) throw new Error("rule_name is required to build Argos rule SOP title");
  return `${id}:${name}排查sop`;
}

function buildTroubleshootingDocTitle({ resultId, ruleName, resultTime, dateKey } = {}) {
  const id = String(resultId || "").trim();
  const name = normalizeArgosRuleNameForSopTitle(ruleName);
  const day = String(dateKey || formatDateKey(resultTime) || formatDateKey(new Date())).trim();
  if (!id) throw new Error("result_id is required to build Argos troubleshooting doc title");
  if (!name) throw new Error("rule_name is required to build Argos troubleshooting doc title");
  return `${id}:${name}:${day}排查结果`;
}

function normalizeArgosRuleNameForSopTitle(ruleName) {
  const raw = String(ruleName || "").trim();
  const withoutStatus = raw.replace(/^(?:\[[^\]]+\]|【[^】]+】)+\s*/g, "");
  const beforeDetail = withoutStatus.split(/[：:]/)[0] || withoutStatus;
  return beforeDetail
    .replace(/[\\/\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function extractCreatedDocToken(payload) {
  const token = extractFirstString(
    payload?.data?.obj_token,
    payload?.data?.doc_token,
    payload?.data?.document?.doc_token,
    payload?.data?.document?.document_id,
    payload?.obj_token,
    payload?.doc_token
  );
  if (!token) throw new Error("wiki node create response did not include doc token");
  return token;
}

function extractCreatedWikiToken(payload) {
  return extractFirstString(payload?.data?.node_token, payload?.data?.nodeToken, payload?.node_token, payload?.nodeToken);
}

function isWikiDocumentUrl(value) {
  return /^https:\/\/[^/\s]+\/wiki\/[A-Za-z0-9_-]+/.test(String(value || "").trim());
}

function getWorkItemExtra(workItem) {
  return parseObjectField(workItem?.extra || workItem?.fields?.extra);
}

function buildCloseExtra({ workItem, docArchive = {}, totalSop = {}, ruleSop = {}, cardUpdate = {}, messageReply = {} } = {}) {
  return JSON.stringify(compactObject({
    ...getWorkItemExtra(workItem),
    doc_archive_status: docArchive.doc_archive_status,
    doc_archive_reason: docArchive.doc_archive_reason,
    doc_url: docArchive.ai_result,
    doc_token: docArchive.doc_token,
    doc_write_status: docArchive.doc_write_status,
    total_sop_writeback_status: totalSop.total_sop_writeback_status,
    total_sop_writeback_reason: totalSop.total_sop_writeback_reason,
    total_sop_doc_url: totalSop.total_sop_doc_url,
    sop_writeback_status: ruleSop.sop_writeback_status,
    sop_writeback_reason: ruleSop.sop_writeback_reason,
    sop_doc_url: ruleSop.sop_doc_url,
    sop_doc_token: ruleSop.sop_doc_token,
    sop_doc_write_status: ruleSop.sop_doc_write_status,
    card_update_status: cardUpdate.card_update_status,
    card_update_reason: cardUpdate.card_update_reason,
    message_reply_status: messageReply.message_reply_status,
    message_reply_reason: messageReply.message_reply_reason
  }));
}

function buildLegacyExtraOnlyFieldClearPatch(workItem) {
  const fieldNames = Array.isArray(workItem?.field_names) ? workItem.field_names : [];
  if (fieldNames.length === 0) return {};
  const existing = new Set(fieldNames);
  return Object.fromEntries(ARGOS_LEGACY_EXTRA_ONLY_FIELD_NAMES.filter((fieldName) => existing.has(fieldName)).map((fieldName) => [fieldName, ""]));
}

function getWorkItemMessageId(workItem) {
  const extra = getWorkItemExtra(workItem);
  return extractFirstString(workItem?.message_id, workItem?.messageId, extra.message_id, extra.source_message_id);
}

function buildWorkItemReplyMarkdown({ workItem, status, summary, docUrl, sopDocUrl }) {
  const lines = [
    "### Argos 报警自动排查结果",
    `- result_id: ${workItem?.result_id || ""}`,
    `- rule_id: ${workItem?.rule_id || ""}`,
    `- 状态: ${status}`,
    `- 摘要: ${summary || ""}`
  ];
  if (docUrl) lines.push(`- 排查文档: ${docUrl}`);
  if (sopDocUrl) lines.push(`- 规则 SOP: ${sopDocUrl}`);
  return lines.join("\n");
}

function buildDerivedArgosSopContent({ workItem = {}, modelResult = {} } = {}) {
  const attribution = String(modelResult.attribution_result || "").trim();
  const ruleId = String(workItem.rule_id || modelResult.rule_id || "").trim();
  const ruleName = String(workItem.rule_name || modelResult.rule_name || "").trim();
  const psm = String(workItem.psm || modelResult.psm || "").trim();
  const totalExplicit = String(modelResult.total_sop_markdown || "").trim();
  const totalSuggestion = String(modelResult.total_sop_suggestion || "").trim();
  const ruleExplicit = String(modelResult.rule_sop_markdown || "").trim();
  const totalMarkdown = totalExplicit || (totalSuggestion ? `## Argos 领域通用知识\n\n- ${totalSuggestion}` : [
    "## Argos 领域通用知识",
    "",
    "- 先读取报警卡片的 Tags、Vars、RCA、触发时间、持续时间和机房维度，确认指标口径与报警窗口。",
    "- 对积压、流量波动和依赖异常类报警，优先按机房维度指标、消费组状态、上游流量、下游依赖和对应时间窗口日志分层取证。",
    "- 固定归因只能作为分类结果，不能替代证据；结论必须由指标、日志、trace、变更、代码或平台状态支撑。"
  ].filter(Boolean).join("\n"));
  const title = ruleId && ruleName ? buildRuleSopDocTitle({ ruleId, ruleName }) : `${ruleId || "unknown"}:${ruleName || "unknown"}排查sop`;
  const ruleMarkdown = ruleExplicit || [
    `# ${title}`,
    "",
    "## 适用范围",
    `- rule_id: ${ruleId || "unknown"}`,
    ruleName ? `- rule_name: ${ruleName}` : "",
    psm ? `- psm: ${psm}` : "",
    "",
    "## 固化排查步骤",
    `- 固定归因：${attribution || "未填写"}`,
    "- 先核对该规则的报警详情、Tags/Vars 和 Argos RCA，再按机房、消费组状态、上游流量、下游依赖四类方向分层验证。",
    "- 记录该规则稳定适用的指标维度、日志关键词、依赖服务、平台状态入口和反例口径；不要写入单次报警明细或一次性处置结论。"
  ].filter(Boolean).join("\n");
  return {
    totalMarkdown,
    ruleMarkdown
  };
}

function buildUnsupportedArgosCardUpdate() {
  return {
    card_update_status: "skipped",
    card_update_reason: "Argos card update is unsupported without a controlled update-card interface; generic messages.patch can only update cards sent by the same app."
  };
}

function normalizeArgosEvidenceCategory(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!text) return "";
  if (text.includes("argos") || text.includes("rca")) return "argos_rca";
  if (text.includes("metric") || text.includes("grafana") || text.includes("监控") || text.includes("指标")) return "metric";
  if (text.includes("log") || text.includes("日志")) return "log";
  if (text.includes("trace") || text.includes("链路")) return "trace";
  if (text.includes("change") || text.includes("deploy") || text.includes("发布") || text.includes("变更")) return "change";
  if (text.includes("dependency") || text.includes("acl") || text.includes("downstream") || text.includes("下游") || text.includes("依赖")) return "dependency";
  if (text.includes("config") || text.includes("配置")) return "config";
  return text;
}

function normalizeArgosEvidenceItems(modelResult = {}) {
  const rawItems = Array.isArray(modelResult.evidence_items)
    ? modelResult.evidence_items
    : Array.isArray(modelResult.investigation_evidence)
      ? modelResult.investigation_evidence
      : [];
  return rawItems
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const category = normalizeArgosEvidenceCategory(item.category || item.type || item.source || item.tool);
      return compactObject({
        ...item,
        category,
        type: item.type || category
      });
    });
}

function normalizeArgosModelResultShape(raw = {}, workItem = {}) {
  const aiResult = String(raw.ai_result || raw.feishu_doc_url || raw.doc_url || "").trim();
  const aiSummary = String(raw.ai_summary || raw.summary || "").trim();
  const evidenceItems = normalizeArgosEvidenceItems(raw);
  return {
    ...raw,
    result_id: String(raw.result_id || workItem.result_id || "").trim(),
    rule_id: String(raw.rule_id || workItem.rule_id || "").trim(),
    rule_name: String(raw.rule_name || workItem.rule_name || "").trim(),
    psm: String(raw.psm || workItem.psm || "").trim(),
    ai_summary: aiSummary,
    ai_result: aiResult,
    feishu_doc_url: String(raw.feishu_doc_url || aiResult).trim(),
    doc_url: String(raw.doc_url || aiResult).trim(),
    writeback_owner: String(raw.writeback_owner || "parent_orchestrator").trim(),
    evidence_items: evidenceItems,
    evidence_categories: [...new Set(evidenceItems.map((item) => item.category).filter(Boolean))]
  };
}

function validateArgosEvidenceCategories({ attributionResult = "", evidenceItems = [] } = {}) {
  const categories = [...new Set(evidenceItems.map((item) => normalizeArgosEvidenceCategory(item.category || item.type || item.source || item.tool)).filter(Boolean))];
  const hasAny = (required) => required.some((category) => categories.includes(category));
  const missingGroups = [];
  if (!hasAny(["argos_rca", "metric"])) {
    missingGroups.push(["argos_rca", "metric"]);
  }
  if (categories.length < 2) {
    missingGroups.push(["any_second_corroborating_category"]);
  }
  const attribution = String(attributionResult || "").toLowerCase();
  if (/下游|dependency|依赖|acl|authorization|auth/.test(attribution) && !hasAny(["dependency", "log", "trace"])) {
    missingGroups.push(["dependency", "log", "trace"]);
  }
  if (/消费积压|consumer|lag/.test(attribution) && !hasAny(["metric", "log"])) {
    missingGroups.push(["metric", "log"]);
  }
  return {
    ok: missingGroups.length === 0,
    categories,
    missing_groups: missingGroups
  };
}

function countBy(items, getter) {
  const counts = {};
  for (const item of items) {
    const key = getter(item);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function validateArgosModelResult({ workItem, modelResult, resultDir }) {
  const resultId = extractFirstString(workItem?.result_id, modelResult?.result_id);
  const blockers = [];
  const add = (code, message, severity = "hard_fail") => blockers.push({ code, message, severity });
  if (!modelResult || typeof modelResult !== "object" || Array.isArray(modelResult)) {
    add("result_json_invalid", "model result is not a JSON object");
    return {
      result_id: resultId,
      overall_valid: false,
      blockers,
      close_readiness: { ready_for_close: false, blockers: blockers.map((item) => item.code) }
    };
  }
  if (!String(modelResult.result_id || "").trim()) add("result_id_missing", "model result_id is required");
  if (resultId && String(modelResult.result_id || "").trim() !== resultId) add("result_id_mismatch", "model result_id does not match work item");
  const status = String(modelResult.status || "").trim();
  if (!["succeeded", "pending", "failed"].includes(status)) add("status_invalid", "status must be succeeded, pending or failed");
  const attribution = String(modelResult.attribution_result || "").trim();
  if (!attribution) add("attribution_result_missing", "attribution_result is required");
  else if (!ARGOS_ATTRIBUTION_RESULTS.includes(attribution)) add("attribution_result_invalid", `attribution_result must be one of ${ARGOS_ATTRIBUTION_RESULTS.join(", ")}`);
  if (status === "succeeded") {
    if (String(modelResult.writeback_owner || "").trim() !== "parent_orchestrator") {
      add("writeback_owner_invalid", "succeeded result must declare writeback_owner=parent_orchestrator");
    }
    const evidenceItems = normalizeArgosEvidenceItems(modelResult);
    const validEvidenceItems = evidenceItems.filter((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const source = String(item.source || item.tool || item.type || "").trim();
      const detail = String(item.summary || item.evidence || item.current_state || item.snapshot_state || item.detail || "").trim();
      return Boolean(source && detail);
    });
    if (validEvidenceItems.length === 0) {
      add("evidence_items_missing", "succeeded result requires evidence_items[] with reusable Argos evidence");
    }
    const categoryValidation = validateArgosEvidenceCategories({ attributionResult: modelResult.attribution_result, evidenceItems: validEvidenceItems });
    if (!categoryValidation.ok) {
      add("evidence_categories_missing", `succeeded result evidence categories insufficient: actual=${categoryValidation.categories.join(",") || "none"} missing=${JSON.stringify(categoryValidation.missing_groups)}`);
    }
    if (!String(workItem?.rule_id || modelResult?.rule_id || "").trim()) add("rule_id_missing", "succeeded result requires rule_id for rule SOP writeback");
    if (!String(workItem?.rule_name || modelResult?.rule_name || "").trim()) add("rule_name_missing", "succeeded result requires rule_name for rule SOP writeback");
    if (!String(modelResult.ai_summary || "").trim()) add("ai_summary_missing", "succeeded result requires ai_summary");
    if (!isValidFeishuDocumentUrl(modelResult.ai_result)) add("ai_result_invalid", "succeeded result requires valid Feishu wiki/doc URL");
    const derivedSop = buildDerivedArgosSopContent({ workItem, modelResult });
    const hasRuleSop = String(derivedSop.ruleMarkdown || "").trim();
    const sopSkipped = String(modelResult.sop_writeback_status || "").trim() === "skipped" && String(modelResult.sop_writeback_reason || "").trim();
    if (!hasRuleSop && !sopSkipped) add("rule_sop_missing_for_succeeded", "succeeded result requires rule_sop_markdown or explicit skipped reason");
  }
  if (status === "pending" && !String(modelResult.pending_reason || modelResult.last_error || modelResult.ai_summary || "").trim()) {
    add("pending_reason_missing", "pending result requires pending_reason, last_error or ai_summary");
  }
  if (status === "failed" && !String(modelResult.last_error || modelResult.error || modelResult.ai_summary || "").trim()) {
    add("failed_reason_missing", "failed result requires last_error, error or ai_summary");
  }
  const docPath = resultDir && resultId ? join(resultDir, `${resultId}.json`) : "";
  return {
    result_id: resultId,
    status,
    attribution_result: attribution,
    result_file: docPath,
    overall_valid: blockers.length === 0,
    blockers,
    close_readiness: {
      ready_for_close: blockers.length === 0,
      blockers: blockers.map((item) => item.code)
    }
  };
}

async function inspectArgosReviewAudit({ resultDir, resultId }) {
  const candidates = [
    join(resultDir || ".", `${resultId}.review.json`),
    join(resultDir || ".", `review-${resultId}.json`)
  ];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    try {
      const review = JSON.parse(await readFile(filePath, "utf8"));
      const blockers = Array.isArray(review.blockers) ? review.blockers : [];
      const missingFields = [];
      if (typeof review.review_passed !== "boolean") missingFields.push("review_passed");
      if (!Array.isArray(review.blockers)) missingFields.push("blockers[]");
      if (!("required_rework_prompt" in review)) missingFields.push("required_rework_prompt");
      if (!Array.isArray(review.checked_files)) missingFields.push("checked_files[]");
      if (!String(review.validation_command || "").trim()) missingFields.push("validation_command");
      if (!String(review.review_summary || "").trim()) missingFields.push("review_summary");
      if (missingFields.length > 0) {
        return { valid: false, code: "invalid_review_audit_schema", reason: `review audit missing fields: ${missingFields.join(", ")}`, file_path: filePath, review };
      }
      if (review.review_passed !== true) {
        return { valid: false, code: "review_not_passed", reason: blockers.length > 0 ? blockers.join("; ") : "review_passed=false", file_path: filePath, review };
      }
      return { valid: true, code: "review_passed", reason: "review_passed=true", file_path: filePath, review };
    } catch (error) {
      return { valid: false, code: "invalid_review_audit_json", reason: error?.message || String(error), file_path: filePath };
    }
  }
  return { valid: false, code: "missing_review_audit", reason: "missing Argos review audit JSON", candidates };
}

async function validateArgosModelResultWithReview({ workItem, modelResult, resultDir }) {
  const validation = validateArgosModelResult({ workItem, modelResult, resultDir });
  if (validation.status === "succeeded") {
    const reviewAudit = await inspectArgosReviewAudit({ resultDir, resultId: validation.result_id });
    validation.review_audit = reviewAudit;
    if (!reviewAudit.valid) {
      validation.blockers.push({ code: reviewAudit.code, message: reviewAudit.reason, severity: "hard_fail" });
      validation.overall_valid = false;
      validation.close_readiness = { ready_for_close: false, blockers: validation.blockers.map((item) => item.code) };
    }
  }
  return validation;
}

function extractWikiNodeToken(value) {
  const text = String(value || "").trim();
  try {
    const url = new URL(text);
    const match = url.pathname.match(/\/(?:wiki|docx|base|bitable|sheet|doc)\/([^/?#]+)/);
    if (match?.[1]) return match[1];
  } catch {
    // plain token
  }
  return text;
}

function toFieldCreatePayload(field) {
  const { field_name, type, property, style } = field;
  let apiType = "text";
  if (type === "text") apiType = "text";
  else if (type === "number") apiType = "number";
  else if (type === "date_time") apiType = "datetime";
  else if (type === "single_select") apiType = "select";

  const payload = { field_name, type: apiType };
  if (style && typeof style === "object") payload.style = { ...style };
  if (apiType === "select" && Array.isArray(property?.options)) {
    payload.options = property.options.map((option) => (typeof option === "string" ? { name: option } : { name: option.name }));
  }
  return payload;
}

function toTableCreateFieldPayload(field) {
  const payload = toFieldCreatePayload(field);
  const { field_name, ...rest } = payload;
  return { name: field_name, ...rest };
}

function normalizeFields(payload) {
  return getItems(payload)
    .map((field) => (typeof field === "string" ? field : extractFirstString(field?.field_name, field?.name, field?.field_id, field?.id)))
    .filter(Boolean);
}

function normalizeVisibleFieldNames(payload) {
  const data = payload?.data || payload || {};
  const rawFields = Array.isArray(data.visible_fields)
    ? data.visible_fields
    : Array.isArray(data.visibleFields)
      ? data.visibleFields
      : Array.isArray(data.fields)
        ? data.fields
        : getItems(payload);
  return rawFields
    .map((field) => (typeof field === "string" ? field : extractFirstString(field?.field_name, field?.name, field?.field_id, field?.id)))
    .filter(Boolean);
}

function schemaFieldsInOrder(fieldNames) {
  const definitions = new Map(ARGOS_DAILY_BASE_SCHEMA_FIELDS.map((field) => [field.field_name, field]));
  return fieldNames.map((fieldName) => definitions.get(fieldName)).filter(Boolean);
}

function normalizeSelectOption(option) {
  if (typeof option === "string") return { name: option };
  return {
    ...option,
    name: extractFirstString(option?.name, option?.text, option?.value)
  };
}

function normalizeRecords(payload) {
  const table = payload?.data || payload;
  if (Array.isArray(table?.data) && Array.isArray(table?.fields)) {
    return table.data.map((row, index) => {
      const fields = {};
      table.fields.forEach((fieldName, fieldIndex) => {
        fields[fieldName] = Array.isArray(row) ? row[fieldIndex] : undefined;
      });
      return {
        record_id: extractFirstString(table.record_id_list?.[index], table.records?.[index]?.record_id, table.records?.[index]?.id),
        fields
      };
    });
  }
  return getItems(payload).map((record) => ({
    record_id: extractFirstString(record?.record_id, record?.id),
    fields: record?.fields || record?.record || {}
  }));
}

function readStatus(fields) {
  const value = fields?.status;
  if (Array.isArray(value)) return String(value[0] || "").trim().toLowerCase();
  if (value && typeof value === "object" && "text" in value) return String(value.text || "").trim().toLowerCase();
  return String(value || "").trim().toLowerCase();
}

function messageTimestamp(message) {
  const raw = message?.create_time || message?.createTime || message?.timestamp || message?.create_timestamp || message?.createTimeMs;
  if (typeof raw === "number") return raw > 10_000_000_000 ? raw : raw * 1000;
  const text = String(raw || "").trim();
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return n > 10_000_000_000 ? n : n * 1000;
  }
  const date = safeDate(text.replace(" ", "T"));
  return date ? date.getTime() : 0;
}

function normalizeMessage(message, chatId) {
  return {
    chat_id: extractFirstString(message?.chat_id, message?.chatId, chatId),
    message_id: extractFirstString(message?.message_id, message?.messageId, message?.id),
    message_app_link: extractFirstString(message?.message_app_link, message?.messageAppLink),
    create_time: extractFirstString(message?.create_time, message?.createTime, message?.timestamp),
    msg_type: extractFirstString(message?.msg_type, message?.message_type, message?.type),
    content: typeof message?.content === "string" ? message.content : JSON.stringify(message?.content || message || {})
  };
}

function errorDetails(error) {
  return [error?.message, error?.stderr, error?.stdout].filter(Boolean).join("\n").toLowerCase();
}

function isBotIdentityNotAllowedError(error) {
  const text = errorDetails(error);
  return (
    text.includes("bot identity is not allowed") ||
    text.includes("bot identity not allowed") ||
    text.includes("lark_cli_bot_command_denied") ||
    text.includes("bot identity is only allowed for aime-approved lark-cli commands") ||
    text.includes("bot/user can not be out of the chat") ||
    text.includes('"code":230002') ||
    text.includes("lark_cli_im_read_guard")
  );
}

function isStrictModeUserError(error) {
  const text = errorDetails(error);
  return (
    text.includes('strict mode is "user"') ||
    text.includes("strict mode is user") ||
    text.includes("only user-identity commands are available") ||
    text.includes("app-identity commands are disabled") ||
    text.includes("bot identity disabled") ||
    text.includes("lark_cli_im_read_guard")
  );
}

function isTokenMissingOrNotConfiguredError(error) {
  const text = errorDetails(error);
  return (
    text.includes("token_missing") ||
    text.includes("not_configured") ||
    text.includes("no access token available for bot") ||
    text.includes("app access token not configured") ||
    text.includes("app token is not configured")
  );
}

function isIdentityFallbackEligible(error) {
  return isBotIdentityNotAllowedError(error) || isStrictModeUserError(error);
}

function botReadDenied(error) {
  return isBotIdentityNotAllowedError(error) || isStrictModeUserError(error) || isTokenMissingOrNotConfiguredError(error);
}

function replaceIdentity(args, identity) {
  const nextArgs = [...args];
  const index = nextArgs.indexOf("--as");
  if (index >= 0) {
    nextArgs[index + 1] = identity;
  } else {
    nextArgs.push("--as", identity);
  }
  return nextArgs;
}

function isLarkBotCommandArgs(args) {
  const index = args.indexOf("--as");
  return index >= 0 && args[index + 1] === "bot";
}

function isImSendCommandArgs(args) {
  return args[0] === "im" && ["messages-reply", "message-send", "messages-send"].includes(args[1]);
}

function withIdentityFallbackMetadata(payload, error) {
  if (payload && typeof payload === "object") {
    payload.__identity_used = "user";
    payload.__identity_fallback_reason = isTokenMissingOrNotConfiguredError(error)
      ? "token_missing"
      : isStrictModeUserError(error)
        ? "strict-mode-user"
        : "bot-identity-not-allowed";
  }
  return payload;
}

function legacyBotReadDenied(error) {
  const text = [error?.message, error?.stderr, error?.stdout].filter(Boolean).join("\n").toLowerCase();
  return (
    text.includes("bot identity is not allowed") ||
    text.includes("bot identity not allowed") ||
    text.includes("bot/user can not be out of the chat") ||
    text.includes('"code":230002')
  );
}

function buildLarkArgs(args) {
  return ["--json", "lark", ...args];
}

function commandToShell(command, args) {
  return [command, ...args].map((part) => (String(part).includes(" ") ? JSON.stringify(String(part)) : String(part))).join(" ");
}

function buildDailyTitle(dateKey) {
  return `${dateKey}-${ARGOS_DAILY_BASE_BIZ_SUFFIX}`;
}

function buildDispatchPlan({ workItems, resultDir, scanDirUrl, troubleshootingSopDoc }) {
  return {
    kind: "argos_alarm_dispatch_plan",
    owner: "parent_orchestrator",
    result_dir: resultDir || "",
    items: workItems.map((workItem) => ({
      result_id: workItem.result_id,
      record_id: workItem.record_id,
      instruction:
        `读取 life-settle-ai-assistant argos_alarm guide alert-troubleshooter，排查 Argos result_id=${workItem.result_id}，` +
        `结果写入 ${resultDir || ".tmp/argos-alarm-<session>"}/${workItem.result_id}.json.tmp 后原子重命名。`,
      guide_command: "life-settle-ai-assistant argos_alarm guide alert-troubleshooter",
      scan_dir_url: scanDirUrl,
      troubleshooting_sop_doc: troubleshootingSopDoc
    }))
  };
}

async function ensureTmpDir() {
  const tmpDir = resolve(process.cwd(), ".tmp");
  await mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

async function writeTempJson(prefix, payload) {
  const tmpDir = await ensureTmpDir();
  const fileName = `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`;
  const absolutePath = join(tmpDir, fileName);
  await writeFile(absolutePath, JSON.stringify(payload), "utf8");
  return { absolutePath, cliPath: `@./.tmp/${fileName}` };
}

async function writeJsonFileAtomic(filePath, payload) {
  await mkdir(resolve(filePath, ".."), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

async function writeJsonlFileAtomic(filePath, items = []) {
  await mkdir(resolve(filePath, ".."), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  const body = items.map((item) => JSON.stringify(item)).join("\n");
  await writeFile(tmpPath, body ? `${body}\n` : "", "utf8");
  await rename(tmpPath, filePath);
}

export function buildArgosGroupsScanPlan({
  chatId = DEFAULT_ARGOS_CHAT_ID,
  scanDirUrl = DEFAULT_ARGOS_SCAN_DIR_URL,
  troubleshootingSopDoc = DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC,
  lookbackHours = 24,
  endTime = new Date(),
  dryRun = false,
  resultDir,
  levels,
  psms
} = {}) {
  const end = endTime instanceof Date ? endTime : new Date(endTime);
  const start = new Date(end.getTime() - Number(lookbackHours || 24) * 60 * 60 * 1000);
  const normalizedChatId = String(chatId || DEFAULT_ARGOS_CHAT_ID).trim();
  const filter = buildArgosAlertFilter({ levels, psms });
  return {
    kind: "argos_alarm_groups_scan_and_troubleshoot_plan",
    success: true,
    dryRun: Boolean(dryRun),
    scanWindow: {
      start: start.toISOString(),
      end: end.toISOString()
    },
    dateKeys: dateKeyListForWindow(start, end),
    input: {
      chat_id: normalizedChatId,
      scan_dir_url: scanDirUrl,
      troubleshooting_sop_doc: troubleshootingSopDoc,
      lookback_hours: Number(lookbackHours || 24),
      result_dir: resultDir || "",
      levels: filter.levels,
      psms: filter.psms
    },
    scanTasks: [
      {
        index: 0,
        chatId: normalizedChatId,
        targetFolderPath: scanDirUrl,
        command: commandToShell("node", [
          "scripts/argos_alarm/argos-alarm-runner.mjs",
          "scan-chat-to-base",
          "--input-json=@./.tmp/<argos-scan-input>.json"
        ])
      }
    ]
  };
}

export function createArgosAlarmRunner({
  execFile = execFilePromise,
  env = process.env,
  sleep: sleepOption,
  templateUrl = DEFAULT_ARGOS_ATTRIBUTION_TEMPLATE_URL
} = {}) {
  const runnerEnv = preprocessArgosAlarmCommandEnv(env || process.env);
  const sleep = sleepOption || ((ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)));
  let dailyBaseFieldNamesPromise;
  let botAutoLoginAttempted = false;

  async function tryFeishuBotLogin() {
    if (!hasFeishuBotCredentials(runnerEnv)) {
      return {
        success: false,
        skipped: true,
        reason: "FEISHU_BOT_APP_ID/FEISHU_BOT_APP_SECRET not set"
      };
    }
    try {
      const bashScript = [
        "printf '%s' \"$FEISHU_BOT_APP_SECRET\" |",
        "  bytedcli lark config init \\",
        "      --new \\",
        "      --force-init \\",
        "      --brand feishu \\",
        "      --lang zh \\",
        "      --app-id \"$FEISHU_BOT_APP_ID\" \\",
        "      --app-secret-stdin"
      ].join("\n");
      const { stdout, stderr } = await execFile("bash", ["-lc", bashScript], {
        env: runnerEnv,
        maxBuffer: 1024 * 1024
      });
      return {
        success: true,
        method: "bytedcli_lark_config_init_stdin",
        stdout,
        stderr
      };
    } catch (error) {
      return {
        success: false,
        method: "bytedcli_lark_config_init_stdin",
        error: error?.message || String(error),
        stderr: error?.stderr,
        stdout: error?.stdout
      };
    }
  }

  async function runJson(args) {
    try {
      const { stdout } = await execFile("bytedcli", buildLarkArgs(args), {
        env: runnerEnv,
        maxBuffer: 64 * 1024 * 1024
      });
      return parseJsonOutput(stdout);
    } catch (error) {
      if (isLarkBotCommandArgs(args) && !botAutoLoginAttempted && isTokenMissingOrNotConfiguredError(error)) {
        botAutoLoginAttempted = true;
        const loginResult = await tryFeishuBotLogin();
        if (loginResult.success) {
          const { stdout } = await execFile("bytedcli", buildLarkArgs(args), {
            env: runnerEnv,
            maxBuffer: 64 * 1024 * 1024
          });
          const payload = parseJsonOutput(stdout);
          if (payload && typeof payload === "object") {
            payload.__bot_auto_login_status = "succeeded";
          }
          return payload;
        }
        error.__bot_auto_login_status = "failed";
        error.__bot_auto_login_error = loginResult.error;
      }
      if (isLarkBotCommandArgs(args) && !isImSendCommandArgs(args) && isIdentityFallbackEligible(error)) {
        const fallbackArgs = replaceIdentity(args, "user");
        const { stdout } = await execFile("bytedcli", buildLarkArgs(fallbackArgs), {
          env: runnerEnv,
          maxBuffer: 64 * 1024 * 1024
        });
        return withIdentityFallbackMetadata(parseJsonOutput(stdout), error);
      }
      throw error;
    }
  }

  async function readChatMessages({ chatId, start, end, pageSize = 50 }) {
    const startMs = start.getTime();
    const endMs = end.getTime();
    const messages = [];
    let pageToken = "";
    let identity = "bot";
    while (true) {
      const args = [
        "im",
        "chat-messages-list",
        "--chat-id",
        chatId,
        "--start-time",
        start.toISOString(),
        "--end-time",
        end.toISOString(),
        "--page-size",
        String(pageSize),
        "--as",
        identity
      ];
      if (pageToken) args.push("--page-token", pageToken);
      let payload;
      try {
        payload = await runJson(args);
      } catch (error) {
        if (identity === "bot" && legacyBotReadDenied(error)) {
          identity = "user";
          pageToken = "";
          messages.length = 0;
          continue;
        }
        throw error;
      }
      for (const item of getItems(payload)) {
        const normalized = normalizeMessage(item, chatId);
        const ts = messageTimestamp(normalized);
        if (!ts || (ts >= startMs && ts < endMs)) messages.push(normalized);
      }
      const data = payload?.data || payload;
      pageToken = extractFirstString(data?.next_page_token, data?.page_token, data?.has_more ? data?.nextPageToken : "");
      if (!data?.has_more || !pageToken) break;
    }
    return { messages, identity };
  }

  async function resolveDailyBaseFieldNamesFromTemplate() {
    const known = new Set(ARGOS_DAILY_BASE_FIELD_NAMES);
    const resolved = await runJson(["base", "+url-resolve", "--url", templateUrl, "--as", "bot"]);
    const data = resolved?.data || resolved || {};
    const baseToken = extractFirstString(data.base_token, data.baseToken, data.app_token, data.appToken);
    const tableId = extractFirstString(data.table_id, data.tableId, data.block_id, data.blockId);
    const viewId = extractFirstString(data.view_id, data.viewId);
    if (!baseToken || !tableId || !viewId) return ARGOS_DAILY_BASE_FIELD_NAMES;
    const visibleFields = normalizeVisibleFieldNames(await runJson([
      "base",
      "view-get-visible-fields",
      "--base-token",
      baseToken,
      "--table-id",
      tableId,
      "--view-id",
      viewId,
      "--as",
      "bot"
    ])).filter((fieldName) => known.has(fieldName));
    if (visibleFields.length === 0) return ARGOS_DAILY_BASE_FIELD_NAMES;
    const missingFields = ARGOS_DAILY_BASE_FIELD_NAMES.filter((fieldName) => !visibleFields.includes(fieldName));
    return [...visibleFields, ...missingFields];
  }

  async function getDailyBaseFieldNames() {
    if (!dailyBaseFieldNamesPromise) {
      dailyBaseFieldNamesPromise = resolveDailyBaseFieldNamesFromTemplate().catch(() => ARGOS_DAILY_BASE_FIELD_NAMES);
    }
    return dailyBaseFieldNamesPromise;
  }

  async function getWikiNode(url) {
    const payload = await runJson(["wiki", "+node-get", "--node-token", extractWikiNodeToken(url), "--as", "bot"]);
    return payload?.data || payload;
  }

  async function listWikiChildren({ spaceId, parentNodeToken }) {
    const payload = await runJson([
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
      "bot"
    ]);
    return getItems(payload);
  }

  async function createMissingBaseFields({ baseToken, tableId, missingFields }) {
    for (const fieldName of missingFields) {
      const definition = ARGOS_DAILY_BASE_SCHEMA_FIELDS.find((field) => field.field_name === fieldName);
      if (!definition) throw new Error(`missing Argos field definition: ${fieldName}`);
      await runJson([
        "base",
        "field-create",
        "--base-token",
        baseToken,
        "--table-id",
        tableId,
        `--json=${JSON.stringify(toFieldCreatePayload(definition))}`,
        "--as",
        "bot"
      ]);
    }
  }

  async function renameBaseField({ baseToken, tableId, field, name }) {
    const fieldId = extractFirstString(field?.id, field?.field_id, field?.fieldId);
    if (!fieldId) throw new Error(`field ${field?.name || field?.field_name || name} missing field_id`);
    const fieldType = String(field?.type || "text").trim() || "text";
    await runJson([
      "base",
      "field-update",
      "--base-token",
      baseToken,
      "--table-id",
      tableId,
      "--field-id",
      fieldId,
      `--json=${JSON.stringify({ name, type: fieldType })}`,
      "--yes",
      "--as",
      "bot"
    ]);
  }

  async function repairLegacyPrimaryFieldOrder({ baseToken, tableId, fieldDefinitions, actualFieldNames, expectedFieldNames }) {
    if (actualFieldNames[0] === expectedFieldNames[0]) return { status: "unchanged" };
    if (
      expectedFieldNames[0] !== "unique_id" ||
      expectedFieldNames[1] !== "result_id" ||
      actualFieldNames[0] !== "result_id" ||
      actualFieldNames[1] !== "unique_id"
    ) {
      return {
        status: "skipped",
        reason: "only result_id/unique_id legacy primary swap is supported",
        actual: actualFieldNames.slice(0, 2),
        expected: expectedFieldNames.slice(0, 2)
      };
    }
    const byName = new Map(fieldDefinitions.map((field) => [extractFirstString(field?.field_name, field?.name), field]));
    const resultIdField = byName.get("result_id");
    const uniqueIdField = byName.get("unique_id");
    if (!resultIdField || !uniqueIdField) {
      return { status: "skipped", reason: "result_id or unique_id field definition missing" };
    }
    const tempName = `__argos_field_swap_${Date.now()}`;
    await renameBaseField({ baseToken, tableId, field: resultIdField, name: tempName });
    await renameBaseField({ baseToken, tableId, field: uniqueIdField, name: "result_id" });
    await renameBaseField({ baseToken, tableId, field: resultIdField, name: "unique_id" });
    return { status: "updated", swapped: ["result_id", "unique_id"] };
  }

  async function ensureDailyBaseViewVisibleFields({ baseToken, tableId, fieldDefinitions, fieldNames }) {
    const viewPayload = await runJson(["base", "view-list", "--base-token", baseToken, "--table-id", tableId, "--as", "bot"]);
    const view = getItems(viewPayload)[0];
    const viewId = extractFirstString(view?.view_id, view?.id, view?.viewId);
    if (!viewId) return { status: "skipped", reason: "no view found" };
    let current = normalizeVisibleFieldNames(await runJson([
      "base",
      "view-get-visible-fields",
      "--base-token",
      baseToken,
      "--table-id",
      tableId,
      "--view-id",
      viewId,
      "--as",
      "bot"
    ]));
    const primaryRepair = await repairLegacyPrimaryFieldOrder({
      baseToken,
      tableId,
      fieldDefinitions,
      actualFieldNames: current,
      expectedFieldNames: fieldNames
    });
    const primaryRepaired = primaryRepair.status === "updated";
    if (primaryRepair.status === "updated") {
      current = [fieldNames[0], fieldNames[1], ...current.slice(2)];
    }
    if (!primaryRepaired && JSON.stringify(current) === JSON.stringify(fieldNames)) {
      return { status: "unchanged", view_id: viewId, visible_fields: current };
    }
    await runJson([
      "base",
      "view-set-visible-fields",
      "--base-token",
      baseToken,
      "--table-id",
      tableId,
      "--view-id",
      viewId,
      `--json=${JSON.stringify({ visible_fields: fieldNames })}`,
      "--as",
      "bot"
    ]);
    return { status: "updated", view_id: viewId, visible_fields: fieldNames };
  }

  async function ensureDailyBase({ scanDirUrl, dateKey }) {
    const fieldNames = await getDailyBaseFieldNames();
    const root = await getWikiNode(scanDirUrl);
    const parentNodeToken = extractFirstString(root.node_token, root.nodeToken, extractWikiNodeToken(scanDirUrl));
    const spaceId = extractFirstString(root.space_id, root.spaceId);
    const title = buildDailyTitle(dateKey);
    const children = await listWikiChildren({ spaceId, parentNodeToken });
    const matches = children.filter((node) => node?.title === title);
    const bitableMatches = matches.filter((node) => {
      const type = String(node?.obj_type || node?.objType || "").toLowerCase();
      return !type || type === "bitable" || type === "base";
    });
    if (bitableMatches.length >= 1) {
      const node = bitableMatches[0];
      return {
        title,
        node_token: extractFirstString(node.node_token, node.nodeToken),
        obj_token: extractFirstString(node.obj_token, node.objToken),
        space_id: extractFirstString(node.space_id, node.spaceId, spaceId)
      };
    }

    const created = await runJson([
      "base",
      "base-create",
      "--name",
      title,
      "--table-name",
      ARGOS_DAILY_BASE_TABLE_NAME,
      "--fields",
      JSON.stringify(schemaFieldsInOrder(fieldNames).map(toTableCreateFieldPayload)),
      "--as",
      "bot"
    ]);
    const baseData = created?.data?.base || {};
    const tableData = created?.data?.table || {};
    const baseToken = extractFirstString(
      baseData?.base_token,
      baseData?.app_token,
      created?.data?.app_token,
      created?.data?.base_token,
      created?.app_token,
      created?.base_token
    );
    const tableId = extractFirstString(
      tableData?.table_id,
      tableData?.id,
      tableData?.tableId,
      created?.data?.table_id,
      created?.data?.id
    );
    if (!baseToken) throw new Error(`Argos daily Base ${title} create response missing base token`);
    if (!tableId) throw new Error(`Argos daily Base ${title} create response missing table_id`);

    const moved = await runJson([
      "wiki",
      "move",
      "--obj-token",
      baseToken,
      "--obj-type",
      "bitable",
      "--target-parent-token",
      parentNodeToken,
      "--target-space-id",
      spaceId,
      "--as",
      "bot"
    ]);
    const node = moved?.data || moved;
    return {
      title: extractFirstString(node.title, title),
      node_token: extractFirstString(node.node_token, node.nodeToken),
      obj_token: extractFirstString(node.obj_token, node.objToken, node.token, baseToken),
      table_id: tableId,
      space_id: extractFirstString(node.space_id, node.spaceId, spaceId)
    };
  }

  async function getBaseContext(dailyBase) {
    const baseToken = dailyBase.obj_token;
    const expectedFieldNames = await getDailyBaseFieldNames();
    if (!baseToken) throw new Error(`daily Base ${dailyBase.title} missing obj_token`);
    let tablesPayload;
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      try {
        tablesPayload = await runJson(["base", "table-list", "--base-token", baseToken, "--as", "bot"]);
        break;
      } catch (error) {
        if (!errorDetails(error).includes("base is copying") || attempt === 8) throw error;
        await sleep(Math.min(1000 * attempt, 5000));
      }
    }
    const tables = getItems(tablesPayload);
    const table = tables[0];
    const tableId = extractFirstString(table?.table_id, table?.id, table?.tableId);
    if (!tableId) throw new Error(`daily Base ${dailyBase.title} missing table_id`);
    const fieldsPayload = await runJson(["base", "field-list", "--base-token", baseToken, "--table-id", tableId, "--as", "bot"]);
    const fieldDefinitions = getItems(fieldsPayload);
    let fieldNames = normalizeFields(fieldsPayload);
    await repairLegacyPrimaryFieldOrder({
      baseToken,
      tableId,
      fieldDefinitions,
      actualFieldNames: fieldNames,
      expectedFieldNames
    });
    if (fieldNames[0] === "result_id" && fieldNames[1] === "unique_id" && expectedFieldNames[0] === "unique_id") {
      fieldNames = ["unique_id", "result_id", ...fieldNames.slice(2)];
    }
    const missing = expectedFieldNames.filter((fieldName) => !fieldNames.includes(fieldName));
    if (missing.length > 0) {
      await createMissingBaseFields({ baseToken, tableId, missingFields: missing });
    }
    const statusField = fieldDefinitions.find((field) => extractFirstString(field?.field_name, field?.name, field?.field_id, field?.id) === "status");
    const statusOptions = new Set((statusField?.options || []).map((option) => normalizeSelectOption(option).name).filter(Boolean));
    const missingStatusOptions = ARGOS_STATUS_OPTIONS.filter((option) => !statusOptions.has(option));
    if (missingStatusOptions.length > 0) {
      await runJson([
        "base",
        "field-update",
        "--base-token",
        baseToken,
        "--table-id",
        tableId,
        "--field-id",
        extractFirstString(statusField?.id, statusField?.field_id, "status"),
        `--json=${JSON.stringify({
          name: "status",
          type: "select",
          multiple: Boolean(statusField?.multiple),
          options: [...statusOptions, ...missingStatusOptions].map((name) => ({ name, hue: "Gray", lightness: "Light" }))
        })}`,
        "--yes",
        "--as",
        "bot"
      ]);
    }
    await ensureDailyBaseViewVisibleFields({ baseToken, tableId, fieldDefinitions, fieldNames: expectedFieldNames });
    return { baseToken, tableId, fieldNames: expectedFieldNames, actualFieldNames: fieldNames };
  }

  async function listRecords({ baseToken, tableId, limit = 200 }) {
    return normalizeRecords(
      await runJson(["base", "record-list", "--base-token", baseToken, "--table-id", tableId, "--page-size", String(limit), "--as", "bot"])
    );
  }

  async function batchCreateRecords({ baseToken, tableId, fieldNames, rows }) {
    if (rows.length === 0) return { ok: true, rows_written: 0, rows_skipped: 0 };
    const { cliPath } = await writeTempJson("argos-insert", { fields: fieldNames, rows });
    const payload = await runJson([
      "base",
      "record-batch-create",
      "--base-token",
      baseToken,
      "--table-id",
      tableId,
      `--json=${cliPath}`,
      "--as",
      "bot"
    ]);
    return { ok: true, rows_written: rows.length, response: payload };
  }

  async function batchUpdateRecords({ baseToken, tableId, updates }) {
    const responses = [];
    for (const update of updates) {
      const recordId = String(update?.record_id || "").trim();
      if (!recordId) throw new Error("batchUpdateRecords requires record_id");
      const { cliPath } = await writeTempJson("argos-update", {
        record_id_list: [recordId],
        patch: update.fields || {}
      });
      const payload = await runJson([
        "base",
        "record-batch-update",
        "--base-token",
        baseToken,
        "--table-id",
        tableId,
        `--json=${cliPath}`,
        "--as",
        "bot"
      ]);
      responses.push(payload);
    }
    return { ok: true, updated: updates.length, responses };
  }

  async function fetchDocMarkdown(docToken) {
    const payload = await runJson(["docs", "fetch", "--doc", docToken, "--doc-format", "markdown", "--as", "bot"]);
    return extractMarkdownText(payload);
  }

  async function overwriteDocMarkdown({ docToken, markdown }) {
    return runJson(["docs", "update", "--doc", docToken, "--command", "overwrite", "--doc-format", "markdown", "--content", markdown, "--as", "bot"]);
  }

  async function createWikiDoc({ title, parentNodeToken, spaceId }) {
    return runJson(["wiki", "node-create", "--obj-type", "docx", "--title", title, "--parent-node-token", parentNodeToken, "--space-id", spaceId, "--as", "bot"]);
  }

  async function publishInvestigationDoc({ workItem, modelResult }) {
    const resultId = String(workItem?.result_id || modelResult?.result_id || "").trim();
    const parentNodeToken = String(workItem?.parent_wiki_token || modelResult?.parent_wiki_token || "").trim();
    const spaceId = String(workItem?.target_space_id || modelResult?.target_space_id || "").trim();
    const originalDocUrl = String(modelResult?.ai_result || modelResult?.doc_url || "").trim();
    if (!parentNodeToken || !spaceId) {
      return {
        ai_result: originalDocUrl,
        doc_archive_status: "skipped",
        doc_archive_reason: "parent_wiki_token or target_space_id not provided"
      };
    }
    const title = buildTroubleshootingDocTitle({
      resultId,
      ruleName: workItem?.rule_name || modelResult?.rule_name,
      resultTime: workItem?.result_time || modelResult?.result_time,
      dateKey: workItem?.date_key || modelResult?.date_key
    });
    try {
      const children = (await listWikiChildren({ spaceId, parentNodeToken })).map((item) => normalizeNodeItem(item, spaceId));
      let targetNode = children.find((child) => child.title === title) || children.find((child) => child.title?.startsWith(`${resultId}:`));
      let docToken = targetNode?.obj_token;
      let wikiToken = targetNode?.node_token;
      let writeStatus = "updated";
      let existing = "";
      if (docToken) {
        existing = await fetchDocMarkdown(docToken);
      } else {
        const created = await createWikiDoc({ title, parentNodeToken, spaceId });
        docToken = extractCreatedDocToken(created);
        wikiToken = extractCreatedWikiToken(created);
        writeStatus = "created";
      }
      const markdown = String(
        modelResult?.result_markdown ||
        modelResult?.troubleshooting_markdown ||
        modelResult?.markdown ||
        ""
      ).trim() || [
        `# ${title}`,
        "",
        "## 排查结论",
        `- 固定归因：${modelResult?.attribution_result || "未填写"}`,
        `- 排查摘要：${modelResult?.ai_summary || modelResult?.summary || "未填写"}`,
        originalDocUrl ? `- 原始结果文档：${originalDocUrl}` : "",
        "",
        "## 关联信息",
        `- result_id: ${resultId}`,
        workItem?.rule_id ? `- rule_id: ${workItem.rule_id}` : "",
        workItem?.rule_name ? `- rule_name: ${workItem.rule_name}` : "",
        workItem?.psm ? `- psm: ${workItem.psm}` : ""
      ].filter(Boolean).join("\n");
      const merged = mergeMarkdownSections({ title, existingMarkdown: existing, newMarkdown: markdown });
      await overwriteDocMarkdown({ docToken, markdown: merged });
      return {
        ai_result: wikiToken ? `https://bytedance.larkoffice.com/wiki/${wikiToken}` : `https://bytedance.larkoffice.com/docx/${docToken}`,
        doc_token: docToken,
        doc_archive_status: isWikiDocumentUrl(wikiToken ? `https://bytedance.larkoffice.com/wiki/${wikiToken}` : "") ? writeStatus : "failed",
        doc_write_status: writeStatus,
        doc_archive_reason: undefined
      };
    } catch (error) {
      return {
        ai_result: originalDocUrl,
        doc_archive_status: "failed",
        doc_archive_reason: error?.message || String(error)
      };
    }
  }

  async function publishTotalSopDoc({ troubleshootingSopDoc, markdown, suggestion }) {
    const content = String(markdown || "").trim() || (String(suggestion || "").trim() ? `## Argos 通用沉淀\n\n- ${String(suggestion).trim()}` : "");
    if (!String(troubleshootingSopDoc || "").trim()) {
      return { total_sop_writeback_status: "skipped", total_sop_writeback_reason: "troubleshooting_sop_doc not provided" };
    }
    if (!content) {
      return { total_sop_writeback_status: "skipped", total_sop_writeback_reason: "no reusable total SOP update from this investigation" };
    }
    try {
      const root = await getWikiNode(troubleshootingSopDoc);
      const docToken = extractFirstString(root.obj_token, root.objToken, root.doc_token, root.node_token, extractWikiNodeToken(troubleshootingSopDoc));
      const title = extractFirstString(root.title, "分账argos报警排查sop");
      const existing = await fetchDocMarkdown(docToken);
      const merged = mergeMarkdownSections({ title, existingMarkdown: existing, newMarkdown: content });
      await overwriteDocMarkdown({ docToken, markdown: merged });
      return {
        total_sop_writeback_status: "succeeded",
        total_sop_doc_url: root.node_token ? `https://bytedance.larkoffice.com/wiki/${root.node_token}` : troubleshootingSopDoc
      };
    } catch (error) {
      return {
        total_sop_writeback_status: "failed",
        total_sop_writeback_reason: error?.message || String(error)
      };
    }
  }

  async function publishRuleSopDoc({ troubleshootingSopDoc, ruleId, ruleName, markdown }) {
    if (!String(troubleshootingSopDoc || "").trim()) {
      return { sop_writeback_status: "skipped", sop_writeback_reason: "troubleshooting_sop_doc not provided" };
    }
    if (!String(markdown || "").trim()) {
      return { sop_writeback_status: "skipped", sop_writeback_reason: "no reusable rule SOP update from this investigation" };
    }
    try {
      const root = await getWikiNode(troubleshootingSopDoc);
      const rootNodeToken = extractFirstString(root.node_token, root.nodeToken, extractWikiNodeToken(troubleshootingSopDoc));
      const rootSpaceId = extractFirstString(root.space_id, root.spaceId);
      const title = buildRuleSopDocTitle({ ruleId, ruleName });
      const children = (await listWikiChildren({ spaceId: rootSpaceId, parentNodeToken: rootNodeToken })).map((item) => normalizeNodeItem(item, rootSpaceId));
      let targetNode = children.find((child) => child.title === title) || children.find((child) => child.title?.startsWith(`${ruleId}:`));
      let docToken = targetNode?.obj_token;
      let wikiToken = targetNode?.node_token;
      let writeStatus = "updated";
      let existing = "";
      if (docToken) {
        existing = await fetchDocMarkdown(docToken);
      } else {
        const created = await createWikiDoc({ title, parentNodeToken: rootNodeToken, spaceId: rootSpaceId });
        docToken = extractCreatedDocToken(created);
        wikiToken = extractCreatedWikiToken(created);
        writeStatus = "created";
      }
      const merged = mergeMarkdownSections({ title, existingMarkdown: existing, newMarkdown: markdown });
      await overwriteDocMarkdown({ docToken, markdown: merged });
      return {
        sop_writeback_status: "succeeded",
        sop_doc_url: wikiToken ? `https://bytedance.larkoffice.com/wiki/${wikiToken}` : `https://bytedance.larkoffice.com/docx/${docToken}`,
        sop_doc_token: docToken,
        sop_doc_write_status: writeStatus
      };
    } catch (error) {
      return {
        sop_writeback_status: "failed",
        sop_writeback_reason: error?.message || String(error)
      };
    }
  }

  async function replyMessage({ messageId, markdown }) {
    return runJson(["im", "messages-reply", "--message-id", messageId, "--reply-in-thread", "--markdown", markdown, "--as", "bot"]);
  }

  async function collectDailyBaseContexts({ scanDirUrl, dateKeys }) {
    const contexts = [];
    for (const dateKey of dateKeys) {
      const dailyBase = await ensureDailyBase({ scanDirUrl, dateKey });
      const baseContext = await getBaseContext(dailyBase);
      contexts.push({
        date_key: dateKey,
        title: dailyBase.title,
        daily_base_url: dailyBase.node_token ? `https://bytedance.larkoffice.com/wiki/${dailyBase.node_token}` : "",
        parent_wiki_token: dailyBase.node_token,
        target_space_id: dailyBase.space_id,
        base_token: baseContext.baseToken,
        table_id: baseContext.tableId,
        field_names: baseContext.fieldNames,
        actual_field_names: baseContext.actualFieldNames
      });
    }
    return contexts;
  }

  async function findDailyBase({ scanDirUrl, dateKey }) {
    const root = await getWikiNode(scanDirUrl);
    const rootNodeToken = extractFirstString(root.node_token, root.nodeToken, extractWikiNodeToken(scanDirUrl));
    const spaceId = extractFirstString(root.space_id, root.spaceId);
    const title = buildDailyTitle(dateKey);
    const children = await listWikiChildren({ spaceId, parentNodeToken: rootNodeToken });
    return children.map((item) => normalizeNodeItem(item, spaceId)).find((item) => item.title === title && item.obj_token) || null;
  }

  async function collectExistingDailyBaseContexts({ scanDirUrl, dateKeys }) {
    const contexts = [];
    for (const dateKey of dateKeys) {
      const dailyBase = await findDailyBase({ scanDirUrl, dateKey });
      if (!dailyBase) continue;
      const baseContext = await getBaseContext(dailyBase);
      contexts.push({
        date_key: dateKey,
        title: dailyBase.title,
        daily_base_url: dailyBase.node_token ? `https://bytedance.larkoffice.com/wiki/${dailyBase.node_token}` : "",
        base_token: baseContext.baseToken,
        table_id: baseContext.tableId,
        field_names: baseContext.fieldNames,
        actual_field_names: baseContext.actualFieldNames
      });
    }
    return contexts;
  }

  async function fetchDocumentMarkdownByUrl(url) {
    const rawUrl = String(url || "").trim();
    if (!rawUrl) return { status: "skipped", markdown: "", reason: "ai_result empty" };
    try {
      let docToken = "";
      if (isWikiDocumentUrl(rawUrl)) {
        const node = await getWikiNode(rawUrl);
        docToken = extractFirstString(node.obj_token, node.objToken, node.doc_token, node.node_token, extractWikiNodeToken(rawUrl));
      } else {
        docToken = extractWikiNodeToken(rawUrl);
      }
      if (!docToken) return { status: "failed", markdown: "", reason: "document token not found" };
      return { status: "succeeded", markdown: await fetchDocMarkdown(docToken), reason: "" };
    } catch (error) {
      return { status: "failed", markdown: "", reason: error?.message || String(error) };
    }
  }

  async function getReadOnlyDailyBaseTableContext(dailyBase, dateKey) {
    const baseToken = extractFirstString(dailyBase?.obj_token, dailyBase?.objToken);
    if (!baseToken) return null;
    const tablesPayload = await runJson(["base", "table-list", "--base-token", baseToken, "--as", "bot"]);
    const table = getItems(tablesPayload)[0];
    const tableId = extractFirstString(table?.table_id, table?.id, table?.tableId);
    if (!tableId) return null;
    return {
      date_key: dateKey,
      daily_base_url: dailyBase.node_token ? `https://bytedance.larkoffice.com/wiki/${dailyBase.node_token}` : "",
      base_token: baseToken,
      table_id: tableId
    };
  }

  async function collectRecentRuleInvestigationReferences({ scanDirUrl, workItem, limit = 2 } = {}) {
    const ruleId = String(workItem?.rule_id || workItem?.unique_id || "").trim();
    const dateKey = String(workItem?.date_key || formatDateKey(workItem?.result_time) || "").trim();
    if (!scanDirUrl || !ruleId || !dateKey) return [];
    const references = [];
    for (const previousDateKey of previousDateKeys(dateKey, 2)) {
      try {
        const dailyBase = await findDailyBase({ scanDirUrl, dateKey: previousDateKey });
        if (!dailyBase) continue;
        const context = await getReadOnlyDailyBaseTableContext(dailyBase, previousDateKey);
        if (!context) continue;
        const records = await listRecords({ baseToken: context.base_token, tableId: context.table_id });
        for (const record of records) {
          if (references.length >= Number(limit || 2)) break;
          const fields = record.fields || {};
          const recordRuleId = String(fields.rule_id || fields.unique_id || "").trim();
          if (recordRuleId !== ruleId) continue;
          if (readStatus(fields) !== "succeeded") continue;
          const aiResult = String(fields.ai_result || "").trim();
          const doc = await fetchDocumentMarkdownByUrl(aiResult);
          references.push({
            date_key: context.date_key,
            record_id: record.record_id,
            unique_id: String(fields.unique_id || "").trim(),
            result_id: String(fields.result_id || "").trim(),
            rule_id: recordRuleId,
            rule_name: String(fields.rule_name || "").trim(),
            psm: String(fields.psm || "").trim(),
            ai_summary: String(fields.ai_summary || "").trim(),
            ai_result: aiResult,
            ai_finished_at: String(fields.ai_finished_at || "").trim(),
            daily_base_url: context.daily_base_url,
            doc_fetch_status: doc.status,
            doc_fetch_reason: doc.reason,
            doc_markdown: doc.markdown
          });
        }
        if (references.length >= Number(limit || 2)) break;
      } catch {
        continue;
      }
    }
    return references;
  }

  const runner = {
    async scanChatToBase({
      chatId = DEFAULT_ARGOS_CHAT_ID,
      start,
      end,
      scanDirUrl = DEFAULT_ARGOS_SCAN_DIR_URL,
      initStatus = "init",
      pageSize = 50,
      resultDir,
      levels,
      psms
    } = {}) {
      const startDate = safeDate(start);
      const endDate = safeDate(end);
      if (!startDate || !endDate) throw new Error("scanChatToBase requires valid start and end");
      const { messages, identity } = await readChatMessages({ chatId, start: startDate, end: endDate, pageSize });
      const filter = buildArgosAlertFilter({ levels, psms });
      const extractedAlerts = messages.map(extractArgosAlertFromMessage).filter(Boolean);
      const alerts = extractedAlerts.filter((alert) => matchesArgosAlertFilter(alert, filter));
      const grouped = new Map();
      const groupedDateMetadata = new Map();
      for (const alert of alerts) {
        const resultTimeDateKey = formatDateKey(alert.result_time) || alert.alarm_date || "";
        const messageDateKey = formatDateKey(alert.message_create_time || alert.extra?.message_create_time) || "";
        const dateKey = resultTimeDateKey || messageDateKey || formatDateKey(endDate);
        const dateKeyReason = resultTimeDateKey ? "result_time" : messageDateKey ? "message_create_time" : "scan_end_time";
        if (!grouped.has(dateKey)) grouped.set(dateKey, []);
        grouped.get(dateKey).push(alert);
        const metadata = groupedDateMetadata.get(dateKey) || {
          date_key_reason: dateKeyReason,
          result_time_date_keys: new Set(),
          message_date_keys: new Set()
        };
        if (resultTimeDateKey) metadata.result_time_date_keys.add(resultTimeDateKey);
        if (messageDateKey) metadata.message_date_keys.add(messageDateKey);
        if (metadata.date_key_reason !== "result_time" && dateKeyReason === "result_time") metadata.date_key_reason = dateKeyReason;
        groupedDateMetadata.set(dateKey, metadata);
      }
      if (grouped.size === 0) grouped.set(formatDateKey(endDate), []);

      const dailyResults = [];
      let totalWritten = 0;
      let totalSkipped = 0;
      let lastFieldNames = [];
      const insertedResultIds = [];
      const skippedResultIds = [];
      for (const [dateKey, dateAlerts] of grouped.entries()) {
        const dailyBase = await ensureDailyBase({ scanDirUrl, dateKey });
        const context = await getBaseContext(dailyBase);
        lastFieldNames = context.fieldNames;
        const records = await listRecords({ baseToken: context.baseToken, tableId: context.tableId });
        const existingUniqueIds = new Set(records.map((record) => String(record.fields.unique_id || "").trim()).filter(Boolean));
        const rows = [];
        for (const alert of dateAlerts) {
          if (existingUniqueIds.has(alert.unique_id)) {
            totalSkipped += 1;
            skippedResultIds.push(alert.result_id || alert.unique_id);
            continue;
          }
          const record = buildArgosBaseRecord({ ...alert, create_time: alert.message_create_time || alert.extra?.message_create_time || alert.result_time }, context.fieldNames, initStatus);
          rows.push(context.fieldNames.map((fieldName) => record[fieldName] ?? null));
          existingUniqueIds.add(alert.unique_id);
          insertedResultIds.push(alert.result_id || alert.unique_id);
        }
        const write = await batchCreateRecords({ baseToken: context.baseToken, tableId: context.tableId, fieldNames: context.fieldNames, rows });
        totalWritten += write.rows_written || 0;
        dailyResults.push({
          date_key: dateKey,
          date_key_reason: groupedDateMetadata.get(dateKey)?.date_key_reason || "scan_end_time",
          result_time_date_key: Array.from(groupedDateMetadata.get(dateKey)?.result_time_date_keys || [])[0] || "",
          result_time_date_keys: Array.from(groupedDateMetadata.get(dateKey)?.result_time_date_keys || []),
          message_date_keys: Array.from(groupedDateMetadata.get(dateKey)?.message_date_keys || []),
          daily_base: dailyBase,
          daily_base_url: dailyBase.node_token ? `https://bytedance.larkoffice.com/wiki/${dailyBase.node_token}` : "",
          alerts: dateAlerts.length,
          write
        });
      }
      let artifacts;
      if (resultDir) {
        const messagesJsonl = join(resultDir, "messages.jsonl");
        const alertsJsonl = join(resultDir, "alerts.jsonl");
        const upsertPlanPath = join(resultDir, "upsert-plan.json");
        const upsertPlan = {
          kind: "argos_alarm_upsert_plan",
          chat_id: chatId,
          scan_window: {
            start: startDate.toISOString(),
            end: endDate.toISOString()
          },
          read_identity: identity,
          messages_scanned: messages.length,
          alerts_extracted: extractedAlerts.length,
          alerts_scanned: alerts.length,
          filter,
          rows_written: totalWritten,
          rows_skipped: totalSkipped,
          inserted_result_ids: insertedResultIds.filter(Boolean),
          skipped_result_ids: skippedResultIds.filter(Boolean),
          daily_results: dailyResults.map((item) => ({
            date_key: item.date_key,
            date_key_reason: item.date_key_reason,
            result_time_date_keys: item.result_time_date_keys,
            message_date_keys: item.message_date_keys,
            daily_base_url: item.daily_base_url,
            alerts: item.alerts,
            rows_written: item.write?.rows_written || 0
          }))
        };
        await writeJsonlFileAtomic(messagesJsonl, messages);
        await writeJsonlFileAtomic(alertsJsonl, alerts);
        await writeJsonFileAtomic(upsertPlanPath, upsertPlan);
        artifacts = {
          messages_jsonl: messagesJsonl,
          alerts_jsonl: alertsJsonl,
          upsert_plan: upsertPlanPath
        };
      }
      return {
        kind: "argos_alarm_scan_chat_to_base",
        success: true,
        read_identity: identity,
        messages_scanned: messages.length,
        alerts_extracted: extractedAlerts.length,
        alerts_scanned: alerts.length,
        filter,
        daily_results: dailyResults,
        daily_base_urls: dailyResults.map((item) => item.daily_base_url).filter(Boolean),
        field_names: lastFieldNames,
        artifacts,
        write: {
          rows_written: totalWritten,
          rows_skipped: totalSkipped
        }
      };
    },

    async prepareAutoTroubleshoot({
      scanDirUrl = DEFAULT_ARGOS_SCAN_DIR_URL,
      dateKeys = [formatDateKey(new Date())],
      sessionId = process.env.AI_SESSION_ID || `argos-${process.pid}`,
      claimLimit = 1,
      troubleshootingSopDoc = DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC,
      resultDir
    } = {}) {
      const contexts = await collectDailyBaseContexts({ scanDirUrl, dateKeys });
      const workItems = [];
      for (const context of contexts) {
        const records = await listRecords({ baseToken: context.base_token, tableId: context.table_id });
        for (const record of records) {
          if (workItems.length >= Number(claimLimit || 1)) break;
          const status = readStatus(record.fields);
          if (status && status !== "init") continue;
          if (!record.record_id || !record.fields?.result_id || !record.fields?.unique_id) continue;
          const now = new Date().toISOString();
          const extra = {
            ...(typeof record.fields.extra === "string" ? JSON.parse(record.fields.extra || "{}") : {}),
            processing_session_id: sessionId,
            processing_started_at: now
          };
          await batchUpdateRecords({
            baseToken: context.base_token,
            tableId: context.table_id,
            updates: [
              {
                record_id: record.record_id,
                fields: {
                  status: "processing",
                  ai_session_id: sessionId,
                  extra: JSON.stringify(extra)
                }
              }
            ]
          });
          workItems.push({
            record_id: record.record_id,
            unique_id: record.fields.unique_id,
            result_id: record.fields.result_id,
            rule_id: record.fields.rule_id,
            rule_name: record.fields.rule_name,
            psm: record.fields.psm,
            result_time: record.fields.result_time,
            status: "processing",
            date_key: context.date_key,
            ai_session_id: sessionId,
            base_token: context.base_token,
            table_id: context.table_id,
            daily_base_url: context.daily_base_url,
            scan_dir_url: scanDirUrl,
            parent_wiki_token: context.parent_wiki_token,
            target_space_id: context.target_space_id,
            field_names: context.actual_field_names,
            troubleshooting_sop_doc: troubleshootingSopDoc,
            extra
          });
        }
      }
      const dispatchPlan = buildDispatchPlan({ workItems, resultDir, scanDirUrl, troubleshootingSopDoc });
      if (resultDir) {
        await mkdir(resultDir, { recursive: true });
        await writeJsonFileAtomic(join(resultDir, "work-items.json"), workItems);
        await writeJsonFileAtomic(join(resultDir, "dispatch-plan.json"), dispatchPlan);
        for (const workItem of workItems) {
          if (workItem.result_id) await writeJsonFileAtomic(join(resultDir, `work-items-${workItem.result_id}.json`), [workItem]);
        }
      }
      return {
        kind: "argos_alarm_prepare_auto_troubleshoot",
        success: true,
        processed_bases: contexts.length,
        claimed: workItems.length,
        workItems,
        dispatch_plan: dispatchPlan
      };
    },

    async splitWorkItems({
      workItems = [],
      resultDir,
      scanDirUrl = DEFAULT_ARGOS_SCAN_DIR_URL,
      troubleshootingSopDoc = DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC
    } = {}) {
      if (!resultDir) throw new Error("splitWorkItems requires resultDir");
      await mkdir(resultDir, { recursive: true });
      const dispatchPlan = buildDispatchPlan({ workItems, resultDir, scanDirUrl, troubleshootingSopDoc });
      const state = {
        kind: "argos_alarm_auto_orchestrator_state",
        result_dir: resultDir,
        scan_dir_url: scanDirUrl,
        work_items_count: workItems.length,
        next_action: workItems.length > 0 ? "dispatch_required" : "final_drain_required",
        dispatch_plan: dispatchPlan
      };
      await writeJsonFileAtomic(join(resultDir, "work-items.json"), workItems);
      await writeJsonFileAtomic(join(resultDir, "dispatch-plan.json"), dispatchPlan);
      await writeJsonFileAtomic(join(resultDir, "auto-orchestrator-state.json"), state);
      for (const workItem of workItems) {
        if (workItem?.result_id) await writeJsonFileAtomic(join(resultDir, `work-items-${workItem.result_id}.json`), [workItem]);
      }
      return {
        kind: "argos_alarm_split_work_items",
        success: true,
        result_dir: resultDir,
        work_items_count: workItems.length,
        next_action: state.next_action,
        dispatch_plan: dispatchPlan
      };
    },

    async resumeAutoOrchestration({
      resultDir,
      scanDirUrl = DEFAULT_ARGOS_SCAN_DIR_URL,
      troubleshootingSopDoc = DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC,
      sessionId
    } = {}) {
      if (!resultDir) throw new Error("resumeAutoOrchestration requires resultDir");
      const workItemsPath = join(resultDir, "work-items.json");
      const workItems = existsSync(workItemsPath) ? JSON.parse(await readFile(workItemsPath, "utf8")) : [];
      const validation = workItems.length > 0 ? await this.validateResultDir({ workItems, resultDir, sessionId }) : { results: [] };
      const readyItems = workItems.filter((workItem) => validation.per_result_close_readiness?.[workItem.result_id]?.ready_for_close === true);
      const missingItems = workItems.filter((workItem) => validation.per_result_close_readiness?.[workItem.result_id]?.blockers?.includes("result_json_missing"));
      const nextAction = readyItems.length > 0
        ? "close_ready_required"
        : missingItems.length > 0
          ? "dispatch_required"
          : "final_drain_required";
      const dispatchPlan = buildDispatchPlan({ workItems: missingItems, resultDir, scanDirUrl, troubleshootingSopDoc });
      const state = {
        kind: "argos_alarm_resume_auto_orchestration",
        success: true,
        result_dir: resultDir,
        next_action: nextAction,
        next_dispatch_items: dispatchPlan.items,
        ready_result_ids: readyItems.map((item) => item.result_id),
        validation
      };
      await writeJsonFileAtomic(join(resultDir, "auto-orchestrator-state.json"), state);
      return state;
    },

    async closeReadyWorkItems({ workItems = [], resultDir, sessionId, skipMessageReply = false } = {}) {
      if (!resultDir) throw new Error("closeReadyWorkItems requires resultDir");
      const validation = await this.validateResultDir({ workItems, resultDir, sessionId });
      const results = [];
      for (const workItem of workItems) {
        const readiness = validation.per_result_close_readiness?.[workItem.result_id];
        if (readiness?.ready_for_close !== true) {
          results.push({
            result_id: workItem.result_id,
            status: "skipped",
            reason: "not ready for close",
            blockers: readiness?.blockers || []
          });
          continue;
        }
        const closeResult = await this.closeWorkItem({ workItem, resultDir, sessionId, skipMessageReply });
        await writeJsonFileAtomic(join(resultDir, `close-${workItem.result_id}.json`), closeResult);
        results.push(closeResult);
      }
      const failed = results.filter((item) => item.success === false || item.status === "skipped");
      return {
        kind: "argos_alarm_close_ready_work_items",
        success: failed.length === 0,
        closed: results.filter((item) => item.kind === "argos_alarm_close_work_item").length,
        skipped: results.filter((item) => item.status === "skipped").length,
        results,
        validation
      };
    },

    async recoverProcessingRecords({
      scanDirUrl = DEFAULT_ARGOS_SCAN_DIR_URL,
      dateKeys = [formatDateKey(new Date())],
      sessionId = process.env.AI_SESSION_ID || "",
      processingMaxAgeMinutes = 120,
      resultId,
      forceByResultId = false,
      apply = false
    } = {}) {
      const contexts = await collectExistingDailyBaseContexts({ scanDirUrl, dateKeys });
      const recovered = [];
      const skipped = [];
      const now = Date.now();
      for (const context of contexts) {
        const records = await listRecords({ baseToken: context.base_token, tableId: context.table_id });
        for (const record of records) {
          const fields = record.fields || {};
          if (readStatus(fields) !== "processing") continue;
          const recordResultId = String(fields.result_id || "").trim();
          const extra = typeof fields.extra === "string" ? JSON.parse(fields.extra || "{}") : (fields.extra || {});
          const startedAt = Date.parse(extra.processing_started_at || extra.processingStartedAt || "");
          const ageMs = Number.isFinite(startedAt) ? now - startedAt : Infinity;
          const stale = ageMs >= Number(processingMaxAgeMinutes || 120) * 60 * 1000;
          const sessionMatched = sessionId && String(fields.ai_session_id || extra.processing_session_id || "") === String(sessionId);
          const forceAllowed = Boolean(forceByResultId && resultId && recordResultId === String(resultId));
          if (!stale) {
            skipped.push({ result_id: recordResultId, record_id: record.record_id, reason: "not_stale" });
            continue;
          }
          if (!sessionMatched && !forceAllowed) {
            skipped.push({ result_id: recordResultId, record_id: record.record_id, reason: "session_mismatch" });
            continue;
          }
          if (apply) {
            await batchUpdateRecords({
              baseToken: context.base_token,
              tableId: context.table_id,
              updates: [{
                record_id: record.record_id,
                fields: {
                  status: "init",
                  ai_session_id: "",
                  extra: JSON.stringify({
                    ...extra,
                    processing_recovered_at: new Date(now).toISOString(),
                    processing_recovered_by_session: sessionId,
                    processing_recovery_reason: forceAllowed ? "forced_by_result_id" : "same_session_stale"
                  })
                }
              }]
            });
          }
          recovered.push({ result_id: recordResultId, record_id: record.record_id, applied: Boolean(apply), age_ms: ageMs });
        }
      }
      return {
        kind: "argos_alarm_recover_processing_records",
        success: true,
        recovered,
        skipped,
        applied: Boolean(apply)
      };
    },

    async syncDailyBaseTemplateOrder({
      scanDirUrl = DEFAULT_ARGOS_SCAN_DIR_URL,
      dateKey = formatDateKey(new Date())
    } = {}) {
      const dailyBase = await ensureDailyBase({ scanDirUrl, dateKey });
      const context = await getBaseContext(dailyBase);
      return {
        kind: "argos_alarm_sync_daily_base_template_order",
        success: true,
        date_key: dateKey,
        daily_base: dailyBase,
        daily_base_url: dailyBase.node_token ? `https://bytedance.larkoffice.com/wiki/${dailyBase.node_token}` : "",
        base_token: context.baseToken,
        table_id: context.tableId,
        field_names: context.fieldNames,
        actual_field_names: context.actualFieldNames
      };
    },

    async inspectResult({ workItem = {}, outputFile } = {}) {
      const resultId = String(workItem.result_id || workItem.unique_id || "").trim();
      if (!resultId) throw new Error("inspectResult requires workItem.result_id");
      const extra = typeof workItem.extra === "string" ? JSON.parse(workItem.extra || "{}") : (workItem.extra || {});
      const inspect = {
        kind: "argos_alarm_inspect_result",
        result_id: resultId,
        inspect_result: {
          result_id: resultId,
          unique_id: String(workItem.unique_id || resultId).trim(),
          rule_id: String(workItem.rule_id || "").trim(),
          rule_name: String(workItem.rule_name || "").trim(),
          psm: String(workItem.psm || "").trim(),
          level: String(workItem.level || "").trim(),
          result_time: String(workItem.result_time || "").trim(),
          result_url: String(workItem.result_url || "").trim(),
          rule_url: String(workItem.rule_url || "").trim(),
          result_content: String(workItem.result_content || "").trim(),
          source_message_id: String(extra.message_id || workItem.message_id || "").trim(),
          source_chat_id: String(extra.chat_id || workItem.chat_id || "").trim()
        },
        work_item: workItem
      };
      if (outputFile) await writeJsonFileAtomic(outputFile, inspect);
      return inspect;
    },

    async prepareSingleTroubleshootData({
      workItem = {},
      resultDir,
      scanDirUrl = workItem.scan_dir_url || DEFAULT_ARGOS_SCAN_DIR_URL,
      troubleshootingSopDoc = workItem.troubleshooting_sop_doc || DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC
    } = {}) {
      if (!resultDir) throw new Error("prepareSingleTroubleshootData requires resultDir");
      const resultId = String(workItem.result_id || "").trim();
      if (!resultId) throw new Error("prepareSingleTroubleshootData requires workItem.result_id");
      await mkdir(resultDir, { recursive: true });
      const inspect = await this.inspectResult({ workItem, outputFile: join(resultDir, `inspect-${resultId}.json`) });
      let totalSopMarkdown = "";
      try {
        const root = await getWikiNode(troubleshootingSopDoc);
        const docToken = extractFirstString(root.obj_token, root.objToken, root.doc_token, root.node_token, extractWikiNodeToken(troubleshootingSopDoc));
        totalSopMarkdown = docToken ? await fetchDocMarkdown(docToken) : "";
      } catch {
        totalSopMarkdown = "";
      }
      const recentRuleInvestigations = await collectRecentRuleInvestigationReferences({ scanDirUrl, workItem });
      const input = {
        kind: "argos_alarm_single_troubleshoot_input",
        result_id: resultId,
        work_item: workItem,
        inspect_result: inspect.inspect_result,
        troubleshooting_sop_doc: troubleshootingSopDoc,
        total_sop_markdown: totalSopMarkdown,
        recent_rule_investigation_policy: {
          role: "hypothesis_reference_only",
          max_lookback_days: 2,
          must_verify_with_current_evidence: true,
          may_reuse: ["metric_dimensions", "log_keywords", "validated_counterexamples", "investigation_steps"],
          must_not_reuse_without_verification: ["root_cause", "attribution_result", "remediation_conclusion", "business_impact"],
          instruction: "历史排查结果只用于缩小排查范围和复用取证路径；必须用本次报警窗口的指标、日志、trace、RCA 或依赖证据重新验证后才能下结论。"
        },
        recent_rule_investigations: recentRuleInvestigations
      };
      const inputFile = join(resultDir, `single-input-${resultId}.json`);
      await writeJsonFileAtomic(inputFile, input);
      return {
        kind: "argos_alarm_prepare_single_troubleshoot_data",
        success: true,
        result_id: resultId,
        input_file: inputFile,
        inspect_file: join(resultDir, `inspect-${resultId}.json`)
      };
    },

    async publishTroubleshootingDoc({ workItem = {}, modelResult = {}, outputFile } = {}) {
      const result = {
        kind: "argos_alarm_publish_troubleshooting_doc",
        ...(await publishInvestigationDoc({ workItem, modelResult }))
      };
      if (outputFile) await writeJsonFileAtomic(outputFile, result);
      return result;
    },

    async publishSopDoc({
      type = "rule",
      troubleshootingSopDoc = DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC,
      ruleId,
      ruleName,
      markdown,
      suggestion
    } = {}) {
      if (type === "total") {
        return {
          kind: "argos_alarm_publish_sop_doc",
          type: "total",
          ...(await publishTotalSopDoc({ troubleshootingSopDoc, markdown, suggestion }))
        };
      }
      return {
        kind: "argos_alarm_publish_sop_doc",
        type: "rule",
        ...(await publishRuleSopDoc({ troubleshootingSopDoc, ruleId, ruleName, markdown }))
      };
    },

    async normalizeModelResultJson({ inputFile, outputFile, workItem = {} } = {}) {
      if (!inputFile) throw new Error("normalizeModelResultJson requires inputFile");
      const raw = JSON.parse(await readFile(inputFile, "utf8"));
      const normalized = normalizeArgosModelResultShape(raw, workItem);
      if (outputFile) await writeJsonFileAtomic(outputFile, normalized);
      return {
        kind: "argos_alarm_normalize_model_result_json",
        success: true,
        input_file: inputFile,
        output_file: outputFile || inputFile,
        normalized_result: normalized
      };
    },

    async normalizeResultDocLinks({ inputFile, outputFile, markdownFile, workItem = {} } = {}) {
      if (!inputFile) throw new Error("normalizeResultDocLinks requires inputFile");
      const raw = JSON.parse(await readFile(inputFile, "utf8"));
      let normalized = normalizeArgosModelResultShape(raw, workItem);
      if (!isWikiDocumentUrl(normalized.ai_result)) {
        if (!markdownFile) throw new Error("normalizeResultDocLinks requires markdownFile when ai_result is not a wiki link");
        const markdown = await readFile(markdownFile, "utf8");
        const published = await publishInvestigationDoc({
          workItem,
          modelResult: {
            ...normalized,
            result_markdown: markdown
          }
        });
        normalized = {
          ...normalized,
          ai_result: published.ai_result,
          feishu_doc_url: published.ai_result,
          doc_url: published.ai_result,
          doc_token: published.doc_token,
          doc_archive_status: published.doc_archive_status,
          doc_write_status: published.doc_write_status
        };
      }
      if (outputFile) await writeJsonFileAtomic(outputFile, normalized);
      return {
        kind: "argos_alarm_normalize_result_doc_links",
        success: true,
        input_file: inputFile,
        output_file: outputFile || inputFile,
        normalized_result: normalized
      };
    },

    async doctorDailyBase({
      scanDirUrl = DEFAULT_ARGOS_SCAN_DIR_URL,
      dateKey = formatDateKey(new Date()),
      outputFile
    } = {}) {
      const dailyBase = await findDailyBase({ scanDirUrl, dateKey });
      if (!dailyBase) {
        const result = {
          kind: "argos_alarm_doctor_daily_base",
          success: false,
          date_key: dateKey,
          checks: {
            daily_base_exists: { ok: false, reason: "daily Base not found" }
          },
          cleanup_plan: []
        };
        if (outputFile) await writeJsonFileAtomic(outputFile, result);
        return result;
      }
      const context = await getBaseContext(dailyBase);
      const expectedFieldNames = await getDailyBaseFieldNames();
      const viewPayload = await runJson(["base", "view-list", "--base-token", context.baseToken, "--table-id", context.tableId, "--as", "bot"]);
      const view = getItems(viewPayload)[0];
      const viewId = extractFirstString(view?.view_id, view?.id, view?.viewId);
      const visibleFields = viewId
        ? normalizeVisibleFieldNames(await runJson([
          "base",
          "view-get-visible-fields",
          "--base-token",
          context.baseToken,
          "--table-id",
          context.tableId,
          "--view-id",
          viewId,
          "--as",
          "bot"
        ]))
        : [];
      const dashboardPayload = await runJson(["base", "dashboard-list", "--base-token", context.baseToken, "--as", "bot"]);
      const workflowPayload = await runJson(["base", "workflow-list", "--base-token", context.baseToken, "--as", "bot"]);
      const dashboards = (dashboardPayload?.data?.dashboards || dashboardPayload?.dashboards || getItems(dashboardPayload))
        .map((item) => ({
          id: extractFirstString(item.dashboard_id, item.dashboardId, item.id),
          name: extractFirstString(item.name, item.dashboard_name, item.title)
        }))
        .filter((item) => item.id);
      const workflows = (workflowPayload?.data?.workflows || workflowPayload?.workflows || getItems(workflowPayload))
        .map((item) => ({
          id: extractFirstString(item.workflow_id, item.workflowId, item.id),
          name: extractFirstString(item.name, item.workflow_name, item.title),
          status: extractFirstString(item.status, item.state)
        }))
        .filter((item) => item.id);
      const missingFields = expectedFieldNames.filter((fieldName) => !context.actualFieldNames.includes(fieldName));
      const extraFields = context.actualFieldNames.filter((fieldName) => !expectedFieldNames.includes(fieldName));
      const visibleMissing = expectedFieldNames.filter((fieldName) => !visibleFields.includes(fieldName));
      const visibleExtra = visibleFields.filter((fieldName) => !expectedFieldNames.includes(fieldName));
      const cleanupPlan = [
        ...dashboards.map((item) => ({ type: "dashboard", id: item.id, name: item.name, action: "manual_review_delete_if_unneeded" })),
        ...workflows.map((item) => ({ type: "workflow", id: item.id, name: item.name, action: "manual_review_disable_if_unneeded" }))
      ];
      const primaryFieldOk = context.actualFieldNames[0] === expectedFieldNames[0];
      const repairPlan = [
        ...cleanupPlan,
        ...(!primaryFieldOk ? [{
          type: "primary_field",
          expected: expectedFieldNames[0],
          actual: context.actualFieldNames[0] || "",
          action: "manual_migration_recreate_base_if_required",
          reason: "Feishu Base existing primary field cannot be safely changed in-place by runner; visible field order is already enforced separately."
        }] : [])
      ];
      const checks = {
        daily_base_exists: { ok: true },
        schema_fields: {
          ok: missingFields.length === 0,
          expected: expectedFieldNames,
          actual: context.actualFieldNames,
          missing: missingFields,
          extra: extraFields
        },
        visible_fields: {
          ok: JSON.stringify(visibleFields) === JSON.stringify(expectedFieldNames),
          expected: expectedFieldNames,
          actual: visibleFields,
          missing: visibleMissing,
          extra: visibleExtra
        },
        dashboards: {
          ok: dashboards.length === 0,
          count: dashboards.length,
          items: dashboards
        },
        workflows: {
          ok: workflows.length === 0,
          count: workflows.length,
          items: workflows
        },
        primary_field: {
          ok: primaryFieldOk,
          expected: expectedFieldNames[0],
          actual: context.actualFieldNames[0] || "",
          severity: primaryFieldOk ? "ok" : "warning",
          blocking: false,
          reason_code: primaryFieldOk ? "" : "historical_primary_field_drift"
        }
      };
      const blockingChecksOk = checks.daily_base_exists.ok === true &&
        checks.schema_fields.ok === true &&
        checks.visible_fields.ok === true &&
        checks.dashboards.ok === true &&
        checks.workflows.ok === true;
      const result = {
        kind: "argos_alarm_doctor_daily_base",
        success: blockingChecksOk,
        date_key: dateKey,
        daily_base_url: dailyBase.node_token ? `https://bytedance.larkoffice.com/wiki/${dailyBase.node_token}` : "",
        base_token: context.baseToken,
        table_id: context.tableId,
        checks,
        cleanup_plan: cleanupPlan,
        repair_plan: repairPlan
      };
      if (outputFile) await writeJsonFileAtomic(outputFile, result);
      return result;
    },

    async closeWorkItem({ workItem, modelResultFile, resultDir, sessionId, skipMessageReply = false }) {
      if (!workItem?.record_id) throw new Error("closeWorkItem requires workItem.record_id");
      const resultId = String(workItem.result_id || "").trim();
      if (!resultId) throw new Error("closeWorkItem requires workItem.result_id");
      const expectedSession = String(sessionId || workItem.ai_session_id || "").trim();
      if (expectedSession && String(workItem.ai_session_id || "") !== expectedSession) {
        throw new Error("closeWorkItem session mismatch");
      }
      const filePath = modelResultFile || join(resultDir || ".", `${resultId}.json`);
      const modelResult = JSON.parse(await readFile(filePath, "utf8"));
      const validation = await validateArgosModelResultWithReview({ workItem, modelResult, resultDir: resultDir || resolve(filePath, "..") });
      if (!validation.overall_valid) {
        const error = new Error(`Argos model result validation failed: ${validation.blockers.map((item) => item.code).join(",")}`);
        error.validation = validation;
        throw error;
      }
      if (String(modelResult.result_id || "") !== resultId) throw new Error("model result_id does not match work item");
      const status = String(modelResult.status || "").trim();
      if (!["succeeded", "pending", "failed"].includes(status)) throw new Error(`invalid Argos result status: ${status}`);
      if (status === "succeeded") {
        if (!String(modelResult.ai_summary || "").trim()) throw new Error("succeeded Argos result requires ai_summary");
        if (!isValidFeishuDocumentUrl(modelResult.ai_result)) throw new Error("succeeded Argos result requires valid ai_result Feishu document URL");
      }
      const docArchive = status === "succeeded"
        ? await publishInvestigationDoc({ workItem, modelResult })
        : { ai_result: modelResult.ai_result, doc_archive_status: "skipped", doc_archive_reason: `status=${status}` };
      const closeModelResult = { ...modelResult, ai_result: docArchive.ai_result };
      const derivedSop = buildDerivedArgosSopContent({ workItem, modelResult: closeModelResult });
      const totalSop = await publishTotalSopDoc({
        troubleshootingSopDoc: workItem.troubleshooting_sop_doc || closeModelResult.troubleshooting_sop_doc || DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC,
        markdown: derivedSop.totalMarkdown,
        suggestion: closeModelResult.total_sop_suggestion
      });
      const ruleSop = await publishRuleSopDoc({
        troubleshootingSopDoc: workItem.troubleshooting_sop_doc || closeModelResult.troubleshooting_sop_doc || DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC,
        ruleId: workItem.rule_id || closeModelResult.rule_id,
        ruleName: workItem.rule_name || closeModelResult.rule_name,
        markdown: derivedSop.ruleMarkdown
      });
      const initialExtra = buildCloseExtra({ workItem, docArchive, totalSop, ruleSop });
      const legacyClearPatch = buildLegacyExtraOnlyFieldClearPatch(workItem);
      await batchUpdateRecords({
        baseToken: workItem.base_token,
        tableId: workItem.table_id,
        updates: [
          {
            record_id: workItem.record_id,
            fields: compactObject({
              status,
              ai_summary: closeModelResult.ai_summary,
              ai_result: closeModelResult.ai_result,
              ai_finished_at: new Date().toISOString(),
              last_error: status === "failed" ? closeModelResult.last_error || closeModelResult.error || "" : "",
              ...legacyClearPatch,
              extra: initialExtra
            })
          }
        ]
      });
      const cardUpdate = buildUnsupportedArgosCardUpdate();
      const messageId = getWorkItemMessageId(workItem);
      let messageReply;
      if (skipMessageReply) {
        messageReply = { message_reply_status: "skipped", message_reply_reason: "skip_message_reply enabled" };
      } else if (!messageId) {
        messageReply = { message_reply_status: "skipped", message_reply_reason: "extra.message_id empty" };
      } else {
        try {
          const detail = await replyMessage({
            messageId,
            markdown: buildWorkItemReplyMarkdown({
              workItem,
              status,
              summary: closeModelResult.ai_summary || closeModelResult.summary || "",
              docUrl: closeModelResult.ai_result,
              sopDocUrl: ruleSop.sop_doc_url
            })
          });
          messageReply = { message_reply_status: "succeeded", message_reply_detail: detail };
        } catch (error) {
          messageReply = { message_reply_status: "failed", message_reply_reason: error?.message || String(error) };
        }
      }
      await batchUpdateRecords({
        baseToken: workItem.base_token,
        tableId: workItem.table_id,
        updates: [
          {
            record_id: workItem.record_id,
            fields: {
              ...legacyClearPatch,
              extra: buildCloseExtra({ workItem, docArchive, totalSop, ruleSop, cardUpdate, messageReply })
            }
          }
        ]
      });
      const sideEffectFailed = [docArchive.doc_archive_status, totalSop.total_sop_writeback_status, ruleSop.sop_writeback_status, cardUpdate.card_update_status, messageReply.message_reply_status].includes("failed");
      return {
        kind: "argos_alarm_close_work_item",
        success: !sideEffectFailed,
        partial_failed: sideEffectFailed || undefined,
        result_id: resultId,
        record_id: workItem.record_id,
        status,
        ai_result: closeModelResult.ai_result,
        ...docArchive,
        ...totalSop,
        ...ruleSop,
        ...cardUpdate,
        ...messageReply
      };
    },

    async validateResultDir({ workItems = [], resultDir, sessionId } = {}) {
      if (!resultDir) throw new Error("validateResultDir requires resultDir");
      const results = [];
      for (const workItem of workItems) {
        const resultId = String(workItem?.result_id || "").trim();
        const filePath = join(resultDir, `${resultId}.json`);
        let modelResult = null;
        let fileSeen = false;
        let parseError = "";
        try {
          modelResult = JSON.parse(await readFile(filePath, "utf8"));
          fileSeen = true;
        } catch (error) {
          parseError = error?.message || String(error);
        }
        if (!fileSeen) {
          results.push({
            result_id: resultId,
            result_file: filePath,
            result_file_seen: false,
            overall_valid: false,
            blockers: [{ code: "result_json_missing", message: parseError || "result JSON file not found", severity: "hard_fail" }],
            close_readiness: { ready_for_close: false, blockers: ["result_json_missing"] }
          });
          continue;
        }
        const validation = await validateArgosModelResultWithReview({ workItem, modelResult, resultDir });
        if (sessionId && String(workItem?.ai_session_id || "") !== String(sessionId)) {
          validation.blockers.push({ code: "session_mismatch", message: "work item ai_session_id does not match validator session", severity: "hard_fail" });
          validation.overall_valid = false;
          validation.close_readiness = { ready_for_close: false, blockers: validation.blockers.map((item) => item.code) };
        }
        validation.result_file_seen = true;
        results.push(validation);
      }
      const invalidResults = results.filter((item) => !item.overall_valid);
      const hardFailCodes = results.flatMap((item) => item.blockers || []).map((item) => item.code).filter(Boolean);
      const hardFailCodeCounts = countBy(hardFailCodes, (item) => item);
      const output = {
        kind: "argos_alarm_validate_result_dir",
        success: invalidResults.length === 0,
        total: results.length,
        valid: results.length - invalidResults.length,
        invalid: invalidResults.length,
        results,
        hard_fail_code_counts: hardFailCodeCounts,
        per_result_close_readiness: Object.fromEntries(results.map((item) => [item.result_id, item.close_readiness])),
        repair_plan: {
          needs_rewrite: invalidResults.map((item) => item.result_id).filter(Boolean),
          auto_fixable: [],
          needs_permission: [],
          fatal: []
        }
      };
      return output;
    },

    async buildAutoTroubleshootDrainSummary({
      scanDirUrl = DEFAULT_ARGOS_SCAN_DIR_URL,
      dateKeys = [formatDateKey(new Date())],
      resultDir,
      workItems,
      workItemsFile,
      outputFile,
      scan,
      dailyBases
    } = {}) {
      if (!resultDir) throw new Error("buildAutoTroubleshootDrainSummary requires resultDir");
      const normalizedDateKeys = [...new Set((dateKeys && dateKeys.length > 0 ? dateKeys : [formatDateKey(new Date())]).filter(Boolean))];
      const contexts = await collectExistingDailyBaseContexts({ scanDirUrl, dateKeys: normalizedDateKeys });
      const allRecords = [];
      for (const context of contexts) {
        const records = await listRecords({ baseToken: context.base_token, tableId: context.table_id });
        allRecords.push(...records.map((record) => ({ ...record, date_key: context.date_key, base_token: context.base_token, table_id: context.table_id })));
      }
      const statusCounts = countBy(allRecords, (record) => readStatus(record.fields) || "unknown");
      let finalWorkItems = workItems || [];
      if (workItemsFile) finalWorkItems = JSON.parse(await readFile(workItemsFile, "utf8"));
      const validation = finalWorkItems.length > 0 ? await this.validateResultDir({ workItems: finalWorkItems, resultDir }) : null;
      let closeAuditFiles = [];
      try {
        closeAuditFiles = (await readdir(resultDir))
          .filter((name) => /^close-.+\.json$/.test(name))
          .map((name) => join(resultDir, name))
          .sort();
      } catch {
        closeAuditFiles = [];
      }
      const blockers = [];
      for (const state of ["init", "processing", "failed"]) {
        if (Number(statusCounts[state] || 0) > 0) {
          blockers.push({ code: `base_status_${state}_remaining`, state, count: Number(statusCounts[state]) });
        }
      }
      if (contexts.length === 0) blockers.push({ code: "no_daily_base_processed", date_keys: normalizedDateKeys });
      if (validation && !validation.success) blockers.push({ code: "validate_result_dir_failed", invalid: validation.invalid, hard_fail_code_counts: validation.hard_fail_code_counts });
      if (finalWorkItems.length > 0 && closeAuditFiles.length < finalWorkItems.length) {
        blockers.push({ code: "close_audit_missing", expected: finalWorkItems.length, actual: closeAuditFiles.length });
      }
      const ready = blockers.length === 0;
      const summary = {
        kind: "argos_alarm_auto_troubleshoot_drain_summary",
        success: ready,
        ready_to_report_complete: ready,
        final_drain: {
          ready_to_report_complete: ready,
          status_counts: statusCounts,
          blockers
        },
        scan_dir_url: scanDirUrl,
        date_keys: normalizedDateKeys,
        date_key_list: normalizedDateKeys,
        result_dir: resultDir,
        scan: scan || { groups: [] },
        daily_bases: dailyBases || contexts.map((context) => ({
          date_key: context.date_key,
          title: context.title,
          wiki_url: context.daily_base_url,
          base_token: context.base_token,
          table_id: context.table_id
        })),
        status_counts: statusCounts,
        processed_bases: contexts.length,
        validation,
        unfinished_records: allRecords
          .filter((record) => ["init", "processing", "failed"].includes(readStatus(record.fields)))
          .map((record) => ({
            record_id: record.record_id,
            result_id: record.fields?.result_id,
            status: readStatus(record.fields),
            date_key: record.date_key
          })),
        audit_files: {
          close: closeAuditFiles
        },
        blockers,
        decision_hint: ready
          ? "ready_to_report_complete=true，可宣布本轮 Argos 自动排障闭环完成。"
          : "ready_to_report_complete=false，必须先处理 blockers 后再宣布完成。"
      };
      if (outputFile) await writeJsonFileAtomic(outputFile, summary);
      return summary;
    },

    async renderRunReport({ runSummaryFile, resultDir, outputFile } = {}) {
      const summaryFile = runSummaryFile || (resultDir ? join(resultDir, "run-summary.json") : "");
      if (!summaryFile) throw new Error("renderRunReport requires runSummaryFile or resultDir");
      const summary = JSON.parse(await readFile(summaryFile, "utf8"));
      if (summary.kind !== "argos_alarm_auto_troubleshoot_drain_summary") {
        const blockers = [{
          code: "run_summary_kind_invalid",
          expected: "argos_alarm_auto_troubleshoot_drain_summary",
          actual: summary.kind || ""
        }];
        const markdown = [
          "# Argos 自动排障运行报告",
          "",
          "- ready_to_report_complete=false",
          `- result_dir=${resultDir || ""}`,
          "",
          "## Blockers",
          "- run_summary_kind_invalid"
        ].join("\n");
        const report = {
          kind: "argos_alarm_run_report",
          success: false,
          ready_to_report_complete: false,
          scan_dir_url: summary.scan_dir_url || "",
          date_keys: summary.date_keys || [],
          result_dir: summary.result_dir || resultDir || "",
          daily_bases: [],
          status_counts: {},
          results: [],
          blockers,
          ready_to_report_complete_reason: "run_summary_kind_invalid: run-summary.json must be generated by auto-troubleshoot-drain",
          markdown
        };
        if (outputFile) await writeJsonFileAtomic(outputFile, report);
        return report;
      }
      const closeFiles = Array.isArray(summary?.audit_files?.close) ? summary.audit_files.close : [];
      const results = [];
      for (const closeFile of closeFiles) {
        try {
          const close = JSON.parse(await readFile(closeFile, "utf8"));
          results.push(compactObject({
            result_id: close.result_id,
            status: close.status,
            ai_result: close.ai_result,
            sop_doc_url: close.sop_doc_url,
            sop_writeback_status: close.sop_writeback_status,
            card_update_status: close.card_update_status,
            card_update_reason: close.card_update_reason,
            message_reply_status: close.message_reply_status,
            close_audit_file: closeFile
          }));
        } catch (error) {
          results.push({ close_audit_file: closeFile, status: "close_audit_read_failed", message_reply_status: "failed", reason: error?.message || String(error) });
        }
      }
      const ready = summary.ready_to_report_complete === true || summary?.final_drain?.ready_to_report_complete === true;
      const markdown = [
        "# Argos 自动排障运行报告",
        "",
        `- ready_to_report_complete=${ready}`,
        `- scan_dir_url=${summary.scan_dir_url || ""}`,
        `- result_dir=${summary.result_dir || resultDir || ""}`,
        `- date_keys=${(summary.date_keys || []).join(",")}`,
        `- status_counts=${JSON.stringify(summary.status_counts || {})}`,
        "",
        "## Daily Bases",
        ...((summary.daily_bases || []).length > 0 ? summary.daily_bases.map((base) => `- ${base.date_key || "-"} ${base.wiki_url || ""}`) : ["- none"]),
        "",
        "## Results",
        ...results.map((item) => `- ${item.result_id || "-"} status=${item.status || ""} sop=${item.sop_doc_url || ""} sop_writeback_status=${item.sop_writeback_status || ""} card_update_status=${item.card_update_status || ""} message_reply_status=${item.message_reply_status || ""}`),
        "",
        "## Blockers",
        ...((summary.blockers || []).length > 0 ? summary.blockers.map((blocker) => `- ${blocker.code || JSON.stringify(blocker)}`) : ["- none"])
      ].join("\n");
      const report = {
        kind: "argos_alarm_run_report",
        success: true,
        ready_to_report_complete: ready,
        scan_dir_url: summary.scan_dir_url,
        date_keys: summary.date_keys || [],
        result_dir: summary.result_dir || resultDir || "",
        daily_bases: summary.daily_bases || [],
        status_counts: summary.status_counts || {},
        results,
        blockers: summary.blockers || [],
        ready_to_report_complete_reason: ready
          ? "ready_to_report_complete=true 且 final drain 未发现阻断项"
          : "ready_to_report_complete=false，仍有 blockers 或未完成记录",
        markdown
      };
      if (outputFile) await writeJsonFileAtomic(outputFile, report);
      return report;
    },

    async runGroupsScanAndPrepare({
      chatId = DEFAULT_ARGOS_CHAT_ID,
      scanDirUrl = DEFAULT_ARGOS_SCAN_DIR_URL,
      troubleshootingSopDoc = DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC,
      lookbackHours = 24,
      endTime = new Date(),
      dateKeys,
      sessionId,
      claimLimit = 1,
      resultDir,
      levels,
      psms
    } = {}) {
      const plan = buildArgosGroupsScanPlan({ chatId, scanDirUrl, troubleshootingSopDoc, lookbackHours, endTime, resultDir, levels, psms });
      const scan = await this.scanChatToBase({
        chatId,
        scanDirUrl,
        start: new Date(plan.scanWindow.start),
        end: new Date(plan.scanWindow.end),
        resultDir,
        levels,
        psms
      });
      const prepare = await this.prepareAutoTroubleshoot({
        scanDirUrl,
        dateKeys: dateKeys?.length ? dateKeys : scan.daily_results.map((item) => item.date_key).filter(Boolean),
        sessionId,
        claimLimit,
        troubleshootingSopDoc,
        resultDir
      });
      const result = {
        kind: "argos_alarm_groups_scan_and_troubleshoot",
        success: scan.success === true && prepare.success === true,
        plan,
        scan,
        troubleshoot: prepare,
        dispatch_plan: prepare.dispatch_plan,
        should_proceed: prepare.workItems.length > 0
      };
      if (resultDir) await writeJsonFileAtomic(join(resultDir, "groups-scan-and-troubleshoot.json"), result);
      return result;
    }
  };

  return runner;
}

function readOption(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index < 0) return "";
  return args[index + 1] || "";
}

async function readJsonInputOption(args) {
  const inline = readOption(args, "--input-json");
  const filePath = readOption(args, "--input-file");
  if (inline && filePath) throw new Error("Use only one of --input-json or --input-file");
  if (filePath) {
    return JSON.parse(await readFile(filePath, "utf8"));
  }
  if (inline) return JSON.parse(inline);
  return {};
}

function firstJsonObject(value) {
  if (Array.isArray(value)) return value[0] || {};
  return value || {};
}

function parseCliDateKeys(args) {
  const result = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--date-key" && args[index + 1]) result.push(args[index + 1]);
  }
  return result;
}

async function writeOutputIfNeeded(args, payload) {
  const outputFile = readOption(args, "--output-file");
  if (outputFile) {
    await mkdir(resolve(outputFile, ".."), { recursive: true });
    await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}

export async function runArgosAlarmRunnerCli(args = process.argv.slice(2), { runner = createArgosAlarmRunner() } = {}) {
  const [subcommand] = args;
  if (readOption(args, "--template-url") || readOption(args, "--template-path") || readOption(args, "--template-node")) {
    throw new Error("--template-url/--template-path has been removed; Argos daily Base is created by runner-owned canonical schema");
  }
  let result;
  if (subcommand === "plan-groups-scan") {
    result = buildArgosGroupsScanPlan({
      chatId: readOption(args, "--chat-id") || DEFAULT_ARGOS_CHAT_ID,
      scanDirUrl: readOption(args, "--scan-dir-url") || DEFAULT_ARGOS_SCAN_DIR_URL,
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc") || DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC,
      lookbackHours: Number(readOption(args, "--lookback-hours") || "24"),
      endTime: readOption(args, "--end-time") || readOption(args, "--end") || new Date(),
      dryRun: args.includes("--dry-run"),
      resultDir: readOption(args, "--result-dir"),
      levels: readOption(args, "--levels"),
      psms: readOption(args, "--psms")
    });
  } else if (subcommand === "scan-chat-to-base") {
    const input = await readJsonInputOption(args);
    result = await runner.scanChatToBase({
      ...input,
      start: input.start ? new Date(input.start) : new Date(readOption(args, "--start-time")),
      end: input.end ? new Date(input.end) : new Date(readOption(args, "--end-time")),
      chatId: input.chatId || readOption(args, "--chat-id") || DEFAULT_ARGOS_CHAT_ID,
      scanDirUrl: input.scanDirUrl || readOption(args, "--scan-dir-url") || DEFAULT_ARGOS_SCAN_DIR_URL,
      resultDir: input.resultDir || readOption(args, "--result-dir"),
      levels: input.levels || readOption(args, "--levels"),
      psms: input.psms || readOption(args, "--psms")
    });
  } else if (subcommand === "prepare-auto-troubleshoot") {
    result = await runner.prepareAutoTroubleshoot({
      scanDirUrl: readOption(args, "--scan-dir-url") || DEFAULT_ARGOS_SCAN_DIR_URL,
      dateKeys: parseCliDateKeys(args),
      sessionId: readOption(args, "--session-id"),
      claimLimit: Number(readOption(args, "--claim-limit") || "1"),
      resultDir: readOption(args, "--result-dir"),
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc") || DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC
    });
  } else if (subcommand === "split-work-items") {
    const workItemsFile = readOption(args, "--work-items-file") || join(readOption(args, "--result-dir"), "work-items.json");
    result = await runner.splitWorkItems({
      workItems: JSON.parse(await readFile(workItemsFile, "utf8")),
      resultDir: readOption(args, "--result-dir"),
      scanDirUrl: readOption(args, "--scan-dir-url") || DEFAULT_ARGOS_SCAN_DIR_URL,
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc") || DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC
    });
  } else if (subcommand === "resume-auto-orchestration") {
    result = await runner.resumeAutoOrchestration({
      resultDir: readOption(args, "--result-dir"),
      scanDirUrl: readOption(args, "--scan-dir-url") || DEFAULT_ARGOS_SCAN_DIR_URL,
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc") || DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC,
      sessionId: readOption(args, "--session-id")
    });
  } else if (subcommand === "close-ready-work-items") {
    const workItemsFile = readOption(args, "--work-items-file") || join(readOption(args, "--result-dir"), "work-items.json");
    result = await runner.closeReadyWorkItems({
      workItems: JSON.parse(await readFile(workItemsFile, "utf8")),
      resultDir: readOption(args, "--result-dir"),
      sessionId: readOption(args, "--session-id"),
      skipMessageReply: args.includes("--skip-message-reply")
    });
  } else if (subcommand === "recover-processing-records") {
    result = await runner.recoverProcessingRecords({
      scanDirUrl: readOption(args, "--scan-dir-url") || DEFAULT_ARGOS_SCAN_DIR_URL,
      dateKeys: parseCliDateKeys(args),
      sessionId: readOption(args, "--session-id"),
      processingMaxAgeMinutes: Number(readOption(args, "--processing-max-age-minutes") || "120"),
      resultId: readOption(args, "--result-id"),
      forceByResultId: args.includes("--force-by-result-id"),
      apply: args.includes("--apply")
    });
  } else if (subcommand === "sync-daily-base-template-order") {
    result = await runner.syncDailyBaseTemplateOrder({
      scanDirUrl: readOption(args, "--scan-dir-url") || DEFAULT_ARGOS_SCAN_DIR_URL,
      dateKey: readOption(args, "--date-key") || formatDateKey(new Date())
    });
  } else if (subcommand === "doctor-daily-base") {
    result = await runner.doctorDailyBase({
      scanDirUrl: readOption(args, "--scan-dir-url") || DEFAULT_ARGOS_SCAN_DIR_URL,
      dateKey: readOption(args, "--date-key") || formatDateKey(new Date()),
      outputFile: readOption(args, "--output-file")
    });
  } else if (subcommand === "inspect-result") {
    const workItem = firstJsonObject(await readJsonInputOption(args));
    result = await runner.inspectResult({
      workItem,
      outputFile: readOption(args, "--output-file")
    });
  } else if (subcommand === "prepare-single-troubleshoot-data") {
    const workItem = firstJsonObject(await readJsonInputOption(args));
    result = await runner.prepareSingleTroubleshootData({
      workItem,
      resultDir: readOption(args, "--result-dir"),
      scanDirUrl: readOption(args, "--scan-dir-url") || workItem.scan_dir_url || DEFAULT_ARGOS_SCAN_DIR_URL,
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc") || workItem.troubleshooting_sop_doc || DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC
    });
  } else if (subcommand === "publish-troubleshooting-doc") {
    const input = await readJsonInputOption(args);
    const modelResultFile = readOption(args, "--model-result-file");
    result = await runner.publishTroubleshootingDoc({
      workItem: input.workItem || input.work_item || input,
      modelResult: input.modelResult || input.model_result || (modelResultFile ? JSON.parse(await readFile(modelResultFile, "utf8")) : input),
      outputFile: readOption(args, "--output-file")
    });
  } else if (subcommand === "publish-sop-doc") {
    const input = await readJsonInputOption(args);
    result = await runner.publishSopDoc({
      type: readOption(args, "--type") || input.type || "rule",
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc") || input.troubleshooting_sop_doc || DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC,
      ruleId: readOption(args, "--rule-id") || input.rule_id,
      ruleName: readOption(args, "--rule-name") || input.rule_name,
      markdown: input.markdown,
      suggestion: input.suggestion
    });
  } else if (subcommand === "normalize-model-result-json") {
    const workItem = readOption(args, "--work-item-file")
      ? JSON.parse(await readFile(readOption(args, "--work-item-file"), "utf8"))
      : {};
    result = await runner.normalizeModelResultJson({
      inputFile: readOption(args, "--input-file"),
      outputFile: readOption(args, "--output-file"),
      workItem
    });
  } else if (subcommand === "normalize-result-doc-links") {
    const workItem = readOption(args, "--work-item-file")
      ? JSON.parse(await readFile(readOption(args, "--work-item-file"), "utf8"))
      : {};
    result = await runner.normalizeResultDocLinks({
      inputFile: readOption(args, "--input-file"),
      outputFile: readOption(args, "--output-file"),
      markdownFile: readOption(args, "--markdown-file"),
      workItem
    });
  } else if (subcommand === "close-work-item") {
    const workItem = firstJsonObject(await readJsonInputOption(args));
    result = await runner.closeWorkItem({
      workItem,
      modelResultFile: readOption(args, "--model-result-file"),
      resultDir: readOption(args, "--result-dir"),
      sessionId: readOption(args, "--session-id"),
      skipMessageReply: args.includes("--skip-message-reply")
    });
  } else if (subcommand === "validate-result-dir") {
    const workItemsFile = readOption(args, "--work-items-file") || join(readOption(args, "--result-dir"), "work-items.json");
    result = await runner.validateResultDir({
      workItems: JSON.parse(await readFile(workItemsFile, "utf8")),
      resultDir: readOption(args, "--result-dir"),
      sessionId: readOption(args, "--session-id")
    });
  } else if (subcommand === "auto-troubleshoot-drain" || subcommand === "auto-troubleshoot-run-summary") {
    result = await runner.buildAutoTroubleshootDrainSummary({
      scanDirUrl: readOption(args, "--scan-dir-url") || DEFAULT_ARGOS_SCAN_DIR_URL,
      dateKeys: parseCliDateKeys(args),
      resultDir: readOption(args, "--result-dir"),
      workItemsFile: readOption(args, "--work-items-file"),
      outputFile: readOption(args, "--output-file")
    });
  } else if (subcommand === "render-run-report") {
    result = await runner.renderRunReport({
      runSummaryFile: readOption(args, "--run-summary-file"),
      resultDir: readOption(args, "--result-dir"),
      outputFile: readOption(args, "--output-file")
    });
  } else if (subcommand === "run-groups-scan-and-troubleshoot") {
    result = await runner.runGroupsScanAndPrepare({
      chatId: readOption(args, "--chat-id") || DEFAULT_ARGOS_CHAT_ID,
      scanDirUrl: readOption(args, "--scan-dir-url") || DEFAULT_ARGOS_SCAN_DIR_URL,
      troubleshootingSopDoc: readOption(args, "--troubleshooting-sop-doc") || DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC,
      lookbackHours: Number(readOption(args, "--lookback-hours") || "24"),
      endTime: readOption(args, "--end-time") || readOption(args, "--end") || new Date(),
      dateKeys: parseCliDateKeys(args),
      sessionId: readOption(args, "--session-id"),
      claimLimit: Number(readOption(args, "--claim-limit") || "1"),
      resultDir: readOption(args, "--result-dir"),
      levels: readOption(args, "--levels"),
      psms: readOption(args, "--psms")
    });
  } else {
    throw new Error(`Unknown Argos alarm runner subcommand: ${subcommand || "(empty)"}`);
  }
  await writeOutputIfNeeded(args, result);
  return result;
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === pathToFileURL(__filename).href) {
  runArgosAlarmRunnerCli()
    .then((result) => {
      if (!readOption(process.argv.slice(2), "--output-file")) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      }
      const subcommand = process.argv.slice(2)[0] || "";
      const diagnosticOnly = subcommand === "doctor-daily-base" || subcommand === "render-run-report";
      process.exit(result?.success === false && !diagnosticOnly ? 1 : 0);
    })
    .catch((error) => {
      process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
      process.exit(1);
    });
}
