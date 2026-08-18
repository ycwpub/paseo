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
            <Text style={settingsStyles.rowTitle}>Export</Text>
            <Text style={settingsStyles.rowHint}>
              Includes settings, summary, detail content, provenance, and revision metadata
            </Text>
          </View>
          <Button size="sm" variant="outline" disabled={disabled} onPress={copyExport}>
            {copied ? "Copied" : "Copy JSON"}
          </Button>
        </View>
        <View style={styles.textAreaCard}>
          <TextInput
            accessibilityLabel="Memory export JSON"
            multiline
            editable={false}
            selectTextOnFocus
            value={exportJson}
            style={styles.transferInput}
          />
        </View>
      </View>
      <View style={[styles.block, settingsStyles.rowBorder]}>
        <Text style={settingsStyles.rowTitle}>Import</Text>
        <Text style={settingsStyles.rowHint}>
          Merge creates new IDs for collisions. Replace removes all current memory first.
        </Text>
        <View style={styles.textAreaCard}>
          <SettingsTextArea
            accessibilityLabel="Memory import JSON"
            value={importJson}
            onChangeText={setImportJson}
            placeholder="Paste a Paseo memory export"
            style={styles.transferInput}
          />
        </View>
        <View style={styles.importActions}>
          <View style={styles.replaceRow}>
            <Text style={settingsStyles.rowHint}>Replace current memory</Text>
            <Switch value={replace} disabled={disabled} onValueChange={setReplace} />
          </View>
          <Button
            size="sm"
            disabled={disabled || importJson.trim().length === 0}
            onPress={runImport}
          >
            Import
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
