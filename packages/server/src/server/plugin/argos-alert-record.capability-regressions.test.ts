import { describe, expect, it } from "vitest";
import { argosMessageFields, parseArgosAlertRecord } from "./argos-alert-record.js";

function event(text: string) {
  return {
    eventId: "evt-1",
    messageId: "om-1",
    chatId: "oc-alerts",
    chatType: "group",
    messageType: "interactive",
    threadId: null,
    rootMessageId: null,
    openId: null,
    unionId: null,
    senderAppId: "cli-argos",
    senderType: "app",
    displayName: "Argos",
    topicName: "报警",
    text,
    createTime: Date.parse("2026-09-09T08:30:00.000Z"),
  };
}

describe("Argos alert record contract", () => {
  it("matches the life-settle Argos identifiers and uses rule_id as unique_id", () => {
    const source = event(
      [
        '<card title="[Argos-CRITICAL][已确认] 消费积压">',
        "服务: life.settle.demo",
        "报警时间: **2026-09-09 16:20:00**",
        "https://cloud.bytedance.net/argos/alarm/detail/event/rule-42/alert-99?problem_id=problem-8&send_item_id=send-7",
        "https://cloud.bytedance.net/argos/alarm/detail/rule/rule-42?psm=life.settle.demo",
        "**Tags:** cluster=default",
        "region=cn",
        "**Argos根因分析**",
        "下游错误率升高",
        "</card>",
      ].join("\n"),
    );

    const alert = parseArgosAlertRecord(source);

    expect(alert).toMatchObject({
      uniqueId: "rule-42",
      resultId: "alert-99",
      ruleId: "rule-42",
      problemId: "problem-8",
      alertGroupId: "alert-99",
      sendItemId: "send-7",
      psm: "life.settle.demo",
      level: "critical",
      ruleName: "消费积压",
      resultTime: "2026-09-09 16:20:00",
    });
    expect(alert?.ruleContent).toContain("cluster=default");
    expect(alert?.ruleContent).not.toContain("下游错误率升高");
    expect(alert?.resultContent).toContain("下游错误率升高");

    expect(
      argosMessageFields(alert!, {
        event: source,
        projectId: "prj-1",
        pluginId: "argos-alert-troubleshooter",
        trigger: "schedule",
        chatName: "Argos 报警群",
      }),
    ).toMatchObject({
      unique_id: "rule-42",
      result_id: "alert-99",
      rule_id: "rule-42",
      psm: "life.settle.demo",
      status: "init",
    });
  });

  it("ignores Argos-like text that is not a complete Argos card", () => {
    expect(parseArgosAlertRecord(event("Argos 服务告警 rule_id=rule-42"))).toBeNull();
    expect(
      parseArgosAlertRecord(
        event(
          [
            '<card title="[Argos-WARNING] 消费积压">',
            "https://cloud.bytedance.net/argos/alarm/detail/event/rule-42/alert-99",
          ].join("\n"),
        ),
      ),
    ).toBeNull();
  });
});
