import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { Pencil, Plus } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { openProjectLarkGroupSettings } from "@/navigation/settings-feature-navigation";
import { useLarkChannel } from "@/screens/settings/channels/use-lark-channel";
import { formatLarkChatId } from "@/screens/settings/channels/lark-directory-format";
import { SettingsGroup } from "@/screens/settings/settings-group";
import { settingsStyles } from "@/styles/settings";
import type { ProjectLarkGroupDraft } from "./project-lark-context-model";

function ProjectLarkGroupRow({
  serverId,
  projectId,
  group,
  botLabel,
  chatLabel,
  isFirst,
}: {
  serverId: string;
  projectId: string;
  group: ProjectLarkGroupDraft;
  botLabel: string;
  chatLabel: string;
  isFirst: boolean;
}) {
  const edit = useCallback(() => {
    openProjectLarkGroupSettings(serverId, projectId, group.id);
  }, [group.id, projectId, serverId]);
  const rowStyle = useMemo(
    () => [settingsStyles.row, !isFirst ? settingsStyles.rowBorder : null],
    [isFirst],
  );

  return (
    <View style={rowStyle} testID={`project-lark-group-row-${group.id}`}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {chatLabel}
        </Text>
        <Text style={settingsStyles.rowHint} numberOfLines={2}>
          {botLabel} · {group.enabled ? "已启用" : "已停用"} · 最近 {group.messageLimitText || "50"}{" "}
          条消息
        </Text>
      </View>
      <Button
        size="sm"
        variant="outline"
        leftIcon={Pencil}
        onPress={edit}
        accessibilityLabel={`编辑飞书群 ${chatLabel}`}
        testID={`project-lark-group-edit-${group.id}`}
      >
        编辑
      </Button>
    </View>
  );
}

export function ProjectLarkGroupsList({
  serverId,
  projectId,
  groups,
}: {
  serverId: string;
  projectId: string;
  groups: readonly ProjectLarkGroupDraft[];
}) {
  const lark = useLarkChannel(serverId);
  const create = useCallback(() => {
    openProjectLarkGroupSettings(serverId, projectId);
  }, [projectId, serverId]);
  const botsById = useMemo(
    () => new Map((lark.status?.bots ?? []).map((bot) => [bot.id, bot] as const)),
    [lark.status?.bots],
  );
  const chats = lark.status?.directory?.chats ?? [];
  const createButton = useMemo(
    () => (
      <Button
        size="sm"
        variant="outline"
        leftIcon={Plus}
        onPress={create}
        testID="project-lark-group-create"
      >
        创建
      </Button>
    ),
    [create],
  );

  return (
    <SettingsGroup
      title="飞书群上下文"
      info="管理当前项目绑定的飞书群。创建或编辑会进入独立页面，不会在项目配置页内展开复杂表单。"
      trailing={createButton}
      testID="project-lark-groups-list"
    >
      <View style={settingsStyles.card}>
        {groups.length === 0 ? (
          <View style={settingsStyles.row}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>尚未绑定飞书群</Text>
              <Text style={settingsStyles.rowHint}>
                点击“创建”，选择飞书机器人和群聊，并配置消息上下文。
              </Text>
            </View>
          </View>
        ) : (
          groups.map((group, index) => {
            const bot = botsById.get(group.botId);
            const botName = bot?.name?.trim() || bot?.bot?.name?.trim() || "未命名机器人";
            const botLabel = bot?.appId ? `${botName}（${bot.appId}）` : botName;
            const chatLabel = bot?.appId
              ? formatLarkChatId(chats, bot.appId, group.chatId)
              : group.chatId;
            return (
              <ProjectLarkGroupRow
                key={group.id}
                serverId={serverId}
                projectId={projectId}
                group={group}
                botLabel={botLabel}
                chatLabel={chatLabel || "未选择飞书群"}
                isFirst={index === 0}
              />
            );
          })
        )}
      </View>
      {lark.error ? <Text style={styles.error}>{lark.error.message}</Text> : null}
    </SettingsGroup>
  );
}

const styles = StyleSheet.create((theme) => ({
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
