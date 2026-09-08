import { describe, expect, it, vi } from "vitest";
import { AlertTroubleshooterConfigSchema } from "@getpaseo/protocol/messages";
import { resolveBambooTroubleshooterCompletion } from "./bamboo-troubleshooter-completion-resolver.js";

const config = AlertTroubleshooterConfigSchema.parse({
  botId: "bot-1",
  chats: [{ chatId: "oc-1", name: "结算报警群" }],
  target: { kind: "default" },
  troubleshootingSopDoc: "https://example.com/wiki/sop",
  attributionRecordRoot: "https://example.com/wiki/root",
  recordTableUrl: "https://example.com/base/alerts?table=tbl_alerts",
  schedule: {
    enabled: false,
    intervalMinutes: 30,
    lookbackMinutes: 120,
    excludeRecentMinutes: 30,
  },
});

const record = {
  recordId: "rec-1",
  uniqueId: "19562663",
  resultId: "19562663",
  tableDate: "20260908",
  messageId: null,
  chatId: null,
  chatName: null,
  messageText: "手动排查",
  messageTime: "2026-09-08T10:00:00.000Z",
  trigger: "manual" as const,
};

describe("resolveBambooTroubleshooterCompletion", () => {
  it("re-publishes a succeeded Agent result instead of trusting its docx URL", async () => {
    const publishDocument = vi.fn(async () => ({
      documentUrl: "https://bytedance.larkoffice.com/wiki/wiki_result",
      markdownFile: "/workspace/.tmp/19562663-troubleshooting.md",
      auditFile: "/workspace/.tmp/publish-doc-19562663.json",
    }));

    const result = await resolveBambooTroubleshooterCompletion(
      {
        message:
          '{"status":"succeeded","summary":"排查完成","feishu_doc_url":"https://bytedance.larkoffice.com/docx/doc_result"}',
        config,
        record,
        workspaceCwd: "/workspace",
        wikiTarget: {
          spaceId: "space_1",
          parentNodeToken: "daily_node",
        },
      },
      publishDocument,
    );

    expect(publishDocument).toHaveBeenCalledOnce();
    expect(result).toEqual({
      status: "succeeded",
      summary: "排查完成",
      documentUrl: "https://bytedance.larkoffice.com/wiki/wiki_result",
    });
  });

  it("does not publish pending results", async () => {
    const publishDocument = vi.fn();
    const result = await resolveBambooTroubleshooterCompletion(
      {
        message: '{"status":"pending","summary":"等待授权"}',
        config,
        record,
        workspaceCwd: "/workspace",
        wikiTarget: {
          spaceId: "space_1",
          parentNodeToken: "daily_node",
        },
      },
      publishDocument,
    );

    expect(result).toEqual({ status: "pending", summary: "等待授权" });
    expect(publishDocument).not.toHaveBeenCalled();
  });

  it("does not accept a docx result when the daily Wiki target is unavailable", async () => {
    await expect(
      resolveBambooTroubleshooterCompletion({
        message:
          '{"status":"succeeded","summary":"排查完成","feishu_doc_url":"https://bytedance.larkoffice.com/docx/doc_result"}',
        config,
        record,
        workspaceCwd: "/workspace",
      }),
    ).rejects.toThrow("无法解析当前日报 Base 的 Wiki 节点");
  });
});
