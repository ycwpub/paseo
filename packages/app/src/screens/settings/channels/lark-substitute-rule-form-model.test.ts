import { describe, expect, test } from "vitest";
import type { LarkSubstituteMode } from "@getpaseo/protocol/messages";
import {
  createAudienceRuleGroup,
  createConversationRule,
  createSubstituteRuleFormLists,
  createUserRule,
  validateSubstituteRuleFormLists,
} from "./lark-substitute-rule-form-model";

function mode(overrides: Partial<LarkSubstituteMode> = {}): LarkSubstituteMode {
  return {
    id: "mode-1",
    name: "研发替身",
    enabled: true,
    botId: "bot-1",
    privateScan: {
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 60,
      excludeRecentMinutes: 20,
    },
    disclosure: { enabled: true, prompt: "【机器人代答】" },
    customPrompt: "",
    delaySeconds: 60,
    activeTimeRanges: [],
    allowlist: [],
    denylist: [],
    target: {
      kind: "workspace",
      provider: "aiden_codex",
      model: "gpt-5.6",
      cwd: "/repo",
      workspaceId: null,
    },
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("Lark substitute rule form model", () => {
  test("splits legacy audience and question rules into four lists", () => {
    const lists = createSubstituteRuleFormLists(
      mode({
        allowlist: [
          { id: "user", type: "user", openId: "ou_user", name: "李四", email: null },
          { id: "question", type: "question_type", description: "研发问题" },
        ],
        denylist: [
          { id: "group", type: "group", chatId: "oc_group", groupId: "1", name: "闲聊群" },
          { id: "question-deny", type: "question_type", description: "薪酬问题" },
        ],
      }),
    );

    expect(lists.audienceAllowRuleGroups).toEqual([
      {
        id: "legacy-user",
        conversationRules: [{ id: "user-private", type: "private" }],
        userRules: [
          {
            id: "user-name",
            type: "user_name",
            name: "李四",
            openId: "ou_user",
            email: null,
          },
        ],
      },
    ]);
    expect(lists.audienceDenyRuleGroups).toEqual([
      {
        id: "legacy-group",
        conversationRules: [
          { id: "group", type: "group", chatId: "oc_group", groupId: "1", name: "闲聊群" },
        ],
        userRules: [{ id: "group-all-senders", type: "all" }],
      },
    ]);
    expect(lists.questionAllowlist).toEqual([{ id: "question", description: "研发问题" }]);
    expect(lists.questionDenylist).toEqual([{ id: "question-deny", description: "薪酬问题" }]);
  });

  test("creates all conversation and sender types", () => {
    expect(createConversationRule("group")).toMatchObject({ type: "group", chatId: "" });
    expect(createConversationRule("group_ai_category")).toMatchObject({
      type: "group_ai_category",
      description: "",
    });
    expect(createConversationRule("private")).toMatchObject({ type: "private" });
    expect(createConversationRule("bot")).toMatchObject({ type: "bot" });
    expect(createConversationRule("all_groups")).toMatchObject({ type: "all_groups" });
    expect(createConversationRule("all")).toMatchObject({ type: "all" });
    expect(createConversationRule("group_name_regex")).toMatchObject({
      type: "group_name_regex",
      pattern: "",
    });
    expect(createUserRule("all_users")).toMatchObject({ type: "all_users" });
    expect(createUserRule("user_name")).toMatchObject({ type: "user_name", name: "" });
    expect(createUserRule("user_email")).toMatchObject({ type: "user_email", email: "" });
    expect(createUserRule("bot_app_id")).toMatchObject({ type: "bot_app_id", appId: "" });
    expect(createUserRule("all_bots")).toMatchObject({ type: "all_bots" });
    expect(createUserRule("all")).toMatchObject({ type: "all" });
    expect(createAudienceRuleGroup()).toMatchObject({
      conversationRules: [{ type: "group" }],
      userRules: [{ type: "all_users" }],
    });
  });

  test("requires both layers and validates their values", () => {
    expect(() =>
      validateSubstituteRuleFormLists({
        audienceAllowRuleGroups: [
          {
            id: "missing-user",
            conversationRules: [{ id: "private", type: "private" }],
            userRules: [],
          },
        ],
        audienceDenyRuleGroups: [],
        questionAllowlist: [],
        questionDenylist: [],
      }),
    ).toThrow("至少需要一条第二层规则");

    expect(() =>
      validateSubstituteRuleFormLists({
        audienceAllowRuleGroups: [
          {
            id: "invalid-regex",
            conversationRules: [{ id: "regex", type: "group_name_regex", pattern: "[" }],
            userRules: [{ id: "all-users", type: "all_users" }],
          },
        ],
        audienceDenyRuleGroups: [],
        questionAllowlist: [],
        questionDenylist: [],
      }),
    ).toThrow("正则表达式无效");

    expect(() =>
      validateSubstituteRuleFormLists({
        audienceAllowRuleGroups: [
          {
            id: "invalid-email",
            conversationRules: [{ id: "private", type: "private" }],
            userRules: [
              {
                id: "email",
                type: "user_email",
                email: "invalid",
                openId: null,
                name: null,
              },
            ],
          },
        ],
        audienceDenyRuleGroups: [],
        questionAllowlist: [],
        questionDenylist: [],
      }),
    ).toThrow("有效的用户邮箱");

    expect(() =>
      validateSubstituteRuleFormLists({
        audienceAllowRuleGroups: [
          {
            id: "invalid-bot",
            conversationRules: [{ id: "bot", type: "bot" }],
            userRules: [{ id: "bot-app", type: "bot_app_id", appId: " " }],
          },
        ],
        audienceDenyRuleGroups: [],
        questionAllowlist: [],
        questionDenylist: [],
      }),
    ).toThrow("请输入机器人 app_id");
  });
});
