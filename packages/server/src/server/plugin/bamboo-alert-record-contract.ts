import type { NormalizedLarkMessageEvent } from "../channels/lark/lark-message-format.js";

export const BAMBOO_RECORD_FIELDS = {
  uniqueId: "unique_id",
  resultId: "result_id",
  alarmRecordDetailId: "alarm_record_detail_id",
  taskId: "task_id",
  taskName: "task_name",
  taskTime: "task_time",
  bambooUrl: "bamboo_url",
  createdAt: "created_at",
  taskSql: "task_sql",
  taskResultNum: "task_result_num",
  taskResultObject: "task_result_object",
  status: "status",
  aiSessionId: "ai_session_id",
  extra: "extra",
  aiSummary: "ai_summary",
  aiResult: "ai_result",
  aiFinishedAt: "ai_finished_at",
  lastError: "last_error",
} as const;

export const BAMBOO_RECORD_STATUSES = [
  "init",
  "processing",
  "succeeded",
  "failed",
  "pending",
  "not_support",
] as const;

export type BambooRecordStatus = (typeof BAMBOO_RECORD_STATUSES)[number];

export interface BambooAlertRecordData {
  resultId: string;
  uniqueId: string;
  taskId: string;
  taskName: string;
  taskTime: string;
  bambooUrl: string;
  taskResultNum: string;
  extra: string;
}

function firstMatch(text: string, patterns: readonly RegExp[]): string {
  for (const pattern of patterns) {
    const match = pattern.exec(text)?.[1]?.trim();
    if (match) return match;
  }
  return "";
}

function eventTimestamp(event: NormalizedLarkMessageEvent): number | null {
  if (event.createTime === null) return null;
  return event.createTime < 10_000_000_000 ? event.createTime * 1000 : event.createTime;
}

export function normalizeBambooTaskName(value: string): string {
  return value
    .replace(/【已确认】|【已自动归因】|【已归因】/gu, "")
    .replace(/【[^】]*归因[^】]*】/gu, "")
    .replace(/【数据监控-bamboo-[^】]+】/giu, "")
    .replace(/【bamboo报警】|【bamboo通知】/giu, "")
    .replace(/已自动归因|自动归因|已归因|归因/gu, "")
    .replace(/bamboo报警|bamboo通知/giu, "")
    .replace(/^[\s:：\-—_]+|[\s:：\-—_]+$/gu, "")
    .trim();
}

export function normalizeBambooUniqueId(value: string): string {
  return value.trim().replace(/^result_id\s*[:=：]\s*/iu, "");
}

export function parseBambooAlertRecord(
  event: NormalizedLarkMessageEvent,
): BambooAlertRecordData | null {
  const resultId = normalizeBambooUniqueId(
    firstMatch(event.text, [
      /\bresult[_\s-]*id\s*[:=：]\s*([a-zA-Z0-9_-]+)/iu,
      /(?:[?&]|&amp;)id=([a-zA-Z0-9_-]+)/iu,
    ]),
  );
  if (!resultId) return null;

  const firstLine =
    event.text
      .split(/\r?\n/u)
      .find((line) => line.trim())
      ?.trim() ?? "";
  const rawTitle =
    firstMatch(event.text, [
      /(?:^|\n)\s*(【数据监控-bamboo[^】]*】[^\n]*)/iu,
      /"title"\s*:\s*"([^"]+)"/iu,
      /(?:^|\n)\s*#+\s*([^\n]+)/u,
    ]) ||
    (firstLine.includes("bamboo") || firstLine.includes("Bamboo") ? firstLine : "") ||
    event.topicName ||
    firstLine ||
    `Bamboo result_id ${resultId}`;
  const timestamp = eventTimestamp(event);
  const messageSentAt = timestamp === null ? null : new Date(timestamp).toISOString();
  const taskTime =
    firstMatch(event.text, [
      /告警时间\s*[:：]\s*([^\n]+)/iu,
      /\btask_time\s*[:=："'\s]+\s*([0-9T:.\-\s]+)/iu,
    ]) ||
    messageSentAt ||
    "";
  const bambooUrl = firstMatch(event.text, [
    /(https:\/\/bamboo\.bytedance\.net\/result-manage\/[^\s)"']+)/iu,
  ]);
  const taskId = firstMatch(event.text, [
    /\btask[_\s-]*id\s*[:=：]\s*([a-zA-Z0-9_-]+)/iu,
    /(?:[?&]|&amp;)task_id=([a-zA-Z0-9_-]+)/iu,
  ]);
  const taskResultNum = firstMatch(event.text, [
    /\btask_result_num\s*[:=："'\s]+\s*(\d+)/iu,
    /\bfalse_data_length\s*[:=："'\s]+\s*(\d+)/iu,
    /异常(?:数据)?(?:条数|数量|数)\s*[:：]?\s*(\d+)/iu,
    /异常数据\s*(\d+)\s*条/iu,
  ]);
  const topicId = event.threadId ?? event.rootMessageId;
  return {
    resultId,
    uniqueId: resultId,
    taskId,
    taskName: normalizeBambooTaskName(rawTitle) || rawTitle,
    taskTime,
    bambooUrl,
    taskResultNum: taskResultNum || "0",
    extra: JSON.stringify({
      chat_id: event.chatId,
      group_id: event.chatId,
      message_id: event.messageId,
      topic_id: topicId,
      message_sent_at_ms: timestamp,
      message_sent_at: messageSentAt,
      raw_title: rawTitle,
      original_title: rawTitle,
      bamboo_check_time: taskTime || null,
    }),
  };
}

export function bambooMessageSentAtMs(extra: unknown): number | null {
  if (typeof extra !== "string" || !extra.trim()) return null;
  try {
    const parsed = JSON.parse(extra) as { message_sent_at_ms?: unknown };
    const value = Number(parsed.message_sent_at_ms);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}
