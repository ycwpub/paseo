import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { AlertTriangle, FolderX, Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import type { DevelopmentDeleteMode } from "./development-delete-model";

export function DevelopmentDeleteSheet({
  visible,
  flowTitle,
  projectName,
  otherFlowCount,
  projectDeleteUnavailableReason,
  deleting,
  onClose,
  onDelete,
}: {
  visible: boolean;
  flowTitle: string;
  projectName: string;
  otherFlowCount: number;
  projectDeleteUnavailableReason: string | null;
  deleting: boolean;
  onClose: () => void;
  onDelete: (mode: DevelopmentDeleteMode) => void;
}) {
  const header = useMemo<SheetHeader>(() => ({ title: "删除插件项目" }), []);
  const handleClose = useCallback(() => {
    if (!deleting) onClose();
  }, [deleting, onClose]);
  const handlePluginOnly = useCallback(() => onDelete("plugin_only"), [onDelete]);
  const handlePluginAndProject = useCallback(() => onDelete("plugin_and_project"), [onDelete]);

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={handleClose}
      desktopMaxWidth={520}
      scrollable={false}
      testID="development-delete-sheet"
    >
      <View style={styles.summary}>
        <Text style={styles.title}>删除“{flowTitle}”</Text>
        <Text style={styles.description}>请选择是否同时删除关联的 {projectName}。</Text>
      </View>

      <View style={styles.option}>
        <View style={styles.optionText}>
          <Text style={styles.optionTitle}>仅删除插件项目</Text>
          <Text style={styles.optionDescription}>
            删除开发流程和运行记录，保留关联 Project、Workspace 与会话。
          </Text>
        </View>
        <Button
          variant="outline"
          leftIcon={Trash2}
          disabled={deleting}
          loading={deleting}
          onPress={handlePluginOnly}
          testID="development-delete-plugin-only"
        >
          仅删除插件项目
        </Button>
      </View>

      <View style={styles.option}>
        <View style={styles.optionText}>
          <Text style={styles.optionTitle}>同时删除关联 Project</Text>
          <Text style={styles.optionDescription}>
            删除开发流程，并从 Paseo 移除关联 Project。Project 下的 Workspace
            与会话会被归档或移除，但不会删除代码目录中的文件。
          </Text>
        </View>
        {otherFlowCount > 0 ? (
          <View style={styles.warning}>
            <AlertTriangle size={16} style={styles.warningIcon} />
            <Text style={styles.warningText}>
              另有 {otherFlowCount} 个插件项目关联此 Project，删除后这些插件项目将失去 Project
              上下文。
            </Text>
          </View>
        ) : null}
        {projectDeleteUnavailableReason ? (
          <Text style={styles.unavailable}>{projectDeleteUnavailableReason}</Text>
        ) : null}
        <Button
          variant="destructive"
          leftIcon={FolderX}
          disabled={deleting || Boolean(projectDeleteUnavailableReason)}
          loading={deleting}
          onPress={handlePluginAndProject}
          testID="development-delete-with-project"
        >
          同时删除 Project
        </Button>
      </View>

      <Button
        variant="secondary"
        disabled={deleting}
        onPress={handleClose}
        testID="development-delete-cancel"
      >
        取消
      </Button>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  summary: {
    gap: theme.spacing[1],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  option: {
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  optionText: {
    gap: theme.spacing[1],
  },
  optionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  optionDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  warningIcon: {
    color: theme.colors.statusWarning,
    flexShrink: 0,
    marginTop: 2,
  },
  warningText: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
  unavailable: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
}));
