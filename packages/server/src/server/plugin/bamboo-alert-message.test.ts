import { describe, expect, it } from "vitest";
import {
  extractBambooResultId,
  isBambooAlertMessage,
  isBambooTroubleshootingResultMessage,
} from "./bamboo-alert-message.js";

describe("Bamboo alert messages", () => {
  it("extracts result_id from Bamboo card links", () => {
    expect(
      extractBambooResultId(
        "https://bamboo.bytedance.net/result-manage/6276?id=19562663&source=lark",
      ),
    ).toBe("19562663");
  });

  it("recognizes forwarded Bamboo cards without an explicit result_id label", () => {
    expect(
      isBambooAlertMessage(
        "【数据监控-bamboo-NOTICE】【bamboo通知】分账异常\nhttps://bamboo.bytedance.net/result-manage/6276?id=19562663",
        "interactive",
      ),
    ).toBe(true);
  });

  it("does not classify an unrelated interactive link with an id parameter", () => {
    expect(isBambooAlertMessage("查看详情：https://example.com/task?id=123", "interactive")).toBe(
      false,
    );
  });

  it("does not ingest its own troubleshooting result as a new alert", () => {
    const text = "Bamboo 报警自动排查结果\nresult_id: 19562663\n状态: succeeded";
    expect(isBambooTroubleshootingResultMessage(text)).toBe(true);
    expect(isBambooAlertMessage(text, "post")).toBe(false);
  });
});
