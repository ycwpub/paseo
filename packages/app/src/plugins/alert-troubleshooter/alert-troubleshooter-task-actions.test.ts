import { describe, expect, it, vi } from "vitest";
import type { AlertTroubleshooterTask } from "@getpaseo/protocol/messages";
import {
  deleteAllAlertTroubleshooterTasks,
  retryAlertTroubleshooterTask,
} from "./alert-troubleshooter-task-actions";

function task(
  id: string,
  overrides: Partial<AlertTroubleshooterTask> = {},
): AlertTroubleshooterTask {
  return {
    id,
    recordId: `rec_${id}`,
    uniqueId: `record_id:rec_${id}`,
    resultId: null,
    tableDate: "20260908",
    messageId: null,
    trigger: "table",
    status: "failed",
    matchedCount: 1,
    attempts: 1,
    queuedAt: "2026-09-08T10:00:00.000Z",
    updatedAt: "2026-09-08T10:01:00.000Z",
    agentId: null,
    error: "缺少 base:record:read",
    ...overrides,
  };
}

const request = {
  pluginId: "bamboo-reconciliation-troubleshooter",
  appId: "bamboo-troubleshooter-console",
  projectId: "prj_1",
};

describe("alert troubleshooter task actions", () => {
  it("verifies permission by enqueueing the failed record before removing the stale failure", async () => {
    const remaining = [task("new", { status: "queued", error: null })];
    const enqueueAlertTroubleshooterRecord = vi.fn(async () => ({
      queued: true,
      error: null,
    }));
    const deleteAlertTroubleshooterTasks = vi.fn(async () => ({
      tasks: remaining,
      error: null,
    }));

    await expect(
      retryAlertTroubleshooterTask(
        { enqueueAlertTroubleshooterRecord, deleteAlertTroubleshooterTasks },
        request,
        task("old"),
      ),
    ).resolves.toEqual(remaining);

    expect(enqueueAlertTroubleshooterRecord).toHaveBeenCalledWith({
      ...request,
      uniqueId: "record_id:20260908:rec_old",
    });
    expect(deleteAlertTroubleshooterTasks).toHaveBeenCalledWith({
      ...request,
      taskIds: ["old"],
    });
    expect(enqueueAlertTroubleshooterRecord.mock.invocationCallOrder[0]).toBeLessThan(
      deleteAlertTroubleshooterTasks.mock.invocationCallOrder[0]!,
    );
  });

  it("prefers result_id when retrying a Bamboo task", async () => {
    const enqueueAlertTroubleshooterRecord = vi.fn(async () => ({
      queued: true,
      error: null,
    }));
    const deleteAlertTroubleshooterTasks = vi.fn(async () => ({
      tasks: [],
      error: null,
    }));

    await retryAlertTroubleshooterTask(
      { enqueueAlertTroubleshooterRecord, deleteAlertTroubleshooterTasks },
      request,
      task("old", { resultId: "987654" }),
    );

    expect(enqueueAlertTroubleshooterRecord).toHaveBeenCalledWith({
      ...request,
      resultId: "987654",
    });
  });

  it("deletes every loaded execution record in protocol-sized batches", async () => {
    const tasks = Array.from({ length: 1_001 }, (_, index) => task(String(index)));
    const enqueueAlertTroubleshooterRecord = vi.fn(
      async (_input: typeof request & { uniqueId?: string; resultId?: string }) => ({
        queued: true,
        error: null,
      }),
    );
    const deleteAlertTroubleshooterTasks = vi.fn(
      async (_input: typeof request & { taskIds: string[] }) => ({
        tasks: [],
        error: null,
      }),
    );

    await expect(
      deleteAllAlertTroubleshooterTasks(
        { enqueueAlertTroubleshooterRecord, deleteAlertTroubleshooterTasks },
        request,
        tasks,
      ),
    ).resolves.toEqual([]);

    expect(deleteAlertTroubleshooterTasks).toHaveBeenCalledTimes(3);
    expect(
      deleteAlertTroubleshooterTasks.mock.calls.map(([input]) => input.taskIds.length),
    ).toEqual([500, 500, 1]);
  });
});
