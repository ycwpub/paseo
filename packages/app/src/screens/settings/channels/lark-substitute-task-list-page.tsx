import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  LarkChannelBotStatus,
  LarkSubstituteMode,
  LarkSubstituteTask,
  LarkSubstituteTaskSource,
  LarkSubstituteTaskStatus,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  larkSubstituteFailureAdvice,
  larkSubstituteFailureStageLabel,
} from "./lark-substitute-task-failure-display";
import {
  isLarkUserOAuthRequiredError,
  LarkUserOAuthErrorAction,
} from "./lark-user-oauth-error-action";
import { useLarkSubstituteTasks } from "./use-lark-substitute-tasks";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function sourceLabel(source: LarkSubstituteTaskSource): string {
  switch (source) {
    case "group_listener":
      return "群消息监听";
    case "group_scan":
      return "群消息扫描";
    case "private_scan":
      return "私聊扫描";
  }
}

function statusLabel(status: LarkSubstituteTaskStatus): string {
  switch (status) {
    case "pending":
      return "待执行";
    case "paused":
      return "已暂停";
    case "running":
      return "执行中";
    case "completed":
      return "已完成";
    case "skipped":
      return "已跳过";
    case "failed":
      return "失败";
  }
}

function scanResultMessage(summary: {
  enabledModeCount: number;
  groupScanCount: number;
  privateScanCount: number;
}): string {
  if (summary.groupScanCount + summary.privateScanCount > 0) {
    return `扫描完成：群消息扫描 ${summary.groupScanCount} 个，私聊扫描 ${summary.privateScanCount} 个。`;
  }
  if (summary.enabledModeCount > 0) {
    return "扫描完成，但当前替身模式没有启用可扫描的群或私聊配置。";
  }
  return "当前没有已启用的替身模式。";
}

function TaskSelection({
  selected,
  disabled = false,
  onPress,
  label,
}: {
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  label: string;
}) {
  const accessibilityState = useMemo(() => ({ checked: selected }), [selected]);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.checkbox,
        selected && styles.checkboxSelected,
        disabled && styles.checkboxDisabled,
      ]}
    >
      {selected ? <Text style={styles.checkmark}>✓</Text> : null}
    </Pressable>
  );
}

function TaskRow({
  serverId,
  botAppId,
  task,
  selected,
  disabled,
  onToggle,
}: {
  serverId: string;
  botAppId: string | null;
  task: LarkSubstituteTask;
  selected: boolean;
  disabled: boolean;
  onToggle: (taskId: string) => void;
}) {
  const toggle = useCallback(() => onToggle(task.id), [onToggle, task.id]);
  const chat = task.chatName ? `${task.chatName}（${task.chatId}）` : task.chatId;
  const sender = task.senderName
    ? `${task.senderName}${task.senderOpenId ? `（${task.senderOpenId}）` : ""}`
    : (task.senderOpenId ?? "未知发送人");
  return (
    <View style={styles.taskRow}>
      <TaskSelection
        selected={selected}
        disabled={disabled}
        onPress={toggle}
        label={`选择任务 ${task.modeName}`}
      />
      <View style={styles.taskContent}>
        <View style={styles.taskTitleRow}>
          <Text style={settingsStyles.rowTitle}>{task.modeName}</Text>
          <Text style={styles.statusBadge}>{statusLabel(task.status)}</Text>
          <Text style={styles.sourceBadge}>{sourceLabel(task.source)}</Text>
        </View>
        <Text style={settingsStyles.rowHint}>
          {chat} · {sender}
        </Text>
        <Text style={styles.messageText} numberOfLines={3}>
          {task.content || "（无文本内容）"}
        </Text>
        <Text style={styles.metaText}>
          创建：{formatDate(task.createdAt)}
          {task.scheduledAt ? ` · 计划执行：${formatDate(task.scheduledAt)}` : ""}
          {task.agentId ? ` · Agent：${task.agentId}` : ""}
        </Text>
        {task.error ? (
          <View style={styles.failureDetails}>
            <Text style={styles.failureStage}>
              失败阶段：{larkSubstituteFailureStageLabel(task.failureStage)}
            </Text>
            <Text style={settingsStyles.rowError}>错误详情：{task.error}</Text>
            <Text style={styles.failureAdvice}>
              处理建议：{larkSubstituteFailureAdvice(task.failureStage, task.error)}
            </Text>
            {botAppId && isLarkUserOAuthRequiredError(task.error) ? (
              <View style={styles.authorizationAction}>
                <Text style={styles.authorizationLabel}>权限链接：</Text>
                <LarkUserOAuthErrorAction
                  serverId={serverId}
                  appId={botAppId}
                  errorMessage={task.error}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function LarkSubstituteTaskListPage({
  serverId,
  mode,
  bots = [],
}: {
  serverId: string;
  mode: LarkSubstituteMode;
  bots?: readonly LarkChannelBotStatus[];
}) {
  const tasks = useLarkSubstituteTasks(serverId, mode.id);
  const botAppIds = useMemo(() => new Map(bots.map((bot) => [bot.id, bot.appId])), [bots]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const selectedTasks = useMemo(
    () => tasks.tasks.filter((task) => selectedIds.has(task.id)),
    [selectedIds, tasks.tasks],
  );
  const pendingIds = useMemo(
    () => selectedTasks.filter((task) => task.status === "pending").map((task) => task.id),
    [selectedTasks],
  );
  const isBusy = tasks.isMutating || tasks.isScanning;
  const allSelected = tasks.tasks.length > 0 && selectedTasks.length === tasks.tasks.length;
  useEffect(() => {
    const availableIds = new Set(tasks.tasks.map((task) => task.id));
    setSelectedIds((current) => {
      const retained = new Set([...current].filter((taskId) => availableIds.has(taskId)));
      return retained.size === current.size ? current : retained;
    });
  }, [tasks.tasks]);
  const handleToggle = useCallback((taskId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);
  const handleToggleAll = useCallback(() => {
    setSelectedIds((current) =>
      current.size === tasks.tasks.length ? new Set() : new Set(tasks.tasks.map((task) => task.id)),
    );
  }, [tasks.tasks]);
  const handlePause = useCallback(() => {
    if (pendingIds.length === 0) return;
    setActionError(null);
    void tasks
      .pauseTasks(pendingIds)
      .then(() => setSelectedIds(new Set()))
      .catch((error) => setActionError(error instanceof Error ? error.message : String(error)));
  }, [pendingIds, tasks]);
  const handleScanNow = useCallback(() => {
    setActionError(null);
    setScanMessage(null);
    void tasks
      .scanNow()
      .then((summary) => {
        setScanMessage(scanResultMessage(summary));
        return undefined;
      })
      .catch((error) => setActionError(error instanceof Error ? error.message : String(error)));
  }, [tasks]);
  const handleDelete = useCallback(async () => {
    if (selectedTasks.length === 0) return;
    const confirmed = await confirmDialog({
      title: `删除 ${selectedTasks.length} 个替身任务？`,
      message: "删除后无法恢复；正在等待执行的任务也会被取消。",
      confirmLabel: "删除",
      cancelLabel: "取消",
      destructive: true,
    });
    if (!confirmed) return;
    setActionError(null);
    try {
      await tasks.deleteTasks(selectedTasks.map((task) => task.id));
      setSelectedIds(new Set());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }, [selectedTasks, tasks]);

  return (
    <View>
      <View style={styles.toolbar}>
        <View style={styles.selectAll}>
          <TaskSelection
            selected={allSelected}
            disabled={isBusy || tasks.tasks.length === 0}
            onPress={handleToggleAll}
            label="选择全部替身任务"
          />
          <Text style={settingsStyles.rowHint}>
            {selectedIds.size > 0 ? `已选择 ${selectedIds.size} 项` : `共 ${tasks.tasks.length} 项`}
          </Text>
        </View>
        <View style={styles.actions}>
          <Button
            size="sm"
            variant="outline"
            loading={tasks.isScanning}
            disabled={isBusy}
            onPress={handleScanNow}
          >
            立刻执行一次扫描
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pendingIds.length === 0 || isBusy}
            onPress={handlePause}
          >
            暂停任务
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={selectedIds.size === 0 || isBusy}
            onPress={handleDelete}
          >
            删除任务
          </Button>
        </View>
      </View>
      {actionError || tasks.error || tasks.scanError ? (
        <Text style={settingsStyles.rowError}>
          {actionError ?? tasks.scanError?.message ?? tasks.error?.message}
        </Text>
      ) : null}
      {scanMessage ? <Text style={styles.scanMessage}>{scanMessage}</Text> : null}
      <View style={settingsStyles.card}>
        {tasks.tasks.length > 0 ? (
          tasks.tasks.map((task) => (
            <TaskRow
              key={task.id}
              serverId={serverId}
              botAppId={botAppIds.get(task.botId) ?? null}
              task={task}
              selected={selectedIds.has(task.id)}
              disabled={isBusy}
              onToggle={handleToggle}
            />
          ))
        ) : (
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>
              {tasks.isLoading
                ? `正在加载“${mode.name}”的替身任务…`
                : `“${mode.name}”暂无任务。监听或扫描到命中该替身回答规则的消息后，会在这里创建任务。`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
    justifyContent: "space-between",
    marginBottom: theme.spacing[3],
  },
  selectAll: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  checkbox: {
    alignItems: "center",
    borderColor: theme.colors.foregroundExtraMuted,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  checkboxSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkboxDisabled: {
    opacity: 0.5,
  },
  checkmark: {
    color: theme.colors.primaryForeground,
    fontSize: theme.fontSize.sm,
  },
  taskRow: {
    alignItems: "flex-start",
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  taskContent: {
    flex: 1,
    gap: theme.spacing[1],
    minWidth: 0,
  },
  taskTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  statusBadge: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  sourceBadge: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
  },
  messageText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  metaText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  failureDetails: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing[1],
    marginTop: theme.spacing[1],
    padding: theme.spacing[3],
  },
  failureStage: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
  },
  failureAdvice: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  authorizationAction: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
  authorizationLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  scanMessage: {
    color: theme.colors.statusSuccess,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing[3],
  },
}));
