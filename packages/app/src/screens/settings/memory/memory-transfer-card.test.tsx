/**
 * @vitest-environment jsdom
 */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Test adapters bridge native callbacks to HTML controls. */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Assistant, PaseoMemoryState } from "@getpaseo/protocol/messages";
import { MemoryTransferCard } from "./memory-transfer-card";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(async () => {}),
}));

vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: (theme: Record<string, unknown>) => unknown) =>
      factory({
        spacing: { 1: 1, 2: 2, 3: 3, 4: 4 },
        borderRadius: { lg: 8 },
        colors: {
          border: "#ddd",
          surface2: "#fff",
          foreground: "#111",
          statusDanger: "#d00",
        },
        fontSize: { sm: 12 },
      }),
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onPress,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onPress: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/select-field", () => ({
  SelectField: ({
    options,
    onChange,
  }: {
    options: Array<{ id: string; label: string; value: unknown }>;
    onChange: (value: unknown) => void;
  }) => {
    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
      const id = (event.target as HTMLElement).dataset.optionId;
      const option = options.find((candidate) => candidate.id === id);
      if (option) onChange(option.value);
    };
    return (
      <div onClick={handleClick}>
        {options.map((option) => (
          <button key={option.id} type="button" data-option-id={option.id}>
            {option.label}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    value,
    onValueChange,
  }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
  }) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(event.target.checked);
    };
    return (
      <input aria-label="替换当前记忆" type="checkbox" checked={value} onChange={handleChange} />
    );
  },
}));

vi.mock("@/components/ui/text-input", () => ({
  EditingTextInput: ({
    accessibilityLabel,
    value,
  }: {
    accessibilityLabel: string;
    value: string;
  }) => <textarea aria-label={accessibilityLabel} readOnly value={value} />,
}));

vi.mock("@/components/settings-textarea", () => ({
  SettingsTextArea: ({
    accessibilityLabel,
    value,
    onChangeText,
  }: {
    accessibilityLabel: string;
    value: string;
    onChangeText: (value: string) => void;
  }) => {
    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChangeText(event.target.value);
    };
    return <textarea aria-label={accessibilityLabel} value={value} onChange={handleChange} />;
  },
}));

vi.mock("@/styles/settings", () => ({
  settingsStyles: {
    card: {},
    rowContent: {},
    rowTitle: {},
    rowHint: {},
    rowBorder: {},
  },
}));

const memory = {
  exportJson: '{"type":"all"}',
  users: [],
  details: [],
} as unknown as PaseoMemoryState;
const assistants = [{ id: "assistant-1", name: "研发助手" }] as Assistant[];

afterEach(cleanup);

describe("MemoryTransferCard", () => {
  test("exports and imports the selected Assistant memory", async () => {
    const onExport = vi.fn(async (selection) => JSON.stringify(selection));
    const onImport = vi.fn(async () => {});
    render(
      <MemoryTransferCard
        memory={memory}
        assistants={assistants}
        disabled={false}
        onExport={onExport}
        onImport={onImport}
      />,
    );

    await waitFor(() => expect(onExport).toHaveBeenCalledWith({ type: "all" }));
    fireEvent.click(screen.getByRole("button", { name: "助手记忆 · 研发助手" }));
    await waitFor(() =>
      expect(onExport).toHaveBeenLastCalledWith({ type: "assistant", id: "assistant-1" }),
    );

    fireEvent.change(screen.getByLabelText("记忆导入 JSON"), {
      target: { value: '{"version":1}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "导入" }));

    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith('{"version":1}', false, {
        type: "assistant",
        id: "assistant-1",
      }),
    );
  });
});
