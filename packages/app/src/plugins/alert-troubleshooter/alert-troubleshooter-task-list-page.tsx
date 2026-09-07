/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Task-row actions bind the selected persisted task id. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Pause, RefreshCw, Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  AlertTroubleshooterTask,
  AlertTroubleshooterTaskStatus,
  AlertTroubleshooterTaskTrigger,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { BackHeader } from "@/components/headers/back-header";
import { useHostRuntimeClient } from "@/runtime/host-runtime";

function triggerLabel(trigger: AlertTroubleshooterTaskTrigger, matchedCount: number): string {
  if (trigger === "message") return "监听到 1 条消息并写入日报表";
  if (trigger === "schedule") return `扫描到 ${matchedCount} 条消息，当前消息已写入日报表`;
  if (trigger === "manual") return "按 unique_id 手动创建";
  return "从日报表轮询认领";
}

function statusLabel(status: AlertTroubleshooterTaskStatus): string {
  if (status === "queued") return "等待执行";
  if (status === "running") return "执行中";
  if (status === "paused") return "已暂停";
  if (status === "succeeded") return "已完成";
  return "执行失败";
}

function TaskRow({
  task,
  busy,
  onPause,
  onDelete,
}: {
  task: AlertTroubleshooterTask;
  busy: boolean;
  onPause: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  const canPause = task.status === "queued" || task.status === "running";
  return (
    <View style={styles.taskCard}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.taskTitle}>{triggerLabel(task.trigger, task.matchedCount)}</Text>
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
            <Text selectable style={styles.error}>
              {task.error}
            </Text>
          ) : null}
        </View>
        <View style={styles.actions}>
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
  projectId,
  projectName,
  onBack,
}: {
  active: boolean;
  serverId: string;
  pluginId: string;
  appId: string;
  projectId: string;
  projectName: string;
  onBack: () => void;
}) {
  const client = useHostRuntimeClient(serverId);
  const [tasks, setTasks] = useState<AlertTroubleshooterTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
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

  return (
    <View style={styles.root}>
      <BackHeader title={`${projectName} · 任务执行记录`} onBack={onBack} />
      <View style={styles.toolbar}>
        <Text style={styles.description}>
          查看监听、扫描、日报入表及 Agent 排查状态；失败原因会直接显示在对应任务中。
        </Text>
        <Button
          size="sm"
          variant="outline"
          leftIcon={RefreshCw}
          loading={loading}
          onPress={refresh}
        >
          刷新
        </Button>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
          busy={busyTaskId === task.id}
          onPause={pauseTask}
          onDelete={deleteTask}
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
  empty: {
    gap: theme.spacing[2],
    padding: theme.spacing[6],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
}));
