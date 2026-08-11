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
      <View style={styles.titleRow} testID="workflow-title-row">
        <WorkflowWrappingTitleInput
          value={name}
          onChangeText={onChangeName}
          placeholder={untitledPlaceholder}
          accessibilityLabel={nameLabel}
          editorTitle={nameLabel}
          expandable={false}
          style={styles.titleInput}
          textInputStyle={styles.titleInputText}
          testID="workflow-name"
        />
      </View>
      <View style={styles.pathActionsRow} testID="workflow-path-actions-row">
        <Text
          style={[styles.path, path ? styles.pathValue : styles.pathHint]}
          selectable={Boolean(path)}
          numberOfLines={2}
        >
          {path ?? generatedPathLabel}
        </Text>
        <View style={styles.actions}>
          {path ? (
            <Button variant="outline" size="sm" leftIcon={Trash2} onPress={onDelete}>
              {deleteLabel}
            </Button>
          ) : null}
          <View style={styles.saveGroup} testID="workflow-save-group">
            {dirty ? (
              <View testID="workflow-save-status">
                <StatusBadge label={unsavedLabel} variant="muted" />
              </View>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  toolbar: {
    gap: theme.spacing[1],
    paddingHorizontal: { xs: theme.spacing[3], md: theme.spacing[4] },
    paddingVertical: theme.spacing[3],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  titleRow: {
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  titleInput: {
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    lineHeight: Math.round(theme.fontSize.lg * 1.5),
  },
  titleInputText: {
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  pathActionsRow: {
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  path: {
    minWidth: 0,
    flex: 1,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.45),
  },
  pathValue: {
    fontFamily: theme.fontFamily.mono,
  },
  pathHint: {
    fontFamily: theme.fontFamily.ui,
  },
  actions: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  saveGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
}));
