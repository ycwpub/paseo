const DEFAULT_TIMEZONE_OFFSET_MINUTES = 8 * 60;

export const BAMBOO_ATTRIBUTION_RESULTS = Object.freeze([
  "[有效告警]代码问题(已知问题)",
  "[有效告警]代码问题(新问题)",
  "[有效告警]补偿任务问题(已知问题)",
  "[有效告警]补偿任务问题(新问题)",
  "[有效告警]上下游问题(已知问题)",
  "[有效告警]上下游问题(新问题)",
  "[有效告警]其他原因(需要修数)(已知问题)",
  "[有效告警]其他原因(需要修数)(新问题)",
  "[有效告警]对账脚本有误/未兼容(已知问题)",
  "[有效告警]业务底表丢数",
  "[有效告警]离线同步问题，已恢复，无需修数",
  "[有效告警]数据生产存在时间差, 导致数据不一致问题[已知问题]",
  "[有效告警]商家冻结户余额不足，需充钱[已知问题]",
  "[有效告警]业务刷数",
  "[无效告警]测试数据",
  "[无效告警]对账平台问题",
  "[无效告警]正常数据波动",
  "[无效告警]临界数据飘移",
  "[无效告警]表权限缺失",
  "[无效告警]非业务底表丢数",
  "[无效告警]规则调试",
  "[无效告警]其他原因(不需要修数)",
  "[无效告警]业务刷数",
]);

export function isAllowedBambooAttributionResult(value) {
  return BAMBOO_ATTRIBUTION_RESULTS.includes(value);
}

export function extractBambooAttributionResult(summary) {
  return BAMBOO_ATTRIBUTION_RESULTS.find((result) => String(summary || "").includes(result));
}

export const GENERIC_ATTRIBUTION_FORBIDDEN_SUMMARY_PATTERNS = Object.freeze([
  "当前规则无专用自动归因模板",
  "Bamboo 存在有效异常样本但当前规则无专用自动归因模板",
  "需要继续按规则 SQL、异常样本和线上数据排查",
]);

const CONCRETE_EVIDENCE_PATTERNS = Object.freeze([
  /diff_reason/i,
  /settle_biz_id/i,
  /settle_amount/i,
  /ledger_payer_account_id/i,
  /receipt_receive_type/i,
  /TQS-\d+/i,
  /NoPrivilegeException/i,
  /execute_id/i,
  /out_flow_no/i,
  /after_sale_refund_id/i,
]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function attributionLabel(value) {
  return typeof value === "string" ? value : value?.label;
}

export function normalizeAttributionSummary(summary, attribution) {
  const raw = String(summary || "").trim();
  const labels = BAMBOO_ATTRIBUTION_RESULTS.filter((label) => raw.includes(label));
  const selected =
    attribution && isAllowedBambooAttributionResult(attribution)
      ? attribution
      : labels.length === 1
        ? labels[0]
        : undefined;
  if (!selected) return raw;

  let text = raw;
  for (const label of BAMBOO_ATTRIBUTION_RESULTS) {
    const escaped = escapeRegExp(label);
    text = text.replace(new RegExp(`(?:[；;。]\\s*)?归因结果[：:]\\s*${escaped}`, "g"), "");
    text = text.replace(new RegExp(escaped, "g"), "");
  }
  text = text
    .replace(/归因结果[：:]\s*$/g, "")
    .replace(/[；;，,\s]+$/g, "")
    .trim();
  if (!text) return raw;
  return `${text}；归因结果：${selected}`;
}

export function containsForbiddenGenericAttribution(summary) {
  const text = String(summary || "");
  return GENERIC_ATTRIBUTION_FORBIDDEN_SUMMARY_PATTERNS.some((pattern) => text.includes(pattern));
}

export function summaryContainsConcreteEvidence(summary) {
  const text = String(summary || "");
  return CONCRETE_EVIDENCE_PATTERNS.some((pattern) => pattern.test(text));
}

function assertSummaryContainsBambooAttributionResult(value) {
  const validation = validateAiSummary(value);
  if (!validation.valid) {
    throw new Error(validation.reasons.join("; "));
  }
}

/**
 * 脚本硬校验 ai_summary / summary（= Base 中写入 ai_summary 字段的原文）：
 *  - 校验通过：{ valid: true, attributionResult, strippedLength, freeTextLength }
 *  - 校验不通过：{ valid: false, reasons: [...具体改法], sampleFixed: 修正模板 }
 * 必须同时满足：
 *   1) 文本非空（去除空白、全角标点、常见分隔符后至少 6 个以上字符）；
 *   2) 必须且只能包含 1 个合法归因结果（∈ BAMBOO_ATTRIBUTION_RESULTS，禁止拼接多个固定归因结果）；
 *   3) 必须在固定归因结果之外还包含「自然语言自由文案」，不能直接等于 attributionResult 本身，
 *      也不能只有"归因结果：<result>"这种纯模版壳；
 *   4) 禁止只写模糊结论（例如"任务执行失败导致告警，非业务数据差异；账号权限不足或 SQL 对象异常"这类没有任何
 *      固定归因结果标签的自由描述）——必须显式附带 BAMBOO_ATTRIBUTION_RESULTS 里的固定选项。
 * 校验不通过，AGENTS.md 要求：不让 AI 蒙混，必须一直改；改好为止才能写 status=succeeded。
 *
 * 反例（用户提出的典型 bad case）：
 *   "Bamboo 任务执行失败导致告警，非业务数据差异；主要表现为执行账号权限不足或 SQL 对象异常。"
 *     -> 没带任何固定归因结果标签（缺 [有效告警]对账脚本有误/未兼容(已知问题) 或 [无效告警]表权限缺失）。
 * 正例：
 *   "Bamboo 规则执行失败，执行账号缺少依赖表或字段查询权限且未产生有效业务样本；归因结果：[无效告警]表权限缺失"
 *   "规则执行 SQL 对象不存在或不兼容当前 Hive 环境，未产出有效样本；归因结果：[有效告警]对账脚本有误/未兼容(已知问题)"
 */
export function validateAiSummary(summary, opts = {}) {
  const requireAttribution = opts?.requireAttribution !== false; // 默认要求
  const minFreeTextLength = Number.isInteger(opts?.minFreeTextLength) ? opts.minFreeTextLength : 8;

  const raw = normalizeAttributionSummary(String(summary ?? "").trim());
  const reasons = [];
  const hints = [];

  if (!raw) {
    reasons.push(
      "ai_summary 为空，必须同时包含固定归因结果(∈ BAMBOO_ATTRIBUTION_RESULTS)和自然语言自由文案",
    );
  }

  // ① 归因结果命中数
  const matchedResults = BAMBOO_ATTRIBUTION_RESULTS.filter((result) => raw.includes(result));
  if (matchedResults.length === 0 && requireAttribution) {
    reasons.push(
      `ai_summary 必须包含且只包含 1 个 BAMBOO_ATTRIBUTION_RESULTS 中的固定归因结果标签(形如 "[有效告警]XXX" 或 "[无效告警]XXX")。当前未命中任何合法标签。合法标签如下(任选其一)：\n${BAMBOO_ATTRIBUTION_RESULTS.map(
        (r, i) => `  ${i + 1}. ${r}`,
      ).join("\n")}`,
    );
  }
  if (matchedResults.length > 1) {
    reasons.push(
      `ai_summary 只能包含 1 个固定归因结果标签，当前命中 ${matchedResults.length} 个：${matchedResults
        .map((r) => `"${r}"`)
        .join("、")}。请按实际根因只保留 1 个最准确的标签。`,
    );
  }
  const attributionResult = matchedResults.length === 1 ? matchedResults[0] : undefined;

  // ② 自由文案长度（去掉所有 attributionResult 后仍要有实质内容）
  let stripped = raw;
  for (const result of matchedResults) {
    // 按字符串 replaceAll，因为 1 个结果可能被重复粘贴
    while (stripped.includes(result)) {
      stripped = stripped.replace(result, "");
    }
  }
  // 去掉常见模板壳词 + 标点/空白
  // 注意：这里手写 ASCII 标点字符；Unicode 全角标点和特殊符号用显式字面量，或通过多段 replace 单独处理
  //       避免把 `\d`/`\w`/`\p` 等误用进字符类里导致 Invalid escape。
  const cleaned = stripped
    .replace(/归因结果[：:]/g, "")
    .replace(/结论[：:]/g, "")
    .replace(/原因[：:]/g, "")
    .replace(/根因[：:]/g, "")
    .replace(/分析[：:]/g, "")
    .replace(/[，。；、！？,.;!?\-—:"'"'`~()（）【】《》<>[\]{}|\\#@$%^&*_+=…·/\s]/g, "")
    .trim();

  if (raw && cleaned.length < minFreeTextLength) {
    reasons.push(
      `ai_summary 必须在固定归因结果之外提供长度 ≥ ${minFreeTextLength} 的自然语言自由文案（说明现象/根因/影响）。当前剥离归因结果标签和模板壳词后仅剩 ${cleaned.length} 个非标点字符。`,
    );
    if (attributionResult) {
      hints.push(
        `不要只写纯"归因结果：${attributionResult}"或完全等于标签本身。改写范式(二选一)：\n  1) "<现象/根因说明>；归因结果：${attributionResult}"\n  2) "归因结果：${attributionResult}。具体表现：<不少于 ${minFreeTextLength} 字的自由描述>"`,
      );
    }
  }

  // ③ 针对用户提出的特定反例给出修正建议模板
  let sampleFixed = undefined;
  if (!attributionResult && raw) {
    const suggested = classifyBambooResult({ summary: raw }).suggestedAttribution;
    if (suggested) {
      sampleFixed = `${raw.replace(/[。；;]\s*$/u, "").trim()}；归因结果：${suggested}`;
      hints.push(`推荐修正模板(把下列原文里的结论显式附上合法归因结果标签)：\n  "${sampleFixed}"`);
    }
  }

  const valid = reasons.length === 0;
  return {
    valid,
    attributionResult: valid ? attributionResult : undefined,
    matchedResults,
    raw_length: raw.length,
    stripped_length: cleaned.length,
    reasons,
    hints,
    sampleFixed,
  };
}

// 【AGENTS.md 硬固化 · status=failed 准入校验】
// status=failed 仅允许用于"网络/瞬时 CLI 错误，重试 3 次以上仍失败"的场景(assertFailedAdmission
// 已做 failedAdmission 结构校验)。除此之外，但凡 modelResult 的 summary/reason/extra 里
// 出现"需要继续排查 / 尚未完成核验 / 未完成闭环 / 待人工确认 / 等待线上数据 /
// 未完成 RPC 日志代码核验"等"实际还没做完、必须继续取证"的关键词，一律禁止写 status=failed；
// 这类 case 必须改写成 status=pending (等待用户授权/等待补证) 或 status=succeeded
// (真正完成了闭环核验)。校验不通过返回 invalid_failed_reason，让 AI 一直改 modelResult。
//
// 同时再跑一遍结构化 assertFailedAdmission() 做兜底，避免仅靠关键词放行后仍缺合法 admission 证据。
const FAILED_REASON_BLOCKED_KEYWORDS = Object.freeze([
  "需要继续排查",
  "继续排查",
  "尚未完成",
  "还未完成",
  "未完成线上",
  "未完成RPC",
  "未完成日志",
  "未完成代码",
  "未完成核验",
  "未完成闭环",
  "未闭环",
  "闭环核验",
  "未核验",
  "待核验",
  "待继续",
  "待人工",
  "待用户",
  "待确认",
  "待排查",
  "待取证",
  "待补证",
  "等待用户",
  "等待授权",
  "等待补证",
  "等待排查",
  "等待线上数据",
  "等待日志",
  "等待代码",
  "人工确认",
  "需要人工",
  "需要补证",
  "需要取证",
  "需要授权",
  "无法闭环",
  "暂未闭环",
  "暂未完成",
]);

const PENDING_AUTHORIZATION_SUMMARY_FALLBACK_HINT = `若当前确实无法推进，请把 status 改成 pending，并按 pendingAdmission 规范补齐：
  * waiting_for_user_authorization=true 或 needs_manual_confirmation=true + pending_admission 字段;
  * pending_admission.{rule_and_samples,current_online_state,permission_blockers,code_idl_config,closure_candidates}
    每一项都必须是 {status: "done"|"blocked"|"not_applicable", evidence: "..."} 的对象，
    且 blocking 的地方要明确说明哪个环节卡住、需要什么权限/证据才能继续。`;

export function validateFailedStatus({ summary, reason, failedAdmission, extra }) {
  const reasons = [];
  const hints = [];
  const summaryText = String(summary || "").trim();
  const reasonText = String(reason || "").trim();
  const extraText = extra ? (typeof extra === "string" ? extra : JSON.stringify(extra)) : "";
  const needle = `${summaryText}\n${reasonText}\n${extraText}`;
  const matchedKeywords = FAILED_REASON_BLOCKED_KEYWORDS.filter((kw) => needle.includes(kw));

  if (matchedKeywords.length > 0) {
    reasons.push(
      `status=failed 只允许"network/transient/cli_network 类错误重试 3 次以上仍失败"的场景。当前 summary/reason/extra 包含继续排查/未完成核验/待补证类关键词: ${matchedKeywords
        .map((k) => `"${k}"`)
        .join(
          ", ",
        )} — 这些是"尚未完成排查"的信号，不是真正的脚本/CLI 失败，禁止写成 status=failed。`,
    );
    hints.push(
      `把 modelResult 的终态改成 pending(真正需要等待用户授权/线上数据/补证) 或 succeeded(已完成线上 RPC/日志/代码闭环核验并给出文档)，不要使用 status=failed。`,
    );
    hints.push(PENDING_AUTHORIZATION_SUMMARY_FALLBACK_HINT);
    hints.push(
      `合法 status=failed 示例(仅能用于 CLI 网络类重试 3 次仍失败)：failedAdmission={error_class:"cli_network", attempts:3, cli_name:"bytedcli", last_error:"ECONNRESET", retry_command:"bytedcli --json lark ..."}; summary="lark-cli 调用 base-batch-update 网络重试 3 次仍超时。"`,
    );
  }

  // 再兜一层：即使关键词没命中，也要确保 failedAdmission 结构合法。
  // 结构错误同样不让写 status=failed，避免 AI 随便塞一个 failedAdmission 就蒙混过关。
  try {
    assertFailedAdmission(failedAdmission);
  } catch (error) {
    reasons.push(String(error?.message || error));
    hints.push(
      `status=failed 必须提供合法 failedAdmission：error_class ∈ {network,transient,cli_network}，attempts >= 3，cli_name/last_error/retry_command 非空；其它权限/口径/低置信/未取证等场景一律改走 pending/succeeded。`,
    );
  }

  return {
    valid: reasons.length === 0,
    blocked_keywords: matchedKeywords,
    reasons,
    hints,
  };
}

export function isValidFeishuDocumentUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    return false;
  }

  const allowedHost =
    url.hostname.endsWith(".larkoffice.com") ||
    url.hostname.endsWith(".feishu.cn") ||
    url.hostname.endsWith(".larksuite.com");
  const isDocumentPath = url.pathname.startsWith("/docx/") || url.pathname.startsWith("/wiki/");

  return url.protocol === "https:" && allowedHost && isDocumentPath;
}

function assertValidSucceededDocUrl(value) {
  if (!isValidFeishuDocumentUrl(value)) {
    throw new Error(
      `ai_result must be a non-empty Feishu document URL when status=succeeded; do not write succeeded until a valid document URL is available; received: ${String(value)}`,
    );
  }
}

const FAILED_ADMISSION_ERROR_CLASSES = Object.freeze(["network", "transient", "cli_network"]);
const TERMINAL_NOTIFICATION_STATUSES = Object.freeze(["succeeded", "failed", "skipped"]);

export function assertFailedAdmission(failedAdmission) {
  if (!failedAdmission || typeof failedAdmission !== "object" || Array.isArray(failedAdmission)) {
    throw new Error("failedAdmission is required when status=failed");
  }
  if (!FAILED_ADMISSION_ERROR_CLASSES.includes(failedAdmission.error_class)) {
    throw new Error(
      "failedAdmission.error_class must be one of network, transient, cli_network when status=failed",
    );
  }
  const attempts = Number(failedAdmission.attempts);
  if (!Number.isInteger(attempts) || attempts < 3) {
    throw new Error("failedAdmission.attempts must be an integer >= 3 when status=failed");
  }
  for (const key of ["cli_name", "last_error", "retry_command"]) {
    if (!String(failedAdmission[key] || "").trim()) {
      throw new Error(`failedAdmission.${key} is required when status=failed`);
    }
  }
}

function assertTerminalNotificationStatus({ status, reason, statusKey, reasonKey }) {
  if (!TERMINAL_NOTIFICATION_STATUSES.includes(status)) {
    throw new Error(`${statusKey} is required when status=succeeded`);
  }
  if ((status === "failed" || status === "skipped") && !String(reason || "").trim()) {
    throw new Error(`${reasonKey} is required when ${statusKey}=${status}`);
  }
}

const PENDING_ADMISSION_CHECKS = Object.freeze([
  "rule_and_samples",
  "current_online_state",
  "permission_blockers",
  "code_idl_config",
  "closure_candidates",
]);

const PENDING_ADMISSION_STATUSES = Object.freeze(["done", "blocked", "not_applicable"]);
const PENDING_AUTHORIZATION_SUMMARY_PREFIX = "等待用户授权，当前无法继续自动取证。";

function assertPendingAdmissionCheck(value, key) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`pendingAdmission.${key} must be an object with status and evidence`);
  }
  if (!PENDING_ADMISSION_STATUSES.includes(value.status)) {
    throw new Error(`pendingAdmission.${key}.status must be one of done, blocked, not_applicable`);
  }
  if (!String(value.evidence || "").trim()) {
    throw new Error(`pendingAdmission.${key}.evidence is required`);
  }
}

export function assertPendingAdmission(pendingAdmission) {
  if (
    !pendingAdmission ||
    typeof pendingAdmission !== "object" ||
    Array.isArray(pendingAdmission)
  ) {
    throw new Error("pendingAdmission is required when status=pending");
  }
  if (pendingAdmission.pending_reason_type === "bamboo_result_inconsistent") {
    const consistency = pendingAdmission.sample_count_consistency;
    if (!consistency || typeof consistency !== "object" || Array.isArray(consistency)) {
      throw new Error(
        "pendingAdmission.sample_count_consistency is required when pending_reason_type=bamboo_result_inconsistent",
      );
    }
    if (
      consistency.verdict !== "bamboo_result_inconsistent" &&
      consistency.verdict !== "sample_count_conflict"
    ) {
      throw new Error(
        "pendingAdmission.sample_count_consistency.verdict must be bamboo_result_inconsistent or sample_count_conflict",
      );
    }
    if (countEffectiveSamples(consistency.card_task_result_num) <= 0) {
      throw new Error("pendingAdmission.sample_count_consistency.card_task_result_num must be > 0");
    }
    if (countEffectiveSamples(consistency.bamboo_false_data_length) !== 0) {
      throw new Error(
        "pendingAdmission.sample_count_consistency.bamboo_false_data_length must be 0",
      );
    }
    if (Number(consistency.retry_attempts) < 3) {
      throw new Error("pendingAdmission.sample_count_consistency.retry_attempts must be >= 3");
    }
    const manualQuestion = String(pendingAdmission.manual_question || "").trim();
    if (!manualQuestion) {
      throw new Error("pendingAdmission.manual_question is required when status=pending");
    }
    if (!manualQuestion.includes("Bamboo") && !manualQuestion.includes("接口")) {
      throw new Error(
        "pendingAdmission.manual_question must describe the Bamboo result interface inconsistency",
      );
    }
    return;
  }
  if (pendingAdmission.waiting_for_user_authorization !== true) {
    throw new Error("pending status is only allowed while waiting for user authorization");
  }
  const authorizationRequest = pendingAdmission.authorization_request;
  if (
    !authorizationRequest ||
    typeof authorizationRequest !== "object" ||
    Array.isArray(authorizationRequest)
  ) {
    throw new Error("pendingAdmission.authorization_request is required when status=pending");
  }
  if (!String(authorizationRequest.target || "").trim()) {
    throw new Error(
      "pendingAdmission.authorization_request.target is required when status=pending",
    );
  }
  if (!String(authorizationRequest.permission || "").trim()) {
    throw new Error(
      "pendingAdmission.authorization_request.permission is required when status=pending",
    );
  }
  for (const key of PENDING_ADMISSION_CHECKS) {
    assertPendingAdmissionCheck(pendingAdmission[key], key);
  }
  const manualQuestion = String(pendingAdmission.manual_question || "").trim();
  if (!manualQuestion) {
    throw new Error("pendingAdmission.manual_question is required when status=pending");
  }
  if (!manualQuestion.includes("授权") && !manualQuestion.includes("权限")) {
    throw new Error(
      "pendingAdmission.manual_question must describe the user authorization required when status=pending",
    );
  }
}

function assertPendingSummary(value) {
  const raw = String(value || "").trim();
  if (raw.startsWith("等待 Bamboo result 接口修复或人工复核。")) {
    return;
  }
  if (!raw.startsWith(PENDING_AUTHORIZATION_SUMMARY_PREFIX)) {
    throw new Error(
      `summary must start with "${PENDING_AUTHORIZATION_SUMMARY_PREFIX}" when status=pending`,
    );
  }
}

function normalizeCompletionTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const trimmed = String(value ?? "").trim();
  if (trimmed) {
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return Date.now();
}

function pad(value, length = 2) {
  return String(value).padStart(length, "0");
}

export function formatIsoWithOffset(date, offsetMinutes = DEFAULT_TIMEZONE_OFFSET_MINUTES) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);

  return [
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    "T",
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`,
    `${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`,
  ].join("");
}

export function buildChatMessageListArgs({ chatId, start, end, pageToken, pageSize = 50 }) {
  const args = [
    "lark",
    "im",
    "chat-messages-list",
    "--chat-id",
    chatId,
    "--page-size",
    String(pageSize),
    "--start",
    formatIsoWithOffset(start),
    "--end",
    formatIsoWithOffset(end),
    "--order",
    "desc",
    "--no-reactions",
    "--as",
    "bot",
  ];

  if (pageToken) {
    args.push("--page-token", pageToken);
  }

  return args;
}

function htmlUnescape(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function findFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return htmlUnescape(match[1].trim());
    }
  }
  return undefined;
}

function parseLocalDateTime(value) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?/,
  );
  if (!match) {
    return undefined;
  }

  return {
    dateKey: `${match[1]}${match[2]}${match[3]}`,
    display: `${match[1]}-${match[2]}-${match[3]} ${match[4] || "00"}:${match[5] || "00"}:${match[6] || "00"}`,
  };
}

function parseBambooUrl(rawUrl) {
  if (!rawUrl) {
    return {};
  }

  const url = htmlUnescape(rawUrl);
  const taskId = url.match(/\/(?:result|rule)-manage\/(\d+)/)?.[1];
  let resultId;

  try {
    resultId = new URL(url).searchParams.get("id") || undefined;
  } catch {
    resultId = url.match(/[?&]id=(\d+)/)?.[1];
  }

  return { resultId, taskId, url };
}

function parsePositiveIntegerId(rawId) {
  const value = String(rawId || "").trim();
  return isPositiveIntegerId(value) ? value : "";
}

function parseNonNegativeInteger(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  return Number(value);
}

export function isPositiveIntegerId(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0;
  }
  return typeof value === "string" && /^[1-9]\d*$/.test(value);
}

/**
 * 仅移除 Bamboo 状态相关前缀，保留【数据监控-bamboo-xx】、【bamboo通知】、【bamboo报警】等有效标题。
 * 用途：排查文档标题、SOP 文档标题（需要保留 Bamboo 原始定位前缀，方便通过标题识别来源）。
 */
export function normalizeBambooTaskName(taskName) {
  return String(taskName || "")
    .replace(/【已确认】/g, "")
    .replace(/【已自动归因】/g, "")
    .replace(/【已归因】/g, "")
    .replace(/【[^】]*归因[^】]*】/g, "")
    .replace(/已自动归因|自动归因|已归因|归因/g, "")
    .replace(/^[\s:：\-—_]+|[\s:：\-—_]+$/g, "")
    .trim();
}

/**
 * 完整清洗 task_name，用于入日报 Base 表的 task_name 字段。
 * 除状态前缀外，还去除：【数据监控-bamboo-xx】、【bamboo通知】、【bamboo报警】、"bamboo报警"/"bamboo通知" 文本。
 * 避免 Base 表中任务名过于冗长，同时防止匹配时前缀干扰。
 */
export function normalizeBambooTaskNameForBase(taskName) {
  return String(taskName || "")
    .replace(/^(?:【已确认】|【已自动归因】|【已归因】)+/, "")
    .replace(/【已确认】/g, "")
    .replace(/【已自动归因】/g, "")
    .replace(/【已归因】/g, "")
    .replace(/【[^】]*归因[^】]*】/g, "")
    .replace(/【数据监控-bamboo-[^】]+】/gi, "")
    .replace(/【bamboo报警】/gi, "")
    .replace(/【bamboo通知】/gi, "")
    .replace(/已自动归因|自动归因|已归因|归因/g, "")
    .replace(/bamboo报警/gi, "")
    .replace(/bamboo通知/gi, "")
    .replace(/^[\s:：\-—_]+|[\s:：\-—_]+$/g, "")
    .trim();
}

/** @deprecated 改用 normalizeBambooTaskNameForBase。原行为等同完整清洗，保持兼容。 */
export function normalizeBambooAlertTaskName(taskName) {
  return normalizeBambooTaskNameForBase(taskName);
}

export function extractBambooAlertFromMessage(message) {
  const content = htmlUnescape(message?.content ?? JSON.stringify(message ?? {}));
  const title = findFirst(content, [
    /<card\s+title="([^"]+)"/,
    /"title"\s*:\s*"([^"]*【数据监控-bamboo[^"]*)"/,
    /#+\s*([^#\n]*【数据监控-bamboo[^\n]*)/,
  ]);

  if (!title?.includes("【数据监控-bamboo")) {
    return null;
  }

  const alarmTime = findFirst(content, [
    /\*\*告警时间:\*\*\s*([^\n]+)/,
    /告警时间[:：]\s*([^\n]+)/,
    /task_time["':：\s]+([0-9T:.\-\s]+)/i,
  ]);
  const parsedTime = alarmTime ? parseLocalDateTime(alarmTime) : undefined;
  const alarmUrl = findFirst(content, [
    /\*\*告警链接:\*\*\s*\[[^\]]*]\(([^)]+)\)/,
    /(https:\/\/bamboo\.bytedance\.net\/result-manage\/[^\s)]+)/,
  ]);
  const ruleUrl = findFirst(content, [
    /\*\*规则链接:\*\*\s*\[[^\]]*]\(([^)]+)\)/,
    /(https:\/\/bamboo\.bytedance\.net\/rule-manage\/[^\s)]+)/,
  ]);
  const alarmInfo = parseBambooUrl(alarmUrl);
  const ruleInfo = parseBambooUrl(ruleUrl);
  const resultId = alarmInfo.resultId;
  const taskId = alarmInfo.taskId || ruleInfo.taskId;
  const alarmRecordDetailId = parsePositiveIntegerId(
    findFirst(content, [
      /alarm_record_detail_id["':：\s]+(\d+)/i,
      /alarm_detail_id["':：\s]+(\d+)/i,
      /alarmRecordDetailId["':：\s]+(\d+)/,
      /detailid["':：\s]+(\d+)/i,
    ]),
  );
  const taskResultNum = parseNonNegativeInteger(
    findFirst(content, [
      /task_result_num["':：\s]+(\d+)/i,
      /false_data_length["':：\s]+(\d+)/i,
      /\*\*异常(?:数据)?(?:条数|数量|数)[:：]\*\*\s*(\d+)/,
      /异常(?:数据)?(?:条数|数量|数)[:：\s]+(\d+)/,
      /发现异常数据\s*(\d+)\s*条/,
      /异常数据\s*(\d+)\s*条/,
      /异常\s*(\d+)\s*条/,
    ]),
  );
  const topicId = message.thread_id || message.topic_id || message.root_id;
  const messageSentAtMs = parseNonNegativeInteger(
    message?.msg_timestamp ?? message?.create_time ?? message?.createTime ?? message?.timestamp,
  );
  const messageSentAt = messageSentAtMs ? new Date(messageSentAtMs).toISOString() : undefined;

  return {
    title,
    task_name: normalizeBambooAlertTaskName(title),
    result_id: resultId,
    task_id: taskId,
    task_time: parsedTime?.display,
    task_date_key: parsedTime?.dateKey,
    alarm_date: parsedTime?.dateKey,
    bamboo_url: alarmInfo.url,
    bamboo_result_url: alarmInfo.url,
    rule_url: ruleInfo.url,
    chat_id: message.chat_id,
    message_id: message.message_id,
    message_link: message.message_app_link,
    alarm_record_detail_id: alarmRecordDetailId,
    task_result_num: taskResultNum,
    extra: {
      chat_id: message.chat_id,
      group_id: message.chat_id,
      message_id: message.message_id,
      topic_id: topicId,
      source_chat_id: message.chat_id,
      source_message_id: message.message_id,
      source_topic_id: topicId,
      message_link: message.message_app_link,
      message_sent_at_ms: messageSentAtMs,
      message_sent_at: messageSentAt,
      rule_link: ruleInfo.url,
      raw_title: title,
      original_title: title,
      bamboo_check_time: parsedTime?.display,
    },
  };
}

export function classifyBambooResult(result) {
  const sampleClassification = classifyBySqlAndSamples(result);
  if (sampleClassification) {
    return sampleClassification;
  }

  const failureReason = [
    result?.instance_false_reason,
    result?.false_reason,
    result?.repeat_reason,
    result?.comment,
    // validateAiSummary 场景下把 summary 也纳入 classify 输入，便于对纯自由文案反例给出 suggestedAttribution
    typeof result?.summary === "string" ? result.summary : undefined,
  ]
    .map((value) => formatBambooFailureReason(value))
    .filter(Boolean)
    .join("\n");

  const runtimeFailure = classifyHiveRuntimeFailureFromText(failureReason);
  if (runtimeFailure) return runtimeFailure;

  const noEffectiveSamples =
    (result.false_data_length === null ||
      result.false_data_length === undefined ||
      result.false_data_length === "") &&
    !isPositiveIntegerId(result.alarm_detail_id);

  if (result.result === "结果正确" && result.alert_status === "无需发送" && noEffectiveSamples) {
    return {
      kind: "non_effective_alert",
      success: true,
      cardUpdateAllowed: false,
      attributionResult: "[无效告警]其他原因(不需要修数)",
      suggestedAttribution: "[无效告警]其他原因(不需要修数)",
      summary:
        "Bamboo 运行成功且结果正确，alert_status=无需发送且无有效异常样本，已自动确认无需修数；归因结果：[无效告警]其他原因(不需要修数)",
    };
  }

  return {
    kind: "needs_investigation",
    success: false,
    cardUpdateAllowed: isPositiveIntegerId(result.alarm_detail_id),
    summary:
      "Bamboo 结果存在有效异常或状态不满足快速闭环条件，需要继续按规则 SQL、异常样本和线上数据排查。",
    suggestedAttribution: undefined,
  };
}

function normalizeMaybeJsonText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectSqlAndSampleEvidence(result = {}) {
  const candidates = [
    result?.sql,
    result?.rule_sql,
    result?.check_sql,
    result?.compare_sql,
    result?.false_reason,
    result?.instance_false_reason,
    result?.diff_reason,
    result?.repeat_reason,
    result?.comment,
    result?.alert_body,
    result?.alertBody,
    result?.summary,
    result?.false_data,
    result?.falseData,
    result?.samples,
    result?.sample,
    result?.rows,
    result?.data,
    result?.raw,
    result?.extra,
  ];
  const text = candidates.map(normalizeMaybeJsonText).filter(Boolean).join("\n");
  const sampleCount = countEffectiveSamples(
    result?.task_result_num ??
      result?.taskResultNum ??
      result?.false_data_length ??
      result?.falseDataLength,
  );
  const hasFalseReason =
    String(result?.false_reason || result?.falseReason || "").trim().length > 0;
  return {
    text,
    sampleCount,
    hasFalseReason,
    ruleId: String(result?.rule_id || result?.rules_id || result?.ruleId || ""),
    resultId: String(result?.result_id || result?.resultId || ""),
    taskName: String(result?.task_name || result?.taskName || ""),
  };
}

function buildGenericAttributionResult({ kind, attribution, confidence, summary, evidence = [] }) {
  return {
    kind,
    success: true,
    cardUpdateAllowed: true,
    attributionResult: attribution,
    suggestedAttribution: attribution,
    confidence,
    evidence,
    summary: normalizeAttributionSummary(summary, attribution),
    nonOverride: true,
  };
}

function buildInvalidPlatformRuntimeFailure({
  kind,
  errorClass,
  evidence,
  resultId,
  ruleId,
  summaryPrefix,
}) {
  const attribution = "[无效告警]对账平台问题";
  return {
    kind,
    success: true,
    cardUpdateAllowed: true,
    attributionResult: attribution,
    suggestedAttribution: attribution,
    confidence: 0.9,
    error_class: errorClass,
    evidence: [evidence],
    summary: normalizeAttributionSummary(
      `${summaryPrefix}（${evidence}），未完成对账脚本执行且未产生有效业务差异样本，result_id=${resultId || "unknown"} rule_id=${ruleId || "unknown"} 排查完成，证据已附文档`,
      attribution,
    ),
    nonOverride: true,
  };
}

function classifyHiveRuntimeFailureFromText(haystack, { resultId = "", ruleId = "" } = {}) {
  if (
    /NoPrivilegeException|No valid privileges|Permission denied|permission\s+denied|权限不足|无权限|缺少依赖表|依赖表或字段查询权限/i.test(
      haystack,
    )
  ) {
    return buildGenericAttributionResult({
      kind: "table_permission_missing",
      attribution: "[无效告警]表权限缺失",
      confidence: 0.95,
      evidence: ["NoPrivilegeException/No valid privileges/Permission denied"],
      summary:
        `Bamboo 规则执行失败，SQL/TQS 返回 NoPrivilegeException 或 No valid privileges，执行账号缺少依赖表或字段查询权限，` +
        `result_id=${resultId || "unknown"} rule_id=${ruleId || "unknown"} 排查完成，证据已附文档`,
    });
  }

  if (
    /Table\s+'.*'\s+not found|Object\s+'.*'\s+not found|Table not found|not found within|表不存在|依赖表不存在|找不到表/i.test(
      haystack,
    )
  ) {
    return buildInvalidPlatformRuntimeFailure({
      kind: "hive_object_not_found",
      errorClass: "dependency_object_not_found",
      evidence: "Object/Table not found",
      resultId,
      ruleId,
      summaryPrefix: "Bamboo 规则执行失败，SQL 引用的依赖表或 Hive 对象不存在/不可见",
    });
  }

  if (
    /Column\s+'.*'\s+cannot be resolved|cannot resolve column|cannot be resolved|字段.*不存在|列.*不存在|列.*无法解析/i.test(
      haystack,
    )
  ) {
    return buildInvalidPlatformRuntimeFailure({
      kind: "hive_column_not_resolved",
      errorClass: "sql_column_not_compatible",
      evidence: "Column cannot be resolved",
      resultId,
      ruleId,
      summaryPrefix: "Bamboo 规则执行失败，对账 SQL 引用字段未兼容当前依赖表结构",
    });
  }

  if (
    /Table partition not found|partition .*not found|分区.*不存在|依赖分区.*未就绪|分区未就绪/i.test(
      haystack,
    )
  ) {
    return buildInvalidPlatformRuntimeFailure({
      kind: "hive_partition_not_ready",
      errorClass: "dependency_partition_not_ready",
      evidence: "Table partition not found",
      resultId,
      ruleId,
      summaryPrefix: "Bamboo 规则执行失败，对账依赖分区未就绪",
    });
  }

  if (
    /TQS-1000081|unify the data type|data type|SQL syntax|syntax error|类型.*不一致|字符串.*数字|数字.*字符串|get_json_object\([^)]*\)\s*=\s*1/i.test(
      haystack,
    )
  ) {
    return buildInvalidPlatformRuntimeFailure({
      kind: "hive_sql_syntax_or_type_error",
      errorClass: "sql_syntax_or_type_error",
      evidence:
        /TQS-1000081|unify the data type|data type|类型.*不一致|字符串.*数字|数字.*字符串|get_json_object\([^)]*\)\s*=\s*1/i.test(
          haystack,
        )
          ? "TQS-1000081/SQL syntax/type error"
          : "SQL syntax/type error",
      resultId,
      ruleId,
      summaryPrefix: "Bamboo 规则执行失败，对账 SQL 存在语法或类型兼容问题",
    });
  }

  if (
    /Yarn|TQS.*timeout|timeout waiting for resources|resource timeout|资源.*超时|队列.*超时|执行环境异常/i.test(
      haystack,
    )
  ) {
    return buildInvalidPlatformRuntimeFailure({
      kind: "hive_execution_environment_error",
      errorClass: "execution_environment_error",
      evidence: "Yarn/TQS resource timeout",
      resultId,
      ruleId,
      summaryPrefix: "Bamboo 规则执行失败，Yarn/TQS 执行资源或运行环境异常",
    });
  }

  return null;
}

export function classifyBySqlAndSamples(result = {}) {
  const { text, sampleCount, hasFalseReason, ruleId, resultId } =
    collectSqlAndSampleEvidence(result);
  const haystack = text.replace(/\s+/g, " ");
  const lower = haystack.toLowerCase();
  const hasEffectiveSamples = sampleCount > 0 || hasFalseReason;

  const runtimeFailure = classifyHiveRuntimeFailureFromText(haystack, { resultId, ruleId });
  if (runtimeFailure) return runtimeFailure;

  if (!hasEffectiveSamples) return null;

  if (
    /settle_biz_id["'\s:=：]*null|settle_biz_id\s+is\s+null|settle_amount["'\s:=：]*0|settle_amount\s*=\s*0|after_sale_refund|售后退款|退款.*结算.*缺失|结算记录.*缺失/i.test(
      haystack,
    )
  ) {
    return buildGenericAttributionResult({
      kind: "compensation_task_missing_settlement",
      attribution: "[有效告警]补偿任务问题(新问题)",
      confidence: 0.88,
      evidence: ["settle_biz_id=NULL", "settle_amount=0", "after_sale_refund"],
      summary:
        `规则命中 ${sampleCount > 0 ? `${sampleCount} 条` : ""}有效差异样本，样本字段表现为 after_sale_refund 已存在但 settle_biz_id=NULL、settle_amount=0，` +
        `说明售后退款后的分账结算记录未生成，需要补偿或修数，result_id=${resultId || "unknown"} rule_id=${ruleId || "unknown"} 排查完成，证据已附文档`,
    });
  }

  if (
    /diff_reason["'\s:=：]*ledger_payer_account_id不一致|ledger_payer_account_id.*不一致|付款账号.*不一致|付款账户.*不一致/i.test(
      haystack,
    )
  ) {
    return buildGenericAttributionResult({
      kind: "upstream_ledger_payer_account_mismatch",
      attribution: "[有效告警]上下游问题(新问题)",
      confidence: 0.86,
      evidence: ["diff_reason=ledger_payer_account_id不一致"],
      summary:
        `有效差异样本命中 diff_reason=ledger_payer_account_id不一致，本地执行单与财经分账单付款账号口径不一致，` +
        `result_id=${resultId || "unknown"} rule_id=${ruleId || "unknown"} 排查完成，证据已附文档`,
    });
  }

  if (
    /财经单据不存在|财经款项不存在|财经.*不存在|finance.*not\s+exist|financial.*not\s+exist/i.test(
      haystack,
    )
  ) {
    return buildGenericAttributionResult({
      kind: "upstream_finance_document_missing",
      attribution: "[有效告警]上下游问题(新问题)",
      confidence: 0.84,
      evidence: ["财经单据不存在/财经款项不存在"],
      summary:
        `有效差异样本显示财经单据不存在或财经款项不存在，上游财经侧单据/款项未产出或未同步到本地对账口径，` +
        `result_id=${resultId || "unknown"} rule_id=${ruleId || "unknown"} 排查完成，证据已附文档`,
    });
  }

  if (/本地款项不存在|本地执行单未成功|local.*not\s+exist|执行单.*未成功/i.test(haystack)) {
    const sqlLooksLocalCompensation = /compensat|补偿|settle|refund|after_sale/i.test(lower);
    const attribution = sqlLooksLocalCompensation
      ? "[有效告警]补偿任务问题(新问题)"
      : "[有效告警]代码问题(新问题)";
    return buildGenericAttributionResult({
      kind: sqlLooksLocalCompensation
        ? "local_payment_missing_compensation"
        : "local_payment_missing_code",
      attribution,
      confidence: 0.78,
      evidence: ["本地款项不存在/本地执行单未成功"],
      summary:
        `有效差异样本显示本地款项不存在或本地执行单未成功，结合 SQL 来源判断为${sqlLooksLocalCompensation ? "补偿任务未覆盖对应链路" : "本地代码处理分支未完整落单"}，` +
        `result_id=${resultId || "unknown"} rule_id=${ruleId || "unknown"} 排查完成，证据已附文档`,
    });
  }

  if (
    /样本.*已恢复|当前查询样本数.*0|false_data_length["'\s:=：]*0|task_result_num["'\s:=：]*0|已恢复|无需修数/i.test(
      haystack,
    )
  ) {
    return buildGenericAttributionResult({
      kind: "offline_sync_recovered",
      attribution: "[有效告警]离线同步问题，已恢复，无需修数",
      confidence: 0.76,
      evidence: ["样本全部已恢复/当前查询样本数为 0"],
      summary:
        `Bamboo 曾产生有效差异样本，但当前复查样本已恢复或查询样本数为 0，符合离线同步延迟恢复特征，` +
        `result_id=${resultId || "unknown"} rule_id=${ruleId || "unknown"} 排查完成，证据已附文档`,
    });
  }

  return null;
}

export function buildBaseRecordPatch({
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
  if (status === "succeeded") {
    assertSummaryContainsBambooAttributionResult(summary);
    assertValidSucceededDocUrl(docUrl);
    assertTerminalNotificationStatus({
      status: cardUpdateStatus,
      reason: cardUpdateReason,
      statusKey: "cardUpdateStatus",
      reasonKey: "cardUpdateReason",
    });
    assertTerminalNotificationStatus({
      status: messageReplyStatus,
      reason: messageReplyReason,
      statusKey: "messageReplyStatus",
      reasonKey: "messageReplyReason",
    });
  }
  if (status === "failed") {
    assertFailedAdmission(failedAdmission);
  }
  if (status === "pending") {
    assertPendingSummary(summary);
    assertPendingAdmission(pendingAdmission);
  }

  const patch = {
    status,
    ai_summary: summary,
    ai_result: docUrl,
    ai_finished_at: normalizeCompletionTimestamp(finishedAt),
  };

  if (status === "succeeded") {
    patch.extra = buildNotificationExtraJson({
      cardUpdateStatus,
      cardUpdateReason,
      messageReplyStatus,
      messageReplyReason,
    });
  }

  return {
    record_id_list: [recordId],
    patch,
  };
}

export function buildBaseModelResultPatch({
  recordId,
  status,
  summary,
  docUrl,
  finishedAt,
  pendingAdmission,
  failedAdmission,
}) {
  if (status === "succeeded") {
    assertSummaryContainsBambooAttributionResult(summary);
    assertValidSucceededDocUrl(docUrl);
  }
  if (status === "failed") {
    assertFailedAdmission(failedAdmission);
  }
  if (status === "pending") {
    assertPendingSummary(summary);
    assertPendingAdmission(pendingAdmission);
  }

  return {
    record_id_list: [recordId],
    patch: {
      status,
      ai_summary: summary,
      ai_result: docUrl,
      ai_finished_at: normalizeCompletionTimestamp(finishedAt),
    },
  };
}

export function buildBaseNotificationPatch({
  recordId,
  extra,
  cardUpdateStatus,
  cardUpdateReason,
  messageReplyStatus,
  messageReplyReason,
}) {
  assertTerminalNotificationStatus({
    status: cardUpdateStatus,
    reason: cardUpdateReason,
    statusKey: "cardUpdateStatus",
    reasonKey: "cardUpdateReason",
  });
  assertTerminalNotificationStatus({
    status: messageReplyStatus,
    reason: messageReplyReason,
    statusKey: "messageReplyStatus",
    reasonKey: "messageReplyReason",
  });

  return {
    record_id_list: [recordId],
    patch: {
      extra: buildNotificationExtraJson({
        extra,
        cardUpdateStatus,
        cardUpdateReason,
        messageReplyStatus,
        messageReplyReason,
      }),
    },
  };
}

function buildNotificationExtraJson({
  extra,
  cardUpdateStatus,
  cardUpdateReason,
  messageReplyStatus,
  messageReplyReason,
}) {
  const notificationExtra = {
    ...parseExtraObject(extra),
    card_update_status: cardUpdateStatus,
  };
  if (cardUpdateReason) {
    notificationExtra.card_update_reason = cardUpdateReason;
  }
  notificationExtra.message_reply_status = messageReplyStatus;
  if (messageReplyReason) {
    notificationExtra.message_reply_reason = messageReplyReason;
  }
  return JSON.stringify(notificationExtra);
}

function parseExtraObject(extra) {
  if (!extra) return {};
  if (typeof extra === "object" && !Array.isArray(extra)) return { ...extra };
  if (typeof extra !== "string") return {};
  try {
    const parsed = JSON.parse(extra);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// 【P0-1 硬固化】Bamboo 失败原因对象/数组转可读字符串（防止 [object Object],[object Object] 乱码）
// - 纯字符串 → trim 后原样
// - null / undefined → 空串
// - 对象/数组（数组每个元素是 { message, code, detail, reason, ... } 这种结构时）→ 优先展平拼接常见字段，兜底 JSON.stringify(..., null, 2)
// - 其他基本类型 → String()
export function formatBambooFailureReason(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const parts = value.map((item) => formatBambooFailureReason(item)).filter(Boolean);
    return parts.join("; ");
  }
  if (typeof value === "object") {
    const vals = [];
    const knownKeys = [
      "message",
      "msg",
      "reason",
      "cause",
      "detail",
      "errorMessage",
      "error_message",
      "code",
      "status",
      "type",
      "name",
      "stack",
    ];
    for (const k of knownKeys) {
      if (k in value) {
        const v = formatBambooFailureReason(value[k]);
        if (v) vals.push(`${k}:${v}`);
      }
    }
    if (vals.length > 0) return vals.join(" | ");
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// 【P0-1 硬固化】异常样本数标准化：AI 最容易在此自由发挥（乱填 / 写 "N/A" / 写非数字）
// 规则：
//  - null / undefined / 空串 / 纯空白 / "N/A" / "null" / "undefined" → 0
//  - 正整数 → 直接返回
//  - 非负整数字符串 → Number 化（"12" / "12.0" 兼容）
//  - 其他 → NaN（交由上层 classifyQuickClosureConditions 识别为 invalid_samples_count）
export function countEffectiveSamples(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return 0;
    if (!Number.isFinite(value)) return 0;
    return value < 0 ? 0 : Math.floor(value);
  }
  if (typeof value !== "string") return 0;
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  const lowered = trimmed.toLowerCase();
  if (["n/a", "na", "null", "undefined", "-", "--", "无", "未检出", "none"].includes(lowered))
    return 0;
  const n = Number(trimmed);
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return n < 0 ? 0 : Math.floor(n);
}

function summarizeAbnormalList(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        return summarizeAbnormalList(parsed);
      } catch {
        // fall through to non-empty string summary
      }
    }
  }
  if (Array.isArray(value)) {
    return { available: value.length > 0, length: value.length, source_type: "array" };
  }
  if (value && typeof value === "object") {
    const items = Array.isArray(value.items)
      ? value.items
      : Array.isArray(value.data)
        ? value.data
        : Array.isArray(value.records)
          ? value.records
          : undefined;
    if (items) {
      return { available: items.length > 0, length: items.length, source_type: "object_array" };
    }
    return { available: Object.keys(value).length > 0, length: undefined, source_type: "object" };
  }
  const trimmed = String(value ?? "").trim();
  return {
    available: Boolean(trimmed),
    length: trimmed ? undefined : 0,
    source_type: typeof value,
  };
}

function hasExplicitSampleInput(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function normalizeAuthoritativeSampleCount({
  falseDataLength,
  bambooFalseDataLength,
  falseReason,
  taskResultNum,
  baseTaskResultNum,
  cardTaskResultNum,
  abnormalList,
} = {}) {
  const bambooRaw = bambooFalseDataLength ?? falseDataLength;
  const baseRaw = baseTaskResultNum ?? taskResultNum;
  const cardRaw = cardTaskResultNum;
  const falseReasonSummary = summarizeAbnormalList(abnormalList ?? falseReason);
  const sources = [];

  if (hasExplicitSampleInput(bambooRaw)) {
    sources.push({
      source: "bamboo_false_data_length",
      count: countEffectiveSamples(bambooRaw),
      known: true,
      priority: 100,
    });
  }
  if (falseReasonSummary.available) {
    sources.push({
      source: "false_reason.length",
      count: Number.isFinite(Number(falseReasonSummary.length))
        ? Number(falseReasonSummary.length)
        : 1,
      known: true,
      priority: 90,
    });
  } else if (
    falseReasonSummary.length === 0 &&
    hasExplicitSampleInput(falseReason ?? abnormalList)
  ) {
    sources.push({
      source: "false_reason.length",
      count: 0,
      known: true,
      priority: 90,
    });
  }
  if (hasExplicitSampleInput(baseRaw)) {
    sources.push({
      source: "base_task_result_num",
      count: countEffectiveSamples(baseRaw),
      known: true,
      priority: 80,
    });
  }
  if (hasExplicitSampleInput(cardRaw)) {
    sources.push({
      source: "card_task_result_num",
      count: countEffectiveSamples(cardRaw),
      known: true,
      priority: 70,
    });
  }

  const positiveSources = sources.filter((item) => item.count > 0);
  const knownCounts = [...new Set(sources.filter((item) => item.known).map((item) => item.count))];
  const conflict = knownCounts.length > 1;
  const selected =
    positiveSources.length > 0
      ? [...positiveSources].sort((a, b) => b.priority - a.priority)[0]
      : [...sources].sort((a, b) => b.priority - a.priority)[0];
  const authoritativeSamples = selected ? selected.count : 0;
  const bambooZeroKnown = sources.some(
    (item) => item.source === "bamboo_false_data_length" && item.count === 0,
  );
  const falseReasonEmptyKnown =
    sources.some((item) => item.source === "false_reason.length" && item.count === 0) ||
    !falseReasonSummary.available;
  const baseZeroKnown = sources.some(
    (item) => item.source === "base_task_result_num" && item.count === 0,
  );

  return {
    authoritativeSamples,
    authoritative_samples: authoritativeSamples,
    source: selected?.source || "unknown",
    sources,
    positiveSources,
    positive_sources: positiveSources,
    conflict,
    sample_count_conflict: conflict,
    canQuickCloseZeroSamples:
      authoritativeSamples === 0 &&
      !conflict &&
      bambooZeroKnown &&
      falseReasonEmptyKnown &&
      baseZeroKnown,
    can_quick_close_zero_samples:
      authoritativeSamples === 0 &&
      !conflict &&
      bambooZeroKnown &&
      falseReasonEmptyKnown &&
      baseZeroKnown,
    nonOverride: true,
  };
}

export function classifySampleCountConsistency({
  taskResultNum,
  cardTaskResultNum,
  falseDataLength,
  bambooFalseDataLength,
  falseReason,
  abnormalList,
  retryAttempts,
} = {}) {
  const cardSamples = countEffectiveSamples(cardTaskResultNum ?? taskResultNum);
  const bambooSamples = countEffectiveSamples(bambooFalseDataLength ?? falseDataLength);
  const listSummary = summarizeAbnormalList(abnormalList ?? falseReason);
  const authoritative = normalizeAuthoritativeSampleCount({
    taskResultNum,
    cardTaskResultNum,
    falseDataLength,
    bambooFalseDataLength,
    falseReason,
    abnormalList,
  });
  const conflict =
    authoritative.conflict || (cardSamples > 0 && bambooSamples === 0 && !listSummary.available);
  return {
    card_task_result_num: cardSamples,
    bamboo_false_data_length: bambooSamples,
    authoritative_samples: authoritative.authoritativeSamples,
    authoritative_source: authoritative.source,
    positive_sources: authoritative.positiveSources,
    can_quick_close_zero_samples: authoritative.canQuickCloseZeroSamples,
    false_reason_available: listSummary.available,
    false_reason_length: listSummary.length,
    false_reason_source_type: listSummary.source_type,
    retry_attempts: Number.isFinite(Number(retryAttempts)) ? Number(retryAttempts) : undefined,
    verdict: conflict ? "sample_count_conflict" : "consistent_or_not_applicable",
  };
}

// 【P0-1 硬固化】快速闭环 4 类条件的硬匹配，AI 不得 override：
//   QC-1: 异常样本数=0 或 cnt_nums<=阈值（默认 5）
//   QC-2: 对账平台/Hive 权限缺失类（instance_status=表权限/脚本不兼容）
//   QC-3: 临界值漂移（|diff| ≤ 1 或 diff_ratio 极小，且样本量 ≤ 阈值）
//   QC-4: 测试数据/规则调试标记在标题/任务名/原始卡片正文中
// 返回 matchedConditions 命中列表 + quickClosureRecommended=至少命中 1 类 + 强制 attribution 建议
export function classifyQuickClosureConditions({
  taskName,
  falseDataLength,
  taskResultNum,
  instanceStatus,
  instanceFalseReason,
  falseReason,
  alertBody,
  sampleThreshold = 5,
  criticalDiffAbs = 1,
  criticalDiffRatio = 0.001,
}) {
  const authoritative = normalizeAuthoritativeSampleCount({
    falseDataLength,
    falseReason,
    taskResultNum,
  });
  const effectiveSamples = authoritative.authoritativeSamples;
  const sampleCountConsistency = classifySampleCountConsistency({
    taskResultNum,
    falseDataLength,
    falseReason,
  });
  const hasSampleCountConflict = sampleCountConsistency.verdict === "sample_count_conflict";
  const conditions = [];
  const normalizedStatus = formatBambooFailureReason(instanceStatus);
  const normalizedFalseReason = [instanceFalseReason, falseReason]
    .map((v) => formatBambooFailureReason(v))
    .filter(Boolean)
    .join("; ");
  const executionFailed =
    /运行失败|核对终止|执行失败|failed|failure|exception|error|权限|permission|privilege|TQS-\d+|表不存在|找不到表|not found/i.test(
      `${normalizedStatus}\n${normalizedFalseReason}`,
    );

  // QC-1: 仅允许 Bamboo/Base 均明确为 0/空的零样本快速闭环；任一来源 >0 必须深排。
  if (!executionFailed && !hasSampleCountConflict && authoritative.canQuickCloseZeroSamples) {
    const attribution = "[无效告警]临界数据飘移";
    const summary = `Bamboo/Base 本轮核验异常样本数均为0，未产生有效异常明细或差异数据，已自动确认无需修数；归因结果：${attribution}`;
    conditions.push({
      code: "QC-1",
      name: "样本数阈值内快速闭环",
      hit: true,
      confidence: "high",
      evidence: `authoritative_samples=0, source=${authoritative.source}, Bamboo/Base 均确认零样本`,
      hardcodedAttribution: attribution,
      hardcodedSummary: summary,
    });
  }

  // QC-2: 权限/脚本类
  const statusHit = /权限|permission|privilege|表缺失|表不存在|找不到表/i.test(normalizedStatus);
  const reasonHit =
    /NoPrivilegeException|No valid privileges|does not have privileges for QUERY|Permission denied|permission denied|privilege|表不存在|找不到表|未授权/i.test(
      normalizedFalseReason,
    );
  if (statusHit || reasonHit) {
    const isTablePermission =
      normalizedStatus.includes("表权限") || normalizedStatus.includes("permission") || reasonHit;
    const attribution = "[无效告警]表权限缺失";
    const evidenceList = [
      statusHit ? `instance_status=${normalizedStatus.slice(0, 80)}` : null,
      reasonHit ? `false_reason=${normalizedFalseReason.slice(0, 120)}` : null,
    ]
      .filter(Boolean)
      .join("; ");
    const summary = `Bamboo 规则执行失败，${evidenceList}，未产生有效业务样本，已自动确认归属权限类问题；归因结果：${attribution}`;
    conditions.push({
      code: "QC-2",
      name: "权限缺失/脚本不兼容类快速闭环",
      hit: true,
      confidence: isTablePermission ? "high" : "medium",
      evidence: evidenceList,
      hardcodedAttribution: attribution,
      hardcodedSummary: summary,
    });
  }

  // QC-3: 临界漂移（alert body 中能解析出 diff 绝对值 ≤ criticalDiffAbs 且 ratio ≤ criticalDiffRatio，且样本数 ≤ 10）
  const normalizedAlert = String(alertBody || taskName || "").replace(/\s+/g, " ");
  const absDiffMatch = normalizedAlert.match(
    /(?:差值|差异|diff|差额|差量)\s*[:：=]?\s*(-?\d+(?:\.\d+)?)/i,
  );
  const ratioMatch = normalizedAlert.match(
    /(?:差异比例|diff[_ ]?ratio|比例)\s*[:：=]?\s*(-?\d+(?:\.\d+)?)\s*%?/i,
  );
  let criticalHit = false;
  let criticalEvidence = null;
  if (!executionFailed && !hasSampleCountConflict && absDiffMatch) {
    const diff = Math.abs(Number(absDiffMatch[1]));
    if (
      !Number.isNaN(diff) &&
      diff <= criticalDiffAbs &&
      effectiveSamples <= Math.max(sampleThreshold * 2, 10)
    ) {
      criticalHit = true;
      criticalEvidence = `abs_diff=${diff}（≤ ${criticalDiffAbs}）, effective_samples=${effectiveSamples}`;
    }
  }
  if (!executionFailed && !hasSampleCountConflict && ratioMatch) {
    const ratio = Math.abs(Number(ratioMatch[1]));
    const ratioNormalized = ratio > 1 ? ratio / 100 : ratio;
    if (
      !Number.isNaN(ratio) &&
      ratioNormalized <= criticalDiffRatio &&
      effectiveSamples <= Math.max(sampleThreshold * 2, 10)
    ) {
      criticalHit = true;
      criticalEvidence = `diff_ratio=${ratioNormalized}（≤ ${criticalDiffRatio}）, effective_samples=${effectiveSamples}`;
    }
  }
  if (criticalHit && criticalEvidence) {
    const attribution = "[无效告警]临界数据飘移";
    const summary = `Bamboo 核验命中临界值漂移（${criticalEvidence}），属于可忽略的数据波动，已自动确认无需修数；归因结果：${attribution}`;
    conditions.push({
      code: "QC-3",
      name: "临界值漂移快速闭环",
      hit: true,
      confidence: "medium",
      evidence: criticalEvidence,
      hardcodedAttribution: attribution,
      hardcodedSummary: summary,
    });
  }

  // QC-4: 测试/调试标记
  const testingKeywords = [
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
  const testingHaystack =
    `${taskName || ""}\n${normalizedAlert}\n${normalizedFalseReason}`.toLowerCase();
  const hitKeywords = testingKeywords.filter((kw) => testingHaystack.includes(kw.toLowerCase()));
  if (hitKeywords.length > 0) {
    const attribution = hitKeywords.some((k) => k.includes("调试"))
      ? "[无效告警]规则调试"
      : "[无效告警]测试数据";
    const summary = `Bamboo 报警标题/正文命中测试/调试标记（关键词=${JSON.stringify(hitKeywords)}），属于非生产数据，已自动确认无需修数；归因结果：${attribution}`;
    conditions.push({
      code: "QC-4",
      name: "测试数据/规则调试标记命中",
      hit: true,
      confidence: "high",
      evidence: `命中关键词=${JSON.stringify(hitKeywords)}`,
      hardcodedAttribution: attribution,
      hardcodedSummary: summary,
    });
  }

  const matchedConditions = conditions.filter((c) => c.hit);
  const quickClosureRecommended = matchedConditions.length > 0;
  // 优先级：QC-2(权限/执行失败) > QC-4(测试/调试) > QC-1(样本0) > QC-3(临界)
  const priorityOrdered = [...matchedConditions].sort((a, b) => {
    const rank = { "QC-2": 0, "QC-4": 1, "QC-1": 2, "QC-3": 3 };
    return (rank[a.code] ?? 9) - (rank[b.code] ?? 9);
  });
  const topAttribution = priorityOrdered[0]?.hardcodedAttribution;
  const topSummary = priorityOrdered[0]?.hardcodedSummary;
  const overallConfidence = priorityOrdered[0]?.confidence || "none";

  return {
    effectiveSamples,
    authoritativeSamples: authoritative.authoritativeSamples,
    authoritative_samples: authoritative.authoritativeSamples,
    authoritativeSampleSource: authoritative.source,
    authoritative_sample_source: authoritative.source,
    sampleCountConsistency,
    sample_count_consistency: sampleCountConsistency,
    sampleThreshold,
    matchedConditions,
    matchedCodes: matchedConditions.map((c) => c.code),
    quickClosureRecommended,
    quick_closure_recommended: quickClosureRecommended,
    topHardcodedAttribution: topAttribution,
    top_hardcoded_attribution: topAttribution,
    topHardcodedSummary: topSummary,
    top_hardcoded_summary: topSummary,
    overallConfidence,
    overall_confidence: overallConfidence,
    nonOverride: true, // 【硬约束】此返回值为最终权威值，AI 不得 override
  };
}

// 【P0-2 L2 硬规则】needs_manual_review ↔ status 联动：
//   pending 必须 needs=true（因为 waiting_for_user_authorization=true 就是人工干预）
//   failed 必须 needs=true（网络错误达到 3 次以上才允许 failed，后续需要人工确认是否 retry）
//   processing 必须 needs=false（模型仍然在跑，不需要人工介入）
//   init 必须 needs=false（尚未认领）
//   succeeded 默认 needs=false，除非在 opts 里显式 overrideByDoc 表示 SOP 文档有后续人工操作建议
export function validateNeedsManualConfirmation(status, opts = {}) {
  const s = String(status || "").trim();
  const reasons = [];
  let needs = false;
  switch (s) {
    case "pending":
      if (opts.pendingAdmission?.pending_reason_type === "bamboo_result_inconsistent") {
        needs = false;
        reasons.push(
          "status=pending 且 pending_reason_type=bamboo_result_inconsistent，属于 Bamboo result 接口数据冲突等待复核，不强制 needs_manual_review=true",
        );
      } else {
        needs = true;
        reasons.push(
          "status=pending 必须 needs_manual_review=true（等待用户授权或确认，属于人工干预阶段）",
        );
      }
      break;
    case "failed":
      needs = true;
      reasons.push(
        "status=failed 必须 needs_manual_review=true（连续网络错误后转人工介入检查权限/链路）",
      );
      break;
    case "processing":
      needs = false;
      reasons.push(
        "status=processing 必须 needs_manual_review=false（AI 仍在自动处理，禁止提前转人工）",
      );
      break;
    case "init":
      needs = false;
      reasons.push(
        "status=init 必须 needs_manual_review=false（尚未认领 processing，不应触发人工介入）",
      );
      break;
    case "succeeded":
      needs = Boolean(opts.overrideByDoc);
      if (needs)
        reasons.push(
          "status=succeeded 因 SOP 文档标注需要人工 follow-up，needs_manual_review=true",
        );
      else reasons.push("status=succeeded 默认 needs_manual_review=false（自动闭环成功）");
      break;
    case "not_support":
      needs = true;
      reasons.push(
        "status=not_support 必须 needs_manual_review=true（当前口径/脚本不支持，转人工判断是否归档）",
      );
      break;
    default:
      reasons.push(`未知 status=${s}，无法判定 needs_manual_review`);
      return { valid: false, needsManualReview: undefined, reasons, nonOverride: true };
  }
  const override = opts.needsManualReviewProvided !== undefined;
  if (override) {
    const provided = Boolean(opts.needsManualReviewProvided);
    if (provided !== needs) {
      reasons.push(
        `AI 提供 needs_manual_review=${provided} 与硬规则期望=${needs} 不一致，已按硬规则纠正为 ${needs}`,
      );
    }
  }
  return { valid: true, needsManualReview: needs, reasons, nonOverride: true };
}

// 【P0-2 L2 硬规则】ai_summary 长度 + 关键词双重校验：
//   - 必须包含 1 个且只包含 1 个 BAMBOO_ATTRIBUTION_RESULTS 里的固定归因
//   - 去掉固定归因后自由文案长度 minLength~maxLength（默认 20~500）
//   - succeeded/pending：必须含 "排查完成" / "证据已附文档" / "等待用户授权" 之一
//   - 返回归一化后的 ai_summary（AI 提供的若不满足可自动 prepend fixed attribution，AI 不可 override）
export function normalizeAiSummaryLengthAndKeywords(aiSummary, opts = {}) {
  const {
    requiredAttribution, // 可选：若提供则要求必须包含此固定归因（来自 classifyQuickClosure 或 build-attribution-candidates）
    qcHardcodedSummary, // 可选：QC 命中时脚本产出的权威配套 summary（全部字段齐全时可兜底修复）
    minLength = 20,
    maxLength = 500,
    requireFreeTextKeywords = true, // 是否要求自由文案含关键词
  } = opts || {};
  const raw = typeof aiSummary === "string" ? aiSummary : "";
  const reasons = [];
  const hints = [];
  const aiValidation = validateAiSummary(raw, {
    requireAttribution: true,
    minFreeTextLength: minLength,
  });
  let valid = aiValidation.valid;
  let normalized = raw;

  // 长度上限校验
  if (raw.length > maxLength) {
    valid = false;
    reasons.push(
      `ai_summary 长度=${raw.length} 超过上限=${maxLength}，请精简到 ${maxLength} 字符以内`,
    );
    hints.push(`建议长度 ${minLength}~${maxLength}，固定归因占 10~20 字，其余为自由证据摘要`);
  }
  // 必填归因对齐
  if (requiredAttribution && isAllowedBambooAttributionResult(requiredAttribution)) {
    if (aiValidation.attributionResult && aiValidation.attributionResult !== requiredAttribution) {
      valid = false;
      reasons.push(
        `AI 提供归因=${aiValidation.attributionResult} 与脚本权威归因=${requiredAttribution} 不一致（nonOverride，禁止 AI 自选）`,
      );
      hints.push(
        `应使用脚本 classifyQuickClosure / build-attribution-candidates 产出的 topHardcodedAttribution=${requiredAttribution}`,
      );
      // 【硬修复】把 AI 提供的错误归因替换成权威归因（nonOverride）
      normalized = normalized.replace(aiValidation.attributionResult, requiredAttribution);
    }
    if (!aiValidation.attributionResult) {
      // AI 完全没写归因，先 prepend 权威归因；若后续仍失败且有 qc summary 则再兜底
      normalized = `${requiredAttribution}。${normalized}`;
      reasons.push(`AI 未写入固定归因，已按硬规则 prepend 权威归因=${requiredAttribution}`);
    }
  }
  // 自由文案关键词检查（succeeded/pending）
  const normalizedAttribution =
    requiredAttribution && isAllowedBambooAttributionResult(requiredAttribution)
      ? requiredAttribution
      : extractBambooAttributionResult(normalized);
  if (normalizedAttribution) {
    normalized = normalizeAttributionSummary(normalized, normalizedAttribution);
  }
  if (requireFreeTextKeywords) {
    const freeText = normalized.replace(/\[(有效|无效)告警\][^\s，。；\n]+/g, "").trim();
    const kwRequired = [
      "排查完成",
      "证据已附文档",
      "等待用户授权",
      "网络错误多次重试仍失败",
      "已自动确认无需修数",
      "当前不支持自动排查",
    ];
    const hit = kwRequired.some((kw) => freeText.includes(kw));
    if (!hit) {
      valid = false;
      reasons.push(
        `ai_summary 去掉固定归因后的自由文案缺少状态关键词，应至少包含：${kwRequired.join(" / ")} 之一`,
      );
      hints.push(
        `样例：${requiredAttribution || "[有效告警]代码问题(新问题)"}。排查完成，上下游链路已验证，证据已附文档。`,
      );
    }
  }

  // 【QC 配套 summary 兜底修复】
  // 当 1) 校验失败（缺归因/缺关键词/长度不足） 且 2) 脚本产出了 qcHardcodedSummary（含合法归因+关键词+足够自由文案）
  // 则直接用权威 summary 作为 normalized，让后续 close-prepared-work-items 可闭环。
  if (!valid && qcHardcodedSummary && typeof qcHardcodedSummary === "string") {
    const qcValid = validateAiSummary(qcHardcodedSummary, {
      requireAttribution: true,
      minFreeTextLength: minLength,
    });
    if (qcValid.valid) {
      normalized = qcHardcodedSummary;
      valid = true;
      reasons.push(
        `ai_summary 已按 QC 权威配套 summary 自动修复（原问题：${reasons.filter((r) => !r.startsWith("ai_summary 已按 QC")).join("; ")}）`,
      );
    }
  }

  return {
    valid,
    raw,
    normalized,
    rawLength: raw.length,
    normalizedLength: normalized.length,
    attributionResult:
      requiredAttribution && isAllowedBambooAttributionResult(requiredAttribution)
        ? requiredAttribution
        : aiValidation.attributionResult,
    matchedResults: aiValidation.matchedResults,
    minLength,
    maxLength,
    reasons,
    hints: hints.length > 0 ? hints : aiValidation.hints,
    sampleFixed: aiValidation.sampleFixed,
    nonOverride: true,
  };
}

// 【P0-2 L3 deep check】6 项 pending 准入顺序命中即停：
//   P-1: authorization_request.target 非空且格式 "PSM 方法名"
//   P-2: rule_and_samples.status=done 且 evidence 长度 >=30 字
//   P-3: current_online_state.status ∈ {done, blocked} 且 evidence 长度 >=20
//   P-4: permission_blockers.status ∈ {done, blocked} 且 evidence 长度 >=20
//   P-5: code_idl_config.status ∈ {done, blocked, not_applicable}
//   P-6: closure_candidates.status ∈ {done, blocked, not_applicable} 且至少 2 项候选被评估
// 任一不通过 → hardFailCode=P-N，deepValid=false，不再继续
export function deepValidatePendingAdmission(pendingAdmission, _context = {}) {
  if (!pendingAdmission || typeof pendingAdmission !== "object") {
    return {
      deepValid: false,
      hardFailCode: "P-0",
      passedChecks: [],
      failedChecks: ["pendingAdmission 为空或不是对象"],
      reasons: ["status=pending 必须提供结构化 PendingAdmission 6 项证据"],
      nonOverride: true,
    };
  }
  if (pendingAdmission.pending_reason_type === "bamboo_result_inconsistent") {
    try {
      assertPendingAdmission(pendingAdmission);
      return {
        deepValid: true,
        hardFailCode: "",
        passedChecks: ["Bamboo result 接口样本数冲突 pending 准入通过"],
        failedChecks: [],
        reasons: [
          "卡片异常数大于 0，但 Bamboo result 连续重试后仍返回 0 且无异常列表，允许进入接口异常 pending",
        ],
        nonOverride: true,
      };
    } catch (error) {
      return {
        deepValid: false,
        hardFailCode: "P-BAMBOO-RESULT",
        passedChecks: [],
        failedChecks: [error?.message || String(error)],
        reasons: ["Bamboo result 接口异常 pending 准入证据不足"],
        nonOverride: true,
      };
    }
  }
  if (pendingAdmission.waiting_for_user_authorization !== true) {
    return {
      deepValid: false,
      hardFailCode: "P-0b",
      passedChecks: [],
      failedChecks: [
        `waiting_for_user_authorization=${pendingAdmission.waiting_for_user_authorization}，必须为 true`,
      ],
      reasons: ["status=pending 必须处于 waiting_for_user_authorization=true 阶段"],
      nonOverride: true,
    };
  }
  const authReq = pendingAdmission.authorization_request || {};
  const allowedStatuses = new Set(["done", "blocked", "not_applicable"]);
  const checks = [
    {
      code: "P-1",
      run: () => {
        const target = String(authReq.target || "").trim();
        if (!target)
          return {
            ok: false,
            reason:
              "authorization_request.target 为空，应形如 'life.settle.ledger QueryLedgerDetail' 或 PSM",
          };
        if (!/\S+\s+\S+/.test(target) && !/^[a-zA-Z][\w.-]*\.[a-zA-Z][\w.-]*/.test(target)) {
          return {
            ok: false,
            reason: `authorization_request.target='${target}' 格式不符合 'PSM 方法名' 或 PSM 标识`,
          };
        }
        if (!String(authReq.permission || "").trim())
          return { ok: false, reason: "authorization_request.permission 不能为空" };
        return { ok: true, reason: `target=${target}, permission=${authReq.permission}` };
      },
    },
    {
      code: "P-2",
      run: () => {
        const c = pendingAdmission.rule_and_samples || {};
        if (c.status !== "done")
          return {
            ok: false,
            reason: `rule_and_samples.status=${c.status}，必须=done（必须先解析好规则 SQL 和异常样本才能转 pending）`,
          };
        if (String(c.evidence || "").length < 30)
          return {
            ok: false,
            reason: `rule_and_samples.evidence 长度=${String(c.evidence || "").length}，必须≥30字（需包含规则SQL摘要、异常样本样例、稳定业务key）`,
          };
        return { ok: true, reason: `evidence length=${String(c.evidence || "").length}` };
      },
    },
    {
      code: "P-3",
      run: () => {
        const c = pendingAdmission.current_online_state || {};
        if (!allowedStatuses.has(c.status))
          return {
            ok: false,
            reason: `current_online_state.status=${c.status}，必须∈{done,blocked,not_applicable}`,
          };
        if (c.status !== "not_applicable" && String(c.evidence || "").length < 20)
          return {
            ok: false,
            reason: `current_online_state.evidence 长度=${String(c.evidence || "").length}，必须≥20字`,
          };
        return { ok: true, reason: c.status };
      },
    },
    {
      code: "P-4",
      run: () => {
        const c = pendingAdmission.permission_blockers || {};
        if (!allowedStatuses.has(c.status))
          return {
            ok: false,
            reason: `permission_blockers.status=${c.status}，必须∈{done,blocked,not_applicable}`,
          };
        if (c.status !== "not_applicable" && String(c.evidence || "").length < 20)
          return {
            ok: false,
            reason: `permission_blockers.evidence 长度=${String(c.evidence || "").length}，必须≥20字（需包含缺少的权限点/申请链接/受阻RPC）`,
          };
        return { ok: true, reason: c.status };
      },
    },
    {
      code: "P-5",
      run: () => {
        const c = pendingAdmission.code_idl_config || {};
        if (!allowedStatuses.has(c.status))
          return {
            ok: false,
            reason: `code_idl_config.status=${c.status}，必须∈{done,blocked,not_applicable}`,
          };
        return { ok: true, reason: c.status };
      },
    },
    {
      code: "P-6",
      run: () => {
        const c = pendingAdmission.closure_candidates || {};
        if (!allowedStatuses.has(c.status))
          return {
            ok: false,
            reason: `closure_candidates.status=${c.status}，必须∈{done,blocked,not_applicable}`,
          };
        if (c.status !== "not_applicable") {
          // evidence 中包含至少 2 个候选用 \n 或 ; 或 ①② 等分隔
          const e = String(c.evidence || "");
          const separators = ["\n", ";", "；", "①", "1)", "候选1", "候选一"];
          const separated = separators.some((sep) => e.split(sep).length >= 2 && e.length >= 40);
          if (!separated)
            return {
              ok: false,
              reason: `closure_candidates.evidence 长度=${e.length}，必须至少评估 2 个闭环候选（证据长度≥40字且含分隔符）`,
            };
        }
        return { ok: true, reason: c.status };
      },
    },
  ];
  const passed = [];
  const failed = [];
  const reasonsOut = [];
  let hardFailCode = null;
  for (const check of checks) {
    const r = check.run();
    if (r.ok) {
      passed.push(`${check.code}: ${r.reason}`);
    } else {
      failed.push(`${check.code}: ${r.reason}`);
      reasonsOut.push(
        `【deep-check hard fail ${check.code}】${r.reason}（L3 顺序命中即停，修复后重新 validate）`,
      );
      hardFailCode = check.code;
      break;
    }
  }
  return {
    deepValid: hardFailCode === null,
    hardFailCode,
    passedChecks: passed,
    failedChecks: failed,
    reasons: reasonsOut,
    manualQuestion: String(pendingAdmission.manual_question || ""),
    nonOverride: true,
  };
}

// 【P0-2 L2 硬规则】status=failed 闭环核验：
//   只有 network/transient/cli_network 错误且 attempts>=3 才允许写 failed
//   其他任何场景（权限缺失、口径不统一、证据不足、文档缺失）禁止写 failed，必须继续补证到 succeeded 或转 pending
export function assertClosedLoopFailed(status, failedAdmission, requiredAttempts = 3) {
  if (status !== "failed") {
    return { valid: true, reasons: ["非 failed，跳过 closed-loop 校验"], nonOverride: true };
  }
  // 复用已有 validateFailedStatus + validateAiSummary 逻辑，额外 deep 校验 attempts
  const baseCheck = validateFailedStatus({ failedAdmission });
  const reasons = [];
  let valid = baseCheck.valid;
  if (!valid) reasons.push(...baseCheck.reasons);
  if (failedAdmission && typeof failedAdmission === "object") {
    const attempts = Number(failedAdmission.attempts || 0);
    if (attempts < requiredAttempts) {
      valid = false;
      reasons.push(
        `failedAdmission.attempts=${attempts} < requiredAttempts=${requiredAttempts}，网络错误必须先重试 ${requiredAttempts} 次以上才允许转 failed`,
      );
    }
    if (
      !["network", "transient", "cli_network"].includes(String(failedAdmission.error_class || ""))
    ) {
      valid = false;
      reasons.push(
        `failedAdmission.error_class=${failedAdmission.error_class} 不在白名单 {network,transient,cli_network}，业务错误/权限缺失一律不得写 status=failed`,
      );
    }
  } else {
    valid = false;
    reasons.push(
      "status=failed 必须提供结构化 failedAdmission（含 error_class, attempts>=3, cli_name, retry_command）",
    );
  }
  return { valid, reasons, hints: baseCheck.hints, requiredAttempts, nonOverride: true };
}

// 【P0-2 L2 硬规则】基于 QC 结果 + 证据链权重自动计算 confidence，AI 不得 override：
//   - high：QC-4 or QC-2 high 命中，或 evidence>=4 项且 样本数<=3
//   - medium：QC-1/QC-3 任一命中，或 evidence>=3 项
//   - low：evidence 少于 2 项 且 非 QC 高置信命中
// 返回 autoConfidence + overriddenIfProvided（若 AI 提供了不同 confidence 则自动纠正）
export function computeConfidenceByEvidence({
  qcResult,
  evidenceCount,
  sampleSize,
  rpcSampleCount,
  providedConfidence,
} = {}) {
  const eCount = Number.isFinite(Number(evidenceCount)) ? Math.max(0, Number(evidenceCount)) : 0;
  const sSize = countEffectiveSamples(sampleSize);
  const rpcN = Number.isFinite(Number(rpcSampleCount)) ? Math.max(0, Number(rpcSampleCount)) : 0;
  let auto = "low";
  const reasons = [];
  const qcTop = qcResult?.overallConfidence || qcResult?.overall_confidence || "none";
  const qcCodes = Array.isArray(qcResult?.matchedCodes) ? qcResult.matchedCodes : [];
  if (
    qcTop === "high" ||
    qcCodes.includes("QC-4") ||
    (qcCodes.includes("QC-2") &&
      (qcResult?.matchedConditions || []).some((c) => c.code === "QC-2" && c.confidence === "high"))
  ) {
    auto = "high";
    reasons.push(`QC 顶层置信=${qcTop}，包含 QC-4 测试/QC-2 权限高置信命中 → high`);
  } else if (qcTop === "medium" || eCount >= 3 || (eCount >= 2 && rpcN >= 2)) {
    auto = "medium";
    reasons.push(`QC 顶层置信=${qcTop}, evidence_items=${eCount}, rpc_samples=${rpcN} → medium`);
  } else if (eCount <= 1 && qcTop !== "high") {
    auto = "low";
    reasons.push(`evidence_items=${eCount} 少于 2 项，QC 非高置信 → low`);
  } else {
    auto = "medium";
    reasons.push(`default → medium（QC=${qcTop}, evidence=${eCount}）`);
  }
  let overridden = false;
  let correctedFrom = null;
  if (providedConfidence && providedConfidence !== auto) {
    overridden = true;
    correctedFrom = providedConfidence;
    reasons.push(`【nonOverride】AI 提供 confidence=${providedConfidence}，脚本权威纠正为 ${auto}`);
  }
  return {
    autoConfidence: auto,
    auto_confidence: auto,
    overridden,
    correctedFrom,
    evidenceItemCount: eCount,
    sampleSizeEffective: sSize,
    rpcSampleCount: rpcN,
    reasons,
    nonOverride: true,
  };
}

export const TROUBLESHOOTING_DOC_SECTION_TITLES = Object.freeze({
  baseInfo: "一、基础信息",
  rawBambooSummary: "二、原始Bamboo结果摘要",
  quickClosureEvidence: "三、快速闭环匹配证据（脚本硬匹配，nonOverride=true）",
  deepInvestigation: "三、深度排查过程",
  evidenceSummary: "四、证据链汇总",
  quickConclusion: "四、归因结论与建议",
  deepConclusion: "五、归因结论与建议",
  pendingEvidence: "三、已完成证据（6项deep-check通过）",
  pendingAuthorization: "四、待用户授权点（authorization_request）",
  pendingUserAction: "五、用户操作指引（manual_question）",
});

// 【P0-2 硬白名单】4 套骨架必含节标题（AI 只能增加，不能删除已有标题，必须填空内容）
export function getDocSkeletonRequiredSections(skeletonType = "deep") {
  const base = {
    [TROUBLESHOOTING_DOC_SECTION_TITLES.baseInfo]:
      "result_id / task_name / task_date / rule_id / bamboo_url 5 项基础元数据",
    [TROUBLESHOOTING_DOC_SECTION_TITLES.rawBambooSummary]:
      "instance_status / false_reason / false_data_length / comment 等原始字段原样摘录",
  };
  const variants = {
    "quick-closure": {
      ...base,
      [TROUBLESHOOTING_DOC_SECTION_TITLES.quickClosureEvidence]:
        "逐条列出 QC-1~QC-4 命中的 evidence、confidence、hardcodedAttribution",
      [TROUBLESHOOTING_DOC_SECTION_TITLES.quickConclusion]:
        "引用 topHardcodedAttribution，注明 nonOverride=true，给出处理建议（修数/不处理/联系上游等）",
    },
    deep: {
      ...base,
      [TROUBLESHOOTING_DOC_SECTION_TITLES.deepInvestigation]:
        "至少 2 段：规则SQL分析、异常样本抽样（≥3条）、RPC/代码链路、权限/表状态 四选二",
      [TROUBLESHOOTING_DOC_SECTION_TITLES.evidenceSummary]:
        "表格化列出每条证据的来源、时间、关键字段、结论",
      [TROUBLESHOOTING_DOC_SECTION_TITLES.deepConclusion]:
        "引用 build-attribution-candidates 产出的权威归因，说明已知/新问题判断依据，是否修数，修复预计时间",
    },
    pending: {
      ...base,
      [TROUBLESHOOTING_DOC_SECTION_TITLES.pendingEvidence]: "列出 P-1~P-6 的 passedChecks",
      [TROUBLESHOOTING_DOC_SECTION_TITLES.pendingAuthorization]:
        "target / permission / apply_url + 已在 document 中附权限申请入口",
      [TROUBLESHOOTING_DOC_SECTION_TITLES.pendingUserAction]:
        "粘贴 manual_question 原文并格式化为可勾选步骤",
    },
    sop: {
      "一、规则基本信息": "rule_id / 规则描述 / 所属业务 / owner",
      "二、报警触发条件": "阈值 / SQL 片段 / 常见 false positive 原因",
      "三、标准排查SOP": "Step1~StepN，每步都有明确命令/路径/预期结果",
      "四、归因决策树": "QC-* → 结果分支 → 最终归因枚举",
      "五、修数或补偿操作指引": "若是已知问题，提供修数脚本路径或补偿任务入口",
    },
  };
  const keys = Object.keys(variants[skeletonType] || variants.deep);
  return {
    skeletonType: variants[skeletonType] ? skeletonType : "deep",
    requiredSectionTitles: keys,
    required_section_titles: keys,
    requiredSections: variants[skeletonType] || variants.deep,
    required_sections: variants[skeletonType] || variants.deep,
    nonOverride: true,
  };
}

// 【P0-2 硬约束】骨架内容填充保护：
//   - 检查 filledContent 是否包含所有 requiredSectionTitles（缺任何 1 项 → valid=false）
//   - 检查每个必含节下方是否有实质性内容（非空，≥20字）
//   - AI 可以在已有节之间新增自定义节（不会报错），但不得删除已有节
//   - 返回 protectedRequiredSections（标题→内容摘要）+ missing/missingContent
export function applyDocSkeletonFillAndProtection(skeletonInfo, filledContent, opts = {}) {
  const {
    minSectionContentLength = 20,
    allowMissingSectionsFillLater = false, // 仅用于草稿阶段 preview，正式 publish 必须 false
  } = opts || {};
  const titles = Array.isArray(skeletonInfo?.requiredSectionTitles)
    ? skeletonInfo.requiredSectionTitles
    : [];
  const content = typeof filledContent === "string" ? filledContent : "";
  const missing = [];
  const missingContent = [];
  const protectedRequiredSections = [];
  for (const t of titles) {
    const idx = content.indexOf(t);
    if (idx < 0) {
      missing.push(t);
      continue;
    }
    // 找到下一个 "X、" 标题或 EOF
    const rest = content.slice(idx + t.length);
    const nextTitleIdx = rest.search(/\n[一二三四五六七八九十百]+、/);
    const sectionBody = (nextTitleIdx > 0 ? rest.slice(0, nextTitleIdx) : rest)
      .replace(/[#*\-`>\s\n]+$/g, "")
      .trim();
    if (sectionBody.length < minSectionContentLength)
      missingContent.push({
        title: t,
        bodyLength: sectionBody.length,
        required: minSectionContentLength,
      });
    protectedRequiredSections.push({
      title: t,
      bodyLength: sectionBody.length,
      bodyPreview: sectionBody.slice(0, 80),
    });
  }
  let valid = true;
  const reasons = [];
  if (missing.length > 0) {
    valid = false;
    reasons.push(
      `缺少 ${missing.length} 个必含节标题（nonOverride，禁止删除）：${JSON.stringify(missing)}`,
    );
  }
  if (missingContent.length > 0) {
    const severity = allowMissingSectionsFillLater ? "warning" : "blocker";
    if (severity === "blocker") valid = false;
    reasons.push(
      `[${severity}] ${missingContent.length} 个必含节内容不足（长度 < ${minSectionContentLength}）：${JSON.stringify(missingContent)}`,
    );
  }
  if (valid)
    reasons.push(`${titles.length} 个必含节齐全且内容符合最小长度要求，AI 增加的自定义节保留`);
  return {
    valid,
    skeletonType: skeletonInfo?.skeletonType || "deep",
    protectedRequiredSections,
    missingRequiredSections: missing,
    missing_required_sections: missing,
    missingContent,
    minSectionContentLength,
    reasons,
    nonOverride: true,
  };
}

// 【P0-3 硬固化】骨架 markdown 生成器：
//   - 输入 skeletonType + qcResult + workItem（inspectResult/raw_card 等）
//   - 输出 mergedMarkdown：必含节标题 + 骨架占位（AI 只能在其下方增加内容/新增自定义节，不得删除必含节）
//   - 如果 userProvidedMarkdown 非空：逐节把 userMarkdown 里对应标题下的内容 merge 进骨架（保证已有节不被覆盖为空）
export function buildDocSkeletonMarkdown({
  skeletonType = "deep",
  qcResult,
  workItem,
  userProvidedMarkdown,
  resultId,
  taskName,
  taskDate,
  ruleId,
  bambooUrl,
  topHardcodedAttribution,
} = {}) {
  const skelInfo = getDocSkeletonRequiredSections(
    typeof skeletonType === "string" ? skeletonType : "deep",
  );
  const titles = skelInfo.requiredSectionTitles;
  const sections = skelInfo.requiredSections;

  // 基础信息填充
  const inspect =
    workItem?.inspectResult && typeof workItem.inspectResult === "object"
      ? workItem.inspectResult
      : workItem || {};
  const finalResultId =
    resultId ?? inspect.result_id ?? inspect.resultId ?? workItem?.result_id ?? "TBD";
  const finalTaskName =
    taskName ??
    inspect.task_name ??
    inspect.taskName ??
    inspect.rule_name ??
    workItem?.task_name ??
    workItem?.taskName ??
    "TBD";
  const finalTaskDate =
    taskDate ??
    inspect.task_date ??
    workItem?.task_date ??
    new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const finalRuleId =
    ruleId ?? inspect.rule_id ?? inspect.ruleId ?? workItem?.rule_id ?? workItem?.ruleId ?? "TBD";
  const finalBambooUrl =
    bambooUrl ??
    inspect.bamboo_url ??
    inspect.bambooResultUrl ??
    workItem?.bamboo_url ??
    workItem?.bambooResultUrl ??
    "TBD";
  const qcTopAttr =
    topHardcodedAttribution ??
    qcResult?.topHardcodedAttribution ??
    qcResult?.top_hardcoded_attribution;
  const finalAttr =
    qcTopAttr && isAllowedBambooAttributionResult(qcTopAttr) ? qcTopAttr : undefined;

  // 尝试从 userProvidedMarkdown 提取已有节内容
  const userMd = typeof userProvidedMarkdown === "string" ? userProvidedMarkdown : "";
  const userSectionBodies = new Map();
  if (userMd) {
    for (let i = 0; i < titles.length; i += 1) {
      const t = titles[i];
      const idx = userMd.indexOf(t);
      if (idx < 0) continue;
      const rest = userMd.slice(idx + t.length);
      const nextIndexes = titles
        .filter((candidate) => candidate !== t)
        .map((candidate) => rest.indexOf(candidate))
        .filter((nextIdx) => nextIdx > 0);
      const nextIdx = nextIndexes.length > 0 ? Math.min(...nextIndexes) : -1;
      userSectionBodies.set(t, (nextIdx > 0 ? rest.slice(0, nextIdx) : rest).trim());
    }
  }

  const buildSectionContent = (title) => {
    const hint = sections[title] || "(此处需填写对应内容)";
    const userContent = userSectionBodies.get(title);
    const hasUserContent = typeof userContent === "string" && userContent.length >= 20;
    // 基础信息特殊处理：自动注入 5 项元数据表格
    if (title === TROUBLESHOOTING_DOC_SECTION_TITLES.baseInfo) {
      const rows = [
        ["字段", "值"],
        ["result_id / alarm_record_detail_id", String(finalResultId)],
        ["task_name / 报警标题", String(finalTaskName)],
        ["task_date / 任务日期", String(finalTaskDate)],
        ["rule_id / 规则ID", String(finalRuleId)],
        ["bamboo 报警结果链接", String(finalBambooUrl)],
      ];
      if (finalAttr)
        rows.push([
          "【权威归因 nonOverride】脚本硬匹配 topHardcodedAttribution",
          String(finalAttr),
        ]);
      if (Array.isArray(qcResult?.matchedCodes) && qcResult.matchedCodes.length > 0) {
        rows.push(["QC 命中（脚本硬匹配，nonOverride）", JSON.stringify(qcResult.matchedCodes)]);
      }
      const table = rows
        .map(
          (r, i) =>
            `| ${r.join(" | ")} |${i === 1 ? "\n" + r.map(() => "| --- ").join("") + "|" : ""}`,
        )
        .join("\n");
      if (hasUserContent) {
        return `${table}\n\n${userContent}`;
      }
      return `${table}\n\n> 🔍 填写指引：${hint}`;
    }
    if (title === TROUBLESHOOTING_DOC_SECTION_TITLES.rawBambooSummary) {
      if (hasUserContent) {
        return userContent;
      }
      const falseLen =
        inspect.false_data_length ??
        inspect.falseDataLength ??
        inspect.alarm_false_data_length ??
        "TBD";
      const instStatus = inspect.instance_status ?? inspect.instanceStatus ?? "TBD";
      const falseReason = inspect.false_reason ?? inspect.falseReason ?? inspect.comment ?? "TBD";
      const body = [
        "- instance_status / 对账实例状态：```" + String(instStatus).slice(0, 500) + "```",
        "- false_reason / comment / 错误原因：```" + String(falseReason).slice(0, 800) + "```",
        `- false_data_length / 异常样本数：**${falseLen}** (经 countEffectiveSamples 归一化=${countEffectiveSamples(falseLen)})`,
      ].join("\n");
      return `${body}\n\n> 🔍 填写指引：${hint}`;
    }
    if (title === TROUBLESHOOTING_DOC_SECTION_TITLES.quickClosureEvidence) {
      const conds = Array.isArray(qcResult?.matchedConditions) ? qcResult.matchedConditions : [];
      if (conds.length === 0)
        return "⚠️ 当前未命中任何 QC 快速闭环条件，本节应留空并跳转到深度排查。\n\n> 若确认走深度排查，请在下一节填写。\n";
      const lines = conds
        .map((c) =>
          [
            `### ${c.code} ${c.name}`,
            `- confidence: **${c.confidence}**`,
            `- evidence：\`\`\`\n${c.evidence}\n\`\`\``,
            `- hardcodedAttribution（nonOverride）：**${c.hardcodedAttribution}**`,
          ].join("\n"),
        )
        .join("\n\n");
      const user = userSectionBodies.get(title);
      return `${lines}\n\n> 🔍 填写指引：${hint}\n> 【硬约束】本节及 QC-* 节标题不得删除、不得修改代码、不得覆盖 hardcodedAttribution 为其他值。${user ? "\n\n#### 用户提供补充（保留）\n" + user : ""}`;
    }
    if (
      title === TROUBLESHOOTING_DOC_SECTION_TITLES.quickConclusion ||
      title === TROUBLESHOOTING_DOC_SECTION_TITLES.deepConclusion
    ) {
      const attr = finalAttr
        ? `**【权威归因 nonOverride ${finalAttr}】**`
        : "请引用 build-attribution-candidates 产出的权威归因";
      if (hasUserContent) {
        return finalAttr ? `${attr}\n\n${userContent}` : userContent;
      }
      return `${attr}\n\n- 已知/新问题判定：（请填 "已知问题"/"新问题"/"N/A"）\n- 是否需要修数：（是/否，若为是请提供修数脚本路径或补偿任务入口）\n- 预计修复完成时间（若为新问题）：YYYY-MM-DD\n- 下游通知与操作建议：\n\n> 🔍 填写指引：${hint}`;
    }
    // 其他节走 userSectionBodies + 默认模板
    if (hasUserContent) return userContent;
    return `> ⚠️ 本节（${title}）为骨架必含节（AI 不得删除节标题），请在此下方填写内容。\n>\n> 🔍 填写指引：${hint}\n\n${userContent ? userContent : ""}`.trim();
  };

  // 拼接 mergedMarkdown
  const parts = [
    `# ${skelInfo.skeletonType}排查文档（骨架自动生成，节标题 nonOverride 不得删除）\n`,
  ];
  for (const title of titles) {
    parts.push(`\n## ${title}\n`);
    parts.push(buildSectionContent(title));
    parts.push("\n");
  }
  // 追加 AI 自定义节未匹配到骨架的部分
  const matchedHeadCount = [...userSectionBodies.keys()].length;
  if (matchedHeadCount > 0 && titles.length > 0) {
    const lastTitle = titles[titles.length - 1];
    const lastIdx = userMd.indexOf(lastTitle);
    if (lastIdx >= 0) {
      const restStr = userMd.slice(lastIdx + lastTitle.length);
      const nextTitleRe = /\n(#{1,6}\s|[一二三四五六七八九十百]+、)/;
      const nxt = restStr.search(nextTitleRe);
      const after = nxt > 0 ? restStr.slice(nxt).trim() : "";
      if (after.length > 0) {
        parts.push(`\n## 附加：用户自定义新增节（nonOverride 允许保留 AI 新增节）\n\n${after}\n`);
      }
    }
  }
  const mergedMarkdown = parts.join("\n");
  return {
    skeletonInfo: skelInfo,
    skeletonType: skelInfo.skeletonType,
    mergedMarkdown,
    merged_markdown: mergedMarkdown,
    requiredSectionTitles: titles,
    required_section_titles: titles,
    autoFillMeta: {
      resultId: finalResultId,
      taskName: finalTaskName,
      taskDate: finalTaskDate,
      ruleId: finalRuleId,
      bambooUrl: finalBambooUrl,
      topHardcodedAttribution: finalAttr,
      qcMatchedCodes: qcResult?.matchedCodes || [],
    },
    nonOverride: true,
  };
}

// 【P1-4 SOP 违禁内容扫描，纯函数，末尾追加零侵入】
export function scanSopMarkdownForbiddenContent({
  sopMarkdown = "",
  ruleId = "",
  taskName = "",
} = {}) {
  const violations = [];
  const md = String(sopMarkdown || "");
  const attributionLines = md
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /(归因结果|归因结论|归因|建议归因|最终归因)/.test(line));
  for (const line of attributionLines) {
    const matchResults = BAMBOO_ATTRIBUTION_RESULTS.filter((label) =>
      line.includes(attributionLabel(label)),
    );
    if (
      matchResults.length === 0 &&
      /\[.*\].*\(.*\)|无效告警|有效告警|数据问题|口径问题|代码问题|配置问题/.test(line)
    ) {
      violations.push({
        code: "SOP_ATTR_NOT_IN_WHITELIST",
        message: `SOP 归因结论不属于 BAMBOO_ATTRIBUTION_RESULTS 白名单：${line.slice(0, 80)}`,
        match: line.slice(0, 120),
      });
    }
  }
  const forbiddenOpPatterns = [
    /建议[你您]/,
    /可以[尝试排查考虑]/,
    /可能(是|由|存在|有问题)/,
    /或许|大概|也许|可能的话/,
  ];
  for (const pattern of forbiddenOpPatterns) {
    for (const line of md.split("\n")) {
      if (pattern.test(line)) {
        violations.push({
          code: "SOP_OPINIONATED_OP_SUGGESTION",
          message: `SOP 禁止自由发挥操作建议（只允许沉淀固定步骤）：${line.trim().slice(0, 80)}`,
          match: line.trim().slice(0, 120),
        });
        break;
      }
    }
  }
  const phoneRegex = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
  const idCardRegex = /(?<!\d)\d{17}[\dXx](?!\d)/g;
  const phoneMatches = md.match(phoneRegex) || [];
  const idCardMatches = md.match(idCardRegex) || [];
  for (const m of phoneMatches)
    violations.push({ code: "SOP_UNREDACTED_PHONE", message: "SOP 包含未脱敏手机号", match: m });
  for (const m of idCardMatches)
    violations.push({
      code: "SOP_UNREDACTED_ID_CARD",
      message: "SOP 包含未脱敏身份证号",
      match: m,
    });
  return {
    rule_id: ruleId,
    task_name: taskName,
    valid: violations.length === 0,
    violation_count: violations.length,
    violations,
    nonOverride: true,
  };
}

// 【P1-1 归因候选生成（纯函数，末尾追加零侵入）】
export function buildAttributionCandidates({
  qcResult,
  classification,
  ruleSpecificKnownIssues = [],
} = {}) {
  const qcTop = qcResult && qcResult.topHardcodedAttribution;
  const classifyAttr =
    classification && (classification.suggestedAttribution || classification.attributionResult);
  const candidates = [];
  if (
    qcTop &&
    typeof qcTop === "string" &&
    BAMBOO_ATTRIBUTION_RESULTS.some((r) => attributionLabel(r) === qcTop)
  ) {
    candidates.push({
      label: qcTop,
      source: "WHITELIST_QC",
      confidence: qcResult.topConfidence || 0.98,
      reason: qcResult.topQuickClosureCode
        ? `QC 命中 ${qcResult.topQuickClosureCode}`
        : "QC 权威快速闭环归因",
      hardcodedAttribution: qcTop,
      nonOverride: true,
    });
  }
  if (Array.isArray(ruleSpecificKnownIssues)) {
    for (const issue of ruleSpecificKnownIssues) {
      if (
        issue &&
        issue.label &&
        BAMBOO_ATTRIBUTION_RESULTS.some((r) => attributionLabel(r) === issue.label)
      ) {
        candidates.push({
          label: issue.label,
          source: "KNOWN_ISSUE",
          confidence: Number.isFinite(+issue.confidence) ? +issue.confidence : 0.9,
          reason: `同 rule_id 近 30 天已命中 ${issue.count || "≥1"} 次同归因（最近 ${issue.lastTaskDate || "TBD"}）`,
          hardcodedAttribution: issue.label,
          sopDocToken: issue.sopDocToken || "",
          nonOverride: true,
        });
      }
    }
  }
  if (
    classifyAttr &&
    typeof classifyAttr === "string" &&
    BAMBOO_ATTRIBUTION_RESULTS.some((r) => attributionLabel(r) === classifyAttr)
  ) {
    const alreadyHas = candidates.some((c) => c.label === classifyAttr);
    if (!alreadyHas) {
      candidates.push({
        label: classifyAttr,
        source: "CLASSIFY_FALLBACK",
        confidence: Number.isFinite(+classification.confidence) ? +classification.confidence : 0.8,
        reason: "classifyBambooResult 建议归因",
        hardcodedAttribution: classifyAttr,
        nonOverride: false,
      });
    }
  }
  for (const r of BAMBOO_ATTRIBUTION_RESULTS) {
    const label = attributionLabel(r);
    const alreadyHas = candidates.some((c) => c.label === label);
    if (!alreadyHas) {
      candidates.push({
        label,
        source: "WHITELIST_CATALOG",
        confidence: 0.3,
        reason: `${typeof r === "string" ? "BAMBOO_ATTRIBUTION_RESULTS" : r.category} / 白名单归因目录`,
        hardcodedAttribution: label,
        nonOverride: false,
      });
    }
  }
  const sorted = candidates.slice().sort((a, b) => +b.confidence - +a.confidence);
  const topCandidate = sorted[0] || {
    label: "[有效告警]其他原因(需要修数)",
    source: "FALLBACK",
    confidence: 0.5,
    reason: "兜底：无匹配归因，标记为 NEW_ISSUE",
    hardcodedAttribution: "[有效告警]其他原因(需要修数)",
    nonOverride: true,
  };
  return {
    candidates: sorted,
    topCandidate,
    is_new_issue:
      topCandidate.source === "CLASSIFY_FALLBACK" ||
      topCandidate.source === "FALLBACK" ||
      topCandidate.source === "WHITELIST_CATALOG",
    known_issue_count: candidates.filter((c) => c.source === "KNOWN_ISSUE").length,
    nonOverride: true,
  };
}

// 【P1-3 白名单 docToken 集合构建（纯函数，末尾追加零侵入）】
export function buildWhitelistedDocTokenSet({
  currentDailyBaseParentWikiToken = "",
  currentDailyBaseChildTokens = [],
  bambooSopRootToken = process.env.BAMBOO_SOP_ROOT_TOKEN || "",
  bambooSopChildTokens = [],
} = {}) {
  const allowed = new Set();
  if (currentDailyBaseParentWikiToken) allowed.add(String(currentDailyBaseParentWikiToken));
  for (const t of currentDailyBaseChildTokens) if (t) allowed.add(String(t));
  if (bambooSopRootToken) allowed.add(String(bambooSopRootToken));
  for (const t of bambooSopChildTokens) if (t) allowed.add(String(t));
  return {
    allowed_tokens: Array.from(allowed),
    size: allowed.size,
    isAllowed: (docToken) => allowed.has(String(docToken || "")),
    nonOverride: true,
  };
}

// 【P2-1 classify-samples（纯函数，末尾追加零侵入）】
// 输入：false_data 样本列表（JSON 数组或字符串化的每行对象）+ QC 命中码/关键字过滤
// 输出：按 QC 关键字聚合后的样本分类（快速定位 QC-5:DATA_ALIGNMENT_HINT 命中样例子集），nonOverride=true
export function classifySamples({
  samples = [],
  keywordFilters = [],
  ruleId = "",
  taskName = "",
} = {}) {
  const arr = Array.isArray(samples)
    ? samples
    : typeof samples === "string"
      ? samples
          .split(/\r?\n/)
          .filter(Boolean)
          .map((l) => {
            try {
              return JSON.parse(l);
            } catch {
              return null;
            }
          })
          .filter(Boolean)
      : [];
  const filters =
    Array.isArray(keywordFilters) && keywordFilters.length > 0
      ? keywordFilters
      : [
          "NOT_IN_ACCOUNT_PERIOD",
          "SETTLE_STATUS_NOT_SUCCESS",
          "REFUND_NO_MATCH",
          "DISCOUNT_ERROR",
          "DOUBLE_ENTRY",
          "ORDER_REPEAT",
          "MERCHANT_AMOUNT_ERROR",
          "USER_AMOUNT_ERROR",
        ];
  const buckets = new Map();
  const unclassified = [];
  for (const s of arr.slice(0, 2000)) {
    const serialized = typeof s === "string" ? s : JSON.stringify(s);
    let matched = false;
    for (const kw of filters) {
      if (serialized.includes(kw)) {
        const bucket = buckets.get(kw) || { keyword: kw, samples: [], count: 0 };
        bucket.samples.push(s);
        bucket.count += 1;
        buckets.set(kw, bucket);
        matched = true;
      }
    }
    if (!matched) unclassified.push(s);
  }
  const grouped = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  return {
    rule_id: ruleId,
    task_name: taskName,
    total_samples: arr.length,
    keyword_filtered_count: grouped.reduce((sum, g) => sum + g.count, 0),
    unclassified_count: unclassified.length,
    groups: grouped,
    unclassified_samples: unclassified.slice(0, 100),
    // top 3 关键字（AI 只需要参考 top 3，避免被长尾信息干扰）
    top_keywords: grouped.slice(0, 3).map((g) => ({ keyword: g.keyword, count: g.count })),
    nonOverride: true,
  };
}

// 【P2-2 build-bamboo-card-update-patch（纯函数，末尾追加零侵入）】
// 功能：构造 Bamboo 卡片回写状态 patch JSON（严格限定可选 status，禁止 AI 自由发挥写任何 status）
// 仅允许 status 从 BAMBOO_CARD_ALLOWED_STATUS 白名单中取值；其他字段仅允许 ai_summary/ai_result/confidence/needs_manual_review 四个可写字段
export function buildBambooCardUpdatePatch({
  resultId = "",
  status = "",
  aiSummary = "",
  aiResult = "",
  confidence = 0,
  needsManualReview = false,
  hardFailCode = "",
} = {}) {
  const BAMBOO_CARD_ALLOWED_STATUS = [
    "init",
    "processing",
    "succeeded",
    "failed",
    "pending",
    "not_support",
  ];
  const hardFailCodes = [
    "invalid_ai_summary",
    "invalid_failed_reason",
    "validator_overall_invalid",
    "incomplete_model_result",
    "missing_model_result",
    "",
  ];
  const sanitizedStatus = BAMBOO_CARD_ALLOWED_STATUS.includes(String(status))
    ? String(status)
    : "pending";
  const sanitizedHardFailCode = hardFailCodes.includes(String(hardFailCode))
    ? String(hardFailCode)
    : "";
  const patch = {
    result_id: String(resultId || ""),
    status: sanitizedStatus,
    confidence: Math.max(0, Math.min(1, Number.isFinite(+confidence) ? +confidence : 0)),
    needs_manual_review: Boolean(needsManualReview),
    ai_summary: String(aiSummary || "").slice(0, 500),
    ai_result: String(aiResult || "").slice(0, 512),
    hard_fail_code: sanitizedHardFailCode,
    // 固定元数据来源：防止 AI 手工改 status
    generated_by: "bamboo-alert-runner-P2-2",
    nonOverride: true,
  };
  // 硬约束：如果 status=succeeded 但 `ai_result` 不是合法飞书文档链接，强制降为 pending + needs_manual_review=true
  if (patch.status === "succeeded" && !isValidFeishuDocumentUrl(patch.ai_result)) {
    patch.status = "pending";
    patch.needs_manual_review = true;
    patch.hard_fail_code = patch.hard_fail_code || "missing_ai_result_doc_link";
  }
  // 硬约束：如果 status=failed，必须有 hard_fail_code（非空），否则强制改为 pending
  if (patch.status === "failed" && !patch.hard_fail_code) {
    patch.status = "pending";
    patch.needs_manual_review = true;
  }
  return patch;
}

function addKnownSettlementRpcShapeReasons({ psm, method, params = {}, reasons }) {
  const normalizedPsm = String(psm || "");
  const normalizedMethod = String(method || "");
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(params || {}, key);
  const requireNonEmptyArray = (field, message) => {
    if (!Array.isArray(params?.[field]) || params[field].length === 0) {
      reasons.push(message || `字段 ${field} 必须是非空数组`);
    }
  };

  if (
    normalizedPsm === "life.settle.ledger_center" &&
    normalizedMethod === "QueryLedgerByItemOrderId"
  ) {
    if (hasOwn("ItemOrderId"))
      reasons.push(
        "QueryLedgerByItemOrderId 必须使用复数字段 ItemOrderIds，禁止使用单数字段 ItemOrderId",
      );
    requireNonEmptyArray("ItemOrderIds", "QueryLedgerByItemOrderId 必须传 ItemOrderIds 非空数组");
  }

  if (
    normalizedPsm === "life.settle.ledger_center" &&
    normalizedMethod === "QueryLedgerByShopOrderId"
  ) {
    if (hasOwn("ShopOrderId"))
      reasons.push(
        "QueryLedgerByShopOrderId 必须使用复数字段 ShopOrderIds，禁止使用单数字段 ShopOrderId",
      );
    requireNonEmptyArray("ShopOrderIds", "QueryLedgerByShopOrderId 必须传 ShopOrderIds 非空数组");
  }

  if (
    normalizedPsm === "life.settle.ledger_center" &&
    normalizedMethod === "MGetLedgerByLedgerId"
  ) {
    if (hasOwn("LedgerId"))
      reasons.push("MGetLedgerByLedgerId 必须使用复数字段 LedgerIds，禁止使用单数字段 LedgerId");
    requireNonEmptyArray("LedgerIds", "MGetLedgerByLedgerId 必须传 LedgerIds 非空数组");
  }

  if (normalizedPsm === "life.settle.tax" && normalizedMethod === "MGetTaxByTaxId") {
    if (hasOwn("tax_ids") || hasOwn("taxIds"))
      reasons.push("MGetTaxByTaxId 必须使用字段 TaxIds，禁止使用 tax_ids/taxIds");
    requireNonEmptyArray("TaxIds", "MGetTaxByTaxId 必须传 TaxIds 非空数组");
  }

  if (normalizedPsm === "life.settle.withdraw" && normalizedMethod === "MGetTransferByTransferId") {
    requireNonEmptyArray("TransferIds", "MGetTransferByTransferId 必须传 TransferIds I64 数组");
    if (
      Array.isArray(params?.TransferIds) &&
      params.TransferIds.some((value) => typeof value !== "number" || !Number.isSafeInteger(value))
    ) {
      reasons.push(
        "MGetTransferByTransferId 的 TransferIds 必须是 I64 数组，元素必须是安全整数 number，禁止传字符串数组",
      );
    }
  }
}

function normalizeLegacyRpcParamSchemas(schemas) {
  if (!schemas || typeof schemas !== "object" || Array.isArray(schemas)) {
    return schemas;
  }
  if (Array.isArray(schemas.rpc_methods)) {
    return schemas;
  }

  const rpcMethods = [];
  for (const [legacyAlias, methods] of Object.entries(schemas)) {
    if (!methods || typeof methods !== "object" || Array.isArray(methods)) {
      continue;
    }
    for (const [qualifiedMethod, definition] of Object.entries(methods)) {
      if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
        continue;
      }
      const lastDot = qualifiedMethod.lastIndexOf(".");
      const psm =
        typeof definition.psm === "string"
          ? definition.psm
          : lastDot > 0
            ? qualifiedMethod.slice(0, lastDot)
            : String(legacyAlias).replace(/^rpc-/, "").replaceAll("-", ".");
      const method =
        typeof definition.method === "string"
          ? definition.method
          : lastDot > 0
            ? qualifiedMethod.slice(lastDot + 1)
            : qualifiedMethod;
      const fields = Array.isArray(definition.fields) ? definition.fields : [];
      const properties = {};
      const required = [];

      for (const field of fields) {
        if (!field || typeof field !== "object" || !field.name) {
          continue;
        }
        const property = {};
        for (const key of ["type", "enum", "minLength", "maxLength", "desc"]) {
          if (field[key] !== undefined) {
            property[key] = field[key];
          }
        }
        properties[field.name] = property;
        if (field.required === true) {
          required.push(field.name);
        }
      }

      rpcMethods.push({ psm, method, required, properties });
    }
  }

  return { ...schemas, rpc_methods: rpcMethods };
}

function valueMatchesSchemaType(value, expectedType) {
  const types = String(expectedType || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  if (types.length === 0) {
    return true;
  }
  return types.some((type) => {
    if (type === "string") return typeof value === "string";
    if (type === "number") return typeof value === "number" && !Number.isNaN(value);
    if (type === "boolean") return typeof value === "boolean";
    if (type === "integer") return Number.isInteger(value);
    if (type === "array") return Array.isArray(value);
    if (type === "object")
      return typeof value === "object" && value !== null && !Array.isArray(value);
    return true;
  });
}

// 【P2-3 validate-rpc-request（纯函数，末尾追加零侵入）】
// 对照 P0-0 生成的 rpc-param-schemas.json，校验传入的 RPC 入参（psm/method/params）是否符合 schema；
// 不符合的字段以 hardFailCode + reasons 形式明确告知，禁止 AI 绕过执行。
export function validateRpcRequest({ psm = "", method = "", params = {}, schemas = null } = {}) {
  const finalSchemas = normalizeLegacyRpcParamSchemas(
    schemas || (typeof RPC_PARAM_SCHEMAS !== "undefined" ? RPC_PARAM_SCHEMAS : null),
  );
  const reasons = [];
  if (!psm) reasons.push("psm 为空");
  if (!method) reasons.push("method 为空");
  let matched = null;
  if (finalSchemas && typeof finalSchemas === "object" && Array.isArray(finalSchemas.rpc_methods)) {
    matched = finalSchemas.rpc_methods.find(
      (m) => m.psm === String(psm) && m.method === String(method),
    );
    if (!matched)
      reasons.push(
        `RPC ${psm}/${method} 未在 rpc-param-schemas.json 白名单内（禁止越权调用未固化的 RPC）`,
      );
  } else {
    reasons.push("rpc-param-schemas.json 未加载（P0-0 前置基建缺失），默认拒绝任何 RPC 调用");
  }
  // 基础 schema 校验：如果 schema 必填字段缺失（如 order_id / result_id 等必须字段），明确报错
  if (matched && Array.isArray(matched.required) && matched.required.length > 0) {
    for (const reqField of matched.required) {
      const val = params?.[reqField];
      if (val === undefined || val === null || val === "") {
        reasons.push(`必填字段 ${reqField} 缺失（schema.required 要求）`);
      }
    }
  }
  // 允许的参数字段：只允许 schema.properties 里的字段，其他字段拒绝
  if (matched && matched.properties && typeof matched.properties === "object") {
    const allowedKeys = new Set(Object.keys(matched.properties));
    for (const k of Object.keys(params || {})) {
      if (!allowedKeys.has(k))
        reasons.push(`参数字段 ${k} 不在 schema.properties 白名单内（越权传参禁止）`);
    }
  }
  // 类型校验（基础：string/number/boolean）
  if (matched && matched.properties) {
    for (const [key, prop] of Object.entries(matched.properties)) {
      if (!params || params[key] === undefined || params[key] === null) continue;
      const val = params[key];
      const expect = prop.type;
      if (expect && !valueMatchesSchemaType(val, expect))
        reasons.push(
          `字段 ${key} 类型错误：期望 ${expect}，实际 ${Array.isArray(val) ? "array" : typeof val}`,
        );
      if (Array.isArray(prop.enum) && !prop.enum.includes(val))
        reasons.push(`字段 ${key} 不在 schema.enum 白名单内`);
      if (
        typeof prop.minLength === "number" &&
        typeof val === "string" &&
        val.length < prop.minLength
      )
        reasons.push(`字段 ${key} 长度小于 schema.minLength=${prop.minLength}`);
      if (
        typeof prop.maxLength === "number" &&
        typeof val === "string" &&
        val.length > prop.maxLength
      )
        reasons.push(`字段 ${key} 长度大于 schema.maxLength=${prop.maxLength}`);
    }
  }
  if (matched) {
    addKnownSettlementRpcShapeReasons({ psm, method, params, reasons });
  }
  return {
    psm: String(psm),
    method: String(method),
    overallValid: reasons.length === 0,
    overall_valid: reasons.length === 0,
    reasons: reasons.slice(0, 30),
    matched_schema: matched,
    // 【硬约束】nonOverride=true，AI 不得 override valid 判定；如 invalid 必须修正或改调用其他白名单 RPC
    nonOverride: true,
    // 生成可直接传给 api-test 的规范化参数（若 valid 则可用，invalid 则为空对象）
    normalized_params: reasons.length === 0 ? params || {} : {},
  };
}
