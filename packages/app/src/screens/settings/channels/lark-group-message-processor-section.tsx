import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { LarkGroupMessageProcessor } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useHostFeature } from "@/runtime/host-features";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useLarkGroupMessageProcessors } from "./use-lark-group-message-processors";

function ProcessorRow({
  processor,
  disabled,
  tasksSupported,
  onOpenTasks,
  onEdit,
  onEnabledChange,
  onDelete,
}: {
  processor: LarkGroupMessageProcessor;
  disabled: boolean;
  tasksSupported: boolean;
  onOpenTasks: (processor: LarkGroupMessageProcessor) => void;
  onEdit: (processor: LarkGroupMessageProcessor) => void;
  onEnabledChange: (processorId: string, enabled: boolean) => void;
  onDelete: (processorId: string) => void;
}) {
  const openTasks = useCallback(() => onOpenTasks(processor), [onOpenTasks, processor]);
  const edit = useCallback(() => onEdit(processor), [onEdit, processor]);
  const setEnabled = useCallback(
    (enabled: boolean) => onEnabledChange(processor.id, enabled),
    [onEnabledChange, processor.id],
  );
  const remove = useCallback(() => onDelete(processor.id), [onDelete, processor.id]);
  return (
    <View style={styles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{processor.name}</Text>
        <Text style={settingsStyles.rowHint}>
          实时监听
          {processor.realtime.enabled
            ? `等待 ${processor.realtime.delaySeconds} 秒`
            : "已关闭"} ·
          定时扫描
          {processor.scan.enabled ? `每 ${processor.scan.intervalMinutes} 分钟` : "已关闭"}
        </Text>
      </View>
      <View style={styles.actions}>
        {tasksSupported ? (
          <Button size="sm" variant="outline" onPress={openTasks}>
            任务列表
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onPress={edit}>
          编辑
        </Button>
        <Switch
          value={processor.enabled}
          disabled={disabled}
          accessibilityLabel={`${processor.name}是否启用`}
          onValueChange={setEnabled}
        />
        <Button size="sm" variant="destructive" disabled={disabled} onPress={remove}>
          删除
        </Button>
      </View>
    </View>
  );
}

export function LarkGroupMessageProcessorSection({
  serverId,
  onCreate,
  onEdit,
  onOpenTasks,
}: {
  serverId: string;
  onCreate: () => void;
  onEdit: (processor: LarkGroupMessageProcessor) => void;
  onOpenTasks: (processor: LarkGroupMessageProcessor) => void;
}) {
  const supported = useHostFeature(serverId, "larkGroupMessageProcessors");
  const tasksSupported = useHostFeature(serverId, "larkGroupMessageProcessorTasks");
  const processors = useLarkGroupMessageProcessors(serverId, supported);
  const [error, setError] = useState<string | null>(null);

  const setEnabled = useCallback(
    (processorId: string, enabled: boolean) => {
      setError(null);
      void processors
        .setEnabled(processorId, enabled)
        .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    },
    [processors],
  );
  const remove = useCallback(
    (processorId: string) => {
      setError(null);
      void processors
        .deleteProcessor(processorId)
        .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    },
    [processors],
  );

  if (!supported) {
    return (
      <SettingsSection title="群消息自动处理">
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>更新 Paseo daemon 后可配置群消息自动处理。</Text>
          </View>
        </View>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title={`群消息自动处理（${processors.processors.length}）`}>
      <View style={styles.header}>
        <Text style={settingsStyles.rowHint}>
          先将机器人手动加入目标群。Paseo 会监听并扫描机器人所在群的人工消息，按规则创建话题回复。
        </Text>
        <Button variant="default" onPress={onCreate} testID="host-page-lark-create-group-processor">
          创建处理器
        </Button>
      </View>
      {error || processors.error ? (
        <Text style={settingsStyles.rowError}>{error ?? processors.error?.message}</Text>
      ) : null}
      <View style={settingsStyles.card}>
        {processors.processors.length > 0 ? (
          processors.processors.map((processor, index) => {
            return (
              <View key={processor.id} style={index === 0 ? undefined : settingsStyles.rowBorder}>
                <ProcessorRow
                  processor={processor}
                  disabled={processors.isMutating}
                  tasksSupported={tasksSupported}
                  onOpenTasks={onOpenTasks}
                  onEdit={onEdit}
                  onEnabledChange={setEnabled}
                  onDelete={remove}
                />
              </View>
            );
          })
        ) : (
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>
              {processors.isLoading ? "正在加载群消息处理器…" : "暂无群消息处理器。"}
            </Text>
          </View>
        )}
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
    justifyContent: "space-between",
    marginBottom: theme.spacing[3],
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
}));
