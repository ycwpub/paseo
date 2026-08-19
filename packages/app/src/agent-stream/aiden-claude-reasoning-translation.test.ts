import { describe, expect, test } from "vitest";
import {
  resolveReasoningTranslationDisplayText,
  shouldTranslateAidenClaudeReasoning,
} from "./aiden-claude-reasoning-translation";

const base = {
  enabled: true,
  supported: true,
  connected: true,
  sourceText: "I should inspect the repository.",
  sourceIsSettled: true,
  isPending: false,
  isError: false,
  translatingText: "正在翻译思考过程…",
  failedText: "思考过程翻译失败。",
  unavailableText: "当前 Paseo 服务不支持思考翻译。",
};

describe("resolveReasoningTranslationDisplayText", () => {
  test("shows the original reasoning unchanged when translation is disabled", () => {
    expect(
      resolveReasoningTranslationDisplayText({
        ...base,
        enabled: false,
      }),
    ).toBe(base.sourceText);
  });

  test("never exposes the English source while translation is pending", () => {
    const displayText = resolveReasoningTranslationDisplayText({
      ...base,
      sourceIsSettled: false,
      isPending: true,
    });

    expect(displayText).toBe(base.translatingText);
    expect(displayText).not.toContain(base.sourceText);
  });

  test("shows only the translated Chinese text after translation succeeds", () => {
    expect(
      resolveReasoningTranslationDisplayText({
        ...base,
        translatedText: "我应该检查代码仓库。",
      }),
    ).toBe("我应该检查代码仓库。");
  });

  test("does not leak the source when translation fails or is unsupported", () => {
    expect(
      resolveReasoningTranslationDisplayText({
        ...base,
        isError: true,
      }),
    ).toBe(base.failedText);
    expect(
      resolveReasoningTranslationDisplayText({
        ...base,
        supported: false,
      }),
    ).toBe(base.unavailableText);
  });
});

describe("shouldTranslateAidenClaudeReasoning", () => {
  test("enables translation only for Aiden Claude", () => {
    expect(
      shouldTranslateAidenClaudeReasoning({
        enabled: true,
        provider: "aiden-claude",
      }),
    ).toBe(true);
    expect(
      shouldTranslateAidenClaudeReasoning({
        enabled: true,
        provider: "aiden-codex",
      }),
    ).toBe(false);
  });
});
