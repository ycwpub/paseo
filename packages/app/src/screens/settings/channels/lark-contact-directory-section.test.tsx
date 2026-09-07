/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  LarkChannelBotStatus,
  LarkDirectory,
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
) {
  render(
    <LarkContactDirectoryPage
      bots={[createBot()]}
      directory={directory}
      selectedBotId="bot-1"
      connected
      supportsOpenIdLookup
      onSelectBot={vi.fn()}
      onEdit={vi.fn()}
      onResolve={onResolve}
      onResolveUsers={onResolveUsers}
    />,
  );
  return { onResolve, onResolveUsers };
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

    expect(await screen.findByText("alice@example.com · ou_existing")).toBeTruthy();
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
    expect(await screen.findByText("alice@example.com · ou_alice")).toBeTruthy();
  });
});
