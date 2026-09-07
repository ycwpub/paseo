import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  LarkChannelBotStatus,
  LarkDirectory,
  LarkDirectoryPrivateUserScanRange,
  LarkDirectoryRecentPrivateUser,
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
import {
  isLarkContactEmailQuery,
  normalizeLarkContactIdentityQuery,
  normalizeLarkContactOpenId,
} from "./lark-contact-directory-model";
import {
  formatLarkContactFirstMessageTime,
  getLarkContactTitle,
  LarkContactCreateForm,
  LarkContactDirectoryList,
  type LarkContactDirectoryWriteInput,
} from "./lark-contact-directory-management";
import { OptionalLarkContactPrivateUserScan } from "./lark-contact-private-user-scan";

export type LarkContactDirectoryUpdateInput = LarkContactDirectoryWriteInput;

function getBotName(bot: LarkChannelBotStatus): string {
  return bot.bot?.name || bot.name || bot.appId || "未命名飞书机器人";
}

function getBotAppId(bot: LarkChannelBotStatus | null): string | null {
  return bot?.appId ?? null;
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

function countContactsWithFirstMessage(users: readonly LarkDirectoryUser[]): number {
  return users.filter((user) => user.firstMessageContent != null).length;
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

function IdentityLookupResultRow({
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
        <Text style={settingsStyles.rowTitle}>{getLarkContactTitle(user)}</Text>
        <Text style={settingsStyles.rowHint}>邮箱：{user.email?.trim() || "未补充"}</Text>
        <Text selectable style={settingsStyles.rowHint}>
          ou_id：{user.openId}
        </Text>
      </View>
      <Button
        size="sm"
        variant="outline"
        onPress={handleEdit}
        testID={`host-page-lark-contact-identity-edit-${user.openId}`}
      >
        编辑
      </Button>
    </View>
  );
}

function IdentityLookupResults({
  users,
  onEdit,
}: {
  users: LarkDirectoryUser[];
  onEdit: (user: LarkDirectoryUser) => void;
}) {
  if (users.length === 0) return null;

  return (
    <View style={styles.identityResults} testID="host-page-lark-contact-identity-results">
      <Text style={settingsStyles.rowTitle}>查询结果（{users.length}）</Text>
      <View style={settingsStyles.card}>
        {users.map((user, index) => (
          <IdentityLookupResultRow
            key={`${user.appId}:${user.openId}`}
            user={user}
            isFirst={index === 0}
            onEdit={onEdit}
          />
        ))}
      </View>
    </View>
  );
}

export function LarkContactDirectoryPage({
  bots,
  directory,
  selectedBotId,
  connected,
  supportsOpenIdLookup,
  supportsPrivateUserScan,
  supportsClearFirstMessages,
  onSelectBot,
  onEdit,
  onResolve,
  onResolveUsers,
  onCreate,
  onDeleteMany,
  onScanPrivateUsers,
  onAddPrivateUser,
  onClearFirstMessages,
}: {
  bots: LarkChannelBotStatus[];
  directory: LarkDirectory | null;
  selectedBotId: string | null;
  connected: boolean;
  supportsOpenIdLookup: boolean;
  supportsPrivateUserScan: boolean;
  supportsClearFirstMessages: boolean;
  onSelectBot: (botId: string) => void;
  onEdit: (user: LarkDirectoryUser) => void;
  onResolve: (appId: string, openId: string) => Promise<LarkDirectoryUser>;
  onResolveUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  onCreate: (input: LarkContactDirectoryUpdateInput) => Promise<LarkDirectoryUser>;
  onDeleteMany: (appId: string, openIds: string[]) => Promise<string[]>;
  onScanPrivateUsers: (
    appId: string,
    range: LarkDirectoryPrivateUserScanRange,
  ) => Promise<LarkDirectoryRecentPrivateUser[]>;
  onAddPrivateUser: (user: LarkDirectoryRecentPrivateUser) => Promise<LarkDirectoryUser>;
  onClearFirstMessages: (appId: string) => Promise<number>;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [identityQuery, setIdentityQuery] = useState("");
  const [identityResults, setIdentityResults] = useState<LarkDirectoryUser[]>([]);
  const [identitySearching, setIdentitySearching] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [openId, setOpenId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addNotice, setAddNotice] = useState<string | null>(null);
  const selectedBot = useMemo(
    () => bots.find((bot) => bot.id === selectedBotId) ?? bots[0] ?? null,
    [bots, selectedBotId],
  );
  const selectedBotAppId = getBotAppId(selectedBot);
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
  const selectedBotContacts = useMemo(() => {
    const appId = selectedBot?.appId;
    if (!appId) return [];
    const merged = new Map<string, LarkDirectoryUser>();
    for (const user of [...(directory?.users ?? []), ...identityResults]) {
      if (user.appId === appId) merged.set(user.openId, user);
    }
    return [...merged.values()];
  }, [directory?.users, identityResults, selectedBot?.appId]);
  const contacts = useMemo(
    () =>
      selectedBotContacts
        .filter((user) => matchesLarkContactSearch(user, searchQuery))
        .sort((left, right) => {
          const leftTime = left.firstMessageAt ? Date.parse(left.firstMessageAt) : 0;
          const rightTime = right.firstMessageAt ? Date.parse(right.firstMessageAt) : 0;
          return (
            rightTime - leftTime ||
            getLarkContactTitle(left).localeCompare(getLarkContactTitle(right))
          );
        }),
    [searchQuery, selectedBotContacts],
  );
  const contactsWithFirstMessageCount = useMemo(
    () => countContactsWithFirstMessage(selectedBotContacts),
    [selectedBotContacts],
  );
  const visibleIdentityResults = useMemo(() => {
    const appId = selectedBot?.appId;
    if (!appId) return [];
    return identityResults.filter((user) => user.appId === appId);
  }, [identityResults, selectedBot?.appId]);
  const handleIdentityQueryChange = useCallback((value: string) => {
    setIdentityQuery(value);
    setIdentityResults([]);
    setIdentityError(null);
  }, []);
  const handleSearchIdentity = useCallback(async () => {
    const appId = selectedBot?.appId?.trim();
    let query: string;
    if (!appId) {
      setIdentityError("请先选择已配置 App ID 的飞书机器人");
      return;
    }
    try {
      query = normalizeLarkContactIdentityQuery(identityQuery);
    } catch (error) {
      setIdentityError(error instanceof Error ? error.message : String(error));
      return;
    }
    const localMatches = selectedBotContacts.filter((user) => {
      const normalized = normalizeSearchText(query);
      return [user.displayName, user.email]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(normalized));
    });
    if (localMatches.length > 0) {
      setIdentityResults(localMatches);
      setIdentityError(null);
      return;
    }
    if (!isLarkContactEmailQuery(query)) {
      setIdentityResults([]);
      setIdentityError("当前通讯录未找到该用户名；可改用用户邮箱向飞书精确查询");
      return;
    }
    setIdentitySearching(true);
    setIdentityError(null);
    try {
      const resolved = await onResolveUsers(appId, [query]);
      setIdentityResults(resolved);
      if (resolved.length === 0) {
        setIdentityError("未找到对应的飞书用户");
      }
    } catch (error) {
      setIdentityResults([]);
      setIdentityError(error instanceof Error ? error.message : String(error));
    } finally {
      setIdentitySearching(false);
    }
  }, [identityQuery, onResolveUsers, selectedBot?.appId, selectedBotContacts]);
  const handleAddByOpenId = useCallback(async () => {
    const appId = selectedBot?.appId?.trim();
    let normalizedOpenId: string;
    if (!appId) {
      setAddError("请先选择已配置 App ID 的飞书机器人");
      return;
    }
    try {
      normalizedOpenId = normalizeLarkContactOpenId(openId);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : String(error));
      return;
    }
    setAdding(true);
    setAddError(null);
    setAddNotice(null);
    try {
      const resolved = await onResolve(appId, normalizedOpenId);
      setOpenId("");
      if (!resolved.email?.trim()) {
        setAddNotice(
          `已添加联系人${resolved.displayName ? `“${resolved.displayName}”` : ""}（${resolved.openId}），但当前机器人无法读取邮箱字段。请检查 contact:user.email:readonly 权限和应用通讯录范围。`,
        );
      }
    } catch (error) {
      setAddError(error instanceof Error ? error.message : String(error));
    } finally {
      setAdding(false);
    }
  }, [onResolve, openId, selectedBot?.appId]);
  const handleDeleteMany = useCallback(
    async (appId: string, openIds: string[]) => {
      const deletedOpenIds = await onDeleteMany(appId, openIds);
      const deleted = new Set(deletedOpenIds);
      setIdentityResults((current) =>
        current.filter((user) => user.appId !== appId || !deleted.has(user.openId)),
      );
      return deletedOpenIds;
    },
    [onDeleteMany],
  );
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
          <LarkContactCreateForm
            appId={selectedBotAppId}
            connected={connected}
            onCreate={onCreate}
          />
          {supportsOpenIdLookup ? (
            <Field
              label="按 ou_id 添加联系人"
              hint="查询飞书用户名和邮箱，并将联系人添加到当前机器人的通讯录。"
              error={addError}
            >
              <View style={styles.lookupRow}>
                <View style={styles.lookupInput}>
                  <FormTextInput
                    value={openId}
                    onChangeText={setOpenId}
                    placeholder="输入 ou_xxx"
                    autoCapitalize="none"
                    testID="host-page-lark-contact-add-open-id"
                  />
                </View>
                <Button
                  variant="outline"
                  onPress={handleAddByOpenId}
                  loading={adding}
                  disabled={!connected || adding || !selectedBot?.appId || !openId.trim()}
                  testID="host-page-lark-contact-add"
                >
                  获取并添加
                </Button>
              </View>
              {addNotice ? <Text style={settingsStyles.rowHint}>{addNotice}</Text> : null}
            </Field>
          ) : null}
          <Field
            label="按用户名或邮箱查询 ou_id"
            hint="优先搜索当前机器人的通讯录；邮箱无本地结果时会向飞书查询并添加联系人。"
            error={identityError}
          >
            <View style={styles.lookupRow}>
              <View style={styles.lookupInput}>
                <FormTextInput
                  value={identityQuery}
                  onChangeText={handleIdentityQueryChange}
                  placeholder="输入用户名或邮箱"
                  autoCapitalize="none"
                  onSubmitEditing={handleSearchIdentity}
                  testID="host-page-lark-contact-identity-query"
                />
              </View>
              <Button
                variant="outline"
                onPress={handleSearchIdentity}
                loading={identitySearching}
                disabled={identitySearching || !selectedBot?.appId || !identityQuery.trim()}
                testID="host-page-lark-contact-identity-search"
              >
                查询 ou_id
              </Button>
            </View>
          </Field>
          <IdentityLookupResults users={visibleIdentityResults} onEdit={onEdit} />
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
      <OptionalLarkContactPrivateUserScan
        supported={supportsPrivateUserScan}
        appId={selectedBot?.appId ?? null}
        connected={connected}
        onScan={onScanPrivateUsers}
        onAdd={onAddPrivateUser}
      />
      <LarkContactDirectoryList
        appId={selectedBotAppId}
        contacts={contacts}
        contactsWithFirstMessageCount={contactsWithFirstMessageCount}
        connected={connected}
        supportsOpenIdLookup={supportsOpenIdLookup}
        supportsClearFirstMessages={supportsClearFirstMessages}
        onEdit={onEdit}
        onResolve={onResolve}
        onDeleteMany={handleDeleteMany}
        onClearFirstMessages={onClearFirstMessages}
      />
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
                消息时间：{formatLarkContactFirstMessageTime(user.firstMessageAt)}
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
  lookupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  lookupInput: {
    flex: 1,
    minWidth: 0,
  },
  identityResults: {
    gap: theme.spacing[2],
  },
}));
