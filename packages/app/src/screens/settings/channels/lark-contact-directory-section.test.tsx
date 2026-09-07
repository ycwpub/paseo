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

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function"
        ? factory({
            spacing: { 2: 8, 4: 16 },
            fontSize: { sm: 12 },
            colors: { foreground: "#111" },
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
) {
  render(
    <LarkContactDirectoryPage
      bots={[createBot()]}
      directory={directory}
      selectedBotId="bot-1"
      connected={connected}
      supportsOpenIdLookup
      supportsPrivateUserScan
      onSelectBot={vi.fn()}
      onEdit={vi.fn()}
      onResolve={onResolve}
      onResolveUsers={onResolveUsers}
      onScanPrivateUsers={onScanPrivateUsers}
      onAddPrivateUser={onAddPrivateUser}
    />,
  );
  return { onResolve, onResolveUsers, onScanPrivateUsers, onAddPrivateUser };
}

afterEach(cleanup);

describe("Lark contact directory", () => {
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
      expect(result.onScanPrivateUsers).toHaveBeenCalledWith("cli_test", 30);
    });
    expect(await screen.findByText("扫描结果（1）")).toBeTruthy();
    expect(screen.getByText("最近消息：现在有结果了吗")).toBeTruthy();

    fireEvent.click(screen.getByTestId("host-page-lark-contact-private-add-ou_recent"));
    await waitFor(() => {
      expect(result.onAddPrivateUser).toHaveBeenCalledWith(candidate);
    });
    expect(await screen.findByText("已在通讯录")).toBeTruthy();
  });
});
