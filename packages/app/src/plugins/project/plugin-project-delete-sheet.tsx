import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { FolderX, Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";

export type PluginProjectDeleteMode = "plugin_only" | "plugin_and_project";

export function PluginProjectDeleteSheet({
  visible,
  projectName,
  projectDeleteUnavailableReason,
  deleting,
  onClose,
  onDelete,
}: {
  visible: boolean;
  projectName: string;
  projectDeleteUnavailableReason: string | null;
  deleting: boolean;
  onClose: () => void;
  onDelete: (mode: PluginProjectDeleteMode) => void;
}) {
  const header = useMemo<SheetHeader>(() => ({ title: "删除插件项目" }), []);
  const handleClose = useCallback(() => {
    if (!deleting) onClose();
  }, [deleting, onClose]);
  const deletePluginOnly = useCallback(() => onDelete("plugin_only"), [onDelete]);
  const deleteWithProject = useCallback(() => onDelete("plugin_and_project"), [onDelete]);

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={handleClose}
      desktopMaxWidth={520}
      scrollable={false}
      testID="plugin-project-delete-sheet"
    >
      <Text style={styles.description}>请选择是否同时删除关联的“{projectName}”Project。</Text>
      <View style={styles.option}>
        <View style={styles.optionText}>
          <Text style={styles.optionTitle}>仅删除插件项目</Text>
          <Text style={styles.optionDescription}>
            删除该插件下的页面状态和配置，保留 Project、Workspace、会话及其他插件数据。
          </Text>
        </View>
        <Button
          variant="outline"
          leftIcon={Trash2}
          loading={deleting}
          disabled={deleting}
          onPress={deletePluginOnly}
        >
          仅删除插件项目
        </Button>
      </View>
      <View style={styles.option}>
        <View style={styles.optionText}>
          <Text style={styles.optionTitle}>同时删除关联 Project</Text>
          <Text style={styles.optionDescription}>
            删除插件项目，并从 Paseo 移除关联 Project。不会删除代码目录中的文件。
          </Text>
        </View>
        {projectDeleteUnavailableReason ? (
          <Text style={styles.unavailable}>{projectDeleteUnavailableReason}</Text>
        ) : null}
        <Button
          variant="destructive"
          leftIcon={FolderX}
          loading={deleting}
          disabled={deleting || Boolean(projectDeleteUnavailableReason)}
          onPress={deleteWithProject}
        >
          同时删除 Project
        </Button>
      </View>
      <Button variant="secondary" disabled={deleting} onPress={handleClose}>
        取消
      </Button>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
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
  unavailable: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
}));
