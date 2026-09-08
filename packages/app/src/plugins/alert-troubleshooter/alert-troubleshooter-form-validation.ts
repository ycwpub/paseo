import type { ZodType } from "zod";
import type {
  AlertTroubleshooterChat,
  AlertTroubleshooterConfig,
  AlertTroubleshooterTarget,
} from "@getpaseo/protocol/messages";

export interface AlertTroubleshooterConfigDraft {
  enabled: boolean;
  listenEnabled: boolean;
  troubleshootingEnabled: boolean;
  botId: string;
  chats: AlertTroubleshooterChat[];
  target: AlertTroubleshooterTarget;
  troubleshootingSopDoc: string;
  attributionRecordRoot: string;
  promptTemplate: string;
  queuePollIntervalMinutes: string;
  schedule: {
    enabled: boolean;
    intervalMinutes: string;
    lookbackMinutes: string;
    excludeRecentMinutes: string;
  };
}

export type AlertTroubleshooterConfigValidation =
  | { success: true; config: AlertTroubleshooterConfig }
  | { success: false; message: string };

function numericValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function issueMessage(path: PropertyKey[]): string {
  const field = path.map(String).join(".");
  if (field === "botId") return "请选择飞书机器人";
  if (field === "chats") return "请至少添加一个监听飞书群";
  if (field.startsWith("chats.")) return "监听飞书群信息不完整，请重新添加";
  if (field === "troubleshootingSopDoc") {
    return "排查 SOP 飞书文档链接格式无效，请输入完整的 http:// 或 https:// 链接";
  }
  if (field === "attributionRecordRoot") {
    return "归因记录链接格式无效，请输入完整的 http:// 或 https:// 链接";
  }
  if (field === "target.assistantId") return "请选择助手";
  if (field === "target.teamId") return "请选择团队";
  if (field === "queuePollIntervalMinutes") return "队列轮询/失败重试间隔必须是 1 到 1440 分钟";
  if (field === "schedule.intervalMinutes") return "扫描间隔必须是 5 到 1440 分钟";
  if (field === "schedule.lookbackMinutes") return "回看范围必须是 30 到 10080 分钟";
  if (field === "schedule.excludeRecentMinutes") {
    return "排除最近消息必须是 0 到 1440 分钟";
  }
  return "配置内容无效，请检查后重试";
}

function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages)];
}

export function validateAlertTroubleshooterConfig(
  schema: ZodType<AlertTroubleshooterConfig>,
  draft: AlertTroubleshooterConfigDraft,
): AlertTroubleshooterConfigValidation {
  const errors: string[] = [];
  const explicitlyValidatedFields = new Set<string>();
  const botId = draft.botId.trim();
  const troubleshootingSopDoc = draft.troubleshootingSopDoc.trim();
  const attributionRecordRoot = draft.attributionRecordRoot.trim();

  if (!botId) {
    errors.push("请选择飞书机器人");
    explicitlyValidatedFields.add("botId");
  }
  if (draft.chats.length === 0) {
    errors.push("请至少添加一个监听飞书群");
    explicitlyValidatedFields.add("chats");
  }
  if (!troubleshootingSopDoc) {
    errors.push("请输入排查 SOP 飞书文档链接");
    explicitlyValidatedFields.add("troubleshootingSopDoc");
  } else if (!isHttpUrl(troubleshootingSopDoc)) {
    errors.push("排查 SOP 飞书文档链接格式无效，请输入完整的 http:// 或 https:// 链接");
    explicitlyValidatedFields.add("troubleshootingSopDoc");
  }
  if (!attributionRecordRoot) {
    errors.push("请输入归因记录根目录");
    explicitlyValidatedFields.add("attributionRecordRoot");
  } else if (!isHttpUrl(attributionRecordRoot)) {
    errors.push("归因记录链接格式无效，请输入完整的 http:// 或 https:// 链接");
    explicitlyValidatedFields.add("attributionRecordRoot");
  }
  const parsed = schema.safeParse({
    version: 4,
    enabled: draft.enabled,
    listenEnabled: draft.listenEnabled,
    troubleshootingEnabled: draft.troubleshootingEnabled,
    botId,
    chats: draft.chats,
    target: draft.target,
    troubleshootingSopDoc,
    attributionRecordRoot,
    promptTemplate: draft.promptTemplate,
    queuePollIntervalMinutes: numericValue(draft.queuePollIntervalMinutes, 5),
    schedule: {
      enabled: draft.schedule.enabled,
      intervalMinutes: numericValue(draft.schedule.intervalMinutes, 30),
      lookbackMinutes: numericValue(draft.schedule.lookbackMinutes, 120),
      excludeRecentMinutes: numericValue(draft.schedule.excludeRecentMinutes, 0),
    },
  });

  if (!parsed.success) {
    errors.push(
      ...parsed.error.issues
        .filter((issue) => !explicitlyValidatedFields.has(String(issue.path[0])))
        .map((issue) => issueMessage(issue.path)),
    );
  }

  const messages = uniqueMessages(errors);
  if (!parsed.success || messages.length > 0) {
    return { success: false, message: messages.join("\n") };
  }
  return { success: true, config: parsed.data };
}
