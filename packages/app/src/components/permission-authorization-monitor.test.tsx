/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PermissionAuthorizationMonitor } from "./permission-authorization-monitor";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const runtime = vi.hoisted(() => ({
  getLarkChannelStatus: vi.fn(),
  getLarkUserOAuthStatus: vi.fn(),
  startLarkUserOAuth: vi.fn(),
  verifyLarkUserOAuth: vi.fn(),
}));
const openExternalUrl = vi.hoisted(() => vi.fn());
const theme = vi.hoisted(() => ({
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 },
  borderRadius: { md: 6, lg: 8 },
  borderWidth: { 1: 1 },
  fontSize: { sm: 13, base: 15 },
  fontWeight: { medium: "500" },
  colors: {
    surface1: "#111",
    border: "#444",
    foreground: "#fff",
    foregroundMuted: "#aaa",
    destructive: "#f00",
    accent: "#0a0",
    accentForeground: "#fff",
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    absoluteFillObject: {},
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHosts: () => [{ serverId: "server-1" }],
  useHostRuntimeClient: () => runtime,
  useHostRuntimeIsConnected: () => true,
}));

vi.mock("@/stores/session-store", () => ({
  useSessionStore: (selector: (state: { sessions: Record<string, unknown> }) => unknown) =>
    selector({ sessions: {} }),
}));

vi.mock("@/utils/open-external-url", () => ({ openExternalUrl }));

describe("PermissionAuthorizationMonitor", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("opens a fresh Lark OAuth link when a configured bot needs authorization", async () => {
    runtime.getLarkChannelStatus.mockResolvedValue({
      error: null,
      status: { bots: [{ id: "bot-1", name: "结算机器人", appId: "cli_test" }] },
    });
    runtime.getLarkUserOAuthStatus.mockResolvedValue({
      error: null,
      status: { needsAuthorization: true },
    });
    runtime.startLarkUserOAuth.mockResolvedValue({
      error: null,
      authorizationUrl: "https://accounts.feishu.cn/open-apis/authen/v1/authorize?state=test",
    });

    render(<PermissionAuthorizationMonitor />);

    expect(await screen.findByText("飞书用户授权已失效")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "立即授权" }));

    await waitFor(() => {
      expect(runtime.startLarkUserOAuth).toHaveBeenCalledWith({
        appId: "cli_test",
        redirectUri: "http://127.0.0.1:6767/oauth/lark",
      });
      expect(openExternalUrl).toHaveBeenCalledWith(
        "https://accounts.feishu.cn/open-apis/authen/v1/authorize?state=test",
      );
    });
  });

  test("verifies authorization with the daemon after the user returns from OAuth", async () => {
    runtime.getLarkChannelStatus.mockResolvedValue({
      error: null,
      status: { bots: [{ id: "bot-1", name: "结算机器人", appId: "cli_test" }] },
    });
    runtime.getLarkUserOAuthStatus.mockResolvedValue({
      error: null,
      status: { needsAuthorization: true },
    });
    runtime.startLarkUserOAuth.mockResolvedValue({
      error: null,
      authorizationUrl: "https://accounts.feishu.cn/open-apis/authen/v1/authorize?state=test",
    });
    runtime.verifyLarkUserOAuth.mockResolvedValue({
      error: null,
      status: { authorized: true },
    });

    render(<PermissionAuthorizationMonitor />);

    expect(await screen.findByText("飞书用户授权已失效")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "已授权，校验" }));

    await waitFor(() => {
      expect(runtime.verifyLarkUserOAuth).toHaveBeenCalledWith({ appId: "cli_test" });
    });
  });

  test("detects a remotely revoked grant during the scheduled health check", async () => {
    runtime.getLarkChannelStatus.mockResolvedValue({
      error: null,
      status: { bots: [{ id: "bot-1", name: "结算机器人", appId: "cli_test" }] },
    });
    runtime.getLarkUserOAuthStatus.mockResolvedValue({
      error: null,
      status: { needsAuthorization: false },
    });
    runtime.verifyLarkUserOAuth.mockResolvedValue({
      error: "飞书用户身份未授权或已失效",
      status: { authorized: false },
    });

    render(<PermissionAuthorizationMonitor />);

    expect(await screen.findByText("飞书用户授权已失效")).toBeTruthy();
    expect(runtime.verifyLarkUserOAuth).toHaveBeenCalledWith({ appId: "cli_test" });
  });
});
