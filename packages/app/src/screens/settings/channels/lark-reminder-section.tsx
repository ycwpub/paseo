import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  LarkChannelBotStatus,
  LarkDirectory,
  LarkDirectoryChat,
  LarkDirectoryUser,
  LarkReminder,
  LarkReminderSender,
  LarkReminderUpdateInput,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { LarkUserOAuthCard } from "@/projects/lark/lark-user-oauth-card";
import { useHostFeature } from "@/runtime/host-features";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { formatLarkChatId, formatLarkUserOpenId } from "./lark-directory-format";
import { LarkReminderAudienceFields } from "./lark-reminder-audience-fields";
import { useLarkReminders } from "./use-lark-reminders";

type SenderType = LarkReminderSender["type"];

interface LarkReminderSharedProps {
  serverId: string;
  bots: LarkChannelBotStatus[];
  directory: LarkDirectory | null;
  directorySupported: boolean;
  resolveDirectoryUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  resolveDirectoryChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
}

interface LarkReminderSectionProps extends LarkReminderSharedProps {
  onCreate: () => void;
  onEdit: (reminder: LarkReminder) => void;
}

interface LarkReminderEditorProps extends LarkReminderSharedProps {
  reminder?: LarkReminder | null;
  onSaved: () => void;
}

function botLabel(bot: LarkChannelBotStatus): string {
  return bot.bot?.name || bot.name || bot.appId || bot.id;
}

function splitOpenIds(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,，;；]+/u)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function getAvailableReminderBots(
  bots: LarkChannelBotStatus[],
  reminder: LarkReminder | null | undefined,
): LarkChannelBotStatus[] {
  return bots.filter((bot) => bot.enabled || bot.id === reminder?.botId);
}

function buildReminderBotOptions(bots: LarkChannelBotStatus[]): SelectFieldOption<string>[] {
  return bots.map((bot) => ({
    id: bot.id,
    value: bot.id,
    label: botLabel(bot),
    description: bot.appId ?? bot.id,
  }));
}

function createReminderEditorInitialState(
  reminder: LarkReminder | null | undefined,
  bots: LarkChannelBotStatus[],
) {
  return {
    name: reminder?.name ?? "",
    botId: reminder?.botId ?? bots[0]?.id ?? null,
    chatId: reminder?.chatId ?? "",
    targetOpenIds: reminder?.targetOpenIds ?? [],
    rawTargetOpenIds: reminder?.targetOpenIds.join(", ") ?? "",
    message: reminder?.message ?? "",
    frequencyMinutes: reminder ? String(reminder.frequencySeconds / 60) : "30",
    senderType: reminder?.sender.type ?? ("bot" as SenderType),
  };
}

interface ReminderEditorValues {
  name: string;
  botId: string | null;
  chatId: string;
  targetOpenIds: string[];
  rawTargetOpenIds: string;
  message: string;
  frequencyMinutes: string;
  senderType: SenderType;
}

function buildReminderUpdateInput(
  values: ReminderEditorValues,
  directorySupported: boolean,
  selectedBot: LarkChannelBotStatus | null,
): { input: LarkReminderUpdateInput | null; error: string | null } {
  const parsedFrequency = Number(values.frequencyMinutes);
  const openIds = directorySupported ? values.targetOpenIds : splitOpenIds(values.rawTargetOpenIds);
  if (!values.botId) return { input: null, error: "请选择已启用的飞书机器人" };
  if (!values.chatId.trim()) return { input: null, error: "请输入群 ID" };
  if (openIds.length === 0) return { input: null, error: "至少通过邮箱选择一个被提醒人" };
  if (!values.message.trim()) return { input: null, error: "请输入提醒文案" };
  if (!Number.isInteger(parsedFrequency) || parsedFrequency < 1) {
    return { input: null, error: "提醒频率必须是大于等于 1 的整数分钟" };
  }
  if (values.senderType === "user" && !selectedBot?.appId) {
    return { input: null, error: "用户身份发送需要选择已配置 App ID 的飞书机器人" };
  }
  return {
    input: {
      name: values.name.trim() || undefined,
      botId: values.botId,
      chatId: values.chatId.trim(),
      targetOpenIds: openIds,
      message: values.message.trim(),
      frequencySeconds: parsedFrequency * 60,
      sender:
        values.senderType === "bot" ? ({ type: "bot" } as const) : ({ type: "user" } as const),
    },
    error: null,
  };
}

function statusLabel(reminder: LarkReminder): string {
  switch (reminder.status) {
    case "active":
      return "运行中";
    case "paused":
      return "已停止";
    case "completed":
      return "已收到回复";
    case "error":
      return "错误";
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function ReminderRow({
  reminder,
  botAppId,
  directory,
  busy,
  onEdit,
  onEnabledChange,
  onDelete,
}: {
  reminder: LarkReminder;
  botAppId: string | null;
  directory: LarkDirectory | null;
  busy: boolean;
  onEdit: (reminder: LarkReminder) => void;
  onEnabledChange: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const handleEdit = useCallback(() => onEdit(reminder), [onEdit, reminder]);
  const handleEnabledChange = useCallback(
    (enabled: boolean) => onEnabledChange(reminder.id, enabled),
    [onEnabledChange, reminder.id],
  );
  const handleDelete = useCallback(() => onDelete(reminder.id), [onDelete, reminder.id]);
  const detail = [
    `群 ${formatLarkChatId(directory?.chats ?? [], botAppId, reminder.chatId)}`,
    `被提醒人 ${reminder.targetOpenIds
      .map((openId) => formatLarkUserOpenId(directory?.users ?? [], botAppId, openId))
      .join("、")}`,
    `每 ${reminder.frequencySeconds / 60} 分钟`,
    `已发送 ${reminder.sendCount} 次`,
    reminder.sender.type === "bot" ? "机器人身份" : "用户身份（OAuth 自动维护）",
  ].join(" · ");
  return (
    <View style={styles.reminderRow}>
      <View style={styles.reminderContent}>
        <View style={styles.reminderTitleRow}>
          <Text style={settingsStyles.rowTitle}>{reminder.name}</Text>
          <Text style={styles.statusBadge}>{statusLabel(reminder)}</Text>
        </View>
        <Text style={settingsStyles.rowHint}>{detail}</Text>
        <Text style={styles.messageText}>{reminder.message}</Text>
        <Text style={styles.metaText}>下次提醒：{formatDate(reminder.nextRunAt)}</Text>
        {reminder.reply ? (
          <Text style={styles.successText}>
            {formatLarkUserOpenId(
              directory?.users ?? [],
              botAppId,
              reminder.reply.openId,
              reminder.reply.displayName,
            )}{" "}
            已于 {formatDate(reminder.reply.repliedAt)} 回复
          </Text>
        ) : null}
        {reminder.lastError ? (
          <Text style={settingsStyles.rowError}>{reminder.lastError}</Text>
        ) : null}
      </View>
      <View style={styles.rowActions}>
        <Button size="sm" variant="outline" onPress={handleEdit} disabled={busy}>
          编辑
        </Button>
        <Switch
          value={reminder.status === "active"}
          onValueChange={handleEnabledChange}
          disabled={busy}
          accessibilityLabel={`${reminder.name} reminder enabled`}
        />
        <Button size="sm" variant="destructive" onPress={handleDelete} disabled={busy}>
          删除
        </Button>
      </View>
    </View>
  );
}

function UpgradeRequiredCard() {
  return (
    <SettingsSection title="定时任务">
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowHint}>更新 Paseo daemon 后可管理飞书定时提醒。</Text>
        </View>
      </View>
    </SettingsSection>
  );
}

export function LarkReminderSection({
  serverId,
  bots,
  directory,
  onCreate,
  onEdit,
}: LarkReminderSectionProps) {
  const supported = useHostFeature(serverId, "larkReminders");
  const reminders = useLarkReminders(serverId, supported);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleEnabledChange = useCallback(
    (id: string, enabled: boolean) => {
      setActionError(null);
      void reminders.setEnabled(id, enabled).catch((error) => {
        setActionError(error instanceof Error ? error.message : String(error));
      });
    },
    [reminders],
  );
  const handleDelete = useCallback(
    (id: string) => {
      setActionError(null);
      void reminders.deleteReminder(id).catch((error) => {
        setActionError(error instanceof Error ? error.message : String(error));
      });
    },
    [reminders],
  );

  if (!supported) return <UpgradeRequiredCard />;

  return (
    <SettingsSection title={`定时任务（${reminders.reminders.length}）`}>
      <View style={styles.listHeader}>
        <Text style={settingsStyles.rowHint}>
          任一被提醒人在群内回复后，任务会自动停止；也可以随时编辑、停止或删除。
        </Text>
        <Button variant="default" onPress={onCreate} testID="host-page-lark-create-reminder">
          创建定时任务
        </Button>
      </View>
      {actionError || reminders.error ? (
        <Text style={settingsStyles.rowError}>{actionError ?? reminders.error?.message}</Text>
      ) : null}
      <View style={settingsStyles.card}>
        {reminders.reminders.length > 0 ? (
          reminders.reminders.map((reminder, index) => (
            <View key={reminder.id} style={index === 0 ? undefined : settingsStyles.rowBorder}>
              <ReminderRow
                reminder={reminder}
                botAppId={bots.find((bot) => bot.id === reminder.botId)?.appId ?? null}
                directory={directory}
                busy={reminders.isMutating}
                onEdit={onEdit}
                onEnabledChange={handleEnabledChange}
                onDelete={handleDelete}
              />
            </View>
          ))
        ) : (
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>
              {reminders.isLoading ? "正在加载定时任务…" : "暂无定时任务。"}
            </Text>
          </View>
        )}
      </View>
    </SettingsSection>
  );
}

export function LarkReminderEditor({
  serverId,
  bots,
  directory,
  directorySupported,
  resolveDirectoryUsers,
  resolveDirectoryChats,
  reminder,
  onSaved,
}: LarkReminderEditorProps) {
  const supported = useHostFeature(serverId, "larkReminders");
  const reminders = useLarkReminders(serverId, supported);
  const isEditing = Boolean(reminder);
  const availableBots = useMemo(() => getAvailableReminderBots(bots, reminder), [bots, reminder]);
  const botOptions = useMemo<SelectFieldOption<string>[]>(
    () => buildReminderBotOptions(availableBots),
    [availableBots],
  );
  const [initialState] = useState(() => createReminderEditorInitialState(reminder, availableBots));
  const [name, setName] = useState(initialState.name);
  const [botId, setBotId] = useState<string | null>(initialState.botId);
  const [chatId, setChatId] = useState(initialState.chatId);
  const [targetOpenIds, setTargetOpenIds] = useState<string[]>(initialState.targetOpenIds);
  const [rawTargetOpenIds, setRawTargetOpenIds] = useState(initialState.rawTargetOpenIds);
  const [message, setMessage] = useState(initialState.message);
  const [frequencyMinutes, setFrequencyMinutes] = useState(initialState.frequencyMinutes);
  const [senderType, setSenderType] = useState<SenderType>(initialState.senderType);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedBot = useMemo(
    () => availableBots.find((bot) => bot.id === botId) ?? null,
    [availableBots, botId],
  );
  const selectedBotDisplay = useMemo(
    () => (selectedBot ? { label: botLabel(selectedBot) } : null),
    [selectedBot],
  );
  const senderOptions = useMemo<SelectFieldOption<SenderType>[]>(
    () => [
      {
        id: "bot",
        value: "bot",
        label: "机器人身份",
        description: "使用所选 Paseo 飞书机器人发送",
      },
      {
        id: "user",
        value: "user",
        label: "用户身份",
        description: "使用当前飞书 OAuth 授权身份发送，Token 由 Paseo 安全保存并自动续期",
      },
    ],
    [],
  );
  const selectedSenderDisplay = useMemo(
    () => ({ label: senderType === "bot" ? "机器人身份" : "用户身份" }),
    [senderType],
  );

  const handleSave = useCallback(async () => {
    const result = buildReminderUpdateInput(
      {
        name,
        botId,
        chatId,
        targetOpenIds,
        rawTargetOpenIds,
        message,
        frequencyMinutes,
        senderType,
      },
      directorySupported,
      selectedBot,
    );
    if (!result.input) {
      setFormError(result.error);
      return;
    }
    try {
      setFormError(null);
      if (reminder) {
        await reminders.update(reminder.id, result.input);
      } else {
        await reminders.create({ ...result.input, enabled: true });
      }
      onSaved();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  }, [
    botId,
    chatId,
    directorySupported,
    frequencyMinutes,
    message,
    name,
    onSaved,
    rawTargetOpenIds,
    reminder,
    reminders,
    selectedBot,
    senderType,
    targetOpenIds,
  ]);

  if (!supported) return <UpgradeRequiredCard />;

  return (
    <SettingsSection title={isEditing ? "编辑定时任务" : "创建定时任务"}>
      <View style={styles.formCard}>
        <Text style={settingsStyles.rowHint}>
          任一被提醒人在任务启动后向该群发送消息，即视为已回复并自动停止。提醒间隔最短 1 分钟。
        </Text>
        <Field label="任务名称">
          <FormTextInput value={name} onChangeText={setName} placeholder="例如：等待方案确认" />
        </Field>
        <SelectField
          label="飞书机器人"
          value={botId}
          selectedDisplay={selectedBotDisplay}
          options={botOptions}
          onChange={setBotId}
          placeholder="选择已启用的机器人"
          emptyText="暂无已启用的机器人"
        />
        <LarkReminderAudienceFields
          directorySupported={directorySupported}
          selectedBot={selectedBot}
          directory={directory}
          chatId={chatId}
          targetOpenIds={targetOpenIds}
          rawTargetOpenIds={rawTargetOpenIds}
          onChatIdChange={setChatId}
          onTargetOpenIdsChange={setTargetOpenIds}
          onRawTargetOpenIdsChange={setRawTargetOpenIds}
          resolveDirectoryUsers={resolveDirectoryUsers}
          resolveDirectoryChats={resolveDirectoryChats}
        />
        <Field label="@ 提醒文案">
          <FormTextInput
            value={message}
            onChangeText={setMessage}
            placeholder="请确认并回复本消息"
            multiline
            textInputStyle={styles.textarea}
          />
        </Field>
        <Field label="提醒频率（分钟）">
          <FormTextInput
            value={frequencyMinutes}
            onChangeText={setFrequencyMinutes}
            keyboardType="numeric"
            placeholder="30"
          />
        </Field>
        <SelectField
          label="发送身份"
          value={senderType}
          selectedDisplay={selectedSenderDisplay}
          options={senderOptions}
          onChange={setSenderType}
          placeholder="选择发送身份"
          emptyText="无可用发送身份"
        />
        {senderType === "user" && selectedBot?.appId ? (
          <LarkUserOAuthCard serverId={serverId} appId={selectedBot.appId} />
        ) : null}
        {formError || reminders.error ? (
          <Text style={settingsStyles.rowError}>{formError ?? reminders.error?.message}</Text>
        ) : null}
        <View style={styles.submitRow}>
          <Button
            variant="default"
            onPress={handleSave}
            loading={reminders.isMutating}
            disabled={reminders.isMutating || availableBots.length === 0}
          >
            {isEditing ? "保存" : "创建并开启"}
          </Button>
        </View>
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
  formCard: {
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    gap: theme.spacing[4],
    padding: theme.spacing[4],
  },
  textarea: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  submitRow: {
    alignItems: "flex-end",
  },
  reminderRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[4],
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
  },
  reminderContent: {
    flex: 1,
    minWidth: 240,
  },
  reminderTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  statusBadge: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.full,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  messageText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[2],
  },
  metaText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
  },
  successText: {
    color: theme.colors.statusSuccess,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
  },
  rowActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
}));
