/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { LarkUserOAuthCard } from "./lark-user-oauth-card";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const oauth = vi.hoisted(() => ({
  status: {
    authorized: true,
    needsAuthorization: false,
    appId: "cli_test",
    expiresAt: null,
    refreshTokenExpiresAt: null,
    openId: null,
    email: null,
    displayName: null,
    scope: null,
  },
  isMutating: false,
  error: null as Error | null,
  mutationError: null as Error | null,
  start: vi.fn(),
  verify: vi.fn(),
  disconnect: vi.fn(),
  refreshStatus: vi.fn(),
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    absoluteFillObject: {},
    create: (factory: unknown) =>
      typeof factory === "function"
        ? factory({
            spacing: { 2: 8, 3: 12, 4: 16, 6: 24 },
            borderRadius: { lg: 8 },
            borderWidth: { 1: 1 },
            fontSize: { sm: 13, base: 15 },
            fontWeight: { medium: "500" },
            colors: {
              surface1: "#111",
              border: "#444",
              foreground: "#fff",
              foregroundMuted: "#aaa",
              destructive: "#f00",
            },
          })
        : factory,
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onPress} type="button">
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/form-field", () => ({
  Field: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  FormTextInput: () => <input />,
}));

vi.mock("@/screens/settings/settings-section", () => ({
  SettingsSection: ({ children }: { children?: React.ReactNode }) => <section>{children}</section>,
}));

vi.mock("@/styles/settings", () => ({
  settingsStyles: {
    rowError: {},
    rowHint: {},
    rowTitle: {},
  },
}));

vi.mock("@/screens/settings/channels/lark-directory-format", () => ({
  formatLarkUserIdentity: () => "",
}));

vi.mock("@/screens/settings/channels/use-lark-user-oauth", () => ({
  useLarkUserOAuth: () => oauth,
}));

vi.mock("@/utils/open-external-url", () => ({
  openExternalUrl: vi.fn(),
}));

describe("LarkUserOAuthCard", () => {
  afterEach(() => {
    cleanup();
    oauth.verify.mockReset();
    oauth.start.mockReset();
    oauth.disconnect.mockReset();
    oauth.refreshStatus.mockReset();
    oauth.error = null;
    oauth.mutationError = null;
  });

  test("opens an authorization dialog when one-click validation detects an expired grant", async () => {
    oauth.verify.mockRejectedValue(
      new Error("飞书用户身份未授权或已失效，请先为 App ID cli_test 完成 OAuth 授权"),
    );

    render(<LarkUserOAuthCard serverId="server-1" appId="cli_test" />);

    fireEvent.click(screen.getByRole("button", { name: "一键校验权限" }));

    expect(await screen.findByText("飞书用户授权已失效")).toBeTruthy();
    expect(screen.getByText("http://127.0.0.1:6767/oauth/lark")).toBeTruthy();
    await waitFor(() => expect(oauth.verify).toHaveBeenCalledTimes(1));
  });
});
