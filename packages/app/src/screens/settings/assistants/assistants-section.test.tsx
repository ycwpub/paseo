/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Assistant } from "@getpaseo/protocol/messages";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AssistantMemoryEditorPage } from "./assistant-memory-editor-page";
import { AssistantEditorPage, AssistantsSection } from "./assistants-section";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 },
    borderRadius: { md: 6, lg: 8, full: 9999 },
    borderWidth: { 1: 1 },
    fontSize: { xs: 11, sm: 13, base: 15 },
    fontFamily: { mono: "monospace" },
    fontWeight: { normal: "400", medium: "500" },
    opacity: { 50: 0.5 },
    colors: {
      foreground: "#fff",
      foregroundMuted: "#aaa",
      surface1: "#111",
      surface2: "#222",
      surface3: "#333",
      border: "#444",
      borderAccent: "#555",
      accent: "#0a0",
      accentForeground: "#fff",
      destructive: "#a00",
      destructiveForeground: "#fff",
      statusDanger: "#f00",
    },
  },
}));

const assistantsState = vi.hoisted(() => ({
  current: {
    assistants: [] as Assistant[],
    createAssistant: vi.fn(),
    updateAssistant: vi.fn(),
    deleteAssistant: vi.fn(),
  },
}));

const resourceState = vi.hoisted(() => ({
  mcpServers: [
    {
      id: "mcp-a",
      name: "MCP A",
      enabled: true,
      transport: { type: "stdio" as const, command: "mcp-a" },
      createdAt: 1,
      updatedAt: 1,
      originalJson: "{}",
    },
    {
      id: "mcp-b",
      name: "MCP B",
      enabled: true,
      transport: { type: "stdio" as const, command: "mcp-b" },
      createdAt: 1,
      updatedAt: 1,
      originalJson: "{}",
    },
  ],
  skills: [
    {
      id: "skill-a",
      name: "Skill A",
      source: "user" as const,
      enabled: true,
      content: "# Skill A",
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "skill-b",
      name: "Skill B",
      source: "user" as const,
      enabled: true,
      content: "# Skill B",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
  withUnistyles:
    (Component: React.ComponentType<Record<string, unknown>>) =>
    ({
      uniProps,
      ...rest
    }: {
      uniProps?: (theme: unknown) => Record<string, unknown>;
    } & Record<string, unknown>) => {
      const themed = uniProps ? uniProps(theme) : {};
      return React.createElement(Component, { ...rest, ...themed });
    },
}));

vi.mock("@/hooks/use-assistants", () => ({
  useAssistants: () => ({
    assistants: assistantsState.current.assistants,
    isLoading: false,
    isConnected: true,
    error: null,
    createAssistant: assistantsState.current.createAssistant,
    updateAssistant: assistantsState.current.updateAssistant,
    deleteAssistant: assistantsState.current.deleteAssistant,
    isMutating: false,
    mutationError: null,
  }),
}));

vi.mock("@/screens/settings/shared/host-resource-sync-card", () => ({
  HostResourceSyncCard: () => null,
}));

vi.mock("@/hooks/use-mcp-servers", () => ({
  useMcpServers: () => ({
    servers: resourceState.mcpServers,
    isLoading: false,
    isConnected: true,
    error: null,
    createServer: vi.fn(),
    updateServer: vi.fn(),
    deleteServer: vi.fn(),
    testServer: vi.fn(),
    isMutating: false,
    mutationError: null,
  }),
}));

vi.mock("@/hooks/use-skills", () => ({
  useSkills: () => ({
    skills: resourceState.skills,
    isLoading: false,
    isConnected: true,
    error: null,
    createSkill: vi.fn(),
    updateSkill: vi.fn(),
    deleteSkill: vi.fn(),
    isMutating: false,
    mutationError: null,
  }),
}));

vi.mock("@/runtime/host-features", () => ({
  useHostFeature: () => true,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
  }: {
    children: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/form-field", () => ({
  Field: ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
    <label>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  ),
  FormTextInput: ({
    initialValue,
    placeholder,
    onChangeText,
  }: {
    initialValue?: string;
    placeholder?: string;
    onChangeText: (value: string) => void;
  }) =>
    React.createElement("input", {
      defaultValue: initialValue,
      placeholder,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        onChangeText(event.currentTarget.value),
    }),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    value,
    onValueChange,
    accessibilityLabel,
  }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    accessibilityLabel?: string;
  }) =>
    React.createElement("input", {
      type: "checkbox",
      checked: value,
      "aria-label": accessibilityLabel,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        onValueChange(event.currentTarget.checked),
    }),
}));

vi.mock("@/components/ui/select-field", () => ({
  SelectField: ({
    label,
    value,
    options,
    onChange,
    disabled,
  }: {
    label: string;
    value: number;
    options: Array<{ value: number; label: string }>;
    onChange: (value: number) => void;
    disabled?: boolean;
  }) => (
    <label>
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        // oxlint-disable-next-line react-perf/jsx-no-new-function-as-prop -- test-only DOM adapter
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

vi.mock("@/components/settings-textarea", () => ({
  SettingsTextAreaCard: ({
    value,
    onChangeText,
    placeholder,
    accessibilityLabel,
  }: {
    value: string;
    onChangeText: (value: string) => void;
    placeholder?: string;
    accessibilityLabel: string;
  }) =>
    React.createElement("textarea", {
      "aria-label": accessibilityLabel,
      value,
      placeholder,
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
        onChangeText(event.currentTarget.value),
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
    children: ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {trailing}
      {children}
    </section>
  ),
}));

function makeAssistant(overrides: Partial<Assistant> = {}): Assistant {
  return {
    id: "assistant-1",
    name: "Reviewer",
    description: "Reviews code",
    prompt: "Review carefully.",
    memoryEnabled: true,
    memory: "# Existing\nPrefer concise feedback.",
    memorySummary: "old summary",
    memoryFiles: {
      summaryPath: "/tmp/assistant-memory/summary.md",
      detailFiles: [
        {
          id: "detail-001",
          title: "Existing",
          path: "/tmp/assistant-memory/details/detail-001.md",
          charCount: 34,
          content: "# Existing\n\nPrefer concise feedback.",
        },
      ],
    },
    resourceSelection: {
      mode: "all-enabled",
      selectedMcpServerIds: [],
      selectedSkillIds: [],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("AssistantsSection", () => {
  afterEach(() => {
    cleanup();
    assistantsState.current.assistants = [];
    assistantsState.current.createAssistant.mockReset();
    assistantsState.current.updateAssistant.mockReset();
    assistantsState.current.deleteAssistant.mockReset();
    resourceState.mcpServers = [
      {
        id: "mcp-a",
        name: "MCP A",
        enabled: true,
        transport: { type: "stdio" as const, command: "mcp-a" },
        createdAt: 1,
        updatedAt: 1,
        originalJson: "{}",
      },
      {
        id: "mcp-b",
        name: "MCP B",
        enabled: true,
        transport: { type: "stdio" as const, command: "mcp-b" },
        createdAt: 1,
        updatedAt: 1,
        originalJson: "{}",
      },
    ];
    resourceState.skills = [
      {
        id: "skill-a",
        name: "Skill A",
        source: "user" as const,
        enabled: true,
        content: "# Skill A",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "skill-b",
        name: "Skill B",
        source: "user" as const,
        enabled: true,
        content: "# Skill B",
        createdAt: 1,
        updatedAt: 1,
      },
    ];
  });

  test("refreshes memory summary/detail previews after appending source memory", async () => {
    const existingAssistant = makeAssistant();
    const updatedAssistant = makeAssistant({
      memory: "# Existing\nPrefer concise feedback.\n\n# New\nMention risky migrations.",
      memorySummary: "new summary with Mention risky migrations",
      memoryFiles: {
        summaryPath: "/tmp/assistant-memory/summary.md",
        detailFiles: [
          {
            id: "detail-001",
            title: "Existing",
            path: "/tmp/assistant-memory/details/detail-001.md",
            charCount: 67,
            content: "# Existing\n\nPrefer concise feedback.\n\n# New\n\nMention risky migrations.",
          },
        ],
      },
    });
    assistantsState.current.assistants = [existingAssistant];
    assistantsState.current.updateAssistant.mockResolvedValue(updatedAssistant);

    render(<AssistantMemoryEditorPage serverId="server-1" assistantId="assistant-1" />);
    expect(screen.getByDisplayValue("old summary")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("助手记忆"), {
      target: { value: "# New\nMention risky migrations." },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存助手记忆" }));

    await waitFor(() =>
      expect(assistantsState.current.updateAssistant).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "assistant-1",
          memoryAppend: "# New\nMention risky migrations.",
        }),
      ),
    );
    const updateInput = assistantsState.current.updateAssistant.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(updateInput).not.toHaveProperty("memorySummary");
    expect(updateInput).not.toHaveProperty("memoryDetailFileEdits");
  });

  test("saves edited memory summary and detail file contents", async () => {
    const existingAssistant = makeAssistant();
    const updatedAssistant = makeAssistant({
      memorySummary: "edited summary",
      memoryFiles: {
        summaryPath: "/tmp/assistant-memory/summary.md",
        detailFiles: [
          {
            id: "detail-001",
            title: "Edited",
            path: "/tmp/assistant-memory/details/detail-001.md",
            charCount: 22,
            content: "# Edited\n\nDetail body",
          },
        ],
      },
    });
    assistantsState.current.assistants = [existingAssistant];
    assistantsState.current.updateAssistant.mockResolvedValue(updatedAssistant);

    render(<AssistantMemoryEditorPage serverId="server-1" assistantId="assistant-1" />);
    fireEvent.change(screen.getByLabelText("记忆总文件内容"), {
      target: { value: "edited summary" },
    });
    fireEvent.change(screen.getByLabelText("Memory detail file detail-001 content"), {
      target: { value: "# Edited\n\nDetail body" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存助手记忆" }));

    await waitFor(() =>
      expect(assistantsState.current.updateAssistant).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "assistant-1",
          memorySummary: "edited summary",
          memoryDetailFileEdits: [
            {
              id: "detail-001",
              content: "# Edited\n\nDetail body",
            },
          ],
        }),
      ),
    );
  });

  test("opens Assistant memory from the Assistant editor instead of editing it inline", () => {
    assistantsState.current.assistants = [makeAssistant()];
    const onOpenMemory = vi.fn();

    render(
      <AssistantEditorPage
        serverId="server-1"
        assistantId="assistant-1"
        onDone={vi.fn()}
        onOpenMemory={onOpenMemory}
      />,
    );

    expect(screen.queryByLabelText("记忆总文件内容")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "配置记忆" }));
    expect(onOpenMemory).toHaveBeenCalledWith("assistant-1");
  });

  test("paginates MCP and Skill lists independently with 10 items per page", () => {
    resourceState.mcpServers = Array.from({ length: 11 }, (_, index) => ({
      id: `mcp-${index + 1}`,
      name: `MCP ${index + 1}`,
      enabled: true,
      transport: { type: "stdio" as const, command: `mcp-${index + 1}` },
      createdAt: 1,
      updatedAt: 1,
      originalJson: "{}",
    }));
    resourceState.skills = Array.from({ length: 11 }, (_, index) => ({
      id: `skill-${index + 1}`,
      name: `Skill ${index + 1}`,
      source: "user" as const,
      enabled: true,
      content: `# Skill ${index + 1}`,
      createdAt: 1,
      updatedAt: 1,
    }));

    render(<AssistantEditorPage serverId="server-1" onDone={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("使用所有已启用的助手资源"));

    expect(screen.getByText("MCP 10")).toBeTruthy();
    expect(screen.queryByText("MCP 11")).toBeNull();
    expect(screen.getByText("Skill 10")).toBeTruthy();
    expect(screen.queryByText("Skill 11")).toBeNull();

    const nextButtons = screen.getAllByRole("button", { name: /^(下一页|Next)$/ });
    fireEvent.click(nextButtons[0]!);
    expect(screen.getByText("MCP 11")).toBeTruthy();
    expect(screen.queryByText("Skill 11")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /^(下一页|Next)$/ })[1]!);
    expect(screen.getByText("Skill 11")).toBeTruthy();
  });

  test("saves custom assistant MCP and skill selection", async () => {
    assistantsState.current.createAssistant.mockResolvedValue(
      makeAssistant({
        id: "assistant-created",
        resourceSelection: {
          mode: "custom",
          selectedMcpServerIds: ["mcp-b"],
          selectedSkillIds: ["skill-a"],
        },
      }),
    );

    render(<AssistantEditorPage serverId="server-1" onDone={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("代码审查助手"), {
      target: { value: "Custom" },
    });
    fireEvent.change(screen.getByLabelText("助手提示词"), {
      target: { value: "Use selected resources." },
    });
    fireEvent.click(screen.getByLabelText("使用所有已启用的助手资源"));
    expect(screen.getByTestId("assistant-resource-group-mcp")).toBeTruthy();
    expect(screen.getByTestId("assistant-resource-group-skill")).toBeTruthy();
    expect(screen.getByText("该助手在新会话中可以调用的外部工具。")).toBeTruthy();
    expect(screen.getByText("注入给该助手的指令包。")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Enable MCP MCP A for assistant"));
    fireEvent.click(screen.getByLabelText("Enable skill Skill B for assistant"));
    fireEvent.click(screen.getByRole("button", { name: "添加助手" }));

    await waitFor(() =>
      expect(assistantsState.current.createAssistant).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Custom",
          prompt: "Use selected resources.",
          resourceSelection: {
            mode: "custom",
            selectedMcpServerIds: ["mcp-b"],
            selectedSkillIds: ["skill-a"],
          },
        }),
      ),
    );
  });

  test("keeps the first-level page as a list and opens create or edit callbacks", () => {
    assistantsState.current.assistants = [makeAssistant()];
    const onCreate = vi.fn();
    const onEdit = vi.fn();

    render(<AssistantsSection serverId="server-1" onCreate={onCreate} onEdit={onEdit} />);

    expect(screen.queryByLabelText("助手提示词")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "创建助手" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "assistant-1" }));
  });
});
