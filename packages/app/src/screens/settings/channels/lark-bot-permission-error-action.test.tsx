/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LarkBotPermissionErrorAction } from "./lark-bot-permission-error-action";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const { client, openExternalUrl } = vi.hoisted(() => ({
  client: {
    applyLarkBot: vi.fn(),
    getLarkBotApplication: vi.fn(),
  },
  openExternalUrl: vi.fn(),
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function"
        ? factory({
            spacing: { 1: 4 },
            fontSize: { sm: 13 },
            colors: { accent: "#4f46e5" },
          })
        : factory,
  },
}));

vi.mock("@/styles/settings", () => ({
  settingsStyles: {
    rowError: {},
    rowHint: {},
  },
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => client,
}));

vi.mock("@/utils/open-external-url", () => ({
  openExternalUrl,
}));

function completedApplication() {
  return {
    id: "application-1",
    status: "completed" as const,
    qrUrl: null,
    expiresAt: null,
    message: "机器人权限配置已提交，将在重新执行任务时验证是否生效",
    error: null,
    botId: "bot-1",
    appId: "cli_test",
    domain: "feishu" as const,
    requirements: null,
  };
}

describe("LarkBotPermissionErrorAction", () => {
  afterEach(() => {
    cleanup();
    client.applyLarkBot.mockReset();
    client.getLarkBotApplication.mockReset();
    openExternalUrl.mockReset();
  });

  test("retries the failed task after the permission configuration is submitted", async () => {
    client.applyLarkBot.mockResolvedValue({
      application: completedApplication(),
      error: null,
    });
    const onAuthorized = vi.fn(async () => {});

    render(
      <LarkBotPermissionErrorAction
        serverId="server-1"
        appId="cli_test"
        botId="bot-1"
        errorMessage="飞书机器人应用身份权限不足，请更新机器人权限"
        onAuthorized={onAuthorized}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "更新飞书机器人权限" }));

    await waitFor(() => expect(onAuthorized).toHaveBeenCalledTimes(1));
    expect(screen.getByText("权限已生效，任务已重新执行")).toBeTruthy();
  });

  test("does not claim success when the retried API call still lacks permission", async () => {
    client.applyLarkBot.mockResolvedValue({
      application: completedApplication(),
      error: null,
    });
    const onAuthorized = vi.fn(async () => {
      throw new Error("仍缺少 base:record:read");
    });

    render(
      <LarkBotPermissionErrorAction
        serverId="server-1"
        appId="cli_test"
        botId="bot-1"
        errorMessage="飞书机器人应用身份权限不足，请更新机器人权限"
        onAuthorized={onAuthorized}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "更新飞书机器人权限" }));

    await waitFor(() => expect(screen.getByText("重新验证并执行")).toBeTruthy());
    expect(
      screen.getByText("权限配置已提交，但重新执行任务失败：仍缺少 base:record:read"),
    ).toBeTruthy();
  });
});
