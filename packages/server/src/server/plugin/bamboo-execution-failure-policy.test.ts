import { describe, expect, it } from "vitest";
import type { AlertTroubleshooterQueueItem } from "./alert-troubleshooter-queue-store.js";
import { AlertTroubleshooterPendingError } from "./alert-troubleshooter-failure-policy.js";
import { classifyBambooExecutionFailure } from "./bamboo-execution-failure-policy.js";

function task(nextRetryAt: string | null): AlertTroubleshooterQueueItem {
  return {
    id: "task-1",
    recordId: "record-1",
    uniqueId: "19562663",
    resultId: "19562663",
    tableDate: "20260909",
    messageId: null,
    trigger: "table",
    status: "failed",
    matchedCount: 1,
    attempts: 1,
    queuedAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:01:00.000Z",
    nextRetryAt,
    agentId: null,
    error: "failed",
  };
}

describe("classifyBambooExecutionFailure", () => {
  it("keeps transient failures retryable while an external retry remains", () => {
    expect(
      classifyBambooExecutionFailure({
        error: new Error("HTTP 529"),
        message: "HTTP 529",
        task: task("2026-09-09T00:31:00.000Z"),
      }),
    ).toEqual({ disposition: "retry", reason: "HTTP 529" });
  });

  it("leaves authorization and review blockers pending instead of marking them failed", () => {
    expect(
      classifyBambooExecutionFailure({
        error: new Error("缺少 base:record:read 权限"),
        message: "缺少 base:record:read 权限",
        task: task("2026-09-09T00:31:00.000Z"),
      }).disposition,
    ).toBe("pending");
    expect(
      classifyBambooExecutionFailure({
        error: new AlertTroubleshooterPendingError("审核返工仍未通过", "review_rework_exhausted"),
        message: "审核返工仍未通过",
        task: task(null),
      }).disposition,
    ).toBe("pending");
  });

  it("marks an exhausted external failure as failed", () => {
    expect(
      classifyBambooExecutionFailure({
        error: new Error("HTTP 529"),
        message: "HTTP 529",
        task: task(null),
      }),
    ).toEqual({ disposition: "failed", reason: "HTTP 529" });
  });

  it("keeps an exhausted non-external blocker pending for user or code repair", () => {
    expect(
      classifyBambooExecutionFailure({
        error: new Error("结果目录缺少业务证据"),
        message: "结果目录缺少业务证据",
        task: task(null),
      }),
    ).toEqual({ disposition: "pending", reason: "结果目录缺少业务证据" });
  });

  it("does not spend automatic retries on non-external runner validation failures", () => {
    expect(
      classifyBambooExecutionFailure({
        error: new Error(
          "Bamboo runner validate-result-dir 执行失败：sample_checks_required_for_effective_samples",
        ),
        message:
          "Bamboo runner validate-result-dir 执行失败：sample_checks_required_for_effective_samples",
        task: task("2026-09-09T00:31:00.000Z"),
      }),
    ).toEqual({
      disposition: "pending",
      reason:
        "Bamboo runner validate-result-dir 执行失败：sample_checks_required_for_effective_samples",
    });
  });
});
