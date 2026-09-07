import { useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { LarkChannelBotStatus } from "@getpaseo/protocol/messages";
import type { LarkDirectoryChat } from "@getpaseo/protocol/messages";
import { FormTextInput } from "@/components/ui/form-field";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { LarkChatDirectoryField } from "@/screens/settings/channels/lark-directory-fields";
import { useLarkChannel } from "@/screens/settings/channels/use-lark-channel";
import { SettingsGroup } from "@/screens/settings/settings-group";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import {
  createProjectLarkGroupDraft,
  type ProjectLarkGroupDraft,
} from "./project-lark-context-model";
import { LarkUserOAuthCard } from "./lark-user-oauth-card";

function formatBotLabel(bot: LarkChannelBotStatus): string {
  const name = bot.name?.trim() || bot.bot?.name?.trim() || "未命名机器人";
  return bot.appId ? `${name}（${bot.appId}）` : name;
}

function useProjectLarkEditorDirectory(serverId: string) {
  const lark = useLarkChannel(serverId);
  const bots = useMemo(
    () => (lark.status?.bots ?? []).filter((bot) => bot.appId && bot.hasAppSecret),
    [lark.status?.bots],
  );
  const botOptions = useMemo<SelectFieldOption<string>[]>(
    () =>
      bots.map((bot) => ({
        id: bot.id,
        value: bot.id,
        label: formatBotLabel(bot),
        description: bot.enabled ? "已启用" : "未启用；只能定时同步，不能实时接收消息",
      })),
    [bots],
  );
  return {
    bots,
    botOptions,
    chats: lark.status?.directory?.chats ?? [],
    isLoading: lark.isLoading,
    resolveChats: lark.resolveDirectoryChats,
    error: lark.error,
  };
}

interface ProjectLarkContextEditorProps {
  serverId: string;
  value: ProjectLarkGroupDraft[];
  error: string | null;
  onChange: (value: ProjectLarkGroupDraft[]) => void;
}

interface ProjectLarkBindingEditorProps {
  serverId: string;
  group: ProjectLarkGroupDraft;
  index: number;
  isLast: boolean;
  bots: LarkChannelBotStatus[];
  botOptions: SelectFieldOption<string>[];
  chats: LarkDirectoryChat[];
  isLoading: boolean;
  resolveChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
  updateGroup: (
    rowId: string,
    updater: (group: ProjectLarkGroupDraft) => ProjectLarkGroupDraft,
  ) => void;
  removeGroup: (rowId: string) => void;
  allowRemove?: boolean;
  title?: string;
}

function ProjectLarkBindingEditor({
  serverId,
  group,
  index,
  isLast,
  bots,
  botOptions,
  chats,
  isLoading,
  resolveChats,
  updateGroup,
  removeGroup,
  allowRemove = true,
  title,
}: ProjectLarkBindingEditorProps) {
  const selectedBot = useMemo(
    () => bots.find((bot) => bot.id === group.botId) ?? null,
    [bots, group.botId],
  );
  const selectedDisplay = useMemo<SelectFieldDisplay | null>(
    () => (selectedBot ? { label: formatBotLabel(selectedBot) } : null),
    [selectedBot],
  );
  const appId = selectedBot?.appId ?? "";
  const handleRemove = useCallback(() => removeGroup(group.rowId), [group.rowId, removeGroup]);
  const handleBotChange = useCallback(
    (botId: string) =>
      updateGroup(group.rowId, (current) => ({
        ...current,
        botId,
        chatId: current.botId === botId ? current.chatId : "",
      })),
    [group.rowId, updateGroup],
  );
  const handleChatChange = useCallback(
    (chatId: string) =>
      updateGroup(group.rowId, (current) => ({
        ...current,
        chatId,
      })),
    [group.rowId, updateGroup],
  );
  const handleEnabledChange = useCallback(
    (enabled: boolean) =>
      updateGroup(group.rowId, (current) => ({
        ...current,
        enabled,
      })),
    [group.rowId, updateGroup],
  );
  const handleMessageLimitChange = useCallback(
    (messageLimitText: string) =>
      updateGroup(group.rowId, (current) => ({
        ...current,
        messageLimitText,
      })),
    [group.rowId, updateGroup],
  );
  const trailing = useMemo(() => {
    if (!allowRemove) return undefined;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`删除飞书群绑定 ${index + 1}`}
        onPress={handleRemove}
        hitSlop={8}
        testID={`project-lark-context-remove-${index}`}
      >
        <Trash2 size={14} color={styles.dangerIcon.color} />
      </Pressable>
    );
  }, [allowRemove, handleRemove, index]);

  return (
    <SettingsSection
      title={title ?? `飞书群绑定 ${index + 1}`}
      trailing={trailing}
      flush={isLast}
      testID={`project-lark-context-binding-${index}`}
    >
      <View style={styles.bindingContent}>
        <SelectField
          label="飞书机器人"
          value={group.botId || null}
          selectedDisplay={selectedDisplay}
          options={botOptions}
          onChange={handleBotChange}
          placeholder="选择已配置的飞书机器人"
          emptyText="没有可用的飞书机器人"
          loading={isLoading}
          searchable
          testID={`project-lark-context-bot-${index}`}
        />
        {appId ? <LarkUserOAuthCard serverId={serverId} appId={appId} /> : null}
        <LarkChatDirectoryField
          label="飞书群"
          hint="可按群名称或 oc_xxx 查询。保存后机器人会自动加入该群。"
          appId={appId}
          chatId={group.chatId}
          chats={chats}
          disabled={!selectedBot}
          onChange={handleChatChange}
          resolveChats={resolveChats}
          testID={`project-lark-context-chat-${index}`}
        />
        <View style={styles.inlineRow}>
          <View style={styles.inlineText}>
            <Text style={settingsStyles.rowTitle}>启用群消息上下文</Text>
            <Text style={settingsStyles.rowHint}>关闭后保留配置，但不再同步或注入该群消息。</Text>
          </View>
          <Switch
            value={group.enabled}
            onValueChange={handleEnabledChange}
            testID={`project-lark-context-enabled-${index}`}
          />
        </View>
        <View style={styles.inlineRow}>
          <View style={styles.inlineText}>
            <Text style={settingsStyles.rowTitle}>最近消息数量</Text>
            <Text style={settingsStyles.rowHint}>每个群保留并注入最近 1 到 200 条消息。</Text>
          </View>
          <FormTextInput
            value={group.messageLimitText}
            onChangeText={handleMessageLimitChange}
            keyboardType="number-pad"
            style={styles.limitInput}
            testID={`project-lark-context-message-limit-${index}`}
          />
        </View>
      </View>
    </SettingsSection>
  );
}

export function ProjectLarkContextEditor({
  serverId,
  value,
  error,
  onChange,
}: ProjectLarkContextEditorProps) {
  const directory = useProjectLarkEditorDirectory(serverId);

  const handleAdd = useCallback(
    () => onChange([...value, createProjectLarkGroupDraft()]),
    [onChange, value],
  );
  const updateGroup = useCallback(
    (rowId: string, updater: (group: ProjectLarkGroupDraft) => ProjectLarkGroupDraft) => {
      onChange(value.map((group) => (group.rowId === rowId ? updater(group) : group)));
    },
    [onChange, value],
  );
  const removeGroup = useCallback(
    (rowId: string) => onChange(value.filter((group) => group.rowId !== rowId)),
    [onChange, value],
  );

  const trailing = useMemo(
    () => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="添加飞书群"
        onPress={handleAdd}
        hitSlop={8}
        style={settingsStyles.sectionHeaderLink}
        testID="project-lark-context-add"
      >
        <Plus size={14} color={styles.iconColor.color} />
      </Pressable>
    ),
    [handleAdd],
  );

  return (
    <SettingsGroup
      title="飞书群上下文"
      info="绑定飞书机器人和群聊后，Paseo 会自动邀请机器人入群，并把最近群消息作为当前项目的参考上下文。群消息不会被视为系统指令或操作授权。"
      trailing={trailing}
      testID="project-lark-context-group"
    >
      {value.length === 0 ? (
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>
              尚未绑定飞书群。请先在设置中配置飞书机器人，再添加群聊。
            </Text>
          </View>
        </View>
      ) : (
        value.map((group, index) => (
          <ProjectLarkBindingEditor
            key={group.rowId}
            serverId={serverId}
            group={group}
            index={index}
            isLast={index === value.length - 1}
            bots={directory.bots}
            botOptions={directory.botOptions}
            chats={directory.chats}
            isLoading={directory.isLoading}
            resolveChats={directory.resolveChats}
            updateGroup={updateGroup}
            removeGroup={removeGroup}
          />
        ))
      )}
      {directory.error ? (
        <Text style={settingsStyles.rowError}>{directory.error.message}</Text>
      ) : null}
      {error ? <Text style={settingsStyles.rowError}>{error}</Text> : null}
    </SettingsGroup>
  );
}

export function ProjectLarkGroupEditor({
  serverId,
  value,
  error,
  onChange,
}: {
  serverId: string;
  value: ProjectLarkGroupDraft;
  error: string | null;
  onChange: (value: ProjectLarkGroupDraft) => void;
}) {
  const directory = useProjectLarkEditorDirectory(serverId);
  const updateGroup = useCallback(
    (_rowId: string, updater: (group: ProjectLarkGroupDraft) => ProjectLarkGroupDraft) => {
      onChange(updater(value));
    },
    [onChange, value],
  );
  const ignoreRemove = useCallback(() => undefined, []);

  return (
    <SettingsGroup
      title="飞书群配置"
      info="选择飞书机器人和群聊后，Paseo 会邀请机器人入群，并把最近群消息作为当前项目的参考上下文。"
      testID="project-lark-group-editor"
    >
      <ProjectLarkBindingEditor
        serverId={serverId}
        group={value}
        index={0}
        isLast
        bots={directory.bots}
        botOptions={directory.botOptions}
        chats={directory.chats}
        isLoading={directory.isLoading}
        resolveChats={directory.resolveChats}
        updateGroup={updateGroup}
        removeGroup={ignoreRemove}
        allowRemove={false}
        title="群配置"
      />
      {directory.error ? (
        <Text style={settingsStyles.rowError}>{directory.error.message}</Text>
      ) : null}
      {error ? <Text style={settingsStyles.rowError}>{error}</Text> : null}
    </SettingsGroup>
  );
}

const styles = StyleSheet.create((theme) => ({
  bindingContent: {
    gap: theme.spacing[4],
  },
  inlineRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[4],
    justifyContent: "space-between",
  },
  inlineText: {
    flex: 1,
    gap: theme.spacing[1],
    minWidth: 0,
  },
  limitInput: {
    width: 96,
  },
  iconColor: {
    color: theme.colors.foregroundMuted,
  },
  dangerIcon: {
    color: theme.colors.destructive,
  },
}));
