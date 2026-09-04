import { useCallback } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  LarkChannelBotStatus,
  LarkDirectory,
  LarkSubstituteMode,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { settingsStyles } from "@/styles/settings";
import { formatLarkUserOpenId } from "./lark-directory-format";
import { getLarkBotLabel } from "./lark-substitute-mode-form-model";

export function LarkSubstituteModeRow({
  mode,
  bot,
  directory,
  bordered,
  disabled,
  onEdit,
  onEnabledChange,
  onDelete,
}: {
  mode: LarkSubstituteMode;
  bot: LarkChannelBotStatus | undefined;
  directory: LarkDirectory | null;
  bordered: boolean;
  disabled: boolean;
  onEdit: (mode: LarkSubstituteMode) => void;
  onEnabledChange: (modeId: string, enabled: boolean) => void;
  onDelete: (modeId: string) => void;
}) {
  const handleEdit = useCallback(() => onEdit(mode), [mode, onEdit]);
  const handleEnabledChange = useCallback(
    (nextEnabled: boolean) => onEnabledChange(mode.id, nextEnabled),
    [mode.id, onEnabledChange],
  );
  const handleDelete = useCallback(() => onDelete(mode.id), [mode.id, onDelete]);
  const userLabel = formatLarkUserOpenId(
    directory?.users ?? [],
    bot?.appId ?? null,
    mode.substituteUser.openId,
    mode.substituteUser.name ?? undefined,
  );
  return (
    <View style={bordered ? [styles.modeRow, settingsStyles.rowBorder] : styles.modeRow}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{mode.name}</Text>
        <Text style={settingsStyles.rowHint}>
          {userLabel} · {bot ? getLarkBotLabel(bot) : `机器人 ${mode.botId}`} · 延迟{" "}
          {mode.delaySeconds} 秒 · 群聊
          {mode.groupReplyIdentity === "user" ? "用户身份" : "机器人身份"}
        </Text>
      </View>
      <View style={styles.actions}>
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
