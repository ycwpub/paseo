function htmlUnescape(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function findFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function cleanMarkdownFieldValue(value) {
  return String(value || "")
    .replace(/^\*+\s*/, "")
    .replace(/\s*\*+$/, "")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractUrls(text) {
  return unique(String(text || "").match(/https?:\/\/[^\s)\]<>"]+/g) || []).map((url) =>
    url.replace(/[),，。；;]+$/g, "")
  );
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isArgosRuleUrl(url) {
  return /\/argos\/alarm\/detail\/[^/?#]+(?:\/[^/?#]+)?(?:[?#]|$)/.test(url) && !url.includes("/single/") && !url.includes("/event/");
}

function extractArgosLevel(title) {
  const source = String(title || "");
  const severity = source.match(/[【\[]([^】\]]*(?:argos-)?(?:critical|warning|fatal|info)[^】\]]*)[】\]]/i);
  const raw = severity?.[1] || findFirst(source, [/^\[([^\]]+)]/, /^【([^】]+)】/]);
  const normalized = String(raw || "").trim().toLowerCase();
  if (normalized.includes("critical")) return "critical";
  if (normalized.includes("warning")) return "warning";
  return "";
}

function extractSection(text, startPattern, endPatterns = []) {
  const source = String(text || "");
  const startMatch = source.match(startPattern);
  if (!startMatch || startMatch.index === undefined) return "";
  const start = startMatch.index;
  let end = source.length;
  for (const pattern of endPatterns) {
    const rest = source.slice(start + startMatch[0].length);
    const match = rest.match(pattern);
    if (match?.index !== undefined) {
      end = Math.min(end, start + startMatch[0].length + match.index);
    }
  }
  return source.slice(start, end).trim();
}

function formatDateKey(value) {
  const match = String(value || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}${match[2]}${match[3]}` : "";
}

export function normalizeArgosRuleName(ruleName) {
  return String(ruleName || "")
    .replace(/^(?:\[[^\]]+])+/g, "")
    .replace(/\[已确认]|\[已屏蔽]|\[已恢复]|\[已关闭]/g, "")
    .replace(/【已确认】|【已屏蔽】|【已恢复】|【已关闭】/g, "")
    .trim();
}

export function extractArgosIdentifiers(text) {
  const urls = extractUrls(text);
  let ruleId = "";
  let resultId = "";
  let problemId = "";
  let alertGroupId = "";
  let sendItemId = "";

  for (const rawUrl of urls) {
    const url = parseUrl(rawUrl);
    if (!url) continue;

    const path = url.pathname;
    const singleMatch = path.match(/\/argos\/alarm\/detail\/single\/[^/]+\/([^/]+)\/([^/?#]+)/);
    const eventMatch = path.match(/\/argos\/alarm\/detail\/event\/([^/]+)\/([^/?#]+)/);
    const detailMatch = path.match(/\/argos\/alarm\/detail\/[^/]+\/([^/?#]+)/);

    if (singleMatch) {
      ruleId ||= singleMatch[1];
      alertGroupId ||= singleMatch[2];
      resultId ||= singleMatch[2];
    } else if (eventMatch) {
      ruleId ||= eventMatch[1];
      alertGroupId ||= eventMatch[2];
      resultId ||= eventMatch[2];
    } else if (detailMatch) {
      ruleId ||= detailMatch[1];
    }

    ruleId ||= url.searchParams.get("rule_id") || "";
    problemId ||= url.searchParams.get("problem_id") || "";
    sendItemId ||= url.searchParams.get("send_item_id") || "";
    alertGroupId ||= url.searchParams.get("alert_group_id") || "";
  }

  resultId ||= alertGroupId || problemId;

  return {
    resultId,
    ruleId,
    problemId,
    alertGroupId,
    sendItemId
  };
}

export function extractArgosAlertFromMessage(message) {
  const content = htmlUnescape(message?.content ?? JSON.stringify(message ?? {}));
  if (!/cloud\.bytedance\.net\/argos\/alarm/.test(content)) return null;

  const title = findFirst(content, [/<card\s+title="([^"]+)"/, /<card\s+title='([^']+)'/]);
  const identifiers = extractArgosIdentifiers(content);
  const urls = extractUrls(content);
  const resultUrl = urls.find((url) => url.includes("/argos/alarm/detail/single/") || url.includes("/argos/alarm/detail/event/")) || "";
  const ruleUrl = urls.find((url) => isArgosRuleUrl(url)) || "";
  const resultUrlObject = parseUrl(resultUrl);
  const ruleUrlObject = parseUrl(ruleUrl);
  const psm = cleanMarkdownFieldValue(
    findFirst(content, [/服务:\s*([^\n\r]+)/, /\bpsm=([^&\s)]+)/]) ||
    resultUrlObject?.searchParams.get("psm") ||
    ruleUrlObject?.searchParams.get("psm") ||
    ""
  );
  const resultTime = findFirst(content, [/[报告]警时间:\**\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/]);
  const ruleName = normalizeArgosRuleName(title || findFirst(content, [/规则:\s*([^\n\r[]+)/]));

  if (!identifiers.ruleId || !identifiers.resultId || !psm || !ruleName) return null;

  const level = extractArgosLevel(title);
  const ruleContent = extractSection(content, /\*\*Tags:\s*\*\*|Tags:\s*/i, [/\*\*Argos根因分析\*\*/i]);
  const resultContent = extractSection(content, /\*\*Argos根因分析\*\*/i, [/<\/card>/i]);

  return {
    unique_id: identifiers.ruleId,
    result_id: identifiers.resultId,
    rule_id: identifiers.ruleId,
    psm,
    level,
    rule_name: ruleName,
    result_time: resultTime,
    message_create_time: message?.create_time || "",
    alarm_date: formatDateKey(resultTime || message?.create_time),
    rule_url: ruleUrl,
    result_url: resultUrl,
    rule_content: ruleContent || content,
    result_content: resultContent || content,
    extra: {
      chat_id: message?.chat_id || "",
      message_id: message?.message_id || "",
      message_app_link: message?.message_app_link || "",
      message_create_time: message?.create_time || "",
      raw_title: title,
      alert_group_id: identifiers.alertGroupId || identifiers.resultId,
      problem_id: identifiers.problemId,
      send_item_id: identifiers.sendItemId
    }
  };
}

export function buildArgosBaseRecord(alert, fieldNames = [], status = "init") {
  const resultId = String(alert?.result_id || "").trim();
  const ruleId = String(alert?.rule_id || "").trim();
  const source = {
    ...alert,
    unique_id: ruleId,
    result_id: resultId,
    status: [status],
    rule_content: "",
    extra: JSON.stringify(alert?.extra || {})
  };
  const record = {};
  for (const fieldName of fieldNames) {
    if (Object.prototype.hasOwnProperty.call(source, fieldName) && source[fieldName] !== undefined) {
      record[fieldName] = source[fieldName];
    }
  }
  return record;
}

export function isValidFeishuDocumentUrl(value) {
  const url = parseUrl(String(value || "").trim());
  if (!url) return false;
  return url.hostname === "bytedance.larkoffice.com" && /^\/(?:wiki|docx)\//.test(url.pathname);
}
