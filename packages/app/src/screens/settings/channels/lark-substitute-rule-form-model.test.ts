import { describe, expect, test } from "vitest";
import type { LarkSubstituteMode } from "@getpaseo/protocol/messages";
import {
  createAudienceRule,
  createSubstituteRuleFormLists,
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

    expect(lists.audienceAllowlist).toHaveLength(1);
    expect(lists.audienceDenylist).toHaveLength(1);
    expect(lists.questionAllowlist).toEqual([{ id: "question", description: "研发问题" }]);
    expect(lists.questionDenylist).toEqual([{ id: "question-deny", description: "薪酬问题" }]);
  });

  test("creates all five audience rule row types", () => {
    expect(createAudienceRule("user")).toMatchObject({ type: "user", openId: null });
    expect(createAudienceRule("group")).toMatchObject({ type: "group", chatId: "" });
    expect(createAudienceRule("group_ai_category")).toMatchObject({
      type: "group_ai_category",
      description: "",
    });
    expect(createAudienceRule("all")).toMatchObject({ type: "all" });
    expect(createAudienceRule("group_name_regex")).toMatchObject({
      type: "group_name_regex",
      pattern: "",
    });
  });

  test("requires stable IDs for users and groups and validates regex rules", () => {
    expect(() =>
      validateSubstituteRuleFormLists({
        audienceAllowlist: [{ id: "user", type: "user", openId: null, name: "张三", email: null }],
        audienceDenylist: [],
        questionAllowlist: [],
        questionDenylist: [],
      }),
    ).toThrow("请选择用户");

    expect(() =>
      validateSubstituteRuleFormLists({
        audienceAllowlist: [{ id: "regex", type: "group_name_regex", pattern: "[" }],
        audienceDenylist: [],
        questionAllowlist: [],
        questionDenylist: [],
      }),
    ).toThrow("正则表达式无效");
  });
});
