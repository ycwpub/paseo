import { describe, expect, it } from "vitest";
import {
  LarkSubstituteModeCreateRequestSchema,
  LarkSubstituteModeListResponseSchema,
  LarkSubstituteModeUpdateRequestSchema,
} from "./substitute-rpc-schemas.js";

const modeInput = {
  name: "工作时间替身",
  enabled: true,
  botId: "bot-1",
  substituteUser: {
    openId: "ou_target",
    name: "张三",
    email: "zhangsan@example.com",
  },
  privateReplyIdentity: "user" as const,
  groupReplyIdentity: "bot" as const,
  disclosure: {
    enabled: true,
    prompt: "【机器人代答】",
  },
  customPrompt: "只回答研发相关问题",
  delaySeconds: 10,
  activeTimeRanges: [
    {
      id: "workday",
      weekdays: [1, 2, 3, 4, 5],
      startTime: "09:00",
      endTime: "18:00",
      timezone: "Asia/Shanghai",
    },
  ],
  allowlist: [
    {
      id: "allow-group",
      type: "group_name_regex" as const,
      pattern: "^研发",
    },
  ],
  denylist: [
    {
      id: "deny-question",
      type: "question_type" as const,
      description: "人事和薪酬问题",
    },
  ],
  target: {
    kind: "assistant" as const,
    assistantId: "assistant-1",
    provider: "aiden_codex",
    model: "gpt-5.5",
    cwd: "/repo",
    workspaceId: null,
  },
};

describe("Lark substitute mode RPC schemas", () => {
  it("accepts all independent substitute mode settings", () => {
    const request = LarkSubstituteModeCreateRequestSchema.parse({
      type: "channel.lark.substitute.create.request",
      requestId: "request-create",
      mode: modeInput,
    });

    expect(request.mode).toMatchObject({
      privateReplyIdentity: "user",
      groupReplyIdentity: "bot",
      delaySeconds: 10,
      target: {
        kind: "assistant",
        assistantId: "assistant-1",
        provider: "aiden_codex",
        model: "gpt-5.5",
      },
    });
  });

  it("keeps private replies restricted to the user identity", () => {
    expect(() =>
      LarkSubstituteModeCreateRequestSchema.parse({
        type: "channel.lark.substitute.create.request",
        requestId: "request-invalid",
        mode: { ...modeInput, privateReplyIdentity: "bot" },
      }),
    ).toThrow();
  });

  it("validates time ranges when updating a mode", () => {
    expect(() =>
      LarkSubstituteModeUpdateRequestSchema.parse({
        type: "channel.lark.substitute.update.request",
        requestId: "request-update",
        modeId: "mode-1",
        mode: {
          ...modeInput,
          activeTimeRanges: [
            {
              id: "invalid",
              weekdays: [1],
              startTime: "25:00",
              endTime: "18:00",
              timezone: "Asia/Shanghai",
            },
          ],
        },
      }),
    ).toThrow();
  });

  it("returns the persisted independent mode list", () => {
    const response = LarkSubstituteModeListResponseSchema.parse({
      type: "channel.lark.substitute.list.response",
      payload: {
        requestId: "request-list",
        modes: [
          {
            id: "mode-1",
            ...modeInput,
            createdAt: "2026-09-04T00:00:00.000Z",
            updatedAt: "2026-09-04T00:00:00.000Z",
          },
        ],
        error: null,
      },
    });

    expect(response.payload.modes[0]?.substituteUser.email).toBe("zhangsan@example.com");
  });
});
