import { describe, expect, it } from "vitest";

import { resolveExternalProxyUiState } from "./external-proxy-model";

describe("resolveExternalProxyUiState", () => {
  it("enables the switch on Debian and reflects persisted state", () => {
    expect(
      resolveExternalProxyUiState({
        featureAdvertised: true,
        configuredEnabled: true,
      }),
    ).toEqual({
      available: true,
      enabled: true,
      switchDisabled: false,
      hint: "所有 Project 请求均通过外部代理，并应用各 Project 的白名单和黑名单。",
    });
  });

  it("defaults the Debian switch off", () => {
    expect(
      resolveExternalProxyUiState({
        featureAdvertised: true,
        configuredEnabled: undefined,
      }),
    ).toEqual({
      available: true,
      enabled: false,
      switchDisabled: false,
      hint: "关闭时 Project 请求直接访问网络，不经过外部代理。",
    });
  });

  it("disables and forces the switch off on non-Debian or old servers", () => {
    expect(
      resolveExternalProxyUiState({
        featureAdvertised: false,
        configuredEnabled: true,
      }),
    ).toEqual({
      available: false,
      enabled: false,
      switchDisabled: true,
      hint: "外部代理仅支持 Debian 服务器。",
    });
  });
});
