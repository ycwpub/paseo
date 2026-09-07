import { describe, expect, it } from "vitest";
import {
  LarkSubstituteModeCreateRequestSchema,
  LarkSubstituteModeListResponseSchema,
  LarkSubstituteModeUpdateRequestSchema,
} from "./substitute-rpc-schemas.js";
import { DEFAULT_LARK_SUBSTITUTE_PRIVATE_SCAN_EXCLUDE_RECENT_MINUTES } from "./substitute-types.js";

const modeInput = {
  name: "工作时间替身",
  enabled: true,
  botId: "bot-1",
  privateScan: {
    enabled: true,
    intervalMinutes: 30,
    lookbackMinutes: 60,
    excludeRecentMinutes: 20,
  },
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
  it("defaults the private scan recent exclusion window to 10 minutes", () => {
    const request = LarkSubstituteModeCreateRequestSchema.parse({
      type: "channel.lark.substitute.create.request",
      requestId: "request-default-private-scan",
      mode: {
        ...modeInput,
        privateScan: undefined,
      },
    });

    expect(request.mode.privateScan.excludeRecentMinutes).toBe(
      DEFAULT_LARK_SUBSTITUTE_PRIVATE_SCAN_EXCLUDE_RECENT_MINUTES,
    );
    expect(request.mode.privateScan.excludeRecentMinutes).toBe(10);
  });

  it("accepts all independent substitute mode settings", () => {
    const request = LarkSubstituteModeCreateRequestSchema.parse({
      type: "channel.lark.substitute.create.request",
      requestId: "request-create",
      mode: modeInput,
    });

    expect(request.mode).toMatchObject({
      privateScan: {
        intervalMinutes: 30,
        lookbackMinutes: 60,
        excludeRecentMinutes: 20,
      },
      delaySeconds: 10,
      target: {
        kind: "assistant",
        assistantId: "assistant-1",
        provider: "aiden_codex",
        model: "gpt-5.5",
      },
    });
  });

  it("requires the private scan exclusion window to be smaller than the lookback", () => {
    expect(() =>
      LarkSubstituteModeCreateRequestSchema.parse({
        type: "channel.lark.substitute.create.request",
        requestId: "request-invalid",
        mode: {
          ...modeInput,
          privateScan: { ...modeInput.privateScan, excludeRecentMinutes: 60 },
        },
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

    expect(response.payload.modes[0]?.privateScan.intervalMinutes).toBe(30);
  });
});
