import type { NormalizedLarkMessageEvent } from "../channels/lark/lark-message-format.js";
import type { BitableWritableFields } from "./bamboo-attribution-record.js";

export const ARGOS_RECORD_FIELDS = {
  uniqueId: "unique_id",
  resultId: "result_id",
  ruleId: "rule_id",
  alarmRecordDetailId: "alarm_record_detail_id",
  psm: "psm",
  level: "level",
  ruleName: "rule_name",
  resultTime: "result_time",
  createTime: "create_time",
  resultUrl: "result_url",
  ruleUrl: "rule_url",
  ruleContent: "rule_content",
  resultContent: "result_content",
  extra: "extra",
  status: "status",
  aiSessionId: "ai_session_id",
  aiSummary: "ai_summary",
  aiResult: "ai_result",
  aiFinishedAt: "ai_finished_at",
  lastError: "last_error",
} as const;

export const ARGOS_ATTRIBUTION_FIELD_NAMES = Object.values(ARGOS_RECORD_FIELDS);

export interface ArgosAlertRecord {
  uniqueId: string;
  resultId: string;
  ruleId: string;
  problemId: string;
  alertGroupId: string;
  sendItemId: string;
  psm: string;
  level: string;
  ruleName: string;
  resultTime: string | null;
  resultUrl: string;
  ruleUrl: string;
  ruleContent: string;
  resultContent: string;
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function firstMatch(text: string, patterns: readonly RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function cleanMarkdownFieldValue(value: string): string {
  return value
    .replace(/^\*+\s*/u, "")
    .replace(/\s*\*+$/u, "")
    .trim();
}

function urls(text: string): string[] {
  return [...new Set(text.match(/https?:\/\/[^\s)\]<>"]+/gu) ?? [])].map((url) =>
    url.replace(/[),，。；;]+$/gu, ""),
  );
}

function extractSection(
  text: string,
  startPattern: RegExp,
  endPatterns: readonly RegExp[] = [],
): string {
  const startMatch = text.match(startPattern);
  if (!startMatch || startMatch.index === undefined) return "";
  const start = startMatch.index;
  let end = text.length;
  for (const pattern of endPatterns) {
    const remainder = text.slice(start + startMatch[0].length);
    const match = remainder.match(pattern);
    if (match?.index !== undefined) {
      end = Math.min(end, start + startMatch[0].length + match.index);
    }
  }
  return text.slice(start, end).trim();
}

function parsedUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeRuleName(value: string): string {
  return value
    .replace(/^(?:\[[^\]]+\])+/gu, "")
    .replace(/\[已确认\]|\[已屏蔽\]|\[已恢复\]|\[已关闭\]/gu, "")
    .replace(/【已确认】|【已屏蔽】|【已恢复】|【已关闭】/gu, "")
    .trim();
}

interface ArgosIdentifiers {
  resultId: string;
  ruleId: string;
  problemId: string;
  alertGroupId: string;
  sendItemId: string;
}

function pathIdentifiers(url: URL): Pick<ArgosIdentifiers, "ruleId" | "alertGroupId"> {
  const single = url.pathname.match(/\/argos\/alarm\/detail\/single\/[^/]+\/([^/]+)\/([^/?#]+)/u);
  if (single) {
    return { ruleId: single[1] ?? "", alertGroupId: single[2] ?? "" };
  }
  const event = url.pathname.match(/\/argos\/alarm\/detail\/event\/([^/]+)\/([^/?#]+)/u);
  if (event) {
    return { ruleId: event[1] ?? "", alertGroupId: event[2] ?? "" };
  }
  const detail = url.pathname.match(/\/argos\/alarm\/detail\/[^/]+\/([^/?#]+)/u);
  return { ruleId: detail?.[1] ?? "", alertGroupId: "" };
}

function firstValue(current: string, candidate: string | null | undefined): string {
  return current || candidate || "";
}

function extractIdentifiers(text: string): {
  resultId: string;
  ruleId: string;
  problemId: string;
  alertGroupId: string;
  sendItemId: string;
} {
  let ruleId = "";
  let problemId = "";
  let alertGroupId = "";
  let sendItemId = "";
  for (const rawUrl of urls(text)) {
    const url = parsedUrl(rawUrl);
    if (!url) continue;
    const path = pathIdentifiers(url);
    ruleId = firstValue(ruleId, path.ruleId);
    alertGroupId = firstValue(alertGroupId, path.alertGroupId);
    ruleId = firstValue(ruleId, url.searchParams.get("rule_id"));
    problemId = firstValue(problemId, url.searchParams.get("problem_id"));
    alertGroupId = firstValue(alertGroupId, url.searchParams.get("alert_group_id"));
    sendItemId = firstValue(sendItemId, url.searchParams.get("send_item_id"));
  }
  ruleId = firstValue(ruleId, firstMatch(text, [/\brule_id\s*[:=]\s*([A-Za-z0-9_-]+)/iu]));
  problemId = firstValue(problemId, firstMatch(text, [/\bproblem_id\s*[:=]\s*([A-Za-z0-9_-]+)/iu]));
  alertGroupId = firstValue(
    alertGroupId,
    firstMatch(text, [
      /\balert_group_id\s*[:=]\s*([A-Za-z0-9_-]+)/iu,
      /\bevent_id\s*[:=]\s*([A-Za-z0-9_-]+)/iu,
      /\bresult_id\s*[:=]\s*([A-Za-z0-9_-]+)/iu,
    ]),
  );
  const resultId = firstValue(alertGroupId, problemId);
  return { resultId, ruleId, problemId, alertGroupId, sendItemId };
}

function argosUrl(text: string, kind: "result" | "rule"): string {
  return (
    urls(text).find((value) =>
      kind === "result"
        ? /\/argos\/alarm\/detail\/(?:single|event)\//u.test(value)
        : /\/argos\/alarm\/detail\//u.test(value) &&
          !/\/argos\/alarm\/detail\/(?:single|event)\//u.test(value),
    ) ?? ""
  );
}

export function parseArgosAlertRecord(event: NormalizedLarkMessageEvent): ArgosAlertRecord | null {
  const text = decodeHtml(event.text);
  if (!/cloud\.bytedance\.net\/argos\/alarm/iu.test(text)) return null;
  const identifiers = extractIdentifiers(text);
  if (!identifiers.ruleId || !identifiers.resultId) return null;
  const title =
    firstMatch(text, [/<card\s+title="([^"]+)"/iu, /<card\s+title='([^']+)'/iu]) ||
    event.topicName ||
    firstMatch(text, [/规则(?:名称)?\s*[:：]\s*([^\n\r]+)/u]);
  const resultUrl = argosUrl(text, "result");
  const ruleUrl = argosUrl(text, "rule");
  const psm = cleanMarkdownFieldValue(
    firstMatch(text, [/(?:服务|PSM)\s*[:：]\s*([^\n\r]+)/iu, /\bpsm=([^&\s)]+)/iu]) ||
      parsedUrl(resultUrl)?.searchParams.get("psm") ||
      parsedUrl(ruleUrl)?.searchParams.get("psm") ||
      "",
  );
  const resultTime = firstMatch(text, [
    /(?:报警|告警)时间\s*[:：]\s*\**\s*(\d{4}-\d{2}-\d{2}[T\s]+\d{2}:\d{2}:\d{2}(?:\.\d+)?)/u,
  ]);
  const ruleName = normalizeRuleName(title);
  if (!psm || !ruleName) return null;
  const level =
    firstMatch(title, [/[【[]([^】\]]*(?:critical|warning)[^】\]]*)[】\]]/iu])
      .toLowerCase()
      .match(/critical|warning/u)?.[0] ?? "";
  return {
    uniqueId: identifiers.ruleId,
    resultId: identifiers.resultId,
    ruleId: identifiers.ruleId,
    problemId: identifiers.problemId,
    alertGroupId: identifiers.alertGroupId || identifiers.resultId,
    sendItemId: identifiers.sendItemId,
    psm,
    level,
    ruleName,
    resultTime: resultTime || null,
    resultUrl,
    ruleUrl,
    ruleContent:
      extractSection(text, /\*\*Tags:\s*\*\*|Tags:\s*/iu, [/\*\*Argos根因分析\*\*/iu]) || text,
    resultContent: extractSection(text, /\*\*Argos根因分析\*\*/iu, [/<\/card>/iu]) || text,
  };
}

function timestamp(value: string | null, fallback: number | null): number | string {
  if (value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (fallback !== null) return fallback < 10_000_000_000 ? fallback * 1000 : fallback;
  return Date.now();
}

export function argosMessageFields(
  alert: ArgosAlertRecord,
  input: {
    event: NormalizedLarkMessageEvent;
    projectId: string;
    pluginId: string;
    trigger: string;
    chatName: string;
  },
): BitableWritableFields {
  const extra = {
    project_id: input.projectId,
    plugin_id: input.pluginId,
    trigger: input.trigger,
    message_id: input.event.messageId,
    chat_id: input.event.chatId,
    group_id: input.event.chatId,
    chat_name: input.chatName,
    message_create_time: input.event.createTime,
    alert_group_id: alert.alertGroupId,
    problem_id: alert.problemId,
    send_item_id: alert.sendItemId,
  };
  return {
    [ARGOS_RECORD_FIELDS.uniqueId]: alert.uniqueId,
    [ARGOS_RECORD_FIELDS.resultId]: alert.resultId,
    [ARGOS_RECORD_FIELDS.ruleId]: alert.ruleId,
    [ARGOS_RECORD_FIELDS.alarmRecordDetailId]: "",
    [ARGOS_RECORD_FIELDS.psm]: alert.psm,
    [ARGOS_RECORD_FIELDS.level]: alert.level,
    [ARGOS_RECORD_FIELDS.ruleName]: alert.ruleName,
    [ARGOS_RECORD_FIELDS.resultTime]: timestamp(alert.resultTime, input.event.createTime),
    [ARGOS_RECORD_FIELDS.createTime]: timestamp(null, input.event.createTime),
    [ARGOS_RECORD_FIELDS.resultUrl]: alert.resultUrl,
    [ARGOS_RECORD_FIELDS.ruleUrl]: alert.ruleUrl,
    [ARGOS_RECORD_FIELDS.ruleContent]: alert.ruleContent,
    [ARGOS_RECORD_FIELDS.resultContent]: alert.resultContent,
    [ARGOS_RECORD_FIELDS.extra]: JSON.stringify(extra),
    [ARGOS_RECORD_FIELDS.status]: "init",
    [ARGOS_RECORD_FIELDS.aiSessionId]: "",
    [ARGOS_RECORD_FIELDS.aiSummary]: "",
    [ARGOS_RECORD_FIELDS.aiResult]: "",
    [ARGOS_RECORD_FIELDS.lastError]: "",
  };
}

export function argosStatusFields(status: string): BitableWritableFields {
  return { [ARGOS_RECORD_FIELDS.status]: status };
}
