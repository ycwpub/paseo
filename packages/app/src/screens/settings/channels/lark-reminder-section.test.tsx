/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  LarkChannelBotStatus,
  LarkDirectory,
  LarkReminder,
} from "@getpaseo/protocol/messages";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LarkReminderEditor, LarkReminderSection } from "./lark-reminder-section";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16 },
    borderRadius: { lg: 8, full: 9999 },
    fontSize: { xs: 11, sm: 13 },
    colors: {
      foreground: "#fff",
      foregroundMuted: "#aaa",
      surface1: "#111",
      surface2: "#222",
      border: "#444",
      statusSuccess: "#0f0",
    },
  },
}));

const reminderState = vi.hoisted(() => ({
  current: {
    reminders: [] as LarkReminder[],
    isLoading: false,
    isMutating: false,
    error: null as Error | null,
    create: vi.fn(),
    update: vi.fn(),
    setEnabled: vi.fn(),
    deleteReminder: vi.fn(),
  },
}));

const directoryState = vi.hoisted(() => ({
  resolveUsers: vi.fn(),
  resolveChats: vi.fn(),
}));

const EMPTY_DIRECTORY = { users: [], chats: [] };

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
}));

vi.mock("@/runtime/host-features", () => ({
  useHostFeature: () => true,
}));

vi.mock("@/styles/settings", () => ({
  settingsStyles: {
    card: {},
    row: {},
    rowBorder: {},
    rowError: {},
    rowHint: {},
    rowTitle: {},
  },
}));

vi.mock("./use-lark-reminders", () => ({
  useLarkReminders: () => reminderState.current,
}));

vi.mock("@/projects/lark/lark-user-oauth-card", () => ({
  LarkUserOAuthCard: ({ appId }: { appId: string }) => (
    <div data-testid="lark-user-oauth-card">OAuth {appId}</div>
  ),
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
    value,
    placeholder,
    onChangeText,
  }: {
    value?: string;
    placeholder?: string;
    onChangeText: (value: string) => void;
  }) => {
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        onChangeText(event.currentTarget.value);
      },
      [onChangeText],
    );
    return <input value={value ?? ""} placeholder={placeholder} onChange={handleChange} />;
  },
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
    value?: string | null;
    options?: Array<{ value: string; label: string }>;
    onChange?: (value: string) => void;
    disabled?: boolean;
  }) => {
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLSelectElement>) => {
        onChange?.(event.currentTarget.value);
      },
      [onChange],
    );
    return (
      <label>
        <span>{label}</span>
        <select aria-label={label} value={value ?? ""} disabled={disabled} onChange={handleChange}>
          <option value="" />
          {(options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
  }) => {
    const handleChange = React.useCallback(() => {
      onValueChange(!value);
    }, [onValueChange, value]);
    return (
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        aria-label={accessibilityLabel}
        onChange={handleChange}
      />
    );
  },
}));

vi.mock("@/screens/settings/settings-section", () => ({
  SettingsSection: ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

function makeBot(): LarkChannelBotStatus {
  return {
    id: "bot-1",
    name: "提醒机器人",
    enabled: true,
    connectionStatus: "connected",
    error: null,
    appId: "cli_reminder",
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
      provider: null,
      model: null,
      modeId: null,
      thinkingOptionId: null,
      cwd: null,
      workspaceId: null,
    },
    bot: {
      name: "Paseo 提醒机器人",
    },
    pendingPairings: [],
    authorizedUsers: [],
  };
}

function makeReminder(overrides: Partial<LarkReminder> = {}): LarkReminder {
  return {
    id: "reminder-1",
    name: "等待确认",
    botId: "bot-1",
    chatId: "oc_group",
    targetOpenIds: ["ou_alice"],
    message: "请确认并回复",
    frequencySeconds: 600,
    sender: { type: "bot" },
    status: "active",
    createdAt: "2026-08-18T08:00:00.000Z",
    updatedAt: "2026-08-18T08:00:00.000Z",
    startedAt: "2026-08-18T08:00:00.000Z",
    completedAt: null,
    lastSentAt: "2026-08-18T08:00:00.000Z",
    nextRunAt: "2026-08-18T08:10:00.000Z",
    sendCount: 1,
    lastError: null,
    reply: null,
    ...overrides,
  };
}

function renderReminderSection(
  directory: LarkDirectory = EMPTY_DIRECTORY,
  onCreate = vi.fn(),
  onEdit = vi.fn(),
) {
  return render(
    <LarkReminderSection
      serverId="server-1"
      bots={[makeBot()]}
      directory={directory}
      directorySupported
      resolveDirectoryUsers={directoryState.resolveUsers}
      resolveDirectoryChats={directoryState.resolveChats}
      onCreate={onCreate}
      onEdit={onEdit}
    />,
  );
}

function renderReminderEditor({
  directory = EMPTY_DIRECTORY,
  reminder,
  onSaved = vi.fn(),
}: {
  directory?: LarkDirectory;
  reminder?: LarkReminder;
  onSaved?: () => void;
} = {}) {
  return render(
    <LarkReminderEditor
      serverId="server-1"
      bots={[makeBot()]}
      directory={directory}
      directorySupported
      resolveDirectoryUsers={directoryState.resolveUsers}
      resolveDirectoryChats={directoryState.resolveChats}
      reminder={reminder}
      onSaved={onSaved}
    />,
  );
}

describe("LarkReminderSection", () => {
  afterEach(() => {
    cleanup();
    reminderState.current.reminders = [];
    reminderState.current.isLoading = false;
    reminderState.current.isMutating = false;
    reminderState.current.error = null;
    reminderState.current.create.mockReset();
    reminderState.current.update.mockReset();
    reminderState.current.setEnabled.mockReset();
    reminderState.current.deleteReminder.mockReset();
    directoryState.resolveUsers.mockReset();
    directoryState.resolveChats.mockReset();
  });

  test("opens the create page from the task list", () => {
    const onCreate = vi.fn();
    renderReminderSection(EMPTY_DIRECTORY, onCreate);

    fireEvent.click(screen.getByRole("button", { name: "创建定时任务" }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "创建并开启" })).toBeNull();
  });

  test("validates required reminder fields", async () => {
    renderReminderEditor();

    fireEvent.click(screen.getByRole("button", { name: "创建并开启" }));

    expect(await screen.findByText("请输入群 ID")).toBeTruthy();
    expect(reminderState.current.create).not.toHaveBeenCalled();
  });

  test("creates a reminder with normalized Open IDs and seconds", async () => {
    reminderState.current.create.mockResolvedValue(makeReminder());
    directoryState.resolveChats.mockResolvedValue([
      {
        appId: "cli_reminder",
        groupId: "oc_group",
        chatId: "oc_group",
        name: "结算群",
        updatedAt: "2026-08-19T00:00:00.000Z",
      },
    ]);
    directoryState.resolveUsers.mockResolvedValue([
      {
        appId: "cli_reminder",
        email: "alice@example.com",
        openId: "ou_alice",
        displayName: "Alice",
        updatedAt: "2026-08-19T00:00:00.000Z",
      },
      {
        appId: "cli_reminder",
        email: "bob@example.com",
        openId: "ou_bob",
        displayName: "Bob",
        updatedAt: "2026-08-19T00:00:00.000Z",
      },
    ]);
    renderReminderEditor();

    fireEvent.change(screen.getByPlaceholderText("例如：等待方案确认"), {
      target: { value: " 等待确认 " },
    });
    fireEvent.change(screen.getByPlaceholderText("输入群名称、群 ID 或 oc_xxx"), {
      target: { value: " 结算群 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "查询群聊" }));
    await waitFor(() =>
      expect(directoryState.resolveChats).toHaveBeenCalledWith("cli_reminder", "结算群"),
    );
    fireEvent.change(screen.getByPlaceholderText("user1@example.com, user2@example.com"), {
      target: { value: "alice@example.com, bob@example.com, alice@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "通过邮箱查询" }));
    await waitFor(() =>
      expect(directoryState.resolveUsers).toHaveBeenCalledWith("cli_reminder", [
        "alice@example.com",
        "bob@example.com",
      ]),
    );
    fireEvent.change(screen.getByPlaceholderText("请确认并回复本消息"), {
      target: { value: " 请确认并回复 " },
    });
    fireEvent.change(screen.getByPlaceholderText("30"), {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建并开启" }));

    await waitFor(() =>
      expect(reminderState.current.create).toHaveBeenCalledWith({
        name: "等待确认",
        botId: "bot-1",
        chatId: "oc_group",
        targetOpenIds: ["ou_alice", "ou_bob"],
        message: "请确认并回复",
        frequencySeconds: 900,
        sender: { type: "bot" },
        enabled: true,
      }),
    );
  });

  test("uses the Paseo-managed OAuth identity without asking for an environment variable", async () => {
    reminderState.current.create.mockResolvedValue(makeReminder({ sender: { type: "user" } }));
    directoryState.resolveChats.mockResolvedValue([
      {
        appId: "cli_reminder",
        groupId: "oc_group",
        chatId: "oc_group",
        name: "结算群",
        updatedAt: "2026-08-19T00:00:00.000Z",
      },
    ]);
    directoryState.resolveUsers.mockResolvedValue([
      {
        appId: "cli_reminder",
        email: "alice@example.com",
        openId: "ou_alice",
        displayName: "Alice",
        updatedAt: "2026-08-19T00:00:00.000Z",
      },
    ]);
    renderReminderEditor();

    fireEvent.change(screen.getByPlaceholderText("输入群名称、群 ID 或 oc_xxx"), {
      target: { value: "oc_group" },
    });
    fireEvent.click(screen.getByRole("button", { name: "查询群聊" }));
    await waitFor(() => expect(directoryState.resolveChats).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText("user1@example.com, user2@example.com"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "通过邮箱查询" }));
    await waitFor(() => expect(directoryState.resolveUsers).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText("请确认并回复本消息"), {
      target: { value: "请回复" },
    });
    fireEvent.change(screen.getByLabelText("发送身份"), {
      target: { value: "user" },
    });
    expect(screen.getByTestId("lark-user-oauth-card").textContent).toContain("cli_reminder");
    expect(screen.queryByText("user_access_token 环境变量")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "创建并开启" }));

    await waitFor(() =>
      expect(reminderState.current.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: { type: "user" },
        }),
      ),
    );
  });

  test("shows complete group and user identities in reminder records", () => {
    reminderState.current.reminders = [
      makeReminder({
        status: "completed",
        reply: {
          messageId: "om_reply",
          openId: "ou_alice",
          displayName: "Alice",
          text: "收到",
          repliedAt: "2026-08-18T08:05:00.000Z",
        },
      }),
    ];
    renderReminderSection({
      users: [
        {
          appId: "cli_reminder",
          email: "alice@example.com",
          openId: "ou_alice",
          displayName: "张三",
          updatedAt: "2026-08-18T08:00:00.000Z",
        },
      ],
      chats: [
        {
          appId: "cli_reminder",
          groupId: "group_settlement",
          chatId: "oc_group",
          name: "结算群",
          updatedAt: "2026-08-18T08:00:00.000Z",
        },
      ],
    });

    expect(
      screen.getByText(
        /群 结算群（group_settlement，oc_group） · 被提醒人 张三（alice@example.com，ou_alice）/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/张三（alice@example.com，ou_alice） 已于/)).toBeTruthy();
  });

  test("opens, stops, starts, and deletes reminder tasks", async () => {
    reminderState.current.reminders = [
      makeReminder(),
      makeReminder({ id: "reminder-2", name: "已停止任务", status: "paused" }),
    ];
    const onEdit = vi.fn();
    reminderState.current.setEnabled.mockResolvedValue(makeReminder());
    reminderState.current.deleteReminder.mockResolvedValue(undefined);
    renderReminderSection(EMPTY_DIRECTORY, vi.fn(), onEdit);

    fireEvent.click(screen.getAllByRole("button", { name: "编辑" })[0]!);
    fireEvent.click(screen.getByLabelText("等待确认 reminder enabled"));
    fireEvent.click(screen.getByLabelText("已停止任务 reminder enabled"));
    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]!);

    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "reminder-1" }));
      expect(reminderState.current.setEnabled).toHaveBeenCalledWith("reminder-1", false);
      expect(reminderState.current.setEnabled).toHaveBeenCalledWith("reminder-2", true);
      expect(reminderState.current.deleteReminder).toHaveBeenCalledWith("reminder-1");
    });
  });

  test("fills and updates an existing reminder", async () => {
    const reminder = makeReminder();
    const onSaved = vi.fn();
    reminderState.current.update.mockResolvedValue(reminder);
    renderReminderEditor({ reminder, onSaved });

    expect((screen.getByPlaceholderText("例如：等待方案确认") as HTMLInputElement).value).toBe(
      "等待确认",
    );
    expect((screen.getByPlaceholderText("请确认并回复本消息") as HTMLInputElement).value).toBe(
      "请确认并回复",
    );
    expect((screen.getByPlaceholderText("30") as HTMLInputElement).value).toBe("10");

    fireEvent.change(screen.getByPlaceholderText("例如：等待方案确认"), {
      target: { value: "更新后的任务" },
    });
    fireEvent.change(screen.getByPlaceholderText("请确认并回复本消息"), {
      target: { value: "新的提醒文案" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(reminderState.current.update).toHaveBeenCalledWith("reminder-1", {
        name: "更新后的任务",
        botId: "bot-1",
        chatId: "oc_group",
        targetOpenIds: ["ou_alice"],
        message: "新的提醒文案",
        frequencySeconds: 600,
        sender: { type: "bot" },
      }),
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
