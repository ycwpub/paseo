/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ProjectLarkGroupsList } from "./project-lark-groups-list";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const openProjectLarkGroupSettings = vi.fn();

vi.mock("react-native", () => ({
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
    <div data-testid={testID}>{children}</div>
  ),
}));

vi.mock("lucide-react-native", () => ({
  Pencil: () => <span />,
  Plus: () => <span />,
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function"
        ? factory({
            colors: { destructive: "#f00" },
            fontSize: { sm: 12 },
          })
        : factory,
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => (
    <button type="button" onClick={onPress} aria-label={accessibilityLabel}>
      {children}
    </button>
  ),
}));

vi.mock("@/screens/settings/settings-group", () => ({
  SettingsGroup: ({
    title,
    trailing,
    children,
  }: {
    title: string;
    trailing?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {trailing}
      {children}
    </section>
  ),
}));

vi.mock("@/styles/settings", () => ({
  settingsStyles: {
    card: {},
    row: {},
    rowBorder: {},
    rowContent: {},
    rowTitle: {},
    rowHint: {},
  },
}));

vi.mock("@/navigation/settings-feature-navigation", () => ({
  openProjectLarkGroupSettings: (...args: unknown[]) => openProjectLarkGroupSettings(...args),
}));

vi.mock("@/screens/settings/channels/use-lark-channel", () => ({
  useLarkChannel: () => ({
    status: {
      bots: [
        {
          id: "bot-1",
          name: "结算助手机器人",
          appId: "cli_test",
        },
      ],
      directory: {
        chats: [
          {
            appId: "cli_test",
            chatId: "oc_settlement",
            groupId: "group_settlement",
            name: "结算研发群",
          },
        ],
      },
    },
    error: null,
  }),
}));

afterEach(() => {
  cleanup();
  openProjectLarkGroupSettings.mockReset();
});

describe("ProjectLarkGroupsList", () => {
  test("shows the configured group array with create and edit actions", () => {
    render(
      <ProjectLarkGroupsList
        serverId="host-1"
        projectId="project-1"
        groups={[
          {
            rowId: "row-1",
            id: "group-config-1",
            botId: "bot-1",
            chatId: "oc_settlement",
            enabled: true,
            messageLimitText: "50",
            rawEntry: {
              id: "group-config-1",
              botId: "bot-1",
              chatId: "oc_settlement",
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("结算研发群（group_settlement，oc_settlement）")).toBeTruthy();
    expect(screen.getByText(/结算助手机器人（cli_test） · 已启用 · 最近 50 条消息/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "创建" }));
    expect(openProjectLarkGroupSettings).toHaveBeenLastCalledWith("host-1", "project-1");

    fireEvent.click(
      screen.getByRole("button", {
        name: "编辑飞书群 结算研发群（group_settlement，oc_settlement）",
      }),
    );
    expect(openProjectLarkGroupSettings).toHaveBeenLastCalledWith(
      "host-1",
      "project-1",
      "group-config-1",
    );
  });
});
