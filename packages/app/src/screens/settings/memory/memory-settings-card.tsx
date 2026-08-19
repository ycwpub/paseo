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
    label: "排除敏感记忆",
    description: "绝不保存检测到的敏感个人数据",
  },
  {
    id: "manual-only",
    value: "manual-only" as const,
    label: "仅响应明确请求",
    description: "仅在用户明确要求时保存敏感信息",
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
          <Text style={settingsStyles.rowTitle}>在 Paseo 会话中使用记忆</Text>
          <Text style={settingsStyles.rowHint}>
            为每轮 Agent 对话提供有限长度的总览和相关记忆详情
          </Text>
        </View>
        <Switch value={settings.enabled} disabled={disabled} onValueChange={setEnabled} />
      </View>
      <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>自动学习</Text>
          <Text style={settingsStyles.rowHint}>在成功回答后提取长期偏好、事实、流程和决策</Text>
        </View>
        <Switch
          value={settings.autoExtract}
          disabled={disabled || !settings.enabled}
          onValueChange={setAutoExtract}
        />
      </View>
      <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>自动整理</Text>
          <Text style={settingsStyles.rowHint}>淘汰过期的自动记忆，并保持有效上下文精简</Text>
        </View>
        <Switch
          value={settings.autoConsolidate ?? true}
          disabled={disabled || !settings.enabled}
          onValueChange={setAutoConsolidate}
        />
      </View>
      <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>在回答下方展示记忆来源</Text>
          <Text style={settingsStyles.rowHint}>支持查看和评价每次回答使用的记忆</Text>
        </View>
        <Switch
          value={settings.showSources ?? true}
          disabled={disabled || !settings.enabled}
          onValueChange={setShowSources}
        />
      </View>
      <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>加密本地记忆内容</Text>
          <Text style={settingsStyles.rowHint}>
            使用 Daemon 本地 AES-256-GCM 密钥加密总文件和子文件
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
          label="敏感信息"
          value={selectedSensitivePolicy}
          selectedDisplay={sensitiveDisplay}
          options={SENSITIVE_POLICY_OPTIONS}
          onChange={setSensitiveMemoryPolicy}
          placeholder="选择策略"
          emptyText="没有可用策略"
          disabled={disabled}
        />
        <View style={styles.fieldGrid}>
          <View style={styles.gridItem}>
            <Field label="上下文字符数" hint="1,000–32,000">
              <FormTextInput
                value={limits.maxInjectedChars}
                onChangeText={setMaxInjectedChars}
                editable={!disabled}
                keyboardType="number-pad"
              />
            </Field>
          </View>
          <View style={styles.gridItem}>
            <Field label="召回详情数" hint="0–12">
              <FormTextInput
                value={limits.maxRetrievedDetails}
                onChangeText={setMaxRetrievedDetails}
                editable={!disabled}
                keyboardType="number-pad"
              />
            </Field>
          </View>
          <View style={styles.gridItem}>
            <Field label="候选池" hint="4–100">
              <FormTextInput
                value={limits.maxCandidates}
                onChangeText={setMaxCandidates}
                editable={!disabled}
                keyboardType="number-pad"
              />
            </Field>
          </View>
          <View style={styles.gridItem}>
            <Field label="保留天数" hint="0 表示一直保留，直到手动设置过期">
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
