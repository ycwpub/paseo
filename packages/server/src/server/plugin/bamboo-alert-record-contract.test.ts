import { describe, expect, it } from "vitest";
import {
  bambooMessageSentAtMs,
  normalizeBambooUniqueId,
  parseBambooAlertRecord,
} from "./bamboo-alert-record-contract.js";

describe("Bamboo alert record contract", () => {
  it("uses raw result_id as the canonical unique_id and preserves scan provenance", () => {
    const record = parseBambooAlertRecord({
      eventId: "evt_1",
      messageId: "om_1",
      chatId: "oc_1",
      chatType: "group",
      messageType: "interactive",
      threadId: "omt_1",
      rootMessageId: null,
      openId: null,
      unionId: null,
      displayName: "Bamboo",
      topicName: "对账报警",
      text: [
        "【已确认】【数据监控-bamboo-CRITICAL】【bamboo报警】账单金额不一致",
        "result_id=19562663",
        "task_id=888",
        "异常数据 19 条",
        "https://bamboo.bytedance.net/result-manage/detail?id=19562663&task_id=888",
      ].join("\n"),
      createTime: Date.parse("2026-09-08T11:18:16.000Z"),
    });

    expect(record).toMatchObject({
      resultId: "19562663",
      uniqueId: "19562663",
      taskId: "888",
      taskName: "账单金额不一致",
      taskResultNum: "19",
    });
    expect(bambooMessageSentAtMs(record?.extra)).toBe(Date.parse("2026-09-08T11:18:16.000Z"));
  });

  it("normalizes legacy prefixed unique ids", () => {
    expect(normalizeBambooUniqueId("result_id:123456")).toBe("123456");
  });

  it("removes Markdown decoration from the alert time before persisting it", () => {
    const record = parseBambooAlertRecord({
      eventId: "evt_19630485",
      messageId: "om_19630485",
      chatId: "oc_alerts",
      chatType: "group",
      messageType: "interactive",
      threadId: null,
      rootMessageId: null,
      openId: null,
      unionId: null,
      displayName: "Bamboo",
      topicName: "对账报警",
      text: [
        "【数据监控-bamboo-WARNING】触发单未按时生成父分账单",
        "result_id=19630485",
        "**告警时间:** ** 2026-09-09T14:41:59.230",
      ].join("\n"),
      createTime: Date.parse("2026-09-09T07:25:27.965Z"),
    });

    expect(record?.taskTime).toBe("2026-09-09T14:41:59.230");
    expect(JSON.parse(record?.extra ?? "{}")).toMatchObject({
      bamboo_check_time: "2026-09-09T14:41:59.230",
    });
  });
});
