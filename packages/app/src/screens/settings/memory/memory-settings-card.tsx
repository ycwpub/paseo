import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PaseoMemorySettings } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { settingsStyles } from "@/styles/settings";

const SENSITIVE_POLICY_OPTIONS = [
  {
    id: "exclude",
    value: "exclude" as const,
    label: "Exclude sensitive memory",
    description: "Never store detected sensitive personal data",
  },
  {
    id: "manual-only",
    value: "manual-only" as const,
    label: "Explicit requests only",
    description: "Store sensitive information only when the user explicitly asks",
  },
];

interface LimitDraft {
  maxInjectedChars: string;
  maxRetrievedDetails: string;
  maxCandidates: string;
  retentionDays: string;
}

function limitDraft(settings: PaseoMemorySettings): LimitDraft {
  return {
    maxInjectedChars: String(settings.maxInjectedChars),
    maxRetrievedDetails: String(settings.maxRetrievedDetails),
    maxCandidates: String(settings.maxCandidates ?? 24),
    retentionDays: String(settings.retentionDays ?? 0),
  };
}

function parseInteger(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function MemorySettingsCard({
  settings,
  disabled,
  onChange,
}: {
  settings: PaseoMemorySettings;
  disabled: boolean;
  onChange: (settings: PaseoMemorySettings) => Promise<void>;
}) {
  const [limits, setLimits] = useState(() => limitDraft(settings));
  useEffect(() => setLimits(limitDraft(settings)), [settings]);
  const selectedSensitivePolicy = settings.sensitiveMemoryPolicy ?? "exclude";
  const sensitiveDisplay = useMemo(
    () => ({
      label:
        SENSITIVE_POLICY_OPTIONS.find((option) => option.value === selectedSensitivePolicy)
          ?.label ?? selectedSensitivePolicy,
    }),
    [selectedSensitivePolicy],
  );
  const setEnabled = useCallback(
    (enabled: boolean) => void onChange({ ...settings, enabled }),
    [onChange, settings],
  );
  const setAutoExtract = useCallback(
    (autoExtract: boolean) => void onChange({ ...settings, autoExtract }),
    [onChange, settings],
  );
  const setAutoConsolidate = useCallback(
    (autoConsolidate: boolean) => void onChange({ ...settings, autoConsolidate }),
    [onChange, settings],
  );
  const setShowSources = useCallback(
    (showSources: boolean) => void onChange({ ...settings, showSources }),
    [onChange, settings],
  );
  const setEncryptAtRest = useCallback(
    (encryptAtRest: boolean) => void onChange({ ...settings, encryptAtRest }),
    [onChange, settings],
  );
  const setSensitiveMemoryPolicy = useCallback(
    (sensitiveMemoryPolicy: NonNullable<PaseoMemorySettings["sensitiveMemoryPolicy"]>) =>
      void onChange({ ...settings, sensitiveMemoryPolicy }),
    [onChange, settings],
  );
  const setMaxInjectedChars = useCallback(
    (maxInjectedChars: string) => setLimits((current) => ({ ...current, maxInjectedChars })),
    [],
  );
  const setMaxRetrievedDetails = useCallback(
    (maxRetrievedDetails: string) => setLimits((current) => ({ ...current, maxRetrievedDetails })),
    [],
  );
  const setMaxCandidates = useCallback(
    (maxCandidates: string) => setLimits((current) => ({ ...current, maxCandidates })),
    [],
  );
  const setRetentionDays = useCallback(
    (retentionDays: string) => setLimits((current) => ({ ...current, retentionDays })),
    [],
  );
  const saveLimits = useCallback(() => {
    void onChange({
      ...settings,
      maxInjectedChars: parseInteger(
        limits.maxInjectedChars,
        settings.maxInjectedChars,
        1_000,
        32_000,
      ),
      maxRetrievedDetails: parseInteger(
        limits.maxRetrievedDetails,
        settings.maxRetrievedDetails,
        0,
        12,
      ),
      maxCandidates: parseInteger(limits.maxCandidates, settings.maxCandidates ?? 24, 4, 100),
      retentionDays: parseInteger(limits.retentionDays, settings.retentionDays ?? 0, 0, 3_650),
    });
  }, [limits, onChange, settings]);

  return (
    <View style={settingsStyles.card}>
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>Use memory in Paseo conversations</Text>
          <Text style={settingsStyles.rowHint}>
            Adds a bounded summary and relevant detail memories to each Agent turn
          </Text>
        </View>
        <Switch value={settings.enabled} disabled={disabled} onValueChange={setEnabled} />
      </View>
      <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>Learn automatically</Text>
          <Text style={settingsStyles.rowHint}>
            Extract durable preferences, facts, procedures, and decisions after successful answers
          </Text>
        </View>
        <Switch
          value={settings.autoExtract}
          disabled={disabled || !settings.enabled}
          onValueChange={setAutoExtract}
        />
      </View>
      <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>Consolidate automatically</Text>
          <Text style={settingsStyles.rowHint}>
            Expire stale automatic memories and keep active context compact
          </Text>
        </View>
        <Switch
          value={settings.autoConsolidate ?? true}
          disabled={disabled || !settings.enabled}
          onValueChange={setAutoConsolidate}
        />
      </View>
      <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>Show memory sources under answers</Text>
          <Text style={settingsStyles.rowHint}>
            Lets you inspect and rate the memories used for each answer
          </Text>
        </View>
        <Switch
          value={settings.showSources ?? true}
          disabled={disabled || !settings.enabled}
          onValueChange={setShowSources}
        />
      </View>
      <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>Encrypt memory content at rest</Text>
          <Text style={settingsStyles.rowHint}>
            Encrypts the summary and detail files with a daemon-local AES-256-GCM key
          </Text>
        </View>
        <Switch
          value={settings.encryptAtRest ?? false}
          disabled={disabled}
          onValueChange={setEncryptAtRest}
        />
      </View>
      <View style={[styles.advanced, settingsStyles.rowBorder]}>
        <SelectField
          label="Sensitive information"
          value={selectedSensitivePolicy}
          selectedDisplay={sensitiveDisplay}
          options={SENSITIVE_POLICY_OPTIONS}
          onChange={setSensitiveMemoryPolicy}
          placeholder="Select policy"
          emptyText="No policies"
          disabled={disabled}
        />
        <View style={styles.fieldGrid}>
          <View style={styles.gridItem}>
            <Field label="Context characters" hint="1,000–32,000">
              <FormTextInput
                value={limits.maxInjectedChars}
                onChangeText={setMaxInjectedChars}
                editable={!disabled}
                keyboardType="number-pad"
              />
            </Field>
          </View>
          <View style={styles.gridItem}>
            <Field label="Retrieved details" hint="0–12">
              <FormTextInput
                value={limits.maxRetrievedDetails}
                onChangeText={setMaxRetrievedDetails}
                editable={!disabled}
                keyboardType="number-pad"
              />
            </Field>
          </View>
          <View style={styles.gridItem}>
            <Field label="Candidate pool" hint="4–100">
              <FormTextInput
                value={limits.maxCandidates}
                onChangeText={setMaxCandidates}
                editable={!disabled}
                keyboardType="number-pad"
              />
            </Field>
          </View>
          <View style={styles.gridItem}>
            <Field label="Retention days" hint="0 keeps memories until manually expired">
              <FormTextInput
                value={limits.retentionDays}
                onChangeText={setRetentionDays}
                editable={!disabled}
                keyboardType="number-pad"
              />
            </Field>
          </View>
        </View>
        <View style={styles.actions}>
          <Button size="sm" variant="outline" disabled={disabled} onPress={saveLimits}>
            Save retrieval limits
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  advanced: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  fieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  gridItem: {
    flex: 1,
    minWidth: 150,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
}));
