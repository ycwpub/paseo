export interface ResolveExternalProxyUiStateInput {
  featureAdvertised: boolean;
  configuredEnabled: boolean | undefined;
}

export interface ExternalProxyUiState {
  available: boolean;
  enabled: boolean;
  switchDisabled: boolean;
  hint: string;
}

export function resolveExternalProxyUiState(
  input: ResolveExternalProxyUiStateInput,
): ExternalProxyUiState {
  if (!input.featureAdvertised) {
    return {
      available: false,
      enabled: false,
      switchDisabled: true,
      hint: "外部代理仅支持 Debian 服务器。",
    };
  }
  const enabled = input.configuredEnabled === true;
  return {
    available: true,
    enabled,
    switchDisabled: false,
    hint: enabled
      ? "所有 Project 请求均通过外部代理，并应用各 Project 的白名单和黑名单。"
      : "关闭时 Project 请求直接访问网络，不经过外部代理。",
  };
}
