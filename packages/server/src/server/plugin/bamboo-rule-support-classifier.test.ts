import { describe, expect, it } from "vitest";
import { classifyBambooPreparedRuleSupport } from "./bamboo-rule-support-classifier.js";

describe("classifyBambooPreparedRuleSupport", () => {
  it.each(["hive", "hive_task", "offline_hive", "offline_hive_task"])(
    "allows supported rule type %s",
    (ruleType) => {
      expect(
        classifyBambooPreparedRuleSupport({
          result_id: "1",
          inspect_result: { rule_type: ruleType },
        }),
      ).toEqual({ supported: true, ruleType });
    },
  );

  it("keeps a missing rule type compatible with the Runner", () => {
    expect(classifyBambooPreparedRuleSupport({ result_id: "1" })).toEqual({
      supported: true,
      ruleType: "",
    });
  });

  it("closes an unsupported rule with the authoritative sample count", () => {
    expect(
      classifyBambooPreparedRuleSupport({
        result_id: "1",
        inspect_result: {
          classification: { rule_type: "multi_sources" },
          false_data_length: 7,
        },
      }),
    ).toEqual({
      supported: false,
      ruleType: "multi_sources",
      summary:
        "当前不支持自动排查：仅支持离线 Hive Bamboo 规则，rule_type=multi_sources，权威样本数=7（source=false_data_length），已跳过单条排查流程。",
    });
  });

  it("falls back through false_reason and Base task_result_num without treating absence as zero", () => {
    expect(
      classifyBambooPreparedRuleSupport({
        result_id: "1",
        inspect_result: {
          rule_type: "multi_sources",
          false_reason: '[{"id":1},{"id":2}]',
        },
      }),
    ).toMatchObject({
      summary: expect.stringContaining("权威样本数=2（source=false_reason）"),
    });
    expect(
      classifyBambooPreparedRuleSupport({
        result_id: "1",
        inspect_result: { rule_type: "multi_sources" },
        work_item: { task_result_num: 3 },
      }),
    ).toMatchObject({
      summary: expect.stringContaining("权威样本数=3（source=task_result_num）"),
    });
  });
});
