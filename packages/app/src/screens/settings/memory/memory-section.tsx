import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PaseoMemoryDetail } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingsTextAreaCard } from "@/components/settings-textarea";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useMemory } from "@/hooks/use-memory";
import { useHostFeature } from "@/runtime/host-features";
import { confirmDialog } from "@/utils/confirm-dialog";

function DetailEditor({
  detail,
  disabled,
  onSave,
  onDelete,
}: {
  detail: PaseoMemoryDetail;
  disabled: boolean;
  onSave: (detail: PaseoMemoryDetail, content: string) => Promise<void>;
  onDelete: (detail: PaseoMemoryDetail) => Promise<void>;
}) {
  const [content, setContent] = useState(detail.content);
  useEffect(() => setContent(detail.content), [detail.content]);
  const save = useCallback(() => onSave(detail, content), [content, detail, onSave]);
  const remove = useCallback(() => onDelete(detail), [detail, onDelete]);
  return (
    <View style={settingsStyles.card}>
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>{detail.title}</Text>
          <Text style={settingsStyles.rowHint}>
            {detail.category} · {detail.charCount.toLocaleString()} chars · {detail.path}
          </Text>
        </View>
        <View style={styles.actions}>
          <Button size="sm" variant="outline" disabled={disabled} onPress={save}>
            Save
          </Button>
          <Button size="sm" variant="destructive" disabled={disabled} onPress={remove}>
            Delete
          </Button>
        </View>
      </View>
      <SettingsTextAreaCard
        accessibilityLabel={`Memory detail ${detail.title}`}
        value={content}
        onChangeText={setContent}
        style={styles.detailInput}
      />
    </View>
  );
}

export function MemorySection({ serverId }: { serverId: string }) {
  const supported = useHostFeature(serverId, "memory");
  const { memory, isLoading, error, updateMemory, clearMemory, isMutating, mutationError } =
    useMemory(serverId, { enabled: supported });
  const [summary, setSummary] = useState("");
  useEffect(() => setSummary(memory?.summary ?? ""), [memory?.summary]);

  const setEnabled = useCallback(
    (enabled: boolean) => {
      if (!memory) return;
      void updateMemory({ settings: { ...memory.settings, enabled } });
    },
    [memory, updateMemory],
  );
  const setAutoExtract = useCallback(
    (autoExtract: boolean) => {
      if (!memory) return;
      void updateMemory({ settings: { ...memory.settings, autoExtract } });
    },
    [memory, updateMemory],
  );
  const saveSummary = useCallback(() => {
    void updateMemory({ summary });
  }, [summary, updateMemory]);
  const saveDetail = useCallback(
    async (detail: PaseoMemoryDetail, content: string) => {
      await updateMemory({ detailEdits: [{ id: detail.id, content }] });
    },
    [updateMemory],
  );
  const deleteDetail = useCallback(
    async (detail: PaseoMemoryDetail) => {
      const confirmed = await confirmDialog({
        title: `Delete ${detail.title}?`,
        message: "This memory detail cannot be recovered.",
        confirmLabel: "Delete",
        destructive: true,
      });
      if (confirmed) {
        await updateMemory({ deleteDetailIds: [detail.id] });
      }
    },
    [updateMemory],
  );
  const clearAll = useCallback(async () => {
    const confirmed = await confirmDialog({
      title: "Clear all Paseo memory?",
      message: "The summary and every detail file will be deleted.",
      confirmLabel: "Clear memory",
      destructive: true,
    });
    if (confirmed) await clearMemory();
  }, [clearMemory]);
  const saveSummaryButton = useMemo(
    () => (
      <Button size="sm" disabled={isMutating} onPress={saveSummary}>
        Save
      </Button>
    ),
    [isMutating, saveSummary],
  );
  const clearAllButton = useMemo(
    () => (
      <Button
        size="sm"
        variant="destructive"
        disabled={isMutating || memory?.details.length === 0}
        onPress={clearAll}
      >
        Clear all
      </Button>
    ),
    [clearAll, isMutating, memory?.details.length],
  );

  if (!supported) {
    return (
      <SettingsSection title="Memory">
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>
              Update the selected Paseo daemon to use long-term memory.
            </Text>
          </View>
        </View>
      </SettingsSection>
    );
  }
  if (isLoading || !memory) {
    return (
      <SettingsSection title="Memory">
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>{error ? error.message : "Loading memory…"}</Text>
          </View>
        </View>
      </SettingsSection>
    );
  }

  const visibleError = mutationError?.message ?? error?.message ?? null;
  return (
    <View>
      <SettingsSection title="Long-term memory">
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>Use memory in Paseo conversations</Text>
              <Text style={settingsStyles.rowHint}>
                Injects a concise summary and relevant detail files into each Agent turn. Files stay
                local on the daemon host.
              </Text>
            </View>
            <Switch value={memory.settings.enabled} onValueChange={setEnabled} />
          </View>
          <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>Learn automatically after each answer</Text>
              <Text style={settingsStyles.rowHint}>
                A hidden Agent extracts durable preferences, facts, procedures, and decisions.
                Secrets, raw logs, temporary failures, and hidden reasoning are excluded.
              </Text>
            </View>
            <Switch
              value={memory.settings.autoExtract}
              onValueChange={setAutoExtract}
              disabled={!memory.settings.enabled}
            />
          </View>
        </View>
        {visibleError ? <Text style={styles.errorText}>{visibleError}</Text> : null}
        <Text style={settingsStyles.rowHint}>
          {memory.stats.detailCount} details · {memory.stats.pendingExtractions} pending extractions
          {memory.stats.lastExtractedAt
            ? ` · last learned ${new Date(memory.stats.lastExtractedAt).toLocaleString()}`
            : ""}
        </Text>
      </SettingsSection>

      <SettingsSection title="Summary file" trailing={saveSummaryButton}>
        <Text style={settingsStyles.rowHint}>{memory.summaryPath}</Text>
        <SettingsTextAreaCard
          accessibilityLabel="Paseo memory summary"
          value={summary}
          onChangeText={setSummary}
          style={styles.summaryInput}
        />
      </SettingsSection>

      <SettingsSection title="Detail files" trailing={clearAllButton}>
        {memory.details.length === 0 ? (
          <View style={settingsStyles.card}>
            <View style={settingsStyles.row}>
              <Text style={settingsStyles.rowHint}>No durable memory has been learned yet.</Text>
            </View>
          </View>
        ) : (
          memory.details.map((detail) => (
            <DetailEditor
              key={detail.id}
              detail={detail}
              disabled={isMutating}
              onSave={saveDetail}
              onDelete={deleteDetail}
            />
          ))
        )}
      </SettingsSection>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  actions: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  summaryInput: {
    minHeight: 220,
  },
  detailInput: {
    minHeight: 140,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
