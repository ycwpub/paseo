import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  LarkChannelBotStatus,
  LarkDirectory,
  LarkDirectoryUser,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";

export interface LarkContactDirectoryUpdateInput {
  appId: string;
  openId: string;
  displayName: string | null;
  email: string | null;
}

function getBotName(bot: LarkChannelBotStatus): string {
  return bot.bot?.name || bot.name || bot.appId || "未命名飞书机器人";
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function matchesLarkContactSearch(user: LarkDirectoryUser, query: string): boolean {
  const normalized = normalizeSearchText(query);
  if (!normalized) return true;
  return [user.displayName, user.email, user.openId, user.firstMessageContent]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase().includes(normalized));
}

function formatFirstMessageTime(value: string | null | undefined): string {
  if (!value) return "暂无";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function contactTitle(user: LarkDirectoryUser): string {
  return user.displayName?.trim() || "未补充用户名";
}

function contactDescription(user: LarkDirectoryUser): string {
  return `${user.email?.trim() || "未补充邮箱"} · ${user.openId}`;
}

export function LarkContactDirectoryEntry({
  bots,
  directory,
  onOpen,
}: {
  bots: LarkChannelBotStatus[];
  directory: LarkDirectory | null;
  onOpen: () => void;
}) {
  const configuredAppIds = useMemo(
    () => new Set(bots.map((bot) => bot.appId).filter((appId): appId is string => Boolean(appId))),
    [bots],
  );
  const count = directory?.users.filter((user) => configuredAppIds.has(user.appId)).length ?? 0;

  return (
    <SettingsSection title="通讯录">
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>飞书联系人（{count}）</Text>
            <Text style={settingsStyles.rowHint}>
              汇总机器人通过私聊、替身模式、定时提醒等渠道获取的联系人信息。
            </Text>
          </View>
          <Button
            size="sm"
            variant="outline"
            onPress={onOpen}
            disabled={bots.length === 0}
            testID="host-page-lark-contacts-open"
          >
            管理
          </Button>
        </View>
      </View>
    </SettingsSection>
  );
}

function ContactRow({
  user,
  isFirst,
  onEdit,
}: {
  user: LarkDirectoryUser;
  isFirst: boolean;
  onEdit: (user: LarkDirectoryUser) => void;
}) {
  const handleEdit = useCallback(() => onEdit(user), [onEdit, user]);
  return (
    <View style={isFirst ? settingsStyles.row : [settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{contactTitle(user)}</Text>
        <Text style={settingsStyles.rowHint}>{contactDescription(user)}</Text>
        <Text style={styles.messageText}>
          第一条消息：{user.firstMessageContent?.trim() || "暂无消息内容"}
        </Text>
        <Text style={settingsStyles.rowHint}>
          第一条消息时间：{formatFirstMessageTime(user.firstMessageAt)}
        </Text>
      </View>
      <Button
        size="sm"
        variant="outline"
        onPress={handleEdit}
        testID={`host-page-lark-contact-edit-${user.openId}`}
      >
        编辑
      </Button>
    </View>
  );
}

export function LarkContactDirectoryPage({
  bots,
  directory,
  selectedBotId,
  onSelectBot,
  onEdit,
}: {
  bots: LarkChannelBotStatus[];
  directory: LarkDirectory | null;
  selectedBotId: string | null;
  onSelectBot: (botId: string) => void;
  onEdit: (user: LarkDirectoryUser) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const selectedBot = useMemo(
    () => bots.find((bot) => bot.id === selectedBotId) ?? bots[0] ?? null,
    [bots, selectedBotId],
  );
  const botOptions = useMemo<SelectFieldOption<string>[]>(
    () =>
      bots.map((bot) => ({
        id: bot.id,
        value: bot.id,
        label: getBotName(bot),
        description: bot.appId ?? "未配置 App ID",
      })),
    [bots],
  );
  const selectedBotDisplay = useMemo<SelectFieldDisplay | null>(
    () =>
      selectedBot
        ? {
            label: getBotName(selectedBot),
            description: selectedBot.appId ?? "未配置 App ID",
          }
        : null,
    [selectedBot],
  );
  const contacts = useMemo(() => {
    const appId = selectedBot?.appId;
    if (!appId) return [];
    return (directory?.users ?? [])
      .filter((user) => user.appId === appId && matchesLarkContactSearch(user, searchQuery))
      .sort((left, right) => {
        const leftTime = left.firstMessageAt ? Date.parse(left.firstMessageAt) : 0;
        const rightTime = right.firstMessageAt ? Date.parse(right.firstMessageAt) : 0;
        return rightTime - leftTime || contactTitle(left).localeCompare(contactTitle(right));
      });
  }, [directory?.users, searchQuery, selectedBot?.appId]);

  return (
    <View testID="host-page-lark-contacts">
      <SettingsSection title="当前飞书机器人">
        <View style={styles.formCard}>
          <SelectField
            label="飞书机器人"
            value={selectedBot?.id ?? null}
            selectedDisplay={selectedBotDisplay}
            options={botOptions}
            onChange={onSelectBot}
            placeholder="选择飞书机器人"
            emptyText="暂无已配置的飞书机器人"
            testID="host-page-lark-contacts-bot"
          />
          <Field label="搜索">
            <FormTextInput
              initialValue={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="搜索用户名、邮箱、ou_id 或第一条消息"
              testID="host-page-lark-contacts-search"
            />
          </Field>
        </View>
      </SettingsSection>
      <SettingsSection title={`联系人（${contacts.length}）`}>
        <View style={settingsStyles.card}>
          {contacts.length > 0 ? (
            contacts.map((user, index) => (
              <ContactRow
                key={`${user.appId}:${user.openId}`}
                user={user}
                isFirst={index === 0}
                onEdit={onEdit}
              />
            ))
          ) : (
            <View style={settingsStyles.row}>
              <View style={settingsStyles.rowContent}>
                <Text style={settingsStyles.rowTitle}>暂无联系人</Text>
                <Text style={settingsStyles.rowHint}>
                  收到私聊、替身模式相关消息，或在提醒中解析到用户后，会自动出现在这里。
                </Text>
              </View>
            </View>
          )}
        </View>
      </SettingsSection>
    </View>
  );
}

export function LarkContactEditorPage({
  user,
  connected,
  onSave,
}: {
  user: LarkDirectoryUser | null;
  connected: boolean;
  onSave: (input: LarkContactDirectoryUpdateInput) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        appId: user.appId,
        openId: user.openId,
        displayName: displayName.trim() || null,
        email: email.trim() || null,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }, [displayName, email, onSave, user]);

  if (!user) {
    return (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowHint}>联系人不存在或已被移除。</Text>
        </View>
      </View>
    );
  }

  return (
    <View testID="host-page-lark-contact-edit">
      <SettingsSection title="联系人身份">
        <View style={styles.formCard}>
          <Field label="ou_id">
            <FormTextInput
              initialValue={user.openId}
              editable={false}
              testID="host-page-lark-contact-open-id"
            />
          </Field>
          <Field label="用户名" hint="可根据第一条消息内容和时间在线下确认后手动补充。">
            <FormTextInput
              initialValue={displayName}
              onChangeText={setDisplayName}
              placeholder="输入用户名"
              testID="host-page-lark-contact-name"
            />
          </Field>
          <Field label="邮箱">
            <FormTextInput
              initialValue={email}
              onChangeText={setEmail}
              placeholder="输入用户邮箱"
              keyboardType="email-address"
              autoCapitalize="none"
              testID="host-page-lark-contact-email"
            />
          </Field>
          {error ? <Text style={settingsStyles.rowError}>{error}</Text> : null}
          <Button
            variant="default"
            onPress={handleSave}
            loading={saving}
            disabled={!connected || saving}
            testID="host-page-lark-contact-save"
          >
            保存联系人
          </Button>
        </View>
      </SettingsSection>
      <SettingsSection title="首次消息">
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>消息内容</Text>
              <Text style={styles.messageText}>
                {user.firstMessageContent?.trim() || "暂无消息内容"}
              </Text>
              <Text style={settingsStyles.rowHint}>
                消息时间：{formatFirstMessageTime(user.firstMessageAt)}
              </Text>
            </View>
          </View>
        </View>
      </SettingsSection>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  formCard: {
    gap: theme.spacing[4],
  },
  messageText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[2],
  },
}));
