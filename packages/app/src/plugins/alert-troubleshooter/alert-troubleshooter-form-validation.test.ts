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
  botId: "bot-1",
  chats: [{ chatId: "oc_alerts", name: "报警群" }],
  target: { kind: "default" },
  troubleshootingSopDoc: "https://example.com/wiki/sop",
  attributionRecordRoot: "https://example.com/wiki/records",
  schedule: {
    enabled: true,
    intervalMinutes: "30",
    lookbackMinutes: "120",
    excludeRecentMinutes: "30",
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
    });

    expect(result).toEqual({
      success: false,
      message: [
        "请选择飞书机器人",
        "请至少添加一个监听飞书群",
        "请输入排查 SOP 飞书文档链接",
        "请输入归因记录飞书文档或目录链接",
      ].join("\n"),
    });
  });

  it("rejects non-http document links without exposing Zod issue JSON", () => {
    const result = validateAlertTroubleshooterConfig(AlertTroubleshooterConfigSchema, {
      ...VALID_DRAFT,
      troubleshootingSopDoc: "not-a-url",
      attributionRecordRoot: "file:///tmp/records",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.message).toContain(
      "排查 SOP 飞书文档链接格式无效，请输入完整的 http:// 或 https:// 链接",
    );
    expect(result.message).toContain("归因记录链接格式无效，请输入完整的 http:// 或 https:// 链接");
    expect(result.message).not.toContain("invalid_format");
    expect(result.message).not.toContain('"origin"');
  });

  it("returns the parsed configuration for a valid draft", () => {
    const result = validateAlertTroubleshooterConfig(AlertTroubleshooterConfigSchema, VALID_DRAFT);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config).toEqual<AlertTroubleshooterConfig>({
      version: 1,
      ...VALID_DRAFT,
      schedule: {
        enabled: true,
        intervalMinutes: 30,
        lookbackMinutes: 120,
        excludeRecentMinutes: 30,
      },
    });
  });
});
