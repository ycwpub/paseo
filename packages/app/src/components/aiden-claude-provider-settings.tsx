import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useAppSettings } from "@/hooks/use-settings";
import { settingsStyles } from "@/styles/settings";
import { Switch } from "@/components/ui/switch";

const AIDEN_CLAUDE_PROVIDER_ID = "aiden-claude";

interface AidenClaudeProviderSettingsProps {
  provider: string;
}

export function AidenClaudeProviderSettings({ provider }: AidenClaudeProviderSettingsProps) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const handleTranslationChange = useCallback(
    (aidenClaudeTranslateReasoningToChinese: boolean) => {
      void updateSettings({ aidenClaudeTranslateReasoningToChinese });
    },
    [updateSettings],
  );

  if (provider !== AIDEN_CLAUDE_PROVIDER_ID) {
    return null;
  }

  const label = t("settings.general.aidenClaudeReasoningTranslation.label");

  return (
    <View style={styles.section} testID="aiden-claude-provider-settings">
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{label}</Text>
            <Text style={settingsStyles.rowHint}>
              {t("settings.general.aidenClaudeReasoningTranslation.description")}
            </Text>
          </View>
          <Switch
            value={settings.aidenClaudeTranslateReasoningToChinese}
            onValueChange={handleTranslationChange}
            accessibilityLabel={label}
            testID="aiden-claude-reasoning-translation-switch"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    marginBottom: theme.spacing[4],
  },
}));
