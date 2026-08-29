/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  InstructionTemplateEditorPage,
  InstructionTemplatesListPage,
} from "./instruction-templates-section";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const daemonState = vi.hoisted(() => ({
  config: {
    instructionTemplates: [
      {
        id: "review",
        name: "代码审核",
        description: "检查本次改动",
        content: "请审核 {{branch}}",
      },
      {
        id: "release",
        name: "发布检查",
        content: "检查发布条件",
      },
    ],
  } as MutableDaemonConfig,
  patchConfig: vi.fn(),
}));

const toast = vi.hoisted(() => ({ show: vi.fn() }));

vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    testID,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
    testID?: string;
  }) => (
    <button type="button" aria-label={accessibilityLabel} data-testid={testID} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { id?: string }) => {
      if (key.endsWith("validation.incomplete")) return "模板信息不完整";
      if (key.endsWith("validation.duplicateId")) return `模板 ID 重复：${options?.id}`;
      if (key.endsWith("actions.saved")) return "已保存";
      return key;
    },
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
    testID,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    testID?: string;
  }) => (
    <button type="button" data-testid={testID} disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/text-input", () => ({
  EditingTextInput: ({
    value,
    onChangeText,
    multiline,
    testID,
  }: {
    value?: string;
    onChangeText?: (value: string) => void;
    multiline?: boolean;
    testID?: string;
  }) =>
    React.createElement(multiline ? "textarea" : "input", {
      value,
      "data-testid": testID,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onChangeText?.(event.currentTarget.value),
    }),
}));

vi.mock("@/contexts/toast-context", () => ({
  useToast: () => toast,
}));

vi.mock("@/hooks/use-daemon-config", () => ({
  useDaemonConfig: () => ({
    config: daemonState.config,
    isLoading: false,
    patchConfig: daemonState.patchConfig,
  }),
}));

vi.mock("@/screens/settings/settings-section", () => ({
  SettingsSection: ({
    title,
    trailing,
    children,
  }: {
    title: string;
    trailing?: ReactNode;
    children?: ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {trailing}
      {children}
    </section>
  ),
}));

vi.mock("@/utils/confirm-dialog", () => ({
  confirmDialog: vi.fn(async () => true),
}));

beforeEach(() => {
  daemonState.patchConfig.mockReset();
  daemonState.patchConfig.mockResolvedValue(daemonState.config);
  toast.show.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("global instruction template pages", () => {
  test("shows the template array and opens the selected template", () => {
    const onEdit = vi.fn();
    render(<InstructionTemplatesListPage serverId="host-1" onCreate={vi.fn()} onEdit={onEdit} />);

    expect(screen.getByText("代码审核")).toBeTruthy();
    expect(screen.getByText("发布检查")).toBeTruthy();

    fireEvent.click(screen.getByTestId("instruction-template-row-review"));
    expect(onEdit).toHaveBeenCalledWith("review");
  });

  test("loads, edits, and saves one template without replacing the others", async () => {
    const onDone = vi.fn();
    render(<InstructionTemplateEditorPage serverId="host-1" templateId="review" onDone={onDone} />);

    await waitFor(() => {
      expect((screen.getByTestId("instruction-template-name") as HTMLInputElement).value).toBe(
        "代码审核",
      );
    });

    fireEvent.change(screen.getByTestId("instruction-template-name"), {
      target: { value: "变更审核" },
    });
    fireEvent.change(screen.getByTestId("instruction-template-content"), {
      target: { value: "审核当前改动" },
    });
    fireEvent.click(screen.getByTestId("save-instruction-template"));

    await waitFor(() => {
      expect(daemonState.patchConfig).toHaveBeenCalledWith({
        instructionTemplates: [
          {
            id: "review",
            name: "变更审核",
            description: "检查本次改动",
            content: "审核当前改动",
          },
          {
            id: "release",
            name: "发布检查",
            content: "检查发布条件",
          },
        ],
      });
    });
    expect(onDone).toHaveBeenCalled();
  });
});
