/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_LARK_USER_OAUTH_REDIRECT_URI } from "@getpaseo/protocol/messages";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  isLarkUserOAuthRequiredError,
  LarkUserOAuthErrorAction,
} from "./lark-user-oauth-error-action";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const { oauthState, openExternalUrl } = vi.hoisted(() => ({
  oauthState: {
    status: null as { authorized: boolean } | null,
    isMutating: false,
    mutationError: null as Error | null,
    start: vi.fn(),
    refreshStatus: vi.fn(),
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

vi.mock("@/utils/open-external-url", () => ({
  openExternalUrl,
}));

vi.mock("./use-lark-user-oauth", () => ({
  useLarkUserOAuth: () => oauthState,
}));

describe("LarkUserOAuthErrorAction", () => {
  afterEach(() => {
    cleanup();
    oauthState.status = null;
    oauthState.isMutating = false;
    oauthState.mutationError = null;
    oauthState.start.mockReset();
    oauthState.refreshStatus.mockReset();
    openExternalUrl.mockReset();
  });

  test("recognizes only user OAuth authorization errors", () => {
    expect(
      isLarkUserOAuthRequiredError(
        "飞书用户身份未授权或已失效，请先为 App ID cli_test 完成 OAuth 授权",
      ),
    ).toBe(true);
    expect(isLarkUserOAuthRequiredError("查询群聊失败")).toBe(false);
  });

  test("creates a fresh authorization URL and opens it directly", async () => {
    oauthState.start.mockResolvedValue({
      authorizationUrl: "https://open.feishu.cn/open-apis/authen/v1/authorize?state=fresh",
      state: "fresh",
    });
    openExternalUrl.mockResolvedValue(undefined);

    render(
      <LarkUserOAuthErrorAction
        serverId="server-1"
        appId="cli_test"
        errorMessage="飞书用户身份未授权或已失效，请先为 App ID cli_test 完成 OAuth 授权"
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "立即授权飞书用户身份" }));

    await waitFor(() =>
      expect(oauthState.start).toHaveBeenCalledWith(DEFAULT_LARK_USER_OAUTH_REDIRECT_URI),
    );
    expect(openExternalUrl).toHaveBeenCalledWith(
      "https://open.feishu.cn/open-apis/authen/v1/authorize?state=fresh",
    );
    expect(screen.getByText("已打开飞书授权页面，完成后将自动刷新。")).toBeTruthy();
  });

  test("clears the stale lookup error after authorization succeeds", async () => {
    const onAuthorized = vi.fn();
    oauthState.start.mockResolvedValue({
      authorizationUrl: "https://open.feishu.cn/open-apis/authen/v1/authorize?state=fresh",
      state: "fresh",
    });
    openExternalUrl.mockResolvedValue(undefined);

    const view = render(
      <LarkUserOAuthErrorAction
        serverId="server-1"
        appId="cli_test"
        errorMessage="飞书用户身份未授权或已失效，请先为 App ID cli_test 完成 OAuth 授权"
        onAuthorized={onAuthorized}
      />,
    );
    fireEvent.click(screen.getByRole("link", { name: "立即授权飞书用户身份" }));
    await waitFor(() => expect(openExternalUrl).toHaveBeenCalled());

    oauthState.status = { authorized: true };
    view.rerender(
      <LarkUserOAuthErrorAction
        serverId="server-1"
        appId="cli_test"
        errorMessage="飞书用户身份未授权或已失效，请先为 App ID cli_test 完成 OAuth 授权"
        onAuthorized={onAuthorized}
      />,
    );

    await waitFor(() => expect(onAuthorized).toHaveBeenCalledTimes(1));
  });
});
