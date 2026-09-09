import { describe, expect, test } from "vitest";
import {
  DEFAULT_LARK_SUBSTITUTE_CUSTOM_PROMPT,
  DEFAULT_LARK_SUBSTITUTE_DELAY_SECONDS,
  DEFAULT_LARK_SUBSTITUTE_GROUP_SCAN_EXCLUDE_RECENT_MINUTES,
  DEFAULT_LARK_SUBSTITUTE_PRIVATE_SCAN_EXCLUDE_RECENT_MINUTES,
  type LarkChannelBotStatus,
} from "@getpaseo/protocol/messages";
import {
  buildSubstituteModeInput,
  createSubstituteModeFormState,
} from "./lark-substitute-mode-form-model";

describe("createSubstituteModeFormState", () => {
  test("uses the substitute mode defaults for new modes", () => {
    const form = createSubstituteModeFormState(null, []);
    expect(form.delaySeconds).toBe(String(DEFAULT_LARK_SUBSTITUTE_DELAY_SECONDS));
    expect(form.delaySeconds).toBe("600");
    expect(form.customPrompt).toBe(DEFAULT_LARK_SUBSTITUTE_CUSTOM_PROMPT);
    expect(form.autoArchiveAgent).toBe(false);
    expect(form.groupScanEnabled).toBe(true);
    expect(form.groupScanExcludeRecentMinutes).toBe(
      String(DEFAULT_LARK_SUBSTITUTE_GROUP_SCAN_EXCLUDE_RECENT_MINUTES),
    );
    expect(form.groupScanExcludeRecentMinutes).toBe("10");
    expect(form.privateScanExcludeRecentMinutes).toBe(
      String(DEFAULT_LARK_SUBSTITUTE_PRIVATE_SCAN_EXCLUDE_RECENT_MINUTES),
    );
    expect(form.privateScanExcludeRecentMinutes).toBe("10");
    expect(form.weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("persists two-layer audience lists and clears legacy flat lists", () => {
    const form = createSubstituteModeFormState(null, []);
    form.name = "研发替身";
    form.botId = "bot-1";
    form.provider = "aiden_codex";
    form.model = "gpt-5.6";
    form.cwd = "/repo";
    form.autoArchiveAgent = true;
    form.audienceAllowRuleGroups = [
      {
        id: "allow",
        conversationRules: [{ id: "private", type: "private" }],
        userRules: [
          {
            id: "email",
            type: "user_email",
            email: "user@example.com",
            openId: null,
            name: null,
          },
        ],
      },
    ];
    form.audienceDenyRuleGroups = [
      {
        id: "deny",
        conversationRules: [{ id: "group-ai", type: "group_ai_category", description: "闲聊群" }],
        userRules: [{ id: "all-users", type: "all_users" }],
      },
    ];
    form.questionAllowlist = [{ id: "question-allow", description: "研发问题" }];
    form.questionDenylist = [{ id: "question-deny", description: "人事问题" }];
    const selectedBot = {
      id: "bot-1",
      appId: "cli_test",
    } as LarkChannelBotStatus;

    const input = buildSubstituteModeInput({
      form,
      selectedBot,
    });

    expect(input.audienceAllowRuleGroups).toEqual(form.audienceAllowRuleGroups);
    expect(input.audienceDenyRuleGroups).toEqual(form.audienceDenyRuleGroups);
    expect(input.audienceAllowlist).toEqual([]);
    expect(input.audienceDenylist).toEqual([]);
    expect(input.questionAllowlist).toEqual([{ id: "question-allow", description: "研发问题" }]);
    expect(input.questionDenylist).toEqual([{ id: "question-deny", description: "人事问题" }]);
    expect(input.autoArchiveAgent).toBe(true);
    expect(input.groupScan).toEqual({
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 60,
      excludeRecentMinutes: 10,
    });
    expect(input.allowlist).toEqual([]);
    expect(input.denylist).toEqual([]);
  });

  test("allows an empty Project so the editor can create one from the mode name", () => {
    const form = createSubstituteModeFormState(null, []);
    form.name = "研发替身";
    form.botId = "bot-1";
    form.provider = "aiden_codex";
    form.model = "gpt-5.6";
    form.cwd = "";

    const input = buildSubstituteModeInput({
      form,
      selectedBot: { id: "bot-1", appId: "cli_test" } as LarkChannelBotStatus,
    });

    expect(input.target.cwd).toBe("");
  });
});
