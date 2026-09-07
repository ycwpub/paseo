/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  LarkChannelBotStatus,
  LarkDirectory,
  LarkDirectoryRecentPrivateUser,
  LarkDirectoryUser,
} from "@getpaseo/protocol/messages";
import { LarkContactDirectoryPage } from "./lark-contact-directory-section";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const confirmDialogMock = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/utils/confirm-dialog", () => ({
  confirmDialog: confirmDialogMock,
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function"
        ? factory({
            spacing: { 2: 8, 4: 16 },
            borderRadius: { sm: 4 },
            fontSize: { sm: 12 },
            colors: {
              foreground: "#111",
              foregroundExtraMuted: "#999",
              primary: "#00f",
              primaryForeground: "#fff",
            },
          })
        : factory,
  },
}));

vi.mock("@/styles/settings", () => ({
  settingsStyles: {
    card: {},
    row: {},
    rowBorder: {},
    rowContent: {},
    rowTitle: {},
    rowHint: {},
    rowError: {},
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

vi.mock("@/components/ui/form-field", () => ({
  Field: ({
    label,
    children,
    error,
  }: {
    label: string;
    children: ReactNode;
    error?: string | null;
  }) => (
    <label>
      <span>{label}</span>
      {children}
      {error ? <span>{error}</span> : null}
    </label>
  ),
  FormTextInput: ({
    value,
    initialValue,
    placeholder,
    onChangeText,
    testID,
  }: {
    value?: string;
    initialValue?: string;
    placeholder?: string;
    onChangeText?: (value: string) => void;
    testID?: string;
  }) => {
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        onChangeText?.(event.currentTarget.value);
      },
      [onChangeText],
    );
    return (
      <input
        value={value ?? initialValue ?? ""}
        placeholder={placeholder}
        data-testid={testID}
        onChange={handleChange}
      />
    );
  },
}));

vi.mock("@/components/ui/select-field", () => ({
  SelectField: () => <div />,
}));

function createBot(): LarkChannelBotStatus {
  return {
    id: "bot-1",
    appId: "cli_test",
    name: "测试机器人",
  } as LarkChannelBotStatus;
}

function createUser(input: Partial<LarkDirectoryUser> = {}): LarkDirectoryUser {
  return {
    appId: "cli_test",
    openId: "ou_existing",
    displayName: null,
    email: null,
    firstMessageContent: "你好",
    firstMessageAt: "2026-09-06T14:58:40.000Z",
    updatedAt: "2026-09-06T14:58:40.000Z",
    ...input,
  };
}

function renderDirectory(
  directory: LarkDirectory,
  onResolve = vi.fn(async () => createUser()),
  onResolveUsers = vi.fn(async () => [createUser()]),
  connected = true,
  onScanPrivateUsers = vi.fn(async () => [] as LarkDirectoryRecentPrivateUser[]),
  onAddPrivateUser = vi.fn(async (user: LarkDirectoryRecentPrivateUser) =>
    createUser({
      openId: user.openId,
      displayName: user.displayName,
      firstMessageContent: user.firstMessageContent,
      firstMessageAt: user.firstMessageAt,
    }),
  ),
  onClearFirstMessages = vi.fn(async () => 0),
  onCreate = vi.fn(async (input) => createUser(input)),
  onDeleteMany = vi.fn(async (_appId: string, openIds: string[]) => openIds),
) {
  render(
    <LarkContactDirectoryPage
      bots={[createBot()]}
      directory={directory}
      selectedBotId="bot-1"
      connected={connected}
      supportsOpenIdLookup
      supportsPrivateUserScan
      supportsClearFirstMessages
      onSelectBot={vi.fn()}
      onEdit={vi.fn()}
      onResolve={onResolve}
      onResolveUsers={onResolveUsers}
      onCreate={onCreate}
      onDeleteMany={onDeleteMany}
      onScanPrivateUsers={onScanPrivateUsers}
      onAddPrivateUser={onAddPrivateUser}
      onClearFirstMessages={onClearFirstMessages}
    />,
  );
  return {
    onResolve,
    onResolveUsers,
    onScanPrivateUsers,
    onAddPrivateUser,
    onClearFirstMessages,
    onCreate,
    onDeleteMany,
  };
}

afterEach(() => {
  cleanup();
  confirmDialogMock.mockClear();
  confirmDialogMock.mockResolvedValue(true);
});

describe("Lark contact directory", () => {
  test("creates a local contact for the selected bot", async () => {
    const onCreate = vi.fn(async (input) => createUser(input));
    renderDirectory(
      { users: [], chats: [] },
      vi.fn(async () => createUser()),
      vi.fn(async () => []),
      true,
      vi.fn(async () => []),
      vi.fn(async (user: LarkDirectoryRecentPrivateUser) => createUser({ openId: user.openId })),
      vi.fn(async () => 0),
      onCreate,
    );

    fireEvent.change(screen.getByTestId("host-page-lark-contact-create-open-id"), {
      target: { value: " ou_new " },
    });
    fireEvent.change(screen.getByTestId("host-page-lark-contact-create-name"), {
      target: { value: " 张三 " },
    });
    fireEvent.change(screen.getByTestId("host-page-lark-contact-create-email"), {
      target: { value: " Alice@Example.com " },
    });
    fireEvent.click(screen.getByTestId("host-page-lark-contact-create"));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        appId: "cli_test",
        openId: "ou_new",
        displayName: "张三",
        email: "Alice@Example.com",
      });
    });
  });

  test("selects visible contacts and batch deletes them after confirmation", async () => {
    const onDeleteMany = vi.fn(async (_appId: string, openIds: string[]) => openIds);
    renderDirectory(
      {
        users: [
          createUser({ openId: "ou_alice", displayName: "张三" }),
          createUser({ openId: "ou_bob", displayName: "李四" }),
          createUser({ appId: "cli_other", openId: "ou_other", displayName: "其他机器人" }),
        ],
        chats: [],
      },
      vi.fn(async () => createUser()),
      vi.fn(async () => []),
      true,
      vi.fn(async () => []),
      vi.fn(async (user: LarkDirectoryRecentPrivateUser) => createUser({ openId: user.openId })),
      vi.fn(async () => 0),
      vi.fn(async (input) => createUser(input)),
      onDeleteMany,
    );

    fireEvent.change(screen.getByTestId("host-page-lark-contacts-search"), {
      target: { value: "张三" },
    });
    fireEvent.click(screen.getByTestId("host-page-lark-contacts-select-all"));
    fireEvent.click(screen.getByTestId("host-page-lark-contacts-delete-selected"));

    await waitFor(() => {
      expect(confirmDialogMock).toHaveBeenCalledWith({
        title: "删除 1 个联系人？",
        message: "将从当前飞书机器人的本地通讯录中删除所选联系人。此操作无法撤销。",
        confirmLabel: "删除",
        cancelLabel: "取消",
        destructive: true,
      });
      expect(onDeleteMany).toHaveBeenCalledWith("cli_test", ["ou_alice"]);
    });
  });

  test("resolves an ou_id and adds it to the selected bot directory", async () => {
    const { onResolve } = renderDirectory({ users: [], chats: [] });

    fireEvent.change(screen.getByTestId("host-page-lark-contact-add-open-id"), {
      target: { value: " ou_new " },
    });
    fireEvent.click(screen.getByTestId("host-page-lark-contact-add"));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith("cli_test", "ou_new");
    });
  });

  test("keeps a contact and explains when the email field is unavailable", async () => {
    const onResolve = vi.fn(async () =>
      createUser({
        openId: "ou_yuan",
        displayName: "袁昌旺",
        email: null,
      }),
    );
    renderDirectory({ users: [], chats: [] }, onResolve);

    fireEvent.change(screen.getByTestId("host-page-lark-contact-add-open-id"), {
      target: { value: "ou_yuan" },
    });
    fireEvent.click(screen.getByTestId("host-page-lark-contact-add"));

    expect(
      await screen.findByText(
        "已添加联系人“袁昌旺”（ou_yuan），但当前机器人无法读取邮箱字段。请检查 contact:user.email:readonly 权限和应用通讯录范围。",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/No visible Lark user found/)).toBeNull();
  });

  test("offers automatic resolution only when contact identity is incomplete", async () => {
    const incomplete = createUser();
    const complete = createUser({
      openId: "ou_complete",
      displayName: "李四",
      email: "lisi@example.com",
    });
    const { onResolve } = renderDirectory({ users: [incomplete, complete], chats: [] });

    expect(screen.queryByTestId("host-page-lark-contact-resolve-ou_complete")).toBeNull();
    fireEvent.click(screen.getByTestId("host-page-lark-contact-resolve-ou_existing"));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith("cli_test", "ou_existing");
    });
  });

  test("finds an ou_id by username from the current bot contact directory", async () => {
    const { onResolveUsers } = renderDirectory({
      users: [createUser({ displayName: "张三", email: "alice@example.com" })],
      chats: [],
    });

    fireEvent.change(screen.getByTestId("host-page-lark-contact-identity-query"), {
      target: { value: "张三" },
    });
    fireEvent.click(screen.getByTestId("host-page-lark-contact-identity-search"));

    const results = await screen.findByTestId("host-page-lark-contact-identity-results");
    expect(within(results).getByText("查询结果（1）")).toBeTruthy();
    expect(within(results).getByText("邮箱：alice@example.com")).toBeTruthy();
    expect(within(results).getByText("ou_id：ou_existing")).toBeTruthy();
    expect(onResolveUsers).not.toHaveBeenCalled();
  });

  test("keeps identity lookup clickable while the host connection is recovering", async () => {
    const { onResolveUsers } = renderDirectory(
      {
        users: [createUser({ displayName: "张三", email: "alice@example.com" })],
        chats: [],
      },
      vi.fn(async () => createUser()),
      vi.fn(async () => [createUser()]),
      false,
    );

    fireEvent.change(screen.getByTestId("host-page-lark-contact-identity-query"), {
      target: { value: "张三" },
    });
    const searchButton = screen.getByTestId("host-page-lark-contact-identity-search");
    expect((searchButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(searchButton);

    const results = await screen.findByTestId("host-page-lark-contact-identity-results");
    expect(within(results).getByText("ou_id：ou_existing")).toBeTruthy();
    expect(onResolveUsers).not.toHaveBeenCalled();
  });

  test("resolves an ou_id by email and adds the returned contact", async () => {
    const resolved = createUser({
      openId: "ou_alice",
      displayName: "张三",
      email: "alice@example.com",
    });
    const onResolveUsers = vi.fn(async () => [resolved]);
    renderDirectory(
      { users: [], chats: [] },
      vi.fn(async () => resolved),
      onResolveUsers,
    );

    fireEvent.change(screen.getByTestId("host-page-lark-contact-identity-query"), {
      target: { value: " alice@example.com " },
    });
    fireEvent.click(screen.getByTestId("host-page-lark-contact-identity-search"));

    await waitFor(() => {
      expect(onResolveUsers).toHaveBeenCalledWith("cli_test", ["alice@example.com"]);
    });
    const results = await screen.findByTestId("host-page-lark-contact-identity-results");
    expect(within(results).getByText("邮箱：alice@example.com")).toBeTruthy();
    expect(within(results).getByText("ou_id：ou_alice")).toBeTruthy();
  });

  test("keeps the general contact search independent from identity lookup", async () => {
    renderDirectory({
      users: [createUser({ displayName: "张三", email: "alice@example.com" })],
      chats: [],
    });

    fireEvent.change(screen.getByTestId("host-page-lark-contact-identity-query"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.click(screen.getByTestId("host-page-lark-contact-identity-search"));

    await screen.findByTestId("host-page-lark-contact-identity-results");
    expect((screen.getByTestId("host-page-lark-contacts-search") as HTMLInputElement).value).toBe(
      "",
    );
  });

  test("scans the last 30 minutes by default and adds a selected private user", async () => {
    const candidate: LarkDirectoryRecentPrivateUser = {
      appId: "cli_test",
      openId: "ou_recent",
      displayName: "李四",
      firstMessageContent: "请帮忙看一下",
      firstMessageAt: "2026-09-07T08:00:00.000Z",
      lastMessageContent: "现在有结果了吗",
      lastMessageAt: "2026-09-07T08:10:00.000Z",
      messageCount: 2,
      inDirectory: false,
    };
    const onScanPrivateUsers = vi.fn(async () => [candidate]);
    const onAddPrivateUser = vi.fn(async () =>
      createUser({
        openId: candidate.openId,
        displayName: candidate.displayName,
        firstMessageContent: candidate.firstMessageContent,
        firstMessageAt: candidate.firstMessageAt,
      }),
    );
    const result = renderDirectory(
      { users: [], chats: [] },
      vi.fn(async () => createUser()),
      vi.fn(async () => []),
      true,
      onScanPrivateUsers,
      onAddPrivateUser,
    );

    expect(
      (screen.getByTestId("host-page-lark-contact-private-lookback") as HTMLInputElement).value,
    ).toBe("30");
    fireEvent.click(screen.getByTestId("host-page-lark-contact-private-scan"));

    await waitFor(() => {
      expect(result.onScanPrivateUsers).toHaveBeenCalledWith("cli_test", {
        lookbackMinutes: 30,
      });
    });
    expect(await screen.findByText("扫描结果（1）")).toBeTruthy();
    expect(screen.getByText("最近消息：现在有结果了吗")).toBeTruthy();

    fireEvent.click(screen.getByTestId("host-page-lark-contact-private-add-ou_recent"));
    await waitFor(() => {
      expect(result.onAddPrivateUser).toHaveBeenCalledWith(candidate);
    });
    expect(await screen.findByText("已在通讯录")).toBeTruthy();
  });

  test("scans private users within an explicit message time range", async () => {
    const result = renderDirectory({ users: [], chats: [] });
    fireEvent.change(screen.getByTestId("host-page-lark-contact-private-start-time"), {
      target: { value: "2026-09-06 09:00" },
    });
    fireEvent.change(screen.getByTestId("host-page-lark-contact-private-end-time"), {
      target: { value: "2026-09-06 10:30" },
    });
    fireEvent.click(screen.getByTestId("host-page-lark-contact-private-scan"));

    await waitFor(() => {
      expect(result.onScanPrivateUsers).toHaveBeenCalledWith("cli_test", {
        lookbackMinutes: 30,
        startTime: Math.floor(new Date("2026-09-06T09:00").getTime() / 1_000),
        endTime: Math.floor(new Date("2026-09-06T10:30").getTime() / 1_000),
      });
    });
  });

  test("clears first message content for every contact of the selected bot", async () => {
    const onClearFirstMessages = vi.fn(async () => 2);
    renderDirectory(
      {
        users: [
          createUser({ openId: "ou_first", firstMessageContent: "第一条" }),
          createUser({ openId: "ou_second", firstMessageContent: "第二条" }),
          createUser({
            appId: "cli_other",
            openId: "ou_other",
            firstMessageContent: "其他机器人消息",
          }),
        ],
        chats: [],
      },
      vi.fn(async () => createUser()),
      vi.fn(async () => []),
      true,
      vi.fn(async () => []),
      vi.fn(async (user: LarkDirectoryRecentPrivateUser) => createUser({ openId: user.openId })),
      onClearFirstMessages,
    );

    fireEvent.click(screen.getByTestId("host-page-lark-contacts-clear-first-messages"));

    await waitFor(() => {
      expect(confirmDialogMock).toHaveBeenCalledWith({
        title: "清空全部首次消息？",
        message:
          "将清空当前机器人下所有联系人的首次消息内容，用户名、邮箱、ou_id 和首次消息时间不会删除。此操作无法撤销。",
        confirmLabel: "清空",
        cancelLabel: "取消",
        destructive: true,
      });
      expect(onClearFirstMessages).toHaveBeenCalledWith("cli_test");
    });
    expect(await screen.findByText("已清空 2 个联系人的首次消息内容。")).toBeTruthy();
  });
});
