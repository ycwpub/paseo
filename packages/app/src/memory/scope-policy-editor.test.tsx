/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaseoMemoryState } from "@getpaseo/protocol/messages";
import { MemoryScopePolicyEditor, type MemoryScopePolicyEditorCopy } from "./scope-policy-editor";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const memoryState = vi.hoisted(() => ({
  memory: {
    settings: { enabled: true },
    scopePolicies: [
      {
        scope: { type: "global" as const, id: "default" },
        enabled: true,
        extractionInstructions: "已保存规范",
      },
    ],
  } as unknown as PaseoMemoryState,
  updateMemory: vi.fn(async () => undefined),
}));

vi.mock("react-native", () => ({
  View: ({ children, testID }: { children?: ReactNode; testID?: string }) => (
    <div data-testid={testID}>{children}</div>
  ),
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: (theme: Record<string, unknown>) => unknown) =>
      factory({
        spacing: { 2: 8, 3: 12, 4: 16 },
        colors: { palette: { green: { 500: "#0a0" } } },
        fontSize: { sm: 13 },
      }),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/styles/settings", () => ({
  settingsStyles: {
    card: {},
    row: {},
    rowBorder: {},
    rowContent: {},
    rowHint: {},
    rowTitle: {},
  },
}));

vi.mock("@/hooks/use-memory", () => ({
  useMemory: () => ({
    memory: memoryState.memory,
    isLoading: false,
    isConnected: true,
    updateMemory: memoryState.updateMemory,
    isMutating: false,
  }),
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ title, description }: { title: string; description: string }) => (
    <div>
      {title}: {description}
    </div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onPress,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onPress?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    value,
    onValueChange,
    accessibilityLabel,
  }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    accessibilityLabel: string;
  }) => {
    const handleChange = React.useCallback(() => {
      onValueChange(!value);
    }, [onValueChange, value]);
    return (
      <input
        type="checkbox"
        checked={value}
        aria-label={accessibilityLabel}
        onChange={handleChange}
      />
    );
  },
}));

vi.mock("@/components/settings-textarea", () => ({
  SettingsTextArea: ({
    value,
    onChangeText,
    accessibilityLabel,
  }: {
    value: string;
    onChangeText: (value: string) => void;
    accessibilityLabel: string;
  }) => {
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChangeText(event.currentTarget.value);
      },
      [onChangeText],
    );
    return <textarea aria-label={accessibilityLabel} value={value} onChange={handleChange} />;
  },
}));

const scope = { type: "global" as const, id: "default" };
const copy: MemoryScopePolicyEditorCopy = {
  enabledTitle: "全局记忆",
  enabledHint: "启用全局记忆",
  instructionsTitle: "保存哪些信息",
  instructionsHint: "输入记忆规范",
  instructionsPlaceholder: "例如：保存长期信息",
  save: "保存规范",
  saving: "保存中",
  saved: "已保存",
  saveError: "保存失败",
};

describe("MemoryScopePolicyEditor", () => {
  afterEach(cleanup);

  it("keeps an unsaved draft when unrelated memory state refreshes", () => {
    const editor = (
      <MemoryScopePolicyEditor serverId="server" scope={scope} copy={copy} testID="policy" />
    );
    const { rerender } = render(editor);
    const input = screen.getByRole("textbox", { name: "保存哪些信息" });

    fireEvent.change(input, { target: { value: "尚未保存的新规范" } });
    expect((input as HTMLTextAreaElement).value).toBe("尚未保存的新规范");

    memoryState.memory = { ...memoryState.memory };
    rerender(editor);

    expect((input as HTMLTextAreaElement).value).toBe("尚未保存的新规范");
  });
});
