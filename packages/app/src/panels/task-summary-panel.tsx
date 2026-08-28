import { ListChecks } from "lucide-react-native";
import { Text, View } from "react-native";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import invariant from "tiny-invariant";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel, type PanelPresentation } from "@/panels/panel-registry";
import { useWorkspaceDirectory } from "@/stores/session-store-hooks";
import { TaskSummaryPane } from "@/task-summary/panel";
import { useWorkspaceTaskSummaryAgent } from "@/task-summary/use-workspace-task-summary-agent";

const ThemedListChecks = withUnistyles(ListChecks);

const taskSummaryPanelPresentation = {
  label: (t) => t("agentPanel.taskSummary.title"),
  subtitle: (t) => t("agentPanel.taskSummary.subtitle"),
  tooltip: (t) => t("agentPanel.taskSummary.open"),
  icon: ThemedListChecks,
} satisfies PanelPresentation;

function TaskSummaryPanel() {
  const { t } = useTranslation();
  const { serverId, workspaceId, target, openPreferredTarget } = usePaneContext();
  const workspaceRoot = useWorkspaceDirectory(serverId, workspaceId);
  const agent = useWorkspaceTaskSummaryAgent(serverId, workspaceId);
  invariant(target.kind === "task_summary", "TaskSummaryPanel requires task_summary target");

  const handleOpenFile = useCallback(
    (path: string) => openPreferredTarget({ kind: "file", path }, "explorerFiles"),
    [openPreferredTarget],
  );

  if (!agent) {
    return (
      <View style={styles.empty} testID="task-summary-empty">
        <Text style={styles.emptyTitle}>{t("agentPanel.taskSummary.emptyTitle")}</Text>
        <Text style={styles.emptyDescription}>{t("agentPanel.taskSummary.emptyDescription")}</Text>
      </View>
    );
  }

  return (
    <TaskSummaryPane
      serverId={serverId}
      agentId={agent.agentId}
      cwd={agent.cwd ?? workspaceRoot ?? ""}
      onOpenFile={handleOpenFile}
    />
  );
}

export const taskSummaryPanelRegistration = definePanel("task_summary", {
  component: TaskSummaryPanel,
  presentation: taskSummaryPanelPresentation,
});

const styles = StyleSheet.create((theme) => ({
  empty: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[6],
    backgroundColor: theme.colors.surfaceSidebar,
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    textAlign: "center",
  },
  emptyDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    textAlign: "center",
  },
}));
