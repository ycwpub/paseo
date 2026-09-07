import { describe, expect, it } from "vitest";
import {
  LarkSubstituteTaskDeleteRequestSchema,
  LarkSubstituteTaskListResponseSchema,
  LarkSubstituteTaskPauseRequestSchema,
  LarkSubstituteTaskScanResponseSchema,
} from "./substitute-task-rpc-schemas.js";

const task = {
  id: "task_1",
  modeId: "mode_1",
  modeName: "测试替身",
  botId: "bot_1",
  source: "group_listener",
  chatId: "oc_chat",
  chatName: "研发群",
  messageId: "om_message",
  senderOpenId: "ou_user",
  senderName: "张三",
  content: "帮我看一下",
  status: "pending",
  scheduledAt: "2026-09-07T06:00:00.000Z",
  startedAt: null,
  completedAt: null,
  agentId: null,
  error: null,
  createdAt: "2026-09-07T05:50:00.000Z",
  updatedAt: "2026-09-07T05:50:00.000Z",
};

describe("Lark substitute task RPC schemas", () => {
  it("parses task lists with source and lifecycle state", () => {
    const response = LarkSubstituteTaskListResponseSchema.parse({
      type: "channel.lark.substitute_task.list.response",
      payload: { requestId: "req_1", tasks: [task], error: null },
    });

    expect(response.payload.tasks[0]).toMatchObject({
      source: "group_listener",
      status: "pending",
      failureStage: null,
    });
  });

  it("accepts bounded batch pause and delete requests", () => {
    expect(
      LarkSubstituteTaskPauseRequestSchema.parse({
        type: "channel.lark.substitute_task.pause.request",
        requestId: "req_pause",
        taskIds: ["task_1", "task_2"],
      }).taskIds,
    ).toHaveLength(2);
    expect(
      LarkSubstituteTaskDeleteRequestSchema.parse({
        type: "channel.lark.substitute_task.delete.request",
        requestId: "req_delete",
        taskIds: ["task_1"],
      }).taskIds,
    ).toEqual(["task_1"]);
  });

  it("parses immediate scan summaries with the refreshed task list", () => {
    const response = LarkSubstituteTaskScanResponseSchema.parse({
      type: "channel.lark.substitute_task.scan.response",
      payload: {
        requestId: "req_scan",
        enabledModeCount: 2,
        groupScanCount: 1,
        privateScanCount: 2,
        tasks: [task],
        error: null,
      },
    });

    expect(response.payload).toMatchObject({
      enabledModeCount: 2,
      groupScanCount: 1,
      privateScanCount: 2,
    });
  });
});
