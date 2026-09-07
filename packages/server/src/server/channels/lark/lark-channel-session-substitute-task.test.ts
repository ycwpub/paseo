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

describe("LarkChannelSession substitute task RPC", () => {
  test("lists, scans, pauses and deletes tasks through the main channel session", async () => {
    let tasks = [task()];
    const service = {
      listSubstituteTasks: vi.fn(() => tasks),
      scanSubstituteTasksNow: vi.fn(async () => ({
        enabledModeCount: 2,
        groupScanCount: 1,
        privateScanCount: 2,
      })),
      pauseSubstituteTasks: vi.fn((taskIds: readonly string[]) => {
        const updatedTasks: LarkSubstituteTask[] = [];
        for (const entry of tasks) {
          updatedTasks.push(
            taskIds.includes(entry.id) ? { ...entry, status: "paused" as const } : entry,
          );
        }
        tasks = updatedTasks;
        return [...taskIds];
      }),
      deleteSubstituteTasks: vi.fn((taskIds: readonly string[]) => {
        const retainedTasks: LarkSubstituteTask[] = [];
        for (const entry of tasks) {
          if (!taskIds.includes(entry.id)) retainedTasks.push(entry);
        }
        tasks = retainedTasks;
        return [...taskIds];
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
    });
    await session.handleRequest({
      type: "channel.lark.substitute_task.scan.request",
      requestId: "scan",
    });
    await session.handleRequest({
      type: "channel.lark.substitute_task.pause.request",
      requestId: "pause",
      taskIds: ["task-1"],
    });
    await session.handleRequest({
      type: "channel.lark.substitute_task.delete.request",
      requestId: "delete",
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
        enabledModeCount: 2,
        groupScanCount: 1,
        privateScanCount: 2,
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
  });
});
