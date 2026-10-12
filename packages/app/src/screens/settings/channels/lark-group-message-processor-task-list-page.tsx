import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { LarkGroupMessageProcessor } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { settingsStyles } from "@/styles/settings";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useLarkGroupMessageProcessorTasks } from "./use-lark-group-message-processor-tasks";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function TaskRow({
  task,
  selected,
  disabled,
  onToggle,
}: {
  task: ReturnType<typeof useLarkGroupMessageProcessorTasks>["tasks"][number];
  selected: boolean;
  disabled: boolean;
  onToggle: (taskId: string) => void;
}) {
  const toggle = useCallback(() => onToggle(task.id), [onToggle, task.id]);
  return (
    <View style={styles.row}>
      <Button
        size="sm"
        variant={selected ? "default" : "outline"}
        disabled={disabled}
        onPress={toggle}
      >
        {selected ? "已选" : "选择"}
      </Button>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>
          {task.status} · {task.source === "listener" ? "群消息监听" : "群消息扫描"}
        </Text>
        <Text style={settingsStyles.rowHint}>
          {task.chatName ?? task.chatId} · {task.senderName ?? task.senderOpenId ?? "未知发送人"}
        </Text>
        <Text style={styles.message} numberOfLines={3}>
          {task.content || "（无文本内容）"}
        </Text>
        <Text style={settingsStyles.rowHint}>
          创建：{formatDate(task.createdAt)}
          {task.agentId ? ` · Agent：${task.agentId}` : ""}
        </Text>
        {task.error ? (
          <Text style={settingsStyles.rowError}>
            失败阶段：{task.failureStage ?? "未知"} · {task.error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function LarkGroupMessageProcessorTaskListPage({
  serverId,
  processor,
}: {
  serverId: string;
  processor: LarkGroupMessageProcessor;
}) {
  const state = useLarkGroupMessageProcessorTasks(serverId, processor.id);
  const [lookbackMinutes, setLookbackMinutes] = useState("120");
  const [excludeRecentMinutes, setExcludeRecentMinutes] = useState("1");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const selectedTasks = useMemo(
    () => state.tasks.filter((task) => selectedIds.has(task.id)),
    [selectedIds, state.tasks],
  );
  const isBusy = state.isMutating || state.isScanning;
  const scan = useCallback(() => {
    const lookback = Number(lookbackMinutes);
    const exclude = Number(excludeRecentMinutes);
    if (
      !Number.isInteger(lookback) ||
      !Number.isInteger(exclude) ||
      lookback < 1 ||
      exclude < 0 ||
      exclude >= lookback
    ) {
      setError("请填写有效扫描范围：扫描范围大于 0，排除最近小于扫描范围。");
      return;
    }
    setError(null);
    void state
      .scanNow({ lookbackMinutes: lookback, excludeRecentMinutes: exclude })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, [excludeRecentMinutes, lookbackMinutes, state]);
  const pause = useCallback(() => {
    const ids = selectedTasks.filter((task) => task.status === "pending").map((task) => task.id);
    if (ids.length === 0) return;
    void state
      .pauseTasks(ids)
      .then(() => setSelectedIds(new Set()))
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, [selectedTasks, state]);
  const retry = useCallback(() => {
    const ids = selectedTasks.filter((task) => task.status === "failed").map((task) => task.id);
    if (ids.length === 0) return;
    void state
      .retryTasks(ids)
      .then(() => setSelectedIds(new Set()))
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, [selectedTasks, state]);
  const remove = useCallback(async () => {
    if (selectedTasks.length === 0) return;
    const confirmed = await confirmDialog({
      title: `删除 ${selectedTasks.length} 个群消息任务？`,
      message: "删除后无法恢复；待执行任务也会被取消。",
      confirmLabel: "删除",
      cancelLabel: "取消",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await state.deleteTasks(selectedTasks.map((task) => task.id));
      setSelectedIds(new Set());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [selectedTasks, state]);
  const removePressed = useCallback(() => void remove(), [remove]);
  const toggleTask = useCallback((taskId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  return (
    <View>
      <View style={styles.scanPanel}>
        <Text style={settingsStyles.rowTitle}>本次手动扫描</Text>
        <View style={styles.scanFields}>
          <Field label="扫描范围（分钟）">
            <FormTextInput
              value={lookbackMinutes}
              onChangeText={setLookbackMinutes}
              keyboardType="number-pad"
            />
          </Field>
          <Field label="排除最近（分钟）">
            <FormTextInput
              value={excludeRecentMinutes}
              onChangeText={setExcludeRecentMinutes}
              keyboardType="number-pad"
            />
          </Field>
        </View>
        <Button
          size="sm"
          variant="outline"
          loading={state.isScanning}
          disabled={isBusy}
          onPress={scan}
        >
          立刻执行一次扫描
        </Button>
      </View>
      <View style={styles.toolbar}>
        <Text style={settingsStyles.rowHint}>
          {selectedIds.size > 0 ? `已选择 ${selectedIds.size} 项` : `共 ${state.tasks.length} 项`}
        </Text>
        <View style={styles.actions}>
          <Button
            size="sm"
            variant="outline"
            disabled={isBusy || !selectedTasks.some((task) => task.status === "failed")}
            onPress={retry}
          >
            重试任务
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isBusy || !selectedTasks.some((task) => task.status === "pending")}
            onPress={pause}
          >
            暂停任务
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isBusy || selectedTasks.length === 0}
            onPress={removePressed}
          >
            删除任务
          </Button>
        </View>
      </View>
      {error || state.error ? (
        <Text style={settingsStyles.rowError}>{error ?? state.error?.message}</Text>
      ) : null}
      <View style={settingsStyles.card}>
        {state.tasks.length > 0 ? (
          state.tasks.map((task, index) => (
            <View key={task.id} style={index === 0 ? undefined : settingsStyles.rowBorder}>
              <TaskRow
                task={task}
                selected={selectedIds.has(task.id)}
                disabled={isBusy}
                onToggle={toggleTask}
              />
            </View>
          ))
        ) : (
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>
              {state.isLoading
                ? "正在加载群消息处理任务…"
                : "暂无任务。监听或扫描命中规则后会在这里创建任务。"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  scanPanel: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
    padding: theme.spacing[4],
  },
  scanFields: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[3] },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
    justifyContent: "space-between",
    marginBottom: theme.spacing[3],
  },
  actions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  message: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
}));
