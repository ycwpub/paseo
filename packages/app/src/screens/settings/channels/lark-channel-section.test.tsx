/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  LarkBotApplication,
  LarkChannelBotStatus,
  LarkChannelStatus,
  LarkReminder,
} from "@getpaseo/protocol/messages";
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
    resolveDirectoryUsers: vi.fn(),
    resolveDirectoryChats: vi.fn(),
    updateDirectoryUser: vi.fn(),
    application: null as LarkBotApplication | null,
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
    resolveDirectoryUsers: channelState.current.resolveDirectoryUsers,
    resolveDirectoryChats: channelState.current.resolveDirectoryChats,
    updateDirectoryUser: channelState.current.updateDirectoryUser,
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
    testID,
    variant,
  }: {
    children: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    testID?: string;
    variant?: string;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      data-testid={testID}
      data-variant={variant}
    >
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
  LarkReminderSection: ({
    onCreate,
    onEdit,
  }: {
    onCreate: () => void;
    onEdit: (reminder: LarkReminder) => void;
  }) => {
    const handleEdit = React.useCallback(() => {
      onEdit({
        id: "reminder-1",
        name: "等待确认",
        botId: "bot-1",
        chatId: "oc_group",
        targetOpenIds: ["ou_alice"],
        message: "请确认",
        frequencySeconds: 600,
        sender: { type: "bot" },
        status: "active",
        createdAt: "2026-08-29T00:00:00.000Z",
        updatedAt: "2026-08-29T00:00:00.000Z",
        startedAt: "2026-08-29T00:00:00.000Z",
        completedAt: null,
        lastSentAt: null,
        nextRunAt: "2026-08-29T00:00:00.000Z",
        sendCount: 0,
        lastError: null,
        reply: null,
      });
    }, [onEdit]);
    return (
      <div>
        <button type="button" onClick={onCreate}>
          创建定时任务
        </button>
        <button type="button" onClick={handleEdit}>
          编辑定时任务
        </button>
      </div>
    );
  },
  LarkReminderEditor: ({ reminder, onSaved }: { reminder?: LarkReminder; onSaved: () => void }) => (
    <div>
      <span>{reminder ? `正在编辑 ${reminder.name}` : "正在创建定时任务"}</span>
      <button type="button" onClick={onSaved}>
        保存定时任务
      </button>
    </div>
  ),
}));

vi.mock("./lark-substitute-mode-section", () => ({
  LarkSubstituteModeSection: ({
    onCreate,
    onEdit,
  }: {
    onCreate: () => void;
    onEdit: (mode: {
      id: string;
      name: string;
      enabled: boolean;
      botId: string;
      privateScan: {
        enabled: boolean;
        intervalMinutes: number;
        lookbackMinutes: number;
        excludeRecentMinutes: number;
      };
      disclosure: { enabled: boolean; prompt: string };
      customPrompt: string;
      delaySeconds: number;
      activeTimeRanges: [];
      allowlist: [];
      denylist: [];
      target: LarkChannelBotStatus["target"];
      createdAt: string;
      updatedAt: string;
    }) => void;
  }) => {
    const handleEdit = React.useCallback(() => {
      onEdit({
        id: "substitute-1",
        name: "工作替身",
        enabled: true,
        botId: "bot-1",
        privateScan: {
          enabled: true,
          intervalMinutes: 30,
          lookbackMinutes: 60,
          excludeRecentMinutes: 20,
        },
        disclosure: { enabled: true, prompt: "【机器人代答】" },
        customPrompt: "",
        delaySeconds: 10,
        activeTimeRanges: [],
        allowlist: [],
        denylist: [],
        target: makeBot().target,
        createdAt: "2026-09-04T00:00:00.000Z",
        updatedAt: "2026-09-04T00:00:00.000Z",
      });
    }, [onEdit]);
    return (
      <div>
        <button type="button" onClick={onCreate}>
          创建替身模式
        </button>
        <button type="button" onClick={handleEdit}>
          编辑替身模式
        </button>
      </div>
    );
  },
  LarkSubstituteModeEditor: ({
    mode,
    onSaved,
  }: {
    mode?: { name: string } | null;
    onSaved: () => void;
  }) => (
    <div>
      <span>{mode ? `正在编辑 ${mode.name}` : "正在创建替身模式"}</span>
      <button type="button" onClick={onSaved}>
        保存替身模式
      </button>
    </div>
  ),
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

  test("shows the permissions and callback allowlist submitted with the application", () => {
    channelState.current.status = makeStatus([]);
    channelState.current.application = {
      id: "application-1",
      status: "waiting_for_scan",
      qrUrl: null,
      expiresAt: null,
      message: "请扫码确认",
      error: null,
      botId: null,
      appId: null,
      domain: null,
      requirements: {
        tenantScopes: ["im:message:readonly", "im:message:send_as_bot"],
        userScopes: ["offline_access"],
        events: ["im.message.receive_v1"],
        callbacks: ["card.action.trigger"],
      },
    };

    render(<LarkChannelSection serverId="server-1" />);

    expect(screen.getByText(/机器人权限 2 项、用户权限 1 项/)).toBeTruthy();
    expect(
      screen.getByText("事件与回调白名单：im.message.receive_v1、card.action.trigger"),
    ).toBeTruthy();
  });

  afterEach(() => {
    cleanup();
    channelState.current.status = null;
    channelState.current.application = null;
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
    channelState.current.resolveDirectoryUsers.mockReset();
    channelState.current.resolveDirectoryChats.mockReset();
    channelState.current.updateDirectoryUser.mockReset();
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
    const onDetailNavigationChange = vi.fn();

    render(
      <LarkChannelSection
        serverId="server-1"
        onDetailNavigationChange={onDetailNavigationChange}
      />,
    );

    expect(screen.getAllByText("袁昌旺的paseo_mac").length).toBeGreaterThan(0);
    expect(screen.getByText(/本地备注：Settlement bot/)).toBeTruthy();
    expect(screen.getByText("Ops bot")).toBeTruthy();
    expect(screen.getByTestId("host-page-lark-bot-edit-bot-1").getAttribute("data-variant")).toBe(
      "outline",
    );
    expect(screen.getByTestId("host-page-lark-bot-edit-bot-2").getAttribute("data-variant")).toBe(
      "outline",
    );

    fireEvent.click(screen.getByTestId("host-page-lark-bot-edit-bot-1"));
    expect(screen.getByText("编辑飞书机器人")).toBeTruthy();
    expect(screen.getByText(/下方连接、模型与项目配置只对这个飞书机器人生效/)).toBeTruthy();
    expect(screen.getByDisplayValue("cli_settle")).toBeTruthy();

    const detailNavigation = onDetailNavigationChange.mock.calls
      .map(([navigation]) => navigation)
      .find((navigation) => navigation?.title === "编辑飞书机器人");
    expect(detailNavigation).toBeTruthy();
    act(() => detailNavigation?.onBack());
    fireEvent.click(screen.getByTestId("host-page-lark-bot-edit-bot-2"));

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
    fireEvent.click(screen.getByTestId("host-page-lark-bot-edit-__legacy_lark_bot__"));
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
    fireEvent.change(screen.getByLabelText("应用 ID"), { target: { value: "cli_new" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(channelState.current.configure).toHaveBeenCalledWith(
        expect.objectContaining({
          createNew: true,
          name: "New bot",
          appId: "cli_new",
          substitute: { enabled: false, openId: null, name: null },
        }),
      ),
    );

    cleanup();
    channelState.current.status = makeStatus([existingBot]);
    render(<LarkChannelSection serverId="server-1" />);

    fireEvent.click(screen.getByTestId("host-page-lark-bot-edit-bot-1"));
    fireEvent.click(screen.getByRole("button", { name: "Delete bot" }));
    await waitFor(() => expect(channelState.current.deleteBot).toHaveBeenCalledWith("bot-1"));
  });

  test("saves the selected thinking and safety modes", async () => {
    const bot = makeBot();
    channelState.current.status = makeStatus([bot]);
    channelState.current.configure.mockResolvedValue(makeStatus([bot]));

    render(<LarkChannelSection serverId="server-1" />);

    fireEvent.click(screen.getByTestId("host-page-lark-bot-edit-bot-1"));
    expect((screen.getByLabelText("思考模式") as HTMLSelectElement).value).toBe("high");
    expect((screen.getByLabelText("安全模式") as HTMLSelectElement).value).toBe("accept-edits");

    fireEvent.change(screen.getByLabelText("思考模式"), { target: { value: "low" } });
    fireEvent.change(screen.getByLabelText("安全模式"), { target: { value: "ask" } });

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

  test("opens independent create and edit pages for substitute modes", async () => {
    channelState.current.status = makeStatus([makeBot()]);
    render(<LarkChannelSection serverId="server-1" />);

    fireEvent.click(screen.getByRole("button", { name: "创建替身模式" }));
    expect(await screen.findByText("正在创建替身模式")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "保存替身模式" }));

    fireEvent.click(screen.getByRole("button", { name: "编辑替身模式" }));
    expect(await screen.findByText("正在编辑 工作替身")).toBeTruthy();
  });

  test("shows authorized users and groups with friendly directory identities", async () => {
    const bot = makeBot({
      authorizedUsers: [
        {
          id: "authorized-1",
          openId: "ou_alice",
          unionId: null,
          chatId: "oc_settlement",
          displayName: "Alice",
          authorizedAt: "2026-08-29T00:00:00.000Z",
        },
      ],
    });
    channelState.current.status = {
      ...makeStatus([bot]),
      directory: {
        users: [
          {
            appId: "cli_settle",
            email: "alice@example.com",
            openId: "ou_alice",
            displayName: "张三",
            updatedAt: "2026-08-29T00:00:00.000Z",
          },
        ],
        chats: [
          {
            appId: "cli_settle",
            groupId: "group_settlement",
            chatId: "oc_settlement",
            name: "结算研发群",
            updatedAt: "2026-08-29T00:00:00.000Z",
          },
        ],
      },
    };

    render(<LarkChannelSection serverId="server-1" />);

    fireEvent.click(screen.getByTestId("host-page-lark-bot-edit-bot-1"));
    expect(await screen.findByText("张三（alice@example.com，ou_alice）")).toBeTruthy();
    expect(screen.getByText("结算研发群（oc_settlement）")).toBeTruthy();
  });

  test("automatically resolves incomplete authorized chat identities", async () => {
    const bot = makeBot({
      authorizedUsers: [
        {
          id: "authorized-1",
          openId: "ou_alice",
          unionId: null,
          chatId: "oc_settlement",
          displayName: "Alice",
          authorizedAt: "2026-08-29T00:00:00.000Z",
        },
      ],
    });
    channelState.current.status = makeStatus([bot]);
    channelState.current.resolveDirectoryChats.mockResolvedValue([]);

    render(<LarkChannelSection serverId="server-1" />);

    fireEvent.click(screen.getByTestId("host-page-lark-bot-edit-bot-1"));
    await waitFor(() => {
      expect(channelState.current.resolveDirectoryChats).toHaveBeenCalledWith(
        "cli_settle",
        "oc_settlement",
      );
    });
  });

  test("shows pending pairing users and groups with complete directory identities", async () => {
    const bot = makeBot({
      pendingPairings: [
        {
          code: "pair-123",
          openId: "ou_alice",
          unionId: null,
          chatId: "oc_settlement",
          displayName: "Alice",
          createdAt: "2026-08-29T00:00:00.000Z",
          expiresAt: "2026-08-29T00:10:00.000Z",
        },
      ],
    });
    channelState.current.status = {
      ...makeStatus([bot]),
      directory: {
        users: [
          {
            appId: "cli_settle",
            email: "alice@example.com",
            openId: "ou_alice",
            displayName: "张三",
            updatedAt: "2026-08-29T00:00:00.000Z",
          },
        ],
        chats: [
          {
            appId: "cli_settle",
            groupId: "group_settlement",
            chatId: "oc_settlement",
            name: "结算研发群",
            updatedAt: "2026-08-29T00:00:00.000Z",
          },
        ],
      },
    };

    render(<LarkChannelSection serverId="server-1" />);

    fireEvent.click(screen.getByTestId("host-page-lark-bot-edit-bot-1"));
    expect(await screen.findByText("张三（alice@example.com，ou_alice）")).toBeTruthy();
    expect(screen.getByText("结算研发群（oc_settlement） · 配对码 pair-123")).toBeTruthy();
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

    fireEvent.click(screen.getByTestId("host-page-lark-bot-edit-bot-1"));
    expect((screen.getByLabelText("助手或团队") as HTMLSelectElement).value).toBe(
      "assistant:assistant-1",
    );
    fireEvent.change(screen.getByLabelText("助手或团队"), {
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

  test("shows reminder tasks directly on the channel overview", () => {
    channelState.current.status = makeStatus([makeBot()]);
    const onDetailNavigationChange = vi.fn();

    render(
      <LarkChannelSection
        serverId="server-1"
        onDetailNavigationChange={onDetailNavigationChange}
      />,
    );

    expect(screen.getByTestId("host-page-channels")).toBeTruthy();
    expect(screen.getByTestId("host-page-lark-reminders-section")).toBeTruthy();
    expect(screen.getByRole("button", { name: "创建定时任务" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "编辑定时任务" })).toBeTruthy();
    expect(onDetailNavigationChange).toHaveBeenCalledWith(null);
  });

  test("searches contacts and opens a dedicated page to supplement identity fields", async () => {
    const contact = {
      appId: "cli_settle",
      email: null,
      openId: "ou_alice",
      displayName: null,
      firstMessageContent: "请帮忙确认结算订单",
      firstMessageAt: "2026-09-06T01:00:00.000Z",
      updatedAt: "2026-09-06T01:00:00.000Z",
    };
    channelState.current.status = {
      ...makeStatus([makeBot()]),
      directory: { users: [contact], chats: [] },
    };
    channelState.current.updateDirectoryUser.mockResolvedValue({
      ...contact,
      displayName: "张三",
      email: "alice@example.com",
    });
    const onDetailNavigationChange = vi.fn();

    render(
      <LarkChannelSection
        serverId="server-1"
        onDetailNavigationChange={onDetailNavigationChange}
      />,
    );

    fireEvent.click(screen.getByTestId("host-page-lark-contacts-open"));
    expect(screen.getByTestId("host-page-channels-directory")).toBeTruthy();
    expect(screen.getByText("第一条消息：请帮忙确认结算订单")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("搜索用户名、邮箱、ou_id 或第一条消息"), {
      target: { value: "结算订单" },
    });
    expect(screen.getByText(/ou_alice/)).toBeTruthy();

    fireEvent.click(screen.getByTestId("host-page-lark-contact-edit-ou_alice"));
    expect(screen.getByTestId("host-page-channels-contact-edit")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("输入用户名"), { target: { value: "张三" } });
    fireEvent.change(screen.getByPlaceholderText("输入用户邮箱"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存联系人" }));

    await waitFor(() => {
      expect(channelState.current.updateDirectoryUser).toHaveBeenCalledWith({
        appId: "cli_settle",
        openId: "ou_alice",
        displayName: "张三",
        email: "alice@example.com",
      });
    });
    expect(screen.getByTestId("host-page-channels-directory")).toBeTruthy();
  });

  test("opens create and edit reminder forms as dedicated secondary pages", () => {
    channelState.current.status = makeStatus([makeBot()]);
    const onDetailNavigationChange = vi.fn();

    render(
      <LarkChannelSection
        serverId="server-1"
        onDetailNavigationChange={onDetailNavigationChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "创建定时任务" }));
    expect(screen.getByTestId("host-page-channels-reminder-create")).toBeTruthy();
    expect(screen.getByText("正在创建定时任务")).toBeTruthy();

    const createNavigation = onDetailNavigationChange.mock.calls
      .map(([navigation]) => navigation)
      .find((navigation) => navigation?.title === "创建定时任务");
    expect(createNavigation).toBeTruthy();
    act(() => createNavigation?.onBack());
    expect(screen.getByTestId("host-page-channels")).toBeTruthy();
    expect(screen.getByTestId("host-page-lark-reminders-section")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "编辑定时任务" }));
    expect(screen.getByTestId("host-page-channels-reminder-edit")).toBeTruthy();
    expect(screen.getByText("正在编辑 等待确认")).toBeTruthy();

    const editNavigation = onDetailNavigationChange.mock.calls
      .map(([navigation]) => navigation)
      .find((navigation) => navigation?.title === "编辑定时任务");
    expect(editNavigation).toBeTruthy();
    act(() => editNavigation?.onBack());
    expect(screen.getByTestId("host-page-channels")).toBeTruthy();
    expect(screen.getByTestId("host-page-lark-reminders-section")).toBeTruthy();
  });
});
