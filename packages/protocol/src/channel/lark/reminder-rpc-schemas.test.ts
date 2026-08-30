import { describe, expect, it } from "vitest";
import {
  LarkReminderCreateRequestSchema,
  LarkReminderListResponseSchema,
  LarkReminderUpdateRequestSchema,
} from "./reminder-rpc-schemas.js";

describe("Lark reminder RPC schemas", () => {
  it("accepts a bot-authored reminder with a safe minimum cadence", () => {
    const request = LarkReminderCreateRequestSchema.parse({
      type: "channel.lark.reminder.create.request",
      requestId: "request-1",
      botId: "bot-1",
      chatId: "oc_team",
      targetOpenIds: ["ou_alice", "ou_bob"],
      message: "请回复确认",
      frequencySeconds: 60,
      sender: { type: "bot" },
    });
    expect(request.enabled).toBe(true);
    expect(request.targetOpenIds).toEqual(["ou_alice", "ou_bob"]);
  });

  it("accepts a user-authored reminder without exposing token configuration", () => {
    const request = LarkReminderCreateRequestSchema.parse({
      type: "channel.lark.reminder.create.request",
      requestId: "request-2",
      botId: "bot-1",
      chatId: "oc_team",
      targetOpenIds: ["ou_alice"],
      message: "请回复确认",
      frequencySeconds: 60,
      sender: { type: "user" },
    });
    expect(request.sender).toEqual({ type: "user" });
  });

  it("drops the legacy environment variable field from older clients", () => {
    const request = LarkReminderCreateRequestSchema.parse({
      type: "channel.lark.reminder.create.request",
      requestId: "request-legacy",
      botId: "bot-1",
      chatId: "oc_team",
      targetOpenIds: ["ou_alice"],
      message: "请回复确认",
      frequencySeconds: 60,
      sender: { type: "user", userAccessTokenEnv: "LARK_USER_ACCESS_TOKEN" },
    });
    expect(request.sender).toEqual({ type: "user" });
  });

  it("accepts updates for an existing reminder", () => {
    const request = LarkReminderUpdateRequestSchema.parse({
      type: "channel.lark.reminder.update.request",
      requestId: "request-update",
      reminderId: "reminder-1",
      name: "更新后的提醒",
      botId: "bot-1",
      chatId: "oc_team",
      targetOpenIds: ["ou_alice"],
      message: "请重新确认",
      frequencySeconds: 300,
      sender: { type: "bot" },
    });
    expect(request.reminderId).toBe("reminder-1");
    expect(request.message).toBe("请重新确认");
  });

  it("returns persisted reminder state", () => {
    const response = LarkReminderListResponseSchema.parse({
      type: "channel.lark.reminder.list.response",
      payload: {
        requestId: "request-3",
        reminders: [
          {
            id: "reminder-1",
            name: "等待确认",
            botId: "bot-1",
            chatId: "oc_team",
            targetOpenIds: ["ou_alice"],
            message: "请回复确认",
            frequencySeconds: 300,
            sender: { type: "bot" },
            status: "active",
            createdAt: "2026-08-18T08:00:00.000Z",
            updatedAt: "2026-08-18T08:00:00.000Z",
            startedAt: "2026-08-18T08:00:00.000Z",
            completedAt: null,
            lastSentAt: null,
            nextRunAt: "2026-08-18T08:00:00.000Z",
            sendCount: 0,
            lastError: null,
            reply: null,
          },
        ],
        error: null,
      },
    });
    expect(response.payload.reminders[0]?.status).toBe("active");
  });
});
