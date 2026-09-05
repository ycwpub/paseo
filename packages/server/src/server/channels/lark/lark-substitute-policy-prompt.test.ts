import { describe, expect, test } from "vitest";
import { formatLarkSubstitutePrompt } from "./lark-message-format.js";

describe("formatLarkSubstitutePrompt policy lists", () => {
  test("requires both audience AI classification and question classification to pass", () => {
    const prompt = formatLarkSubstitutePrompt("用户问题", {
      source: "configured_target",
      configuredTarget: { openId: "ou_target", name: "张三" },
      observedMention: {
        key: "@_user_1",
        name: "张三",
        openId: "ou_target",
        userId: null,
        appId: null,
        idType: "open_id",
      },
      groupAllowRules: ["研发协作群"],
      groupDenyRules: ["闲聊群"],
      questionAllowRules: ["研发和代码问题"],
      questionDenyRules: ["人事和薪酬问题"],
      groupContext: { chatId: "oc_group", name: "研发一群" },
    });

    expect(prompt).toContain('<group chat_id="oc_group" name="研发一群" />');
    expect(prompt).toContain("<allow>研发协作群</allow>");
    expect(prompt).toContain("<deny>闲聊群</deny>");
    expect(prompt).toContain("<allow>研发和代码问题</allow>");
    expect(prompt).toContain("<deny>人事和薪酬问题</deny>");
    expect(prompt.match(/<paseo-no-substitute-answer \/>/gu)).toHaveLength(2);
  });
});
