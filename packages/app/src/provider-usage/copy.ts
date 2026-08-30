// User-facing copy for the provider-usage surfaces, centralized so localization
// is a single-file change. INTEGRATION: move these into the i18n resources
// (a `providerUsage` namespace across all locales) and swap to `t(...)` at the
// call sites once the feature is wired to data. Kept inline for now because the
// surfaces are not yet mounted and the locale files are being edited elsewhere.
export const providerUsageCopy = {
  title: "使用情况",
  refresh: "刷新",
  refreshing: "刷新中…",
  loading: "正在加载用量…",
  empty: "暂无用量数据",
  errorTitle: "无法加载用量",
  hostUnavailable: "请先连接此主机，再查看 Provider 用量",
  hostUpgradeRequired: "请更新主机端后查看 Provider 用量",
  clientUnavailable: "主机连接尚未就绪",
  retry: "重试",
  tooltipLoading: "正在加载用量…",
} as const;

export function formatProviderUsageError(error: string): string {
  const normalized = error.toLowerCase();
  if (
    normalized.includes("empty model list") ||
    normalized.includes("未返回可用模型") ||
    normalized.includes("no models")
  ) {
    return "Aiden 暂无可展示的用量数据，不影响模型正常使用。";
  }
  if (
    normalized.includes("login") ||
    normalized.includes("auth") ||
    normalized.includes("device_code") ||
    normalized.includes("no tty") ||
    normalized.includes("登录")
  ) {
    return "Aiden 登录状态不可用，请先在终端完成 Aiden 登录后重试。";
  }
  if (normalized.startsWith("command failed:")) {
    return "暂时无法获取用量数据，请稍后重试。";
  }
  return error;
}

export function isProviderUsageTemporarilyUnavailable(error: string | null | undefined): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return (
    normalized.includes("empty model list") ||
    normalized.includes("未返回可用模型") ||
    normalized.includes("no models")
  );
}
