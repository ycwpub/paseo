import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useDesktopSettingsExtensions } from "@/desktop/settings/desktop-settings-extensions";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";

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

export function DesktopAttentionSettingsSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useDesktopSettingsExtensions();
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
