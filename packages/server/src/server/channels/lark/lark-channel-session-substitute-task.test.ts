import pino from "pino";
import { describe, expect, test, vi } from "vitest";
import type { LarkSubstituteTask } from "@getpaseo/protocol/messages";
import type { LarkChannelService } from "./lark-channel-service.js";
import { LarkChannelSession } from "./lark-channel-session.js";

function task(status: LarkSubstituteTask["status"] = "pending"): LarkSubstituteTask {
  return {
    id: "task-1",
    modeId: "mode-1",
    modeName: "工作替身",
    botId: "bot-1",
    source: "group_listener",
    chatId: "oc_1",
    chatName: "研发群",
    messageId: "om_1",
    senderOpenId: "ou_1",
    senderName: "张三",
    content: "请帮忙确认发布计划",
    status,
    scheduledAt: "2026-09-07T10:01:00.000Z",
    startedAt: null,
    completedAt: null,
    agentId: null,
    error: null,
    failureStage: null,
    createdAt: "2026-09-07T10:00:00.000Z",
    updatedAt: "2026-09-07T10:00:00.000Z",
  };
}

function listTasksForMode(
  tasks: readonly LarkSubstituteTask[],
  modeId?: string,
): LarkSubstituteTask[] {
  if (!modeId) return [...tasks];
  return tasks.filter((entry) => entry.modeId === modeId);
}

function includesTaskForMode(
  tasks: readonly LarkSubstituteTask[],
  taskId: string,
  modeId?: string,
): boolean {
  if (!modeId) return true;
  return tasks.some((entry) => entry.id === taskId && entry.modeId === modeId);
}

function selectTaskIdsForMode(
  tasks: readonly LarkSubstituteTask[],
  taskIds: readonly string[],
  modeId?: string,
): string[] {
  return taskIds.filter((taskId) => includesTaskForMode(tasks, taskId, modeId));
}

describe("LarkChannelSession substitute task RPC", () => {
  test("lists, scans, pauses and deletes tasks for one substitute mode", async () => {
    let tasks = [
      task(),
      {
        ...task(),
        id: "task-2",
        modeId: "mode-2",
        modeName: "另一个替身",
        messageId: "om_2",
      },
    ];
    const service = {
      listSubstituteTasks: vi.fn((modeId?: string) => listTasksForMode(tasks, modeId)),
      scanSubstituteTasksNow: vi.fn(async () => ({
        enabledModeCount: 1,
        groupScanCount: 1,
        privateScanCount: 1,
      })),
      pauseSubstituteTasks: vi.fn((taskIds: readonly string[], modeId?: string) => {
        const updatedTasks: LarkSubstituteTask[] = [];
        for (const entry of tasks) {
          updatedTasks.push(
            taskIds.includes(entry.id) && (!modeId || entry.modeId === modeId)
              ? { ...entry, status: "paused" as const }
              : entry,
          );
        }
        tasks = updatedTasks;
        return selectTaskIdsForMode(tasks, taskIds, modeId);
      }),
      deleteSubstituteTasks: vi.fn((taskIds: readonly string[], modeId?: string) => {
        const retainedTasks: LarkSubstituteTask[] = [];
        const deletedTaskIds: string[] = [];
        for (const entry of tasks) {
          if (taskIds.includes(entry.id) && (!modeId || entry.modeId === modeId)) {
            deletedTaskIds.push(entry.id);
          } else {
            retainedTasks.push(entry);
          }
        }
        tasks = retainedTasks;
        return deletedTaskIds;
      }),
    } as unknown as LarkChannelService;
    const emit = vi.fn();
    const session = new LarkChannelSession({
      host: { emit },
      service,
      logger: pino({ level: "silent" }),
    });

    await session.handleRequest({
      type: "channel.lark.substitute_task.list.request",
      requestId: "list",
      modeId: "mode-1",
    });
    await session.handleRequest({
      type: "channel.lark.substitute_task.scan.request",
      requestId: "scan",
      modeId: "mode-1",
    });
    await session.handleRequest({
      type: "channel.lark.substitute_task.pause.request",
      requestId: "pause",
      modeId: "mode-1",
      taskIds: ["task-1"],
    });
    await session.handleRequest({
      type: "channel.lark.substitute_task.delete.request",
      requestId: "delete",
      modeId: "mode-1",
      taskIds: ["task-1"],
    });

    expect(emit).toHaveBeenCalledWith({
      type: "channel.lark.substitute_task.list.response",
      payload: { requestId: "list", tasks: [task()], error: null },
    });
    expect(emit).toHaveBeenCalledWith({
      type: "channel.lark.substitute_task.scan.response",
      payload: {
        requestId: "scan",
        enabledModeCount: 1,
        groupScanCount: 1,
        privateScanCount: 1,
        tasks: [task()],
        error: null,
      },
    });
    expect(emit).toHaveBeenCalledWith({
      type: "channel.lark.substitute_task.pause.response",
      payload: {
        requestId: "pause",
        pausedTaskIds: ["task-1"],
        tasks: [task("paused")],
        error: null,
      },
    });
    expect(emit).toHaveBeenCalledWith({
      type: "channel.lark.substitute_task.delete.response",
      payload: {
        requestId: "delete",
        deletedTaskIds: ["task-1"],
        tasks: [],
        error: null,
      },
    });
    expect(service.listSubstituteTasks).toHaveBeenCalledWith("mode-1");
    expect(service.scanSubstituteTasksNow).toHaveBeenCalledWith("mode-1");
    expect(service.pauseSubstituteTasks).toHaveBeenCalledWith(["task-1"], "mode-1");
    expect(service.deleteSubstituteTasks).toHaveBeenCalledWith(["task-1"], "mode-1");
  });
});
