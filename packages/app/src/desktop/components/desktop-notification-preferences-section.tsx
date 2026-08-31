import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DesktopDockAttentionTestRow } from "@/desktop/components/desktop-dock-attention-test-row";
import { clearDesktopIsland, requestDesktopIsland } from "@/desktop/island/desktop-island";
import { useDesktopPermissions } from "@/desktop/permissions/use-desktop-permissions";
import { useDesktopSettingsExtensions } from "@/desktop/settings/desktop-settings-extensions";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";

export function DesktopNotificationPreferencesSection() {
  const { t } = useTranslation();
  const { isDesktopApp } = useDesktopPermissions();
  const { settings, isSaving, updateSettings } = useDesktopSettingsExtensions();
  const [islandTestState, setIslandTestState] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );

  const handleNotificationsEnabledChange = useCallback(
    (enabled: boolean) => {
      void updateSettings({ notifications: { enabled } });
    },
    [updateSettings],
  );
  const handleIslandEnabledChange = useCallback(
    (enabled: boolean) => {
      if (!enabled) clearDesktopIsland();
      void updateSettings({ island: { enabled } });
    },
    [updateSettings],
  );
  const handleIslandShowWhenFocusedChange = useCallback(
    (showWhenFocused: boolean) => {
      void updateSettings({ island: { showWhenFocused } });
    },
    [updateSettings],
  );
  const handleSendTestIsland = useCallback(() => {
    setIslandTestState("sending");
    void requestDesktopIsland({
      id: "paseo:island:test",
      kind: "info",
      title: t("settings.notifications.islandTestTitle"),
      body: t("settings.notifications.islandTestBody"),
      durationMs: 10_000,
    }).then((shown) => setIslandTestState(shown ? "success" : "error"));
  }, [t]);

  if (!isDesktopApp) return null;

  return (
    <SettingsSection title={t("settings.notifications.island")}>
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
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
        <DesktopDockAttentionTestRow />
      </View>
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
