import { describe, expect, it } from "vitest";
import {
  AlertTroubleshooterConfigSchema,
  type AlertTroubleshooterConfig,
} from "@getpaseo/protocol/messages";
import {
  type AlertTroubleshooterConfigDraft,
  validateAlertTroubleshooterConfig,
} from "./alert-troubleshooter-form-validation";

const VALID_DRAFT: AlertTroubleshooterConfigDraft = {
  enabled: true,
  listenEnabled: true,
  troubleshootingEnabled: true,
  botId: "bot-1",
  chats: [{ chatId: "oc_alerts", name: "报警群" }],
  target: { kind: "assistant", assistantId: "assistant-1" },
  troubleshootingSopDoc: "https://example.com/wiki/sop",
  attributionRecordRoot: "https://example.com/wiki/records",
  recordTableUrl: "https://example.com/base/messages?table=tbl_alerts",
  promptTemplate: "处理 {{recordId}}",
  queuePollIntervalMinutes: "5",
  schedule: {
    enabled: true,
    intervalMinutes: "30",
    lookbackMinutes: "120",
    excludeRecentMinutes: "0",
  },
};

describe("validateAlertTroubleshooterConfig", () => {
  it("returns all actionable Chinese messages for required fields", () => {
    const result = validateAlertTroubleshooterConfig(AlertTroubleshooterConfigSchema, {
      ...VALID_DRAFT,
      botId: "",
      chats: [],
      troubleshootingSopDoc: "",
      attributionRecordRoot: "",
      recordTableUrl: "",
    });

    expect(result).toEqual({
      success: false,
      message: [
        "请选择飞书机器人",
        "请至少添加一个监听飞书群",
        "请输入排查 SOP 飞书文档链接",
        "请输入归因记录飞书文档或目录链接",
        "请输入消息多维表格链接",
      ].join("\n"),
    });
  });

  it("rejects non-http document links without exposing Zod issue JSON", () => {
    const result = validateAlertTroubleshooterConfig(AlertTroubleshooterConfigSchema, {
      ...VALID_DRAFT,
      troubleshootingSopDoc: "not-a-url",
      attributionRecordRoot: "file:///tmp/records",
      recordTableUrl: "not-a-base-url",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.message).toContain(
      "排查 SOP 飞书文档链接格式无效，请输入完整的 http:// 或 https:// 链接",
    );
    expect(result.message).toContain("归因记录链接格式无效，请输入完整的 http:// 或 https:// 链接");
    expect(result.message).toContain(
      "消息多维表格链接格式无效，请输入完整的 http:// 或 https:// 链接",
    );
    expect(result.message).not.toContain("invalid_format");
    expect(result.message).not.toContain('"origin"');
  });

  it("requires exactly one assistant or team instead of the legacy default target", () => {
    const result = validateAlertTroubleshooterConfig(AlertTroubleshooterConfigSchema, {
      ...VALID_DRAFT,
      target: { kind: "default" },
    });

    expect(result).toEqual({
      success: false,
      message: "请选择助手或团队",
    });
  });

  it("returns the parsed configuration for a valid draft", () => {
    const result = validateAlertTroubleshooterConfig(AlertTroubleshooterConfigSchema, VALID_DRAFT);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config).toEqual<AlertTroubleshooterConfig>({
      ...VALID_DRAFT,
      version: 3,
      queuePollIntervalMinutes: 5,
      schedule: {
        enabled: true,
        intervalMinutes: 30,
        lookbackMinutes: 120,
        excludeRecentMinutes: 0,
      },
    });
  });
});
