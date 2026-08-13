import React, { type ReactElement } from "react";
import { Text, View } from "react-native";
import { Save, Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkflowWrappingTitleInput } from "@/components/workflows/workflow-wrapping-title-input";

export function WorkflowEditorToolbar({
  name,
  path,
  dirty,
  saving,
  nameLabel,
  untitledPlaceholder,
  generatedPathLabel,
  unsavedLabel,
  deleteLabel,
  saveLabel,
  onChangeName,
  onDelete,
  onSave,
}: {
  name: string;
  path: string | null;
  dirty: boolean;
  saving: boolean;
  nameLabel: string;
  untitledPlaceholder: string;
  generatedPathLabel: string;
  unsavedLabel: string;
  deleteLabel: string;
  saveLabel: string;
  onChangeName: (name: string) => void;
  onDelete: () => void;
  onSave: () => void;
}): ReactElement {
  return (
    <View style={styles.toolbar}>
      <View style={styles.titleGroup}>
        <View style={styles.titleRow}>
          <WorkflowWrappingTitleInput
            value={name}
            onChangeText={onChangeName}
            placeholder={untitledPlaceholder}
            accessibilityLabel={nameLabel}
            editorTitle={nameLabel}
            expandable={false}
            style={styles.titleInput}
            testID="workflow-name"
          />
          {dirty ? <StatusBadge label={unsavedLabel} variant="muted" /> : null}
        </View>
        <Text style={styles.path} selectable>
          {path ?? generatedPathLabel}
        </Text>
      </View>
      <View style={styles.actions}>
        {path ? (
          <Button variant="outline" size="sm" leftIcon={Trash2} onPress={onDelete}>
            {deleteLabel}
          </Button>
        ) : null}
        <Button
          variant="default"
          size="sm"
          leftIcon={Save}
          onPress={onSave}
          loading={saving}
          disabled={!dirty && Boolean(path)}
          testID="workflow-save"
        >
          {saveLabel}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  toolbar: {
    flexDirection: { xs: "column", md: "row" },
    alignItems: { xs: "stretch", md: "flex-start" },
    justifyContent: "space-between",
    gap: theme.spacing[3],
    padding: {
      xs: theme.spacing[3],
      md: theme.spacing[4],
    },
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  titleInput: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    minHeight: 40,
    paddingHorizontal: 0,
    paddingVertical: theme.spacing[1],
    borderWidth: 0,
    backgroundColor: "transparent",
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.normal,
    lineHeight: Math.round(theme.fontSize.xl * 1.25),
  },
  path: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
    lineHeight: Math.round(theme.fontSize.xs * 1.45),
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
}));
