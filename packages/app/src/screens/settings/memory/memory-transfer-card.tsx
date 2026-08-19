import { useCallback, useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingsTextArea } from "@/components/settings-textarea";
import { settingsStyles } from "@/styles/settings";

export function MemoryTransferCard({
  exportJson,
  disabled,
  onImport,
}: {
  exportJson: string;
  disabled: boolean;
  onImport: (json: string, replace: boolean) => Promise<void>;
}) {
  const [importJson, setImportJson] = useState("");
  const [replace, setReplace] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [exportJson]);

  const copyExport = useCallback(async () => {
    await Clipboard.setStringAsync(exportJson);
    setCopied(true);
  }, [exportJson]);
  const runImport = useCallback(async () => {
    await onImport(importJson, replace);
    setImportJson("");
  }, [importJson, onImport, replace]);

  return (
    <View style={settingsStyles.card}>
      <View style={styles.block}>
        <View style={styles.blockHeader}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>导出</Text>
            <Text style={settingsStyles.rowHint}>包含设置、总览、详情内容、来源和修订元数据</Text>
          </View>
          <Button size="sm" variant="outline" disabled={disabled} onPress={copyExport}>
            {copied ? "已复制" : "复制 JSON"}
          </Button>
        </View>
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
          合并时会为冲突项创建新 ID；替换会先删除当前全部记忆。
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
}));
