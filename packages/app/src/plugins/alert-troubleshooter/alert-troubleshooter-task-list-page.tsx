/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Task-row actions bind the selected persisted task id. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Pause, RefreshCw, RotateCcw, Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  AlertTroubleshooterTask,
  AlertTroubleshooterTaskStatus,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { BackHeader } from "@/components/headers/back-header";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import {
  isLarkUserOAuthRequiredError,
  LarkUserOAuthErrorAction,
} from "@/screens/settings/channels/lark-user-oauth-error-action";
import {
  isLarkBotPermissionRequiredError,
  LarkBotPermissionErrorAction,
} from "@/screens/settings/channels/lark-bot-permission-error-action";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  deleteAllAlertTroubleshooterTasks,
  retryAlertTroubleshooterTask,
} from "./alert-troubleshooter-task-actions";

function triggerLabel(task: AlertTroubleshooterTask): string {
  if (task.trigger === "message") return "监听到 1 条消息并写入日报表";
  if (task.trigger === "schedule")
    return `扫描到 ${task.matchedCount} 条消息，当前消息已写入日报表`;
  if (task.trigger === "manual") {
    return task.resultId ? "按 result_id 手动调试" : "按 unique_id 手动创建";
  }
  return "从日报表轮询认领";
}

function statusLabel(status: AlertTroubleshooterTaskStatus): string {
  if (status === "queued") return "等待执行";
  if (status === "running") return "执行中";
  if (status === "paused") return "已暂停";
  if (status === "succeeded") return "已完成";
  if (status === "pending") return "等待授权或人工处理";
  if (status === "not_support") return "暂不支持";
  return "执行失败";
}

function TaskRow({
  task,
  busy,
  serverId,
  larkAppId,
  larkBotId,
  onPause,
  onDelete,
  onRetry,
  onAuthorized,
}: {
  task: AlertTroubleshooterTask;
  busy: boolean;
  serverId: string;
  larkAppId: string;
  larkBotId: string;
  onPause: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onRetry: (task: AlertTroubleshooterTask) => Promise<void>;
  onAuthorized: (task: AlertTroubleshooterTask) => Promise<void>;
}) {
  const canPause = task.status === "queued" || task.status === "running";
  const canRetry = task.status === "failed" || task.status === "paused";
  return (
    <View style={styles.taskCard}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.taskTitle}>{triggerLabel(task)}</Text>
          <Text selectable style={styles.meta}>
            unique_id：{task.uniqueId}
          </Text>
          {task.resultId ? (
            <Text selectable style={styles.meta}>
              result_id：{task.resultId}
            </Text>
          ) : null}
          <Text selectable style={styles.meta}>
            日报：{task.tableDate} · 状态：{statusLabel(task.status)} · 尝试：{task.attempts}
          </Text>
          {task.agentId ? (
            <Text selectable style={styles.meta}>
              Agent：{task.agentId}
            </Text>
          ) : null}
          {task.error ? (
            <View style={styles.failure}>
              <Text selectable style={styles.error}>
                {task.error}
              </Text>
              {larkAppId && isLarkUserOAuthRequiredError(task.error) ? (
                <View style={styles.authorizationAction}>
                  <Text style={styles.meta}>权限链接：</Text>
                  <LarkUserOAuthErrorAction
                    serverId={serverId}
                    appId={larkAppId}
                    errorMessage={task.error}
                    onAuthorized={() => {
                      void onAuthorized(task).catch(() => {});
                    }}
                  />
                </View>
              ) : null}
              {larkAppId && larkBotId && isLarkBotPermissionRequiredError(task.error) ? (
                <View style={styles.authorizationAction}>
                  <Text style={styles.meta}>权限链接：</Text>
                  <LarkBotPermissionErrorAction
                    serverId={serverId}
                    appId={larkAppId}
                    botId={larkBotId}
                    errorMessage={task.error}
                    onAuthorized={() => onAuthorized(task)}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.actions}>
          {canRetry ? (
            <Button
              size="xs"
              variant="outline"
              leftIcon={RotateCcw}
              disabled={busy}
              onPress={() => void onRetry(task)}
            >
              重新执行
            </Button>
          ) : null}
          {canPause ? (
            <Button
              size="xs"
              variant="outline"
              leftIcon={Pause}
              disabled={busy}
              onPress={() => onPause(task.id)}
            >
              暂停
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="ghost"
            leftIcon={Trash2}
            disabled={busy}
            onPress={() => onDelete(task.id)}
          >
            删除
          </Button>
        </View>
      </View>
      <Text style={styles.time}>更新时间：{new Date(task.updatedAt).toLocaleString("zh-CN")}</Text>
    </View>
  );
}

export function AlertTroubleshooterTaskListPage({
  active,
  serverId,
  pluginId,
  appId,
  larkAppId,
  larkBotId,
  projectId,
  projectName,
  onBack,
}: {
  active: boolean;
  serverId: string;
  pluginId: string;
  appId: string;
  larkAppId: string;
  larkBotId: string;
  projectId: string;
  projectName: string;
  onBack: () => void;
}) {
  const client = useHostRuntimeClient(serverId);
  const [tasks, setTasks] = useState<AlertTroubleshooterTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useMemo(() => ({ pluginId, appId, projectId }), [appId, pluginId, projectId]);

  const refresh = useCallback(async () => {
    if (!client || !active) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.listAlertTroubleshooterTasks(request);
      if (response.error) throw new Error(response.error);
      setTasks(response.tasks);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [active, client, request]);

  useEffect(() => {
    void refresh();
    if (!active) return;
    const timer = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  const pauseTask = useCallback(
    async (taskId: string) => {
      if (!client) return;
      setBusyTaskId(taskId);
      setError(null);
      try {
        const response = await client.pauseAlertTroubleshooterTasks({
          ...request,
          taskIds: [taskId],
        });
        if (response.error) throw new Error(response.error);
        setTasks(response.tasks);
      } catch (pauseError) {
        setError(pauseError instanceof Error ? pauseError.message : String(pauseError));
      } finally {
        setBusyTaskId(null);
      }
    },
    [client, request],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      if (!client) return;
      setBusyTaskId(taskId);
      setError(null);
      try {
        const response = await client.deleteAlertTroubleshooterTasks({
          ...request,
          taskIds: [taskId],
        });
        if (response.error) throw new Error(response.error);
        setTasks(response.tasks);
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
      } finally {
        setBusyTaskId(null);
      }
    },
    [client, request],
  );

  const retryTask = useCallback(
    async (task: AlertTroubleshooterTask) => {
      if (!client) throw new Error("当前主机未连接，无法重新执行任务");
      setBusyTaskId(task.id);
      setError(null);
      try {
        setTasks(await retryAlertTroubleshooterTask(client, request, task));
      } catch (retryError) {
        const message = retryError instanceof Error ? retryError.message : String(retryError);
        setError(message);
        throw retryError;
      } finally {
        setBusyTaskId(null);
      }
    },
    [client, request],
  );

  const deleteAllTasks = useCallback(async () => {
    if (!client || tasks.length === 0) return;
    const confirmed = await confirmDialog({
      title: `删除全部 ${tasks.length} 条执行记录？`,
      message: "删除后无法恢复；正在执行或等待执行的任务也会停止。",
      confirmLabel: "删除全部",
      cancelLabel: "取消",
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingAll(true);
    setError(null);
    try {
      setTasks(await deleteAllAlertTroubleshooterTasks(client, request, tasks));
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : String(deleteError);
      await refresh();
      setError(message);
    } finally {
      setDeletingAll(false);
    }
  }, [client, refresh, request, tasks]);

  return (
    <View style={styles.root}>
      <BackHeader title={`${projectName} · 任务执行记录`} onBack={onBack} />
      <View style={styles.toolbar}>
        <Text style={styles.description}>
          查看监听、扫描、日报入表及 Agent 排查状态；失败原因会直接显示在对应任务中。
        </Text>
        <View style={styles.actions}>
          <Button
            size="sm"
            variant="outline"
            leftIcon={RefreshCw}
            loading={loading}
            disabled={deletingAll}
            onPress={refresh}
          >
            刷新
          </Button>
          <Button
            size="sm"
            variant="destructive"
            leftIcon={Trash2}
            loading={deletingAll}
            disabled={tasks.length === 0 || deletingAll || busyTaskId !== null}
            onPress={() => void deleteAllTasks()}
          >
            删除全部
          </Button>
        </View>
      </View>
      {error ? (
        <View style={styles.failure}>
          <Text style={styles.error}>{error}</Text>
          {larkAppId && isLarkUserOAuthRequiredError(error) ? (
            <View style={styles.authorizationAction}>
              <Text style={styles.meta}>权限链接：</Text>
              <LarkUserOAuthErrorAction
                serverId={serverId}
                appId={larkAppId}
                errorMessage={error}
                onAuthorized={refresh}
              />
            </View>
          ) : null}
          {larkAppId && larkBotId && isLarkBotPermissionRequiredError(error) ? (
            <View style={styles.authorizationAction}>
              <Text style={styles.meta}>权限链接：</Text>
              <LarkBotPermissionErrorAction
                serverId={serverId}
                appId={larkAppId}
                botId={larkBotId}
                errorMessage={error}
                onAuthorized={refresh}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {tasks.length === 0 && !loading ? (
        <View style={styles.empty}>
          <Text style={styles.taskTitle}>暂无任务执行记录</Text>
          <Text style={styles.description}>监听或扫描到匹配消息后，任务会显示在这里。</Text>
        </View>
      ) : null}
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          busy={deletingAll || busyTaskId === task.id}
          serverId={serverId}
          larkAppId={larkAppId}
          larkBotId={larkBotId}
          onPause={pauseTask}
          onDelete={deleteTask}
          onRetry={retryTask}
          onAuthorized={retryTask}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    gap: theme.spacing[4],
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  taskCard: {
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  flex: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  taskTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  description: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  meta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  time: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  failure: {
    gap: theme.spacing[1],
  },
  authorizationAction: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
  empty: {
    gap: theme.spacing[2],
    padding: theme.spacing[6],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
}));
