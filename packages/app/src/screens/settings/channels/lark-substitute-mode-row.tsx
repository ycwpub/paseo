import { useCallback } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { LarkChannelBotStatus, LarkSubstituteMode } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { settingsStyles } from "@/styles/settings";
import { getLarkBotLabel } from "./lark-substitute-mode-form-model";

export function LarkSubstituteModeRow({
  mode,
  bot,
  bordered,
  disabled,
  onOpenTasks,
  onEdit,
  onEnabledChange,
  onDelete,
}: {
  mode: LarkSubstituteMode;
  bot: LarkChannelBotStatus | undefined;
  bordered: boolean;
  disabled: boolean;
  onOpenTasks?: (mode: LarkSubstituteMode) => void;
  onEdit: (mode: LarkSubstituteMode) => void;
  onEnabledChange: (modeId: string, enabled: boolean) => void;
  onDelete: (modeId: string) => void;
}) {
  const handleEdit = useCallback(() => onEdit(mode), [mode, onEdit]);
  const handleOpenTasks = useCallback(() => onOpenTasks?.(mode), [mode, onOpenTasks]);
  const handleEnabledChange = useCallback(
    (nextEnabled: boolean) => onEnabledChange(mode.id, nextEnabled),
    [mode.id, onEnabledChange],
  );
  const handleDelete = useCallback(() => onDelete(mode.id), [mode.id, onDelete]);
  return (
    <View style={bordered ? [styles.modeRow, settingsStyles.rowBorder] : styles.modeRow}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{mode.name}</Text>
        <Text style={settingsStyles.rowHint}>
          授权用户 · {bot ? getLarkBotLabel(bot) : `机器人 ${mode.botId}`} · 延迟{" "}
          {mode.delaySeconds} 秒 · 机器人身份回答 ·{" "}
          {mode.privateScan.enabled
            ? `私聊每 ${mode.privateScan.intervalMinutes} 分钟扫描`
            : "私聊扫描已关闭"}
        </Text>
      </View>
      <View style={styles.actions}>
        {onOpenTasks ? (
          <Button size="sm" variant="outline" onPress={handleOpenTasks}>
            任务列表
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onPress={handleEdit}>
          编辑
        </Button>
        <Switch
          value={mode.enabled}
          onValueChange={handleEnabledChange}
          disabled={disabled}
          accessibilityLabel={`${mode.name}是否启用`}
        />
        <Button size="sm" variant="destructive" onPress={handleDelete} disabled={disabled}>
          删除
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  modeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
  },
}));
