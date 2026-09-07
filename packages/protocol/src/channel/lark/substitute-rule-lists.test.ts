import { describe, expect, test } from "vitest";
import {
  DEFAULT_LARK_SUBSTITUTE_CUSTOM_PROMPT,
  DEFAULT_LARK_SUBSTITUTE_DELAY_SECONDS,
  LarkSubstituteModeCreateInputSchema,
} from "./substitute-types.js";

describe("Lark substitute split rule lists", () => {
  test("accepts independent audience and question allowlists and denylists", () => {
    const mode = LarkSubstituteModeCreateInputSchema.parse({
      name: "研发替身",
      enabled: true,
      botId: "bot-1",
      disclosure: { enabled: true, prompt: "【机器人代答】" },
      customPrompt: "",
      delaySeconds: 60,
      activeTimeRanges: [],
      audienceAllowlist: [
        { id: "user", type: "user", openId: "ou_user", name: "李四", email: "b@example.com" },
        { id: "group-ai", type: "group_ai_category", description: "研发协作群" },
        { id: "all", type: "all" },
      ],
      audienceDenylist: [{ id: "regex", type: "group_name_regex", pattern: "^闲聊" }],
      audienceAllowRuleGroups: [
        {
          id: "engineering-users",
          conversationRules: [
            { id: "group", type: "group", chatId: "oc_group", groupId: null, name: "研发群" },
            { id: "private", type: "private" },
            { id: "bot", type: "bot" },
            { id: "all", type: "all" },
          ],
          userRules: [
            { id: "all-users", type: "all_users" },
            { id: "bot-app", type: "bot_app_id", appId: "cli_alert" },
            { id: "bot-name", type: "bot_name", name: "告警机器人" },
            { id: "all-bots", type: "all_bots" },
            { id: "all-senders", type: "all" },
            {
              id: "open-id",
              type: "user_open_id",
              openId: "ou_user",
              name: "用户",
              email: "user@example.com",
            },
            {
              id: "email",
              type: "user_email",
              email: "user@example.com",
              openId: null,
              name: null,
            },
          ],
        },
      ],
      audienceDenyRuleGroups: [],
      questionAllowlist: [{ id: "question-allow", description: "研发和代码问题" }],
      questionDenylist: [{ id: "question-deny", description: "薪酬和人事问题" }],
      allowlist: [],
      denylist: [],
      target: {
        kind: "workspace",
        provider: "aiden_codex",
        model: "gpt-5.6",
        cwd: "/repo",
        workspaceId: null,
      },
    });

    expect(mode.audienceAllowlist).toHaveLength(3);
    expect(mode.audienceAllowRuleGroups).toHaveLength(1);
    expect(mode.audienceAllowRuleGroups?.[0]?.conversationRules).toHaveLength(4);
    expect(mode.audienceAllowRuleGroups?.[0]?.userRules).toHaveLength(7);
    expect(mode.questionAllowlist).toEqual([
      { id: "question-allow", description: "研发和代码问题" },
    ]);
  });

  test("defaults the substitute prompt and automatic answer delay", () => {
    const mode = LarkSubstituteModeCreateInputSchema.parse({
      name: "研发替身",
      enabled: true,
      botId: "bot-1",
      disclosure: { enabled: true, prompt: "【机器人代答】" },
      target: {
        kind: "workspace",
        provider: "aiden_codex",
        model: "gpt-5.6",
        cwd: "/repo",
        workspaceId: null,
      },
    });

    expect(mode.customPrompt).toBe(DEFAULT_LARK_SUBSTITUTE_CUSTOM_PROMPT);
    expect(mode.delaySeconds).toBe(DEFAULT_LARK_SUBSTITUTE_DELAY_SECONDS);
  });
});
