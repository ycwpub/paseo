import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { withUnistyles } from "react-native-unistyles";
import { RotateCw } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { DesktopPermissionRow } from "@/desktop/components/desktop-permission-row";
import { useDesktopPermissions } from "@/desktop/permissions/use-desktop-permissions";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useDesktopSettings } from "@/desktop/settings/desktop-settings";

const ATTENTION_VOLUME_OPTIONS = [
  { value: "0", label: "0%" },
  { value: "0.25", label: "25%" },
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
] as const;

type AttentionVolumeOption = (typeof ATTENTION_VOLUME_OPTIONS)[number]["value"];

function resolveAttentionVolumeOption(volume: number): AttentionVolumeOption {
  return ATTENTION_VOLUME_OPTIONS.reduce((closest, option) =>
    Math.abs(Number(option.value) - volume) < Math.abs(Number(closest.value) - volume)
      ? option
      : closest,
  ).value;
}

function DesktopAttentionSettingsSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useDesktopSettings();
  const selectedVolume = resolveAttentionVolumeOption(settings.attention.soundVolume);

  const handleVolumeChange = useCallback(
    (value: AttentionVolumeOption) => {
      void updateSettings({ attention: { soundVolume: Number(value) } });
    },
    [updateSettings],
  );

  return (
    <SettingsSection title={t("settings.permissions.backgroundAttention.title")}>
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>
              {t("settings.permissions.backgroundAttention.soundVolume")}
            </Text>
            <Text style={settingsStyles.rowHint}>
              {t("settings.permissions.backgroundAttention.description")}
            </Text>
          </View>
          <SegmentedControl
            size="sm"
            value={selectedVolume}
            options={[...ATTENTION_VOLUME_OPTIONS]}
            onValueChange={handleVolumeChange}
            testID="desktop-attention-volume"
          />
        </View>
      </View>
    </SettingsSection>
  );
}

const ThemedRotateCw = withUnistyles(RotateCw, (theme) => ({
  size: theme.iconSize.md,
  color: theme.colors.foregroundMuted,
}));

export function DesktopPermissionsSection() {
  const { t } = useTranslation();
  const {
    isDesktopApp,
    snapshot,
    isRefreshing,
    requestingPermission,
    refreshPermissions,
    requestPermission,
  } = useDesktopPermissions();

  const handleRefreshPress = useCallback(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  const handleRequestMicrophone = useCallback(() => {
    void requestPermission("microphone");
  }, [requestPermission]);

  const isBusy = isRefreshing || requestingPermission !== null;

  const refreshIcon = useMemo(() => <ThemedRotateCw />, []);

  const refreshButton = useMemo(
    () => (
      <Button
        variant="ghost"
        size="sm"
        leftIcon={refreshIcon}
        onPress={handleRefreshPress}
        disabled={isBusy}
        accessibilityLabel={t("settings.permissions.refreshAccessibility")}
      >
        {isRefreshing ? t("settings.permissions.refreshing") : t("settings.permissions.refresh")}
      </Button>
    ),
    [refreshIcon, handleRefreshPress, isBusy, isRefreshing, t],
  );

  const permissionLabels = useMemo(
    () => ({
      granted: t("settings.permissions.actions.granted"),
      request: t("settings.permissions.actions.request"),
      requesting: t("settings.permissions.actions.requesting"),
    }),
    [t],
  );

  if (!isDesktopApp) {
    return null;
  }

  return (
    <>
      <SettingsSection title={t("settings.permissions.title")} trailing={refreshButton}>
        <View style={settingsStyles.card}>
          <DesktopPermissionRow
            title={t("settings.permissions.notifications")}
            status={snapshot?.notifications ?? null}
            isRequesting={requestingPermission === "notifications"}
            onRequest={handleRequestNotifications}
            labels={permissionLabels}
            extraActionLabel={t("settings.permissions.test")}
            isExtraActionBusy={isSendingTestNotification}
            isExtraActionDisabled={!notificationsGranted || isBusy}
            onExtraAction={handleSendTestNotification}
          />
          {testNotificationError ? (
            <Text style={errorTextStyle}>{testNotificationError}</Text>
          ) : null}
          <DesktopPermissionRow
            title={t("settings.permissions.microphone")}
            showBorder
            status={snapshot?.microphone ?? null}
            isRequesting={requestingPermission === "microphone"}
            onRequest={handleRequestMicrophone}
            labels={permissionLabels}
          />
        </View>
      </SettingsSection>
      <DesktopAttentionSettingsSection />
    </>
  );
}
