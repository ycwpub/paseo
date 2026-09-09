import { describe, expect, it } from "vitest";
import { BambooReviewResultSchema } from "./bamboo-review-result.js";

describe("BambooReviewResultSchema", () => {
  it("keeps the canonical string-array review contract", () => {
    expect(
      BambooReviewResultSchema.parse({
        review_passed: true,
        blockers: [],
        required_rework_prompt: "",
        checked_files: ["/tmp/result.json"],
        validation_command: "validate",
        review_summary: "通过",
      }),
    ).toMatchObject({
      blockers: [],
      checked_files: ["/tmp/result.json"],
    });
  });

  it("normalizes structured reviewer details without losing the rework reason or file path", () => {
    expect(
      BambooReviewResultSchema.parse({
        review_passed: false,
        blockers: [
          {
            code: "doc_content_quality_gate_failed",
            file: "/tmp/19626626.md",
            detail: "缺少必含章节",
          },
        ],
        required_rework_prompt: "补齐章节",
        checked_files: [
          {
            label: "result_json",
            path: "/tmp/19626626.json",
            exists: true,
          },
        ],
        validation_command: "validate",
        review_summary: "不通过",
      }),
    ).toMatchObject({
      blockers: ["doc_content_quality_gate_failed: 缺少必含章节 (/tmp/19626626.md)"],
      checked_files: ["/tmp/19626626.json"],
    });
  });

  it("normalizes structured scalar fields returned by a reviewer", () => {
    const parsed = BambooReviewResultSchema.parse({
      review_passed: false,
      blockers: [
        {
          code: "validator_not_passed",
          message: "Runner validator 未通过",
        },
      ],
      required_rework_prompt: {
        action: "重新生成 validator 输出",
      },
      checked_files: ["/tmp/19626959.json"],
      validation_command: {
        command: "validate-model-result-json",
      },
      review_summary: {
        result_id: "19626959",
        decision: "不通过：Runner validator 未通过，必须返工。",
      },
    });

    expect(parsed.blockers).toEqual(["validator_not_passed: Runner validator 未通过"]);
    expect(JSON.parse(parsed.required_rework_prompt)).toEqual({
      action: "重新生成 validator 输出",
    });
    expect(JSON.parse(parsed.validation_command)).toEqual({
      command: "validate-model-result-json",
    });
    expect(JSON.parse(parsed.review_summary)).toEqual({
      result_id: "19626959",
      decision: "不通过：Runner validator 未通过，必须返工。",
    });
  });

  it("never leaves unknown structured blocker and checked-file values as objects", () => {
    expect(
      BambooReviewResultSchema.parse({
        review_passed: false,
        blockers: [{ nested: { reason: "unknown shape" } }],
        required_rework_prompt: "",
        checked_files: [{ nested: { path: "/tmp/result.json" } }],
        validation_command: "validate",
        review_summary: "不通过",
      }),
    ).toMatchObject({
      blockers: ['{"nested":{"reason":"unknown shape"}}'],
      checked_files: ['{"nested":{"path":"/tmp/result.json"}}'],
    });
  });
});
