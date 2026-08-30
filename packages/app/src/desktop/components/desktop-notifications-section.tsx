import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { withUnistyles } from "react-native-unistyles";
import { RotateCw } from "lucide-react-native";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DesktopDockAttentionTestRow } from "@/desktop/components/desktop-dock-attention-test-row";
import { DesktopPermissionRow } from "@/desktop/components/desktop-permission-row";
import { useDesktopPermissions } from "@/desktop/permissions/use-desktop-permissions";
import { useDesktopSettings } from "@/desktop/settings/desktop-settings";
import { clearDesktopIsland, requestDesktopIsland } from "@/desktop/island/desktop-island";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";

const ThemedRotateCw = withUnistyles(RotateCw, (theme) => ({
  size: theme.iconSize.md,
  color: theme.colors.foregroundMuted,
}));

function getNotificationTestHint(input: {
  enabled: boolean;
  permissionGranted: boolean;
  disabledHint: string;
  testHint: string;
  permissionRequiredHint: string;
}): string {
  if (!input.enabled) {
    return input.disabledHint;
  }
  return input.permissionGranted ? input.testHint : input.permissionRequiredHint;
}

export function DesktopNotificationsSection() {
  const { t } = useTranslation();
  const { settings, isSaving, updateSettings } = useDesktopSettings();
  const {
    isDesktopApp,
    snapshot,
    isRefreshing,
    requestingPermission,
    testNotificationState,
    refreshPermissions,
    requestPermission,
    sendTestNotification,
  } = useDesktopPermissions();
  const [islandTestState, setIslandTestState] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );

  const handleRefreshPress = useCallback(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  const handleRequestNotifications = useCallback(() => {
    void requestPermission("notifications");
  }, [requestPermission]);

  const handleNotificationsEnabledChange = useCallback(
    (enabled: boolean) => {
      void updateSettings({ notifications: { enabled } }).catch(() => {
        // useDesktopSettings owns the user-visible IPC error.
      });
    },
    [updateSettings],
  );

  const handlePlaySoundChange = useCallback(
    (playSound: boolean) => {
      void updateSettings({ notifications: { playSound } }).catch(() => {
        // useDesktopSettings owns the user-visible IPC error.
      });
    },
    [updateSettings],
  );

  const handleIslandEnabledChange = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        clearDesktopIsland();
      }
      void updateSettings({ island: { enabled } }).catch(() => {
        // useDesktopSettings owns the user-visible IPC error.
      });
    },
    [updateSettings],
  );

  const handleIslandShowWhenFocusedChange = useCallback(
    (showWhenFocused: boolean) => {
      void updateSettings({ island: { showWhenFocused } }).catch(() => {
        // useDesktopSettings owns the user-visible IPC error.
      });
    },
    [updateSettings],
  );

  const handleSendTestNotification = useCallback(() => {
    void sendTestNotification();
  }, [sendTestNotification]);

  const handleSendTestIsland = useCallback(() => {
    setIslandTestState("sending");
    void requestDesktopIsland({
      id: "paseo:island:test",
      kind: "info",
      title: t("settings.notifications.islandTestTitle"),
      body: t("settings.notifications.islandTestBody"),
      durationMs: 10_000,
    }).then((shown) => {
      setIslandTestState(shown ? "success" : "error");
      return undefined;
    });
  }, [t]);

  const isPermissionBusy = isRefreshing || requestingPermission !== null;
  const isSendingTestNotification = testNotificationState.status === "sending";
  const refreshIcon = useMemo(() => <ThemedRotateCw />, []);
  const refreshButton = useMemo(
    () => (
      <Button
        variant="ghost"
        size="sm"
        leftIcon={refreshIcon}
        onPress={handleRefreshPress}
        disabled={isPermissionBusy}
        accessibilityLabel={t("settings.notifications.refreshAccessibility")}
      >
        {isRefreshing ? t("settings.permissions.refreshing") : t("settings.permissions.refresh")}
      </Button>
    ),
    [handleRefreshPress, isPermissionBusy, isRefreshing, refreshIcon, t],
  );
  const permissionLabels = useMemo(
    () => ({
      granted: t("settings.permissions.actions.granted"),
      request: t("settings.permissions.actions.request"),
      requesting: t("settings.permissions.actions.requesting"),
      busyExtraAction: (label: string) =>
        t("settings.permissions.actions.busyExtraAction", { label }),
    }),
    [t],
  );

  if (!isDesktopApp) {
    return null;
  }

  const notificationsGranted = snapshot?.notifications.state === "granted";
  const notificationTestHint = getNotificationTestHint({
    enabled: settings.notifications.enabled,
    permissionGranted: notificationsGranted,
    disabledHint: t("settings.notifications.disabledHint"),
    testHint: t("settings.notifications.testHint"),
    permissionRequiredHint: t("settings.notifications.permissionRequired"),
  });

  return (
    <SettingsSection title={t("settings.notifications.title")} trailing={refreshButton}>
      <View style={settingsStyles.card}>
        <DesktopPermissionRow
          title={t("settings.notifications.permission")}
          status={snapshot?.notifications ?? null}
          isRequesting={requestingPermission === "notifications"}
          onRequest={handleRequestNotifications}
          labels={permissionLabels}
        />
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.notifications.enabled")}</Text>
            <Text style={settingsStyles.rowHint}>{t("settings.notifications.enabledHint")}</Text>
          </View>
          <Switch
            value={settings.notifications.enabled}
            onValueChange={handleNotificationsEnabledChange}
            disabled={isSaving}
            accessibilityLabel={t("settings.notifications.enabled")}
            testID="desktop-notifications-enabled-switch"
          />
        </View>
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.notifications.playSound")}</Text>
            <Text style={settingsStyles.rowHint}>{t("settings.notifications.playSoundHint")}</Text>
          </View>
          <Switch
            value={settings.notifications.playSound}
            onValueChange={handlePlaySoundChange}
            disabled={isSaving || !settings.notifications.enabled}
            accessibilityLabel={t("settings.notifications.playSound")}
            testID="desktop-notifications-play-sound-switch"
          />
        </View>
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.notifications.island")}</Text>
            <Text style={settingsStyles.rowHint}>{t("settings.notifications.islandHint")}</Text>
          </View>
          <Switch
            value={settings.island.enabled}
            onValueChange={handleIslandEnabledChange}
            disabled={isSaving}
            accessibilityLabel={t("settings.notifications.island")}
            testID="desktop-notifications-island-switch"
          />
        </View>
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>
              {t("settings.notifications.islandShowWhenFocused")}
            </Text>
            <Text style={settingsStyles.rowHint}>
              {t("settings.notifications.islandShowWhenFocusedHint")}
            </Text>
          </View>
          <Switch
            value={settings.island.showWhenFocused}
            onValueChange={handleIslandShowWhenFocusedChange}
            disabled={isSaving || !settings.island.enabled}
            accessibilityLabel={t("settings.notifications.islandShowWhenFocused")}
            testID="desktop-notifications-island-focused-switch"
          />
        </View>
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.notifications.islandTest")}</Text>
            <Text style={settingsStyles.rowHint}>{t("settings.notifications.islandTestHint")}</Text>
          </View>
          <Button
            variant="outline"
            size="sm"
            onPress={handleSendTestIsland}
            disabled={!settings.island.enabled || isSaving || islandTestState === "sending"}
            testID="desktop-notifications-island-test"
          >
            {islandTestState === "sending"
              ? t("settings.notifications.sending")
              : t("settings.notifications.send")}
          </Button>
        </View>
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.notifications.test")}</Text>
            <Text style={settingsStyles.rowHint}>{notificationTestHint}</Text>
          </View>
          <Button
            variant="outline"
            size="sm"
            onPress={handleSendTestNotification}
            disabled={
              !settings.notifications.enabled ||
              !notificationsGranted ||
              isPermissionBusy ||
              isSendingTestNotification
            }
          >
            {isSendingTestNotification
              ? t("settings.notifications.sending")
              : t("settings.notifications.send")}
          </Button>
        </View>
        <DesktopDockAttentionTestRow />
      </View>
      {testNotificationState.status === "success" ? (
        <Alert
          variant="success"
          title={t("settings.notifications.sentTitle")}
          description={t("settings.notifications.sentDescription")}
          testID="desktop-notifications-test-success"
        />
      ) : null}
      {testNotificationState.status === "error" ? (
        <Alert
          variant="error"
          title={t("settings.notifications.sendFailedTitle")}
          description={testNotificationState.message}
          testID="desktop-notifications-test-error"
        />
      ) : null}
      {islandTestState === "success" ? (
        <Alert
          variant="success"
          title={t("settings.notifications.islandTestSuccess")}
          description={t("settings.notifications.islandTestSuccessHint")}
          testID="desktop-notifications-island-test-success"
        />
      ) : null}
      {islandTestState === "error" ? (
        <Alert
          variant="error"
          title={t("settings.notifications.islandTestFailed")}
          description={t("settings.notifications.islandTestFailedHint")}
          testID="desktop-notifications-island-test-error"
        />
      ) : null}
    </SettingsSection>
  );
}
