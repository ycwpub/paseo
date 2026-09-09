import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NormalizedLarkMessageEvent } from "../channels/lark/lark-message-format.js";
import type { AlertScanFailure, AlertScanWindow } from "./alert-troubleshooter-manager.js";
import { parseArgosAlertRecord } from "./argos-alert-record.js";

export interface ArgosGroupScanAudit {
  chat_id: string;
  chat_name?: string;
  start: string;
  end: string;
  scanned_messages: number;
  matched_alerts: number;
  ignored_messages: number;
  error?: string;
  messages: Array<{
    message_id: string;
    message_type: string;
    create_time: number | null;
    text: string;
  }>;
  alerts: Array<NonNullable<ReturnType<typeof parseArgosAlertRecord>>>;
}

interface ArgosScanAudit {
  version: 1;
  started_at: string;
  finished_at: string;
  window: { start: string; end: string };
  groups: ArgosGroupScanAudit[];
  failures: AlertScanFailure[];
  totals: {
    groups: number;
    scanned_messages: number;
    matched_alerts: number;
    ignored_messages: number;
    failed_groups: number;
  };
}

function safeTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/gu, "-");
}

export function buildArgosGroupScanAudit(input: {
  chatId: string;
  chatName?: string;
  window: AlertScanWindow;
  messages: readonly NormalizedLarkMessageEvent[];
  error?: string;
}): ArgosGroupScanAudit {
  const alerts = input.messages
    .map((message) => parseArgosAlertRecord(message))
    .filter((record): record is NonNullable<typeof record> => record !== null);
  return {
    chat_id: input.chatId,
    ...(input.chatName ? { chat_name: input.chatName } : {}),
    start: input.window.start.toISOString(),
    end: input.window.end.toISOString(),
    scanned_messages: input.messages.length,
    matched_alerts: alerts.length,
    ignored_messages: input.messages.length - alerts.length,
    ...(input.error ? { error: input.error } : {}),
    messages: input.messages.map((message) => ({
      message_id: message.messageId,
      message_type: message.messageType ?? "unknown",
      create_time: message.createTime,
      text: message.text,
    })),
    alerts,
  };
}

export async function writeArgosScanAudit(input: {
  cwd: string;
  startedAt: Date;
  finishedAt: Date;
  window: AlertScanWindow;
  groups: ArgosGroupScanAudit[];
  failures: AlertScanFailure[];
}): Promise<string> {
  const directory = path.join(input.cwd, ".tmp", "argos-scan-audits");
  const auditFile = path.join(directory, `${safeTimestamp(input.startedAt)}.json`);
  const temporaryFile = `${auditFile}.tmp`;
  const audit: ArgosScanAudit = {
    version: 1,
    started_at: input.startedAt.toISOString(),
    finished_at: input.finishedAt.toISOString(),
    window: {
      start: input.window.start.toISOString(),
      end: input.window.end.toISOString(),
    },
    groups: input.groups,
    failures: input.failures,
    totals: {
      groups: input.groups.length,
      scanned_messages: input.groups.reduce((total, group) => total + group.scanned_messages, 0),
      matched_alerts: input.groups.reduce((total, group) => total + group.matched_alerts, 0),
      ignored_messages: input.groups.reduce((total, group) => total + group.ignored_messages, 0),
      failed_groups: input.failures.length,
    },
  };
  await mkdir(directory, { recursive: true });
  await writeFile(temporaryFile, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  await rename(temporaryFile, auditFile);
  return auditFile;
}

export async function recoverArgosMessageFromScanAudit(input: {
  cwd: string;
  messageId: string;
}): Promise<NormalizedLarkMessageEvent | null> {
  const directory = path.join(input.cwd, ".tmp", "argos-scan-audits");
  let files: string[];
  try {
    files = (await readdir(directory))
      .filter((file) => file.endsWith(".json"))
      .sort((left, right) => right.localeCompare(left));
  } catch {
    return null;
  }
  for (const file of files) {
    let audit: ArgosScanAudit;
    try {
      audit = JSON.parse(await readFile(path.join(directory, file), "utf8")) as ArgosScanAudit;
    } catch {
      continue;
    }
    for (const group of audit.groups ?? []) {
      const message = group.messages.find((candidate) => candidate.message_id === input.messageId);
      if (!message) continue;
      return {
        eventId: `argos-scan-audit:${file}:${message.message_id}`,
        messageId: message.message_id,
        chatId: group.chat_id,
        chatType: "group",
        messageType: message.message_type,
        threadId: null,
        rootMessageId: null,
        openId: null,
        unionId: null,
        displayName: "Argos",
        topicName: "报警",
        text: message.text,
        createTime: message.create_time,
      };
    }
  }
  return null;
}
