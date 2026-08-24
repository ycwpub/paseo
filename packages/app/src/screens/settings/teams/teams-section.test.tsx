/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Assistant, Team } from "@getpaseo/protocol/messages";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TeamsSection } from "./teams-section";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
afterEach(cleanup);

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 },
    borderRadius: { lg: 8 },
    fontSize: { xs: 11, sm: 13, base: 15 },
    fontWeight: { normal: "400" },
    colors: {
      foreground: "#111",
      foregroundMuted: "#666",
      surface1: "#fff",
      border: "#ddd",
      statusDanger: "#f00",
    },
  },
}));

const assistant: Assistant = {
  id: "assistant-1",
  name: "Leader",
  description: "",
  prompt: "",
  memoryEnabled: false,
  memory: "",
  memorySummary: "",
  memoryFiles: {
    summaryPath: "",
    detailFiles: [],
  },
  resourceSelection: {
    mode: "all-enabled",
    selectedMcpServerIds: [],
    selectedSkillIds: [],
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const worker: Assistant = {
  ...assistant,
  id: "assistant-2",
  name: "Worker",
};

const team: Team = {
  id: "team-1",
  userId: "local",
  name: "Settlement team",
  workspace: "",
  workspaceMode: "shared",
  leaderAssistantId: assistant.id,
  assistantIds: [assistant.id, "assistant-2"],
  assistants: [
    {
      slotId: assistant.id,
      conversationId: "",
      role: "leader",
      assistantBackend: "preset",
      assistantName: assistant.name,
      status: "idle",
      assistantId: assistant.id,
    },
    {
      slotId: worker.id,
      conversationId: "",
      role: "teammate",
      assistantBackend: "preset",
      assistantName: worker.name,
      status: "idle",
      assistantId: worker.id,
      model: "codex/gpt-5.4",
      thinkingOptionId: "high",
    },
  ],
  createdAt: 1,
  updatedAt: 1,
};

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
    hairlineWidth: 1,
  },
}));

vi.mock("@/hooks/use-assistants", () => ({
  useAssistants: () => ({
    assistants: [assistant, worker],
    isLoading: false,
    isConnected: true,
    error: null,
  }),
}));

const { updateTeam } = vi.hoisted(() => ({
  updateTeam: vi.fn(async (input) => ({ ...team, ...input })),
}));

vi.mock("@/hooks/use-teams", () => ({
  useTeams: () => ({
    teams: [team],
    isLoading: false,
    isConnected: true,
    error: null,
    createTeam: vi.fn(),
    updateTeam,
    deleteTeam: vi.fn(),
    isMutating: false,
    mutationError: null,
  }),
}));

vi.mock("@/hooks/use-providers-snapshot", () => ({
  useProvidersSnapshot: () => ({
    entries: [
      {
        provider: "codex",
        label: "Codex",
        enabled: true,
        status: "ready",
        models: [
          {
            id: "gpt-5.4",
            label: "GPT-5.4",
            thinkingOptions: [
              { id: "medium", label: "Medium" },
              { id: "high", label: "High" },
            ],
          },
          {
            id: "gpt-5.5",
            label: "GPT-5.5",
            thinkingOptions: [{ id: "xhigh", label: "Extra high" }],
          },
        ],
      },
      {
        provider: "claude",
        label: "Claude",
        enabled: true,
        status: "ready",
        models: [
          {
            id: "claude-sonnet-4-5",
            label: "Claude Sonnet 4.5",
            thinkingOptions: [{ id: "high", label: "High" }],
          },
        ],
      },
    ],
    isLoading: false,
    isFetching: false,
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
    variant,
  }: {
    children: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    variant?: string;
  }) => (
    <button type="button" disabled={disabled} onClick={onPress} data-variant={variant}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/form-field", () => ({
  Field: ({ label, children }: { label: string; children: ReactNode }) => (
    <label>
      <span>{label}</span>
      {children}
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
  Switch: () => <input type="checkbox" />,
}));

vi.mock("@/components/ui/select-field", () => ({
  SelectField: ({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
  }) => {
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLSelectElement>) => {
        onChange(event.currentTarget.value);
      },
      [onChange],
    );
    return (
      <label>
        <span>{label}</span>
        <select aria-label={label} value={value} onChange={handleChange}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  },
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

describe("TeamsSection", () => {
  test("shows the existing team name when editing", () => {
    render(<TeamsSection serverId="server-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect((screen.getByPlaceholderText("团队名称") as HTMLInputElement).value).toBe(
      "Settlement team",
    );
    expect(screen.getByRole("button", { name: "保存团队" }).getAttribute("data-variant")).toBe(
      "default",
    );
  });

  test("edits and saves teammate provider, model, and thinking settings", async () => {
    updateTeam.mockClear();
    render(<TeamsSection serverId="server-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect((screen.getByLabelText("Provider") as HTMLSelectElement).value).toBe("codex");
    expect((screen.getByLabelText("模型") as HTMLSelectElement).value).toBe("gpt-5.4");
    expect((screen.getByLabelText("思考模式") as HTMLSelectElement).value).toBe("high");

    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "claude" },
    });
    fireEvent.change(screen.getByLabelText("模型"), {
      target: { value: "claude-sonnet-4-5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存团队" }));

    await waitFor(() =>
      expect(updateTeam).toHaveBeenCalledWith(
        expect.objectContaining({
          memberSettings: {
            [worker.id]: {
              provider: "claude",
              model: "claude-sonnet-4-5",
            },
          },
        }),
      ),
    );
  });
});
