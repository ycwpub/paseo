import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  LarkChannelBotStatus,
  LarkReminder,
  LarkReminderSender,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { useHostFeature } from "@/runtime/host-features";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useLarkReminders } from "./use-lark-reminders";

type SenderType = LarkReminderSender["type"];

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
  busy,
  onEnabledChange,
  onDelete,
}: {
  reminder: LarkReminder;
  busy: boolean;
  onEnabledChange: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const handleEnabledChange = useCallback(
    (enabled: boolean) => onEnabledChange(reminder.id, enabled),
    [onEnabledChange, reminder.id],
  );
  const handleDelete = useCallback(() => onDelete(reminder.id), [onDelete, reminder.id]);
  const detail = [
    `群 ${reminder.chatId}`,
    `每 ${reminder.frequencySeconds / 60} 分钟`,
    `已发送 ${reminder.sendCount} 次`,
    reminder.sender.type === "bot"
      ? "机器人身份"
      : `用户身份（${reminder.sender.userAccessTokenEnv}）`,
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
            {reminder.reply.displayName} 已于 {formatDate(reminder.reply.repliedAt)} 回复
          </Text>
        ) : null}
        {reminder.lastError ? (
          <Text style={settingsStyles.rowError}>{reminder.lastError}</Text>
        ) : null}
      </View>
      <View style={styles.rowActions}>
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

export function LarkReminderSection({
  serverId,
  bots,
}: {
  serverId: string;
  bots: LarkChannelBotStatus[];
}) {
  const supported = useHostFeature(serverId, "larkReminders");
  const reminders = useLarkReminders(serverId, supported);
  const enabledBots = useMemo(() => bots.filter((bot) => bot.enabled), [bots]);
  const botOptions = useMemo<SelectFieldOption<string>[]>(
    () =>
      enabledBots.map((bot) => ({
        id: bot.id,
        value: bot.id,
        label: botLabel(bot),
        description: bot.appId ?? bot.id,
      })),
    [enabledBots],
  );
  const [name, setName] = useState("");
  const [botId, setBotId] = useState<string | null>(enabledBots[0]?.id ?? null);
  const [chatId, setChatId] = useState("");
  const [targetOpenIds, setTargetOpenIds] = useState("");
  const [message, setMessage] = useState("");
  const [frequencyMinutes, setFrequencyMinutes] = useState("30");
  const [senderType, setSenderType] = useState<SenderType>("bot");
  const [userAccessTokenEnv, setUserAccessTokenEnv] = useState("LARK_USER_ACCESS_TOKEN");
  const [formError, setFormError] = useState<string | null>(null);

  const selectedBot = useMemo(
    () => enabledBots.find((bot) => bot.id === botId) ?? null,
    [botId, enabledBots],
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
        description: "使用环境变量中的 user_access_token 发送，不在 Paseo 中保存 Token",
      },
    ],
    [],
  );
  const selectedSenderDisplay = useMemo(
    () => ({
      label: senderType === "bot" ? "机器人身份" : "用户身份",
    }),
    [senderType],
  );

  const handleCreate = useCallback(async () => {
    const openIds = splitOpenIds(targetOpenIds);
    const parsedFrequency = Number(frequencyMinutes);
    if (!botId) {
      setFormError("请选择已启用的飞书机器人");
      return;
    }
    if (!chatId.trim()) {
      setFormError("请输入群 ID");
      return;
    }
    if (openIds.length === 0) {
      setFormError("至少输入一个被提醒人的 Open ID");
      return;
    }
    if (!message.trim()) {
      setFormError("请输入提醒文案");
      return;
    }
    if (!Number.isInteger(parsedFrequency) || parsedFrequency < 1) {
      setFormError("提醒频率必须是大于等于 1 的整数分钟");
      return;
    }
    if (senderType === "user" && !userAccessTokenEnv.trim()) {
      setFormError("用户身份发送必须填写 user_access_token 环境变量名");
      return;
    }
    try {
      setFormError(null);
      await reminders.create({
        name: name.trim() || undefined,
        botId,
        chatId: chatId.trim(),
        targetOpenIds: openIds,
        message: message.trim(),
        frequencySeconds: parsedFrequency * 60,
        sender:
          senderType === "bot"
            ? { type: "bot" }
            : { type: "user", userAccessTokenEnv: userAccessTokenEnv.trim() },
        enabled: true,
      });
      setName("");
      setTargetOpenIds("");
      setMessage("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  }, [
    botId,
    chatId,
    frequencyMinutes,
    message,
    name,
    reminders,
    senderType,
    targetOpenIds,
    userAccessTokenEnv,
  ]);

  const handleEnabledChange = useCallback(
    (id: string, enabled: boolean) => {
      setFormError(null);
      void reminders.setEnabled(id, enabled).catch((error) => {
        setFormError(error instanceof Error ? error.message : String(error));
      });
    },
    [reminders],
  );
  const handleDelete = useCallback(
    (id: string) => {
      setFormError(null);
      void reminders.deleteReminder(id).catch((error) => {
        setFormError(error instanceof Error ? error.message : String(error));
      });
    },
    [reminders],
  );

  if (!supported) {
    return (
      <SettingsSection title="飞书定时提醒">
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>更新 Paseo daemon 后可管理飞书定时提醒。</Text>
          </View>
        </View>
      </SettingsSection>
    );
  }

  return (
    <>
      <SettingsSection title="创建飞书定时提醒">
        <View style={styles.formCard}>
          <Text style={settingsStyles.rowHint}>
            任一被提醒人在任务启动后向该群发送消息，即视为已回复并自动停止。提醒间隔最短 1
            分钟；也可以随时手动停止或删除。
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
          <Field label="群 ID" hint="例如 oc_xxx；机器人或授权用户必须已加入该群。">
            <FormTextInput value={chatId} onChangeText={setChatId} placeholder="oc_xxxxxxxxxx" />
          </Field>
          <Field
            label="被提醒人 Open ID"
            hint="支持多个 Open ID，使用逗号、空格或换行分隔；任一人回复即停止。"
          >
            <FormTextInput
              value={targetOpenIds}
              onChangeText={setTargetOpenIds}
              placeholder="ou_xxx, ou_yyy"
              multiline
              textInputStyle={styles.textarea}
            />
          </Field>
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
          {senderType === "user" ? (
            <Field
              label="user_access_token 环境变量"
              hint="仅保存环境变量名；Token 必须由 daemon 进程环境提供。"
            >
              <FormTextInput
                value={userAccessTokenEnv}
                onChangeText={setUserAccessTokenEnv}
                placeholder="LARK_USER_ACCESS_TOKEN"
              />
            </Field>
          ) : null}
          {formError || reminders.error ? (
            <Text style={settingsStyles.rowError}>{formError ?? reminders.error?.message}</Text>
          ) : null}
          <View style={styles.submitRow}>
            <Button
              variant="default"
              onPress={handleCreate}
              loading={reminders.isMutating}
              disabled={reminders.isMutating || enabledBots.length === 0}
            >
              创建并开启
            </Button>
          </View>
        </View>
      </SettingsSection>
      <SettingsSection title={`提醒任务（${reminders.reminders.length}）`}>
        <View style={settingsStyles.card}>
          {reminders.reminders.length > 0 ? (
            reminders.reminders.map((reminder, index) => (
              <View key={reminder.id} style={index === 0 ? undefined : settingsStyles.rowBorder}>
                <ReminderRow
                  reminder={reminder}
                  busy={reminders.isMutating}
                  onEnabledChange={handleEnabledChange}
                  onDelete={handleDelete}
                />
              </View>
            ))
          ) : (
            <View style={settingsStyles.row}>
              <Text style={settingsStyles.rowHint}>
                {reminders.isLoading ? "正在加载提醒任务…" : "暂无提醒任务。"}
              </Text>
            </View>
          )}
        </View>
      </SettingsSection>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
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
    gap: theme.spacing[4],
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
  },
  reminderContent: {
    flex: 1,
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
    fontSize: theme.fontSize.xs,
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
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  successText: {
    color: theme.colors.statusSuccess,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  rowActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[3],
  },
}));
