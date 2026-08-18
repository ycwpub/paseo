/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AidenClaudeProviderSettings } from "./aiden-claude-provider-settings";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const settingsState = vi.hoisted(() => ({
  translateReasoning: false,
  updateSettings: vi.fn(async () => undefined),
}));

vi.mock("react-native", () => ({
  View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
    <div data-testid={testID}>{children}</div>
  ),
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: (theme: { spacing: { 4: number } }) => unknown) =>
      factory({ spacing: { 4: 16 } }),
  },
}));

vi.mock("@/styles/settings", () => ({
  settingsStyles: {
    card: {},
    row: {},
    rowContent: {},
    rowTitle: {},
    rowHint: {},
  },
}));

vi.mock("@/hooks/use-settings", () => ({
  useAppSettings: () => ({
    settings: {
      aidenClaudeTranslateReasoningToChinese: settingsState.translateReasoning,
    },
    updateSettings: settingsState.updateSettings,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "settings.general.aidenClaudeReasoningTranslation.label":
          "Translate Aiden Claude reasoning to Chinese",
        "settings.general.aidenClaudeReasoningTranslation.description":
          "Show only the Simplified Chinese translation.",
      })[key] ?? key,
  }),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: (props: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    accessibilityLabel: string;
    testID: string;
  }) => {
    const { value, onValueChange, accessibilityLabel, testID } = props;
    const handleClick = React.useCallback(() => {
      onValueChange(!value);
    }, [onValueChange, value]);
    return (
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={accessibilityLabel}
        data-testid={testID}
        onClick={handleClick}
      />
    );
  },
}));

describe("AidenClaudeProviderSettings", () => {
  beforeEach(() => {
    settingsState.translateReasoning = false;
    settingsState.updateSettings.mockClear();
  });

  afterEach(cleanup);

  it("only renders in the Aiden Claude provider configuration", () => {
    const { rerender } = render(<AidenClaudeProviderSettings provider="aiden-codex" />);

    expect(screen.queryByTestId("aiden-claude-provider-settings")).toBeNull();

    rerender(<AidenClaudeProviderSettings provider="aiden-claude" />);

    expect(screen.getByTestId("aiden-claude-provider-settings")).toBeTruthy();
  });

  it("updates the reasoning translation preference", () => {
    render(<AidenClaudeProviderSettings provider="aiden-claude" />);

    fireEvent.click(screen.getByTestId("aiden-claude-reasoning-translation-switch"));

    expect(settingsState.updateSettings).toHaveBeenCalledWith({
      aidenClaudeTranslateReasoningToChinese: true,
    });
  });
});
