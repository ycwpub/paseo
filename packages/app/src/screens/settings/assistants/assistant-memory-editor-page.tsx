import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { Assistant, AssistantUpdateInput } from "@getpaseo/protocol/messages";
import { SettingsTextAreaCard } from "@/components/settings-textarea";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import { useAssistants } from "@/hooks/use-assistants";
import { useHostFeature } from "@/runtime/host-features";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { AssistantMemoryArtifacts } from "./assistants-section";

function AssistantMemoryForm({
  assistant,
  isConnected,
  isMutating,
  mutationError,
  onSave,
}: {
  assistant: Assistant;
  isConnected: boolean;
  isMutating: boolean;
  mutationError: Error | null;
  onSave: (input: AssistantUpdateInput) => Promise<Assistant>;
}) {
  const [memoryEnabled, setMemoryEnabled] = useState(assistant.memoryEnabled);
  const [memoryAppend, setMemoryAppend] = useState("");
  const [memorySummary, setMemorySummary] = useState(assistant.memorySummary);
  const [memoryFiles, setMemoryFiles] = useState<Assistant["memoryFiles"]>(assistant.memoryFiles);
  const [memorySummaryDirty, setMemorySummaryDirty] = useState(false);
  const [dirtyDetailFileIds, setDirtyDetailFileIds] = useState<string[]>([]);

  const handleMemorySummaryChange = useCallback((value: string) => {
    setMemorySummary(value);
    setMemorySummaryDirty(true);
  }, []);
  const handleDetailFileContentChange = useCallback((id: string, value: string) => {
    setMemoryFiles((current) => ({
      ...current,
      detailFiles: current.detailFiles.map((file) =>
        file.id === id ? { ...file, content: value, charCount: value.length } : file,
      ),
    }));
    setDirtyDetailFileIds((current) => (current.includes(id) ? current : [...current, id]));
  }, []);
  const handleSave = useCallback(async () => {
    const append = memoryAppend.trim();
    const memoryDetailFileEdits = memoryFiles.detailFiles
      .filter((file) => dirtyDetailFileIds.includes(file.id))
      .map((file) => ({ id: file.id, content: file.content ?? "" }));
    const updated = await onSave({
      id: assistant.id,
      memoryEnabled,
      ...(memoryEnabled && append ? { memoryAppend: append } : {}),
      ...(memoryEnabled && memorySummaryDirty ? { memorySummary } : {}),
      ...(memoryEnabled && memoryDetailFileEdits.length > 0 ? { memoryDetailFileEdits } : {}),
    });
    setMemoryAppend("");
    setMemorySummary(updated.memorySummary);
    setMemoryFiles(updated.memoryFiles);
    setMemorySummaryDirty(false);
    setDirtyDetailFileIds([]);
  }, [
    assistant.id,
    dirtyDetailFileIds,
    memoryAppend,
    memoryEnabled,
    memoryFiles.detailFiles,
    memorySummary,
    memorySummaryDirty,
    onSave,
  ]);

  return (
    <View testID="assistant-memory-editor-page">
      <SettingsSection title="助手记忆配置">
        <View style={styles.card}>
          <View style={settingsStyles.row}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>启用助手记忆</Text>
              <Text style={settingsStyles.rowHint}>
                开启后，Agent 可按需读取助手记忆总览和对应的记忆子文件。
              </Text>
            </View>
            <Switch
              value={memoryEnabled}
              onValueChange={setMemoryEnabled}
              accessibilityLabel="启用助手记忆"
            />
          </View>
          {memoryEnabled ? (
            <>
              <Field
                label="追加源记忆"
                hint="新增内容会追加到现有助手记忆，不会覆盖已经保存的内容。"
                testID="assistant-memory-field"
              >
                <SettingsTextAreaCard
                  value={memoryAppend}
                  onChangeText={setMemoryAppend}
                  placeholder="填写要追加的新记忆；留空则保持现有记忆不变。"
                  accessibilityLabel="助手记忆"
                  style={styles.memoryInput}
                />
              </Field>
              <AssistantMemoryArtifacts
                memorySummary={memorySummary}
                memoryFiles={memoryFiles}
                isEditing
                onMemorySummaryChange={handleMemorySummaryChange}
                onDetailFileContentChange={handleDetailFileContentChange}
              />
            </>
          ) : (
            <Text style={settingsStyles.rowHint}>
              当前已关闭助手记忆。保存后不会向 Agent 提供助手记忆文件。
            </Text>
          )}
          {mutationError ? (
            <Text style={settingsStyles.rowError}>{mutationError.message}</Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              variant="default"
              onPress={handleSave}
              disabled={!isConnected}
              loading={isMutating}
            >
              保存助手记忆
            </Button>
          </View>
        </View>
      </SettingsSection>
    </View>
  );
}

export function AssistantMemoryEditorPage({
  serverId,
  assistantId,
}: {
  serverId: string;
  assistantId: string;
}) {
  const supportsAssistants = useHostFeature(serverId, "assistants");
  const assistants = useAssistants(serverId, { enabled: supportsAssistants });
  const assistant = useMemo(
    () => assistants.assistants.find((entry) => entry.id === assistantId) ?? null,
    [assistantId, assistants.assistants],
  );

  if (!supportsAssistants) {
    return <Text style={settingsStyles.rowHint}>助手记忆功能需要更新主机后使用。</Text>;
  }
  if (assistants.isLoading) {
    return <Text style={settingsStyles.rowHint}>正在加载助手记忆…</Text>;
  }
  if (!assistant) {
    return <Text style={settingsStyles.rowHint}>找不到要编辑记忆的助手。</Text>;
  }

  return (
    <AssistantMemoryForm
      key={assistant.id}
      assistant={assistant}
      isConnected={assistants.isConnected}
      isMutating={assistants.isMutating}
      mutationError={assistants.mutationError}
      onSave={assistants.updateAssistant}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  memoryInput: {
    minHeight: 120,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
}));
