import { describe, expect, test } from "vitest";
import { LarkSubstituteModeCreateInputSchema } from "./substitute-types.js";

describe("Lark substitute split rule lists", () => {
  test("accepts independent audience and question allowlists and denylists", () => {
    const mode = LarkSubstituteModeCreateInputSchema.parse({
      name: "研发替身",
      enabled: true,
      botId: "bot-1",
      substituteUser: { openId: "ou_target", name: "张三", email: "a@example.com" },
      privateReplyIdentity: "user",
      groupReplyIdentity: "bot",
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
    expect(mode.questionAllowlist).toEqual([
      { id: "question-allow", description: "研发和代码问题" },
    ]);
  });
});
