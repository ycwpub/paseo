import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { PaseoMemoryPolicyTarget } from "@getpaseo/protocol/messages";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingsTextArea } from "@/components/settings-textarea";
import { useMemory } from "@/hooks/use-memory";
import { settingsStyles } from "@/styles/settings";
import { memoryPolicyDraft } from "./policy-view-model";

interface MemoryPolicyEditorCopy {
  enabledTitle: string;
  enabledHint: string;
  instructionsTitle: string;
  instructionsHint: string;
  instructionsPlaceholder: string;
  save: string;
  saving: string;
  saved: string;
  saveError: string;
}

interface MemoryPolicyEditorProps {
  serverId: string;
  target: PaseoMemoryPolicyTarget;
  copy: MemoryPolicyEditorCopy;
  testID: string;
}

export function MemoryPolicyEditor({ serverId, target, copy, testID }: MemoryPolicyEditorProps) {
  const { t } = useTranslation();
  const { memory, isLoading, isConnected, updateMemory, isMutating } = useMemory(serverId);
  const persistedDraft = useMemo(() => memoryPolicyDraft(memory, target), [memory, target]);
  const [enabled, setEnabled] = useState(persistedDraft.enabled);
  const [extractionInstructions, setExtractionInstructions] = useState(
    persistedDraft.extractionInstructions,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEnabled(persistedDraft.enabled);
    setExtractionInstructions(persistedDraft.extractionInstructions);
  }, [persistedDraft]);

  const save = useCallback(async () => {
    setSaveError(null);
    setSaved(false);
    try {
      await updateMemory({
        policyUpdates: [{ target, enabled, extractionInstructions }],
      });
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : copy.saveError);
    }
  }, [copy.saveError, enabled, extractionInstructions, target, updateMemory]);
  const handleSavePress = useCallback(() => {
    void save();
  }, [save]);
  const handleEnabledChange = useCallback((nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    setSaved(false);
    setSaveError(null);
  }, []);
  const handleInstructionsChange = useCallback((value: string) => {
    setExtractionInstructions(value);
    setSaved(false);
    setSaveError(null);
  }, []);

  const disabled = isLoading || !isConnected || isMutating;
  const globalMemoryDisabled = memory !== null && !memory.settings.enabled;

  return (
    <View style={styles.container} testID={testID}>
      {globalMemoryDisabled ? (
        <Alert
          variant="warning"
          title={t("memoryPolicies.globalDisabledTitle")}
          description={t("memoryPolicies.globalDisabledDescription")}
        />
      ) : null}
      {saveError ? <Alert variant="error" title={copy.saveError} description={saveError} /> : null}
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{copy.enabledTitle}</Text>
            <Text style={settingsStyles.rowHint}>{copy.enabledHint}</Text>
          </View>
          <Switch
            value={enabled}
            disabled={disabled}
            onValueChange={handleEnabledChange}
            testID={`${testID}-enabled`}
            accessibilityLabel={copy.enabledTitle}
          />
        </View>
        <View style={[styles.instructions, settingsStyles.rowBorder]}>
          <Text style={settingsStyles.rowTitle}>{copy.instructionsTitle}</Text>
          <Text style={settingsStyles.rowHint}>{copy.instructionsHint}</Text>
          <SettingsTextArea
            testID={`${testID}-instructions`}
            accessibilityLabel={copy.instructionsTitle}
            value={extractionInstructions}
            onChangeText={handleInstructionsChange}
            placeholder={copy.instructionsPlaceholder}
            style={styles.textArea}
          />
        </View>
        <View style={[styles.actions, settingsStyles.rowBorder]}>
          {saved ? <Text style={styles.saved}>{copy.saved}</Text> : <View />}
          <Button testID={`${testID}-save`} size="sm" disabled={disabled} onPress={handleSavePress}>
            {isMutating ? copy.saving : copy.save}
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[3],
  },
  instructions: {
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  textArea: {
    minHeight: 120,
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  actions: {
    minHeight: 52,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  saved: {
    color: theme.colors.palette.green[500],
    fontSize: theme.fontSize.sm,
  },
}));
