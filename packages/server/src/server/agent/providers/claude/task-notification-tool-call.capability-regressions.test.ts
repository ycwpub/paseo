import { describe, expect, it } from "vitest";
import {
  coerceTaskNotificationHistoryRecordToSystemMessage,
  readTaskNotificationEnvelopeFromHistoryRecord,
} from "./task-notification-tool-call.js";
describe("task-notification-tool-call", () => {
  it("reads task and tool-use identities from queued user notifications", () => {
    const record = {
      type: "user",
      uuid: "queued-task-note",
      message: {
        content: [
          "<task-notification>",
          "<task-id>agent-task</task-id>",
          "<tool-use-id>toolu_resumed_agent_call</tool-use-id>",
          "<status>completed</status>",
          "</task-notification>",
        ].join("\n"),
      },
    };
    expect(readTaskNotificationEnvelopeFromHistoryRecord(record)).toMatchObject({
      messageId: "queued-task-note",
      taskId: "agent-task",
      toolUseId: "toolu_resumed_agent_call",
      status: "completed",
    });
  });
  it("preserves the tool-use identity when coercing queued user notifications", () => {
    const record = {
      type: "user",
      uuid: "queued-task-note",
      message: {
        content: [
          "<task-notification>",
          "<task-id>agent-task</task-id>",
          "<tool-use-id>toolu_background_bash</tool-use-id>",
          "<status>completed</status>",
          "</task-notification>",
        ].join("\n"),
      },
    };
    expect(coerceTaskNotificationHistoryRecordToSystemMessage(record)).toMatchObject({
      type: "system",
      subtype: "task_notification",
      uuid: "queued-task-note",
      task_id: "agent-task",
      tool_use_id: "toolu_background_bash",
      status: "completed",
    });
  });
});
