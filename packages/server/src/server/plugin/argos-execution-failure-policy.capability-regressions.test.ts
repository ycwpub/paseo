import { describe, expect, it } from "vitest";
import type { AlertTroubleshooterQueueItem } from "./alert-troubleshooter-queue-store.js";
import { classifyArgosExecutionFailure } from "./argos-execution-failure-policy.js";

function task(nextRetryAt: string | null): AlertTroubleshooterQueueItem {
  return {
    id: "task-1",
    recordId: "rec-1",
    uniqueId: "rule-42",
    resultId: "alert-99",
    tableDate: "20260909",
    messageId: "om-1",
    trigger: "schedule",
    status: "failed",
    matchedCount: 1,
    attempts: 1,
    queuedAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    nextRetryAt,
    agentId: null,
    error: "failed",
  };
}

describe("Argos failure policy", () => {
  it("keeps permission and validation failures pending instead of retrying them", () => {
    expect(
      classifyArgosExecutionFailure({
        error: new Error("missing scope"),
        message: "缺少权限 base:record:read",
        task: task("2026-09-09T00:05:00.000Z"),
      }),
    ).toMatchObject({ disposition: "pending" });
    expect(
      classifyArgosExecutionFailure({
        error: new Error("validation"),
        message: "Argos 结果目录未通过 close 门禁：evidence_items_missing",
        task: task("2026-09-09T00:05:00.000Z"),
      }),
    ).toMatchObject({ disposition: "pending" });
  });

  it("only schedules bounded retries for transient external failures", () => {
    expect(
      classifyArgosExecutionFailure({
        error: new Error("HTTP 429"),
        message: "HTTP 429 rate limit",
        task: task("2026-09-09T00:05:00.000Z"),
      }),
    ).toMatchObject({ disposition: "retry" });
    expect(
      classifyArgosExecutionFailure({
        error: new Error("HTTP 429"),
        message: "HTTP 429 rate limit",
        task: task(null),
      }),
    ).toMatchObject({ disposition: "failed" });
  });
});
