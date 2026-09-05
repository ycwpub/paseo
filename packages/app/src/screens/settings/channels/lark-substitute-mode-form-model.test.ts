import { describe, expect, test } from "vitest";
import type { LarkChannelBotStatus } from "@getpaseo/protocol/messages";
import {
  buildSubstituteModeInput,
  createSubstituteModeFormState,
} from "./lark-substitute-mode-form-model";

describe("createSubstituteModeFormState", () => {
  test("defaults new substitute modes to a 60 second delay and weekdays 1 through 7", () => {
    const form = createSubstituteModeFormState(null, []);
    expect(form.delaySeconds).toBe("60");
    expect(form.weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("persists the four independent rule lists and clears legacy mixed lists", () => {
    const form = createSubstituteModeFormState(null, []);
    form.name = "研发替身";
    form.botId = "bot-1";
    form.openId = "ou_target";
    form.provider = "aiden_codex";
    form.model = "gpt-5.6";
    form.cwd = "/repo";
    form.audienceAllowlist = [{ id: "all", type: "all" }];
    form.audienceDenylist = [{ id: "group-ai", type: "group_ai_category", description: "闲聊群" }];
    form.questionAllowlist = [{ id: "question-allow", description: "研发问题" }];
    form.questionDenylist = [{ id: "question-deny", description: "人事问题" }];
    const selectedBot = {
      id: "bot-1",
      appId: "cli_test",
    } as LarkChannelBotStatus;

    const input = buildSubstituteModeInput({
      form,
      selectedBot,
      directoryUsers: [
        {
          appId: "cli_test",
          openId: "ou_target",
          displayName: "张三",
          email: "zhangsan@example.com",
          updatedAt: "2026-09-05T00:00:00.000Z",
        },
      ],
    });

    expect(input.audienceAllowlist).toEqual([{ id: "all", type: "all" }]);
    expect(input.audienceDenylist).toEqual([
      { id: "group-ai", type: "group_ai_category", description: "闲聊群" },
    ]);
    expect(input.questionAllowlist).toEqual([{ id: "question-allow", description: "研发问题" }]);
    expect(input.questionDenylist).toEqual([{ id: "question-deny", description: "人事问题" }]);
    expect(input.allowlist).toEqual([]);
    expect(input.denylist).toEqual([]);
  });

  test("allows an empty Project so the editor can create one from the mode name", () => {
    const form = createSubstituteModeFormState(null, []);
    form.name = "研发替身";
    form.botId = "bot-1";
    form.openId = "ou_target";
    form.provider = "aiden_codex";
    form.model = "gpt-5.6";
    form.cwd = "";

    const input = buildSubstituteModeInput({
      form,
      selectedBot: { id: "bot-1", appId: "cli_test" } as LarkChannelBotStatus,
      directoryUsers: [],
    });

    expect(input.target.cwd).toBe("");
  });
});
