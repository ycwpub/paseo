import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { StyleSheet } from "react-native-unistyles";
import type {
  Assistant,
  PaseoMemoryState,
  PaseoMemoryTransferSelection,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { EditingTextInput as TextInput } from "@/components/ui/text-input";
import { SettingsTextArea } from "@/components/settings-textarea";
import { settingsStyles } from "@/styles/settings";
import {
  buildMemoryTransferSelectionOptions,
  memoryTransferSelectionKey,
  memoryTransferSelectionLabel,
} from "./memory-transfer-selection";

export function MemoryTransferCard({
  memory,
  assistants,
  disabled,
  onExport,
  onImport,
}: {
  memory: PaseoMemoryState;
  assistants: readonly Assistant[];
  disabled: boolean;
  onExport: (selection: PaseoMemoryTransferSelection) => Promise<string>;
  onImport: (
    json: string,
    replace: boolean,
    selection: PaseoMemoryTransferSelection,
  ) => Promise<void>;
}) {
  const [selection, setSelection] = useState<PaseoMemoryTransferSelection>({ type: "all" });
  const [exportJson, setExportJson] = useState(memory.exportJson ?? "");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importJson, setImportJson] = useState("");
  const [replace, setReplace] = useState(false);
  const [copied, setCopied] = useState(false);
  const selectionOptions = useMemo(
    () => buildMemoryTransferSelectionOptions({ memory, assistants }),
    [assistants, memory],
  );
  const selectedOption =
    selectionOptions.find(
      (option) =>
        memoryTransferSelectionKey(option.value) === memoryTransferSelectionKey(selection),
    ) ?? selectionOptions[0]!;
  const selectedDisplay = useMemo(
    () => ({
      label: selectedOption.label,
      description: selectedOption.description,
    }),
    [selectedOption],
  );
  const selectionLabel = memoryTransferSelectionLabel(selection, assistants);
  let copyLabel = "复制 JSON";
  if (exporting) copyLabel = "正在导出…";
  else if (copied) copyLabel = "已复制";

  useEffect(() => {
    let active = true;
    setExporting(true);
    setExportError(null);
    void (async () => {
      try {
        const json = await onExport(selection);
        if (active) setExportJson(json);
      } catch (error) {
        if (active) setExportError(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) setExporting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [onExport, selection]);
  useEffect(() => setCopied(false), [exportJson]);

  const copyExport = useCallback(async () => {
    await Clipboard.setStringAsync(exportJson);
    setCopied(true);
  }, [exportJson]);
  const runImport = useCallback(async () => {
    await onImport(importJson, replace, selection);
    setImportJson("");
  }, [importJson, onImport, replace, selection]);

  return (
    <View style={settingsStyles.card}>
      <View style={styles.selection}>
        <SelectField
          label="导入导出范围"
          value={selection}
          selectedDisplay={selectedDisplay}
          options={selectionOptions}
          onChange={setSelection}
          getValueKey={memoryTransferSelectionKey}
          placeholder="选择记忆范围"
          emptyText="没有可选的记忆范围"
          disabled={disabled || exporting}
        />
      </View>
      <View style={styles.block}>
        <View style={styles.blockHeader}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>导出</Text>
            <Text style={settingsStyles.rowHint}>
              {selection.type === "all"
                ? "包含设置、总览、详情内容、来源和修订元数据"
                : `仅导出${selectionLabel}的可同步记忆内容、来源和修订元数据`}
            </Text>
          </View>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || exporting || exportJson.length === 0}
            onPress={copyExport}
          >
            {copyLabel}
          </Button>
        </View>
        {exportError ? <Text style={styles.error}>{exportError}</Text> : null}
        <View style={styles.textAreaCard}>
          <TextInput
            accessibilityLabel="记忆导出 JSON"
            multiline
            editable={false}
            selectTextOnFocus
            value={exportJson}
            style={styles.transferInput}
          />
        </View>
      </View>
      <View style={[styles.block, settingsStyles.rowBorder]}>
        <Text style={settingsStyles.rowTitle}>导入</Text>
        <Text style={settingsStyles.rowHint}>
          {selection.type === "all"
            ? "合并时会保留现有记忆；替换会先删除当前全部记忆。"
            : `合并时会保留现有记忆；替换只会先删除${selectionLabel}。`}
        </Text>
        <View style={styles.textAreaCard}>
          <SettingsTextArea
            accessibilityLabel="记忆导入 JSON"
            value={importJson}
            onChangeText={setImportJson}
            placeholder="粘贴 Paseo 记忆导出内容"
            style={styles.transferInput}
          />
        </View>
        <View style={styles.importActions}>
          <View style={styles.replaceRow}>
            <Text style={settingsStyles.rowHint}>替换当前记忆</Text>
            <Switch value={replace} disabled={disabled} onValueChange={setReplace} />
          </View>
          <Button
            size="sm"
            disabled={disabled || importJson.trim().length === 0}
            onPress={runImport}
          >
            导入
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  selection: {
    padding: theme.spacing[4],
    paddingBottom: 0,
  },
  block: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  blockHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  textAreaCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
    overflow: "hidden",
  },
  transferInput: {
    minHeight: 160,
    fontFamily: "monospace",
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    padding: theme.spacing[3],
    textAlignVertical: "top",
  },
  importActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  replaceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  error: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
  },
}));
