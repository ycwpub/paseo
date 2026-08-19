import { describe, expect, test } from "vitest";
import {
  isReadableEnglishReasoning,
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
  test("enables translation only for readable English Aiden Claude thinking", () => {
    expect(
      shouldTranslateAidenClaudeReasoning({
        enabled: true,
        provider: "aiden-claude",
        sourceText: "I should inspect the repository.",
      }),
    ).toBe(true);
    expect(
      shouldTranslateAidenClaudeReasoning({
        enabled: true,
        provider: "aiden-codex",
        sourceText: "I should inspect the repository.",
      }),
    ).toBe(false);
  });

  test("shows Chinese text directly without starting translation", () => {
    expect(
      shouldTranslateAidenClaudeReasoning({
        enabled: true,
        provider: "aiden-claude",
        sourceText: "我先检查当前实现，再运行相关测试。",
        source: "text",
      }),
    ).toBe(false);
  });

  test("never translates a text block even when its content is English", () => {
    expect(
      shouldTranslateAidenClaudeReasoning({
        enabled: true,
        provider: "aiden-claude",
        sourceText: "I will inspect the current implementation.",
        source: "text",
      }),
    ).toBe(false);
  });

  test("translates an English native thinking block", () => {
    expect(
      shouldTranslateAidenClaudeReasoning({
        enabled: true,
        provider: "aiden-claude",
        sourceText: "I should inspect the current implementation.",
        source: "thinking",
      }),
    ).toBe(true);
  });
});

describe("isReadableEnglishReasoning", () => {
  test("accepts readable English thinking", () => {
    expect(isReadableEnglishReasoning("Let me inspect the current implementation.")).toBe(true);
  });

  test("keeps Chinese text unchanged even when it contains English technical terms", () => {
    expect(isReadableEnglishReasoning("先检查 provider 事件，再运行 npm test。")).toBe(false);
  });

  test("does not translate empty or punctuation-only content", () => {
    expect(isReadableEnglishReasoning("")).toBe(false);
    expect(isReadableEnglishReasoning("...")).toBe(false);
  });
});
