import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getIsElectron } from "@/constants/platform";
import { useFetchQuery } from "@/data/query";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import {
  useDesktopIpcErrorReporter,
  useDesktopIpcQueryErrorToast,
} from "@/desktop/hooks/desktop-ipc-error";
import { i18n } from "@/i18n/i18next";

const QUERY_KEY = ["desktop-settings", "extensions"] as const;

export interface DesktopSettingsExtensions {
  notifications: { enabled: boolean };
  attention: { soundVolume: number };
  island: { enabled: boolean; showWhenFocused: boolean };
}

export interface DesktopSettingsExtensionsPatch extends Record<string, unknown> {
  notifications?: Partial<DesktopSettingsExtensions["notifications"]>;
  attention?: Partial<DesktopSettingsExtensions["attention"]>;
  island?: Partial<DesktopSettingsExtensions["island"]>;
}

export const DEFAULT_DESKTOP_SETTINGS_EXTENSIONS: DesktopSettingsExtensions = {
  notifications: { enabled: true },
  attention: { soundVolume: 0.5 },
  island: { enabled: true, showWhenFocused: true },
};

export function useDesktopSettingsExtensions() {
  const queryClient = useQueryClient();
  const reportError = useDesktopIpcErrorReporter();
  const { data, isPending, error } = useFetchQuery<DesktopSettingsExtensions, Error>({
    queryKey: QUERY_KEY,
    queryFn: loadDesktopSettingsExtensions,
    dataShape: "value",
    staleTimeMs: Number.MAX_SAFE_INTEGER,
    retry: false,
  });
  useDesktopIpcQueryErrorToast({
    error,
    message: i18n.t("desktop.settings.loadFailed"),
    logLabel: "[DesktopSettingsExtensions] Failed to load settings",
  });
  const mutation = useMutation<
    DesktopSettingsExtensions,
    Error,
    DesktopSettingsExtensionsPatch,
    { previous: DesktopSettingsExtensions }
  >({
    mutationFn: updateDesktopSettingsExtensions,
    onMutate: (updates) => {
      const previous =
        queryClient.getQueryData<DesktopSettingsExtensions>(QUERY_KEY) ??
        DEFAULT_DESKTOP_SETTINGS_EXTENSIONS;
      queryClient.setQueryData(QUERY_KEY, mergeDesktopSettingsExtensions(previous, updates));
      return { previous };
    },
    onSuccess: (settings) => queryClient.setQueryData(QUERY_KEY, settings),
    onError: (saveError, _updates, context) => {
      if (context) queryClient.setQueryData(QUERY_KEY, context.previous);
      reportError({
        error: saveError,
        message: i18n.t("desktop.settings.saveFailed"),
        logLabel: "[DesktopSettingsExtensions] Failed to save settings",
      });
    },
  });
  const updateSettings = useCallback(
    async (updates: DesktopSettingsExtensionsPatch) => {
      if (getIsElectron()) await mutation.mutateAsync(updates);
    },
    [mutation],
  );
  return {
    settings: data ?? DEFAULT_DESKTOP_SETTINGS_EXTENSIONS,
    isLoading: isPending,
    isSaving: mutation.isPending,
    error: error ?? null,
    updateSettings,
  };
}

export async function loadDesktopSettingsExtensions(): Promise<DesktopSettingsExtensions> {
  if (!getIsElectron()) return DEFAULT_DESKTOP_SETTINGS_EXTENSIONS;
  return parseDesktopSettingsExtensions(
    await invokeDesktopCommand<unknown>("get_desktop_settings"),
  );
}

export async function updateDesktopSettingsExtensions(
  updates: DesktopSettingsExtensionsPatch,
): Promise<DesktopSettingsExtensions> {
  if (!getIsElectron()) return DEFAULT_DESKTOP_SETTINGS_EXTENSIONS;
  return parseDesktopSettingsExtensions(
    await invokeDesktopCommand<unknown>("patch_desktop_settings", updates),
  );
}

export function parseDesktopSettingsExtensions(raw: unknown): DesktopSettingsExtensions {
  const record = isRecord(raw) ? raw : {};
  const notifications = isRecord(record.notifications) ? record.notifications : {};
  const attention = isRecord(record.attention) ? record.attention : {};
  const island = isRecord(record.island) ? record.island : {};
  return {
    notifications: {
      enabled:
        typeof notifications.enabled === "boolean"
          ? notifications.enabled
          : DEFAULT_DESKTOP_SETTINGS_EXTENSIONS.notifications.enabled,
    },
    attention: {
      soundVolume:
        typeof attention.soundVolume === "number" && Number.isFinite(attention.soundVolume)
          ? Math.min(1, Math.max(0, attention.soundVolume))
          : DEFAULT_DESKTOP_SETTINGS_EXTENSIONS.attention.soundVolume,
    },
    island: {
      enabled:
        typeof island.enabled === "boolean"
          ? island.enabled
          : DEFAULT_DESKTOP_SETTINGS_EXTENSIONS.island.enabled,
      showWhenFocused:
        typeof island.showWhenFocused === "boolean"
          ? island.showWhenFocused
          : DEFAULT_DESKTOP_SETTINGS_EXTENSIONS.island.showWhenFocused,
    },
  };
}

function mergeDesktopSettingsExtensions(
  current: DesktopSettingsExtensions,
  updates: DesktopSettingsExtensionsPatch,
): DesktopSettingsExtensions {
  return {
    notifications: { ...current.notifications, ...updates.notifications },
    attention: { ...current.attention, ...updates.attention },
    island: { ...current.island, ...updates.island },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
