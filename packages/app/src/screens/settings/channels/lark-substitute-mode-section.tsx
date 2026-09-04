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
  directory,
  onCreate,
  onEdit,
}: {
  serverId: string;
  bots: LarkChannelBotStatus[];
  directory: LarkDirectory | null;
  onCreate: () => void;
  onEdit: (mode: LarkSubstituteMode) => void;
}) {
  const supported = useHostFeature(serverId, "larkSubstituteModes");
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
          私聊固定使用用户身份回复；群聊可为每个替身模式选择用户或机器人身份。
        </Text>
        <Button variant="default" onPress={onCreate} testID="host-page-lark-create-substitute">
          创建替身模式
        </Button>
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
              directory={directory}
              bordered={index > 0}
              disabled={substituteModes.isMutating}
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
}));
