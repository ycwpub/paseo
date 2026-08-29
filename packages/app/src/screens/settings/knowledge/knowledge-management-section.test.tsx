/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { KnowledgeManagementSection } from "./knowledge-management-section";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
afterEach(cleanup);

const assistantState = vi.hoisted(() => ({
  assistant: {
    id: "assistant-1",
    name: "研发助手",
    description: "负责研发任务",
    prompt: "完成研发任务。",
    memoryEnabled: false,
    memory: "",
    memorySummary: "",
    memoryFiles: { summaryPath: "", detailFiles: [] },
    knowledge: {
      general: [
        {
          type: "local-directory" as const,
          source: "references",
          enabled: true,
        },
      ],
      standards: [],
    },
    resourceSelection: {
      mode: "all-enabled" as const,
      selectedMcpServerIds: [],
      selectedSkillIds: [],
    },
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
  },
  updateAssistant: vi.fn(),
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
        spacing: { 3: 12, 4: 16, 8: 32 },
        fontSize: { sm: 13 },
        fontWeight: { normal: "400" },
        borderRadius: { lg: 8 },
        colors: { foregroundMuted: "#666" },
      }),
  },
}));

vi.mock("lucide-react-native", () => ({
  Save: () => null,
}));

vi.mock("@/screens/settings/settings-section", () => ({
  SettingsSection: ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

vi.mock("@/screens/settings/shared/host-resource-sync-card", () => ({
  HostResourceSyncCard: () => null,
}));

vi.mock("@/components/ui/segmented-control", async () => {
  const ReactModule = await import("react");
  function SegmentOption({
    option,
    onValueChange,
  }: {
    option: { value: string; label: string; testID?: string };
    onValueChange: (value: string) => void;
  }) {
    const select = ReactModule.useCallback(
      () => onValueChange(option.value),
      [onValueChange, option.value],
    );
    return (
      <button type="button" data-testid={option.testID} onClick={select}>
        {option.label}
      </button>
    );
  }
  return {
    SegmentedControl: ({
      options,
      onValueChange,
    }: {
      options: Array<{ value: string; label: string; testID?: string }>;
      onValueChange: (value: string) => void;
    }) => (
      <div>
        {options.map((option) => (
          <SegmentOption key={option.value} option={option} onValueChange={onValueChange} />
        ))}
      </div>
    ),
  };
});

vi.mock("@/components/ui/select-field", () => ({
  SelectField: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
    testID,
  }: {
    children: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    testID?: string;
  }) => (
    <button type="button" disabled={disabled} data-testid={testID} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ title, description }: { title: string; description: string }) => (
    <div>
      {title} {description}
    </div>
  ),
}));

vi.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({ projects: [], isLoading: false }),
}));

vi.mock("@/hooks/use-assistants", () => ({
  useAssistants: () => ({
    assistants: [assistantState.assistant],
    isLoading: false,
    isConnected: true,
    error: null,
    createAssistant: vi.fn(),
    updateAssistant: assistantState.updateAssistant,
    deleteAssistant: vi.fn(),
    isMutating: false,
    mutationError: null,
  }),
}));

vi.mock("@/runtime/host-features", () => ({
  useHostFeature: () => true,
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => null,
}));

vi.mock("@/screens/settings/host-knowledge/host-knowledge-section", () => ({
  HostKnowledgeSection: () => <div>全局知识内容</div>,
}));

vi.mock("@/projects/knowledge/editor", async () => {
  const ReactModule = await import("react");
  return {
    ProjectKnowledgeEditor: ({
      title,
      onChange,
    }: {
      title: string;
      onChange: (value: {
        general: Array<{
          id: string;
          type: "local-document";
          source: string;
          enabled: boolean;
          rawEntry: undefined;
        }>;
        standards: [];
        projectSpecific: [];
      }) => void;
    }) => {
      const change = ReactModule.useCallback(
        () =>
          onChange({
            general: [
              {
                id: "knowledge-1",
                type: "local-document",
                source: "assistant.md",
                enabled: true,
                rawEntry: undefined,
              },
            ],
            standards: [],
            projectSpecific: [],
          }),
        [onChange],
      );
      return (
        <div>
          <span>{title}</span>
          <button type="button" onClick={change}>
            修改知识
          </button>
        </div>
      );
    },
  };
});

describe("KnowledgeManagementSection", () => {
  test("manages knowledge for the selected Assistant", async () => {
    assistantState.updateAssistant.mockReset();
    assistantState.updateAssistant.mockResolvedValue(assistantState.assistant);
    render(<KnowledgeManagementSection serverId="server-1" />);

    fireEvent.click(screen.getByTestId("knowledge-scope-assistant"));
    expect(screen.getByText("选择助手")).toBeTruthy();
    expect(screen.getByText("研发助手 · 助手知识")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "修改知识" }));
    fireEvent.click(screen.getByTestId("assistant-knowledge-save"));

    await waitFor(() =>
      expect(assistantState.updateAssistant).toHaveBeenCalledWith({
        id: "assistant-1",
        knowledge: {
          general: [{ type: "local-document", source: "assistant.md", enabled: true }],
          standards: [],
        },
      }),
    );
  });
});
