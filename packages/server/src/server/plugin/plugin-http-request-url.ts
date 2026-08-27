import type { PluginHttpProjectConfig } from "@getpaseo/protocol/messages";

export const PLUGIN_HTTP_REQUEST_ID_QUERY_PARAM = "request_id";

export function normalizePluginHttpJobPath(path: string): string {
  const withoutLegacyMarker = path.trim().replaceAll("{requestId}", "");
  const collapsed = withoutLegacyMarker.replace(/\/{2,}/gu, "/");
  if (collapsed.length > 1 && collapsed.endsWith("/")) {
    return collapsed.slice(0, -1);
  }
  return collapsed || "/";
}

export function withPluginHttpRequestId(path: string, requestId: string): string {
  const normalizedPath = normalizePluginHttpJobPath(path);
  const separator = normalizedPath.includes("?") ? "&" : "?";
  return `${normalizedPath}${separator}${PLUGIN_HTTP_REQUEST_ID_QUERY_PARAM}=${encodeURIComponent(requestId)}`;
}

export function pluginHttpRequestUrlTemplate(path: string): string {
  const normalizedPath = normalizePluginHttpJobPath(path);
  const separator = normalizedPath.includes("?") ? "&" : "?";
  return `${normalizedPath}${separator}${PLUGIN_HTTP_REQUEST_ID_QUERY_PARAM}={requestId}`;
}

export function pluginHttpRequestId(requestUrl: URL): string | null {
  const value = requestUrl.searchParams.get(PLUGIN_HTTP_REQUEST_ID_QUERY_PARAM)?.trim() ?? "";
  return value || null;
}

export function normalizePluginHttpProjectConfigPaths(
  config: PluginHttpProjectConfig,
): PluginHttpProjectConfig {
  return {
    ...config,
    listeners: config.listeners.map((listener) => ({
      ...listener,
      defaultJobApi: listener.defaultJobApi
        ? {
            ...listener.defaultJobApi,
            submitPath: normalizePluginHttpJobPath(listener.defaultJobApi.submitPath),
            queryPath: normalizePluginHttpJobPath(listener.defaultJobApi.queryPath),
            deletePath: normalizePluginHttpJobPath(listener.defaultJobApi.deletePath),
          }
        : undefined,
    })),
  };
}
