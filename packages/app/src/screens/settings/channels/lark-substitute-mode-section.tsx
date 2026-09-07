import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  LarkChannelBotStatus,
  LarkDirectory,
  LarkSubstituteMode,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { useHostFeature } from "@/runtime/host-features";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { LarkSubstituteModeRow } from "./lark-substitute-mode-row";
import { useLarkSubstituteModes } from "./use-lark-substitute-modes";

export { LarkSubstituteModeEditor } from "./lark-substitute-mode-editor";

export function LarkSubstituteModeSection({
  serverId,
  bots,
  directory: _directory,
  onCreate,
  onEdit,
  onOpenTasks,
}: {
  serverId: string;
  bots: LarkChannelBotStatus[];
  directory: LarkDirectory | null;
  onCreate: () => void;
  onEdit: (mode: LarkSubstituteMode) => void;
  onOpenTasks: (mode: LarkSubstituteMode) => void;
}) {
  const supported = useHostFeature(serverId, "larkSubstituteModes");
  const tasksSupported = useHostFeature(serverId, "larkSubstituteTasks");
  const substituteModes = useLarkSubstituteModes(serverId, supported);
  const [error, setError] = useState<string | null>(null);
  const handleEnabledChange = useCallback(
    (modeId: string, nextEnabled: boolean) => {
      setError(null);
      void substituteModes.setEnabled(modeId, nextEnabled).catch((reason) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    },
    [substituteModes],
  );
  const handleDelete = useCallback(
    (modeId: string) => {
      setError(null);
      void substituteModes.deleteMode(modeId).catch((reason) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    },
    [substituteModes],
  );

  if (!supported) {
    return (
      <SettingsSection title="替身模式">
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>更新 Paseo daemon 后可管理独立替身模式。</Text>
          </View>
        </View>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title={`替身模式（${substituteModes.modes.length}）`}>
      <View style={styles.listHeader}>
        <Text style={settingsStyles.rowHint}>
          当前 OAuth 授权用户即替身用户；群聊自动邀请机器人入群，私聊按计划扫描并转发到三方群，
          回答均由机器人在话题中发送。
        </Text>
        <View style={styles.headerActions}>
          <Button variant="default" onPress={onCreate} testID="host-page-lark-create-substitute">
            创建替身模式
          </Button>
        </View>
      </View>
      {error || substituteModes.error ? (
        <Text style={settingsStyles.rowError}>{error ?? substituteModes.error?.message}</Text>
      ) : null}
      <View style={settingsStyles.card}>
        {substituteModes.modes.length > 0 ? (
          substituteModes.modes.map((mode, index) => (
            <LarkSubstituteModeRow
              key={mode.id}
              mode={mode}
              bot={bots.find((entry) => entry.id === mode.botId)}
              bordered={index > 0}
              disabled={substituteModes.isMutating}
              onOpenTasks={tasksSupported ? onOpenTasks : undefined}
              onEdit={onEdit}
              onEnabledChange={handleEnabledChange}
              onDelete={handleDelete}
            />
          ))
        ) : (
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>
              {substituteModes.isLoading ? "正在加载替身模式…" : "暂无替身模式。"}
            </Text>
          </View>
        )}
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  listHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
    justifyContent: "space-between",
    marginBottom: theme.spacing[3],
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
}));
