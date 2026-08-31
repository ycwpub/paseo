/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PresentedChatOutlinePrompt } from "./loaded-prompt-model";
import { createActivePromptPublisher } from "./model";
import { ChatOutlineRail } from "./rail.web";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock("react-native", () => ({
  Pressable: ({
    accessibilityLabel,
    children,
    onBlur,
    onFocus,
    onPress,
    testID,
  }: {
    accessibilityLabel?: string;
    children?: ReactNode;
    onBlur?: () => void;
    onFocus?: () => void;
    onPress?: () => void;
    testID?: string;
  }) => (
    <button
      aria-label={accessibilityLabel}
      data-testid={testID}
      onBlur={onBlur}
      onClick={onPress}
      onFocus={onFocus}
      type="button"
    >
      {children}
    </button>
  ),
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children, testID, ...props }: { children?: ReactNode; testID?: string }) => (
    <div data-testid={testID} {...props}>
      {children}
    </div>
  ),
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: (theme: Record<string, unknown>) => unknown) =>
      factory({
        spacing: { 1: 4, 2: 8, 3: 12 },
        borderRadius: { base: 4, lg: 8, full: 999 },
        borderWidth: { 1: 1 },
        fontSize: { xs: 11, sm: 13 },
        fontWeight: { medium: "500", semibold: "600" },
        shadow: { md: {} },
        colors: {
          border: "#ddd",
          borderAccent: "#aaa",
          foreground: "#111",
          foregroundMuted: "#666",
          surface2: "#fff",
        },
      }),
  },
}));

vi.mock("react-native-reanimated", () => ({
  useReducedMotion: () => false,
}));

vi.mock("@/hooks/use-container-width", () => ({
  useContainerWidthBelow: () => ({ onLayout: vi.fn(), isBelow: false }),
}));

vi.mock("@/styles/unistyles-inline-style", () => ({
  inlineUnistylesStyle: (style: unknown) => style,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "agentStream.chatOutline.question": "问题",
        "agentStream.chatOutline.answer": "回答",
        "agentStream.chatOutline.model": "模型",
        "agentStream.chatOutline.time": "时间",
        "agentStream.chatOutline.pendingAnswer": "等待回答",
        "agentStream.chatOutline.unknownModel": "未知模型",
      })[key] ?? key,
    i18n: { language: "zh-CN", resolvedLanguage: "zh-CN" },
  }),
}));

describe("ChatOutlineRail", () => {
  afterEach(cleanup);

  it("shows the question, answer, model, and time in the focused prompt card", () => {
    const prompts: PresentedChatOutlinePrompt[] = [
      {
        seq: 7,
        timestamp: "saved-time",
        preview: "如何修复连接超时？",
        answerPreview: "已增加重连退避并修复连接状态。",
        model: "gpt-5.6",
      },
    ];
    render(
      <ChatOutlineRail
        prompts={prompts}
        activePrompt={createActivePromptPublisher()}
        onJumpToPrompt={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByTestId("chat-outline-tick-7"));

    const preview = screen.getByTestId("chat-outline-preview");
    expect(preview.textContent).toContain("问题");
    expect(preview.textContent).toContain("如何修复连接超时？");
    expect(preview.textContent).toContain("回答");
    expect(preview.textContent).toContain("已增加重连退避并修复连接状态。");
    expect(preview.textContent).toContain("模型");
    expect(preview.textContent).toContain("gpt-5.6");
    expect(preview.textContent).toContain("时间 · saved-time");
  });
});
