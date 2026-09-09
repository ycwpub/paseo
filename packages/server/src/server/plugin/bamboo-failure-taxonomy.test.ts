import { describe, expect, it } from "vitest";
import { AlertTroubleshooterPendingError } from "./alert-troubleshooter-failure-policy.js";
import { classifyBambooFailureCategory } from "./bamboo-failure-taxonomy.js";

describe("classifyBambooFailureCategory", () => {
  it("separates actionable and terminal failure categories", () => {
    expect(classifyBambooFailureCategory(new Error("缺少权限"), "缺少权限")).toBe("authorization");
    expect(classifyBambooFailureCategory(new Error("缺少 result_id"), "缺少 result_id")).toBe(
      "record_contract",
    );
    expect(
      classifyBambooFailureCategory(new Error("sample_checks_required"), "sample_checks_required"),
    ).toBe("evidence_validation");
    expect(classifyBambooFailureCategory(new Error("HTTP 529"), "HTTP 529")).toBe(
      "transient_external",
    );
    expect(
      classifyBambooFailureCategory(new Error("TypeError: impossible"), "TypeError: impossible"),
    ).toBe("fatal_runtime");
  });

  it("recognizes exhausted review rework explicitly", () => {
    const error = new AlertTroubleshooterPendingError("审核失败", "review_rework_exhausted");
    expect(classifyBambooFailureCategory(error, error.message)).toBe("review_rework_exhausted");
  });
});
