/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LarkChannelBotStatus, LarkChannelStatus } from "@getpaseo/protocol/messages";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LarkChannelSection } from "./lark-channel-section";

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
      statusSuccess: "#0f0",
      statusWarning: "#ff0",
      statusDanger: "#f00",
    },
  },
}));

const channelState = vi.hoisted(() => ({
  current: {
    status: null as LarkChannelStatus | null,
    configure: vi.fn(),
    deleteBot: vi.fn(),
    testConnection: vi.fn(),
    setEnabled: vi.fn(),
    approvePairing: vi.fn(),
    rejectPairing: vi.fn(),
    revokeUser: vi.fn(),
    application: null,
    applyBot: vi.fn(),
    refreshApplication: vi.fn(),
    clearApplication: vi.fn(),
  },
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
    }: { uniProps?: (theme: unknown) => Record<string, unknown> } & Record<string, unknown>) => {
      const themed = uniProps ? uniProps(theme) : {};
      return React.createElement(Component, { ...rest, ...themed });
    },
}));

vi.mock("lucide-react-native", () => ({
  Bot: () => <span data-testid="bot-icon" />,
  ExternalLink: () => <span data-testid="external-link-icon" />,
}));

vi.mock("./use-lark-channel", () => ({
  useLarkChannel: () => ({
    status: channelState.current.status,
    isLoading: false,
    isConnected: true,
    error: null,
    configure: channelState.current.configure,
    deleteBot: channelState.current.deleteBot,
    testConnection: channelState.current.testConnection,
    setEnabled: channelState.current.setEnabled,
    approvePairing: channelState.current.approvePairing,
    rejectPairing: channelState.current.rejectPairing,
    revokeUser: channelState.current.revokeUser,
    application: channelState.current.application,
    applyBot: channelState.current.applyBot,
    refreshApplication: channelState.current.refreshApplication,
    clearApplication: channelState.current.clearApplication,
    isApplying: false,
    isMutating: false,
    mutationError: null,
  }),
}));

vi.mock("@/runtime/host-features", () => ({
  useHostFeature: () => true,
}));

vi.mock("@/hooks/use-assistants", () => ({
  useAssistants: () => ({
    assistants: [
      { id: "assistant-1", name: "Settlement", description: "Settlement helper" },
      { id: "assistant-2", name: "Reviewer", description: "Reviews changes" },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-teams", () => ({
  useTeams: () => ({
    teams: [
      {
        id: "team-1",
        name: "Delivery team",
        leaderAssistantId: "assistant-1",
        assistantIds: ["assistant-1", "assistant-2"],
        assistants: [],
      },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-providers-snapshot", () => ({
  useProvidersSnapshot: () => ({
    entries: [
      {
        provider: "claude",
        label: "Claude",
        enabled: true,
        defaultModeId: "accept-edits",
        modes: [
          { id: "ask", label: "Ask every time" },
          { id: "accept-edits", label: "Accept edits" },
        ],
        models: [
          {
            id: "sonnet",
            label: "Sonnet",
            description: "Sonnet",
            defaultThinkingOptionId: "high",
            thinkingOptions: [
              { id: "low", label: "Low" },
              { id: "high", label: "High", isDefault: true },
            ],
          },
        ],
      },
    ],
    isLoading: false,
    isFetching: false,
  }),
}));

vi.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({
    projects: [
      {
        projectKey: "project-1",
        projectName: "Repo",
        projectCustomName: null,
        hosts: [{ serverId: "server-1", isOnline: true, repoRoot: "/repo/app" }],
      },
    ],
  }),
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
    resetKey,
    onChangeText,
  }: {
    initialValue?: string;
    placeholder?: string;
    resetKey?: string | number;
    onChangeText: (value: string) => void;
  }) => {
    const [value, setValue] = React.useState(initialValue ?? "");
    React.useEffect(() => {
      setValue(initialValue ?? "");
    }, [initialValue, resetKey]);
    return React.createElement("input", {
      value,
      placeholder,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        setValue(event.currentTarget.value);
        onChangeText(event.currentTarget.value);
      },
    });
  },
}));

vi.mock("@/components/ui/select-field", () => ({
  SelectField: (props: {
    label: string;
    value?: string | null;
    selectedDisplay?: { label: string } | null;
    options?: Array<{ value: string; label: string }>;
    onChange?: (value: string) => void;
    disabled?: boolean;
  }) => {
    const { onChange } = props;
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLSelectElement>) => {
        onChange?.(event.currentTarget.value);
      },
      [onChange],
    );
    return (
      <label>
        <span>{props.label}</span>
        <select
          aria-label={props.label}
          value={props.value ?? ""}
          disabled={props.disabled}
          onChange={handleChange}
        >
          <option value="" />
          {(props.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span>{props.selectedDisplay?.label ?? ""}</span>
      </label>
    );
  },
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    value,
    onValueChange,
    disabled,
    accessibilityLabel,
  }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    disabled?: boolean;
    accessibilityLabel?: string;
  }) =>
    React.createElement("input", {
      type: "checkbox",
      checked: value,
      disabled,
      "aria-label": accessibilityLabel,
      onChange: () => undefined,
      onClick: () => onValueChange(!value),
    }),
}));

vi.mock("@/components/ui/loading-spinner", () => ({
  LoadingSpinner: () => <span>Loading</span>,
}));

vi.mock("@/screens/settings/settings-section", () => ({
  SettingsSection: ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

vi.mock("./lark-reminder-section", () => ({
  LarkReminderSection: () => null,
}));

function makeBot(overrides: Partial<LarkChannelBotStatus> = {}): LarkChannelBotStatus {
  return {
    id: "bot-1",
    name: "Settlement bot",
    enabled: false,
    connectionStatus: "disabled",
    error: null,
    appId: "cli_settle",
    hasAppSecret: true,
    hasEncryptKey: false,
    hasVerificationToken: false,
    domain: "feishu",
    substitute: {
      enabled: false,
      openId: null,
      name: null,
    },
    target: {
      kind: "assistant",
      assistantId: "assistant-1",
      provider: "claude",
      model: "sonnet",
      modeId: "accept-edits",
      thinkingOptionId: "high",
      cwd: "/repo/app",
      workspaceId: null,
    },
    bot: null,
    pendingPairings: [],
    authorizedUsers: [],
    ...overrides,
  };
}

function makeStatus(
  bots: LarkChannelBotStatus[],
  activeBotId: string | null = bots[0]?.id ?? null,
): LarkChannelStatus {
  const active = bots.find((bot) => bot.id === activeBotId) ?? bots[0] ?? makeBot();
  return {
    enabled: active.enabled,
    connectionStatus: active.connectionStatus,
    error: active.error,
    appId: active.appId,
    hasAppSecret: active.hasAppSecret,
    hasEncryptKey: active.hasEncryptKey,
    hasVerificationToken: active.hasVerificationToken,
    domain: active.domain,
    target: active.target,
    substitute: active.substitute,
    bot: active.bot,
    pendingPairings: active.pendingPairings,
    authorizedUsers: active.authorizedUsers,
    activeBotId,
    bots,
  };
}

describe("LarkChannelSection", () => {
  test("starts the automatic Feishu bot application flow", async () => {
    channelState.current.status = makeStatus([]);
    channelState.current.applyBot.mockResolvedValue({
      id: "application-1",
      status: "starting",
    });

    render(<LarkChannelSection serverId="server-1" />);
    fireEvent.click(screen.getByRole("button", { name: "申请飞书机器人" }));

    await waitFor(() => {
      expect(channelState.current.applyBot).toHaveBeenCalledWith();
    });
  });

  afterEach(() => {
    cleanup();
    channelState.current.status = null;
    channelState.current.configure.mockReset();
    channelState.current.deleteBot.mockReset();
    channelState.current.applyBot.mockReset();
    channelState.current.refreshApplication.mockReset();
    channelState.current.clearApplication.mockReset();
    channelState.current.testConnection.mockReset();
    channelState.current.setEnabled.mockReset();
    channelState.current.approvePairing.mockReset();
    channelState.current.rejectPairing.mockReset();
    channelState.current.revokeUser.mockReset();
  });

  test("shows multiple configured Lark bots and loads the selected bot", async () => {
    channelState.current.status = makeStatus([
      makeBot({
        bot: {
          name: "袁昌旺的paseo_mac",
        },
      }),
      makeBot({ id: "bot-2", name: "Ops bot", appId: "cli_ops" }),
    ]);

    render(<LarkChannelSection serverId="server-1" />);

    expect(screen.getAllByText("袁昌旺的paseo_mac").length).toBeGreaterThan(0);
    expect(screen.getByText(/本地备注：Settlement bot/)).toBeTruthy();
    expect(screen.getByText(/下方配置（包括替身模式）只对这个飞书机器人生效/)).toBeTruthy();
    expect(screen.getByText(/当前机器人：袁昌旺的paseo_mac/)).toBeTruthy();
    expect(screen.getByText("Ops bot")).toBeTruthy();
    expect(screen.getByDisplayValue("cli_settle")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => expect(screen.getByDisplayValue("cli_ops")).toBeTruthy());
  });

  test("shows legacy single-bot status as a bot list item", async () => {
    channelState.current.status = {
      ...makeStatus([], null),
      enabled: true,
      connectionStatus: "connected",
      appId: "cli_legacy",
      hasAppSecret: true,
      target: {
        kind: "assistant",
        assistantId: "assistant-1",
        provider: "claude",
        model: "sonnet",
        cwd: "/repo/app",
        workspaceId: null,
      },
      bots: [],
      activeBotId: null,
    };

    render(<LarkChannelSection serverId="server-1" />);

    expect(screen.getByText("飞书机器人列表（1）")).toBeTruthy();
    expect(screen.getAllByText(/cli_legacy/).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("cli_legacy")).toBeTruthy();
  });

  test("adds and deletes Lark bots through channel mutations", async () => {
    const existingBot = makeBot();
    const newBot = makeBot({ id: "bot-2", name: "New bot", appId: "cli_new" });
    channelState.current.status = makeStatus([existingBot]);
    channelState.current.configure.mockResolvedValue(makeStatus([existingBot, newBot], newBot.id));
    channelState.current.deleteBot.mockResolvedValue(makeStatus([], null));

    render(<LarkChannelSection serverId="server-1" />);

    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    fireEvent.change(screen.getByLabelText("机器人名称"), { target: { value: "New bot" } });
    fireEvent.change(screen.getByLabelText("App ID"), { target: { value: "cli_new" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(channelState.current.configure).toHaveBeenCalledWith(
        expect.objectContaining({ createNew: true, name: "New bot", appId: "cli_new" }),
      ),
    );

    cleanup();
    channelState.current.status = makeStatus([existingBot]);
    render(<LarkChannelSection serverId="server-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete bot" }));
    await waitFor(() => expect(channelState.current.deleteBot).toHaveBeenCalledWith("bot-1"));
  });

  test("saves the selected thinking and safety modes", async () => {
    const bot = makeBot();
    channelState.current.status = makeStatus([bot]);
    channelState.current.configure.mockResolvedValue(makeStatus([bot]));

    render(<LarkChannelSection serverId="server-1" />);

    expect((screen.getByLabelText("Thinking mode") as HTMLSelectElement).value).toBe("high");
    expect((screen.getByLabelText("Safety mode") as HTMLSelectElement).value).toBe("accept-edits");

    fireEvent.change(screen.getByLabelText("Thinking mode"), { target: { value: "low" } });
    fireEvent.change(screen.getByLabelText("Safety mode"), { target: { value: "ask" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(channelState.current.configure).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({
            modeId: "ask",
            thinkingOptionId: "low",
          }),
        }),
      ),
    );
  });

  test("configures substitute mode with an Open ID and note name", async () => {
    const bot = makeBot({
      substitute: {
        enabled: true,
        openId: "ou_old",
        name: "Old note",
      },
    });
    channelState.current.status = makeStatus([bot]);
    channelState.current.configure.mockResolvedValue(
      makeStatus([
        makeBot({
          substitute: {
            enabled: true,
            openId: "ou_alice",
            name: "Alice",
          },
        }),
      ]),
    );

    render(<LarkChannelSection serverId="server-1" />);

    const openIdInput = await waitFor(() => screen.getByPlaceholderText("ou_xxxxxxxxxx"));
    fireEvent.change(openIdInput, {
      target: { value: " ou_alice " },
    });
    fireEvent.change(screen.getByPlaceholderText("例如：张三"), {
      target: { value: " Alice " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(channelState.current.configure).toHaveBeenCalledWith(
        expect.objectContaining({
          substitute: {
            enabled: true,
            openId: "ou_alice",
            name: "Alice",
          },
        }),
      ),
    );
  });

  test("selects a team as the Lark bot target", async () => {
    const bot = makeBot();
    const teamBot = makeBot({
      target: {
        kind: "team",
        teamId: "team-1",
        provider: "claude",
        model: "sonnet",
        modeId: "accept-edits",
        thinkingOptionId: "high",
        cwd: "/repo/app",
        workspaceId: null,
      },
    });
    channelState.current.status = makeStatus([bot]);
    channelState.current.configure.mockResolvedValue(makeStatus([teamBot]));

    render(<LarkChannelSection serverId="server-1" />);

    expect((screen.getByLabelText("Assistant or team") as HTMLSelectElement).value).toBe(
      "assistant:assistant-1",
    );
    fireEvent.change(screen.getByLabelText("Assistant or team"), {
      target: { value: "team:team-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(channelState.current.configure).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({
            kind: "team",
            teamId: "team-1",
          }),
        }),
      ),
    );
  });
});
