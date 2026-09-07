import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { LarkDirectoryUser } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  needsLarkContactResolution,
  normalizeLarkContactOpenId,
} from "./lark-contact-directory-model";
import { LarkContactFirstMessageCleanup } from "./lark-contact-first-message-cleanup";

export interface LarkContactDirectoryWriteInput {
  appId: string;
  openId: string;
  displayName: string | null;
  email: string | null;
}

export function formatLarkContactFirstMessageTime(value: string | null | undefined): string {
  if (!value) return "暂无";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function getLarkContactTitle(user: LarkDirectoryUser): string {
  return user.displayName?.trim() || "未补充用户名";
}

function getLarkContactDescription(user: LarkDirectoryUser): string {
  return `${user.email?.trim() || "未补充邮箱"} · ${user.openId}`;
}

export function LarkContactCreateForm({
  appId,
  connected,
  onCreate,
}: {
  appId: string | null;
  connected: boolean;
  onCreate: (input: LarkContactDirectoryWriteInput) => Promise<LarkDirectoryUser>;
}) {
  const [openId, setOpenId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!appId) {
      setError("请先选择已配置 App ID 的飞书机器人");
      return;
    }
    let normalizedOpenId: string;
    try {
      normalizedOpenId = normalizeLarkContactOpenId(openId);
    } catch (validationError) {
      setError(
        validationError instanceof Error ? validationError.message : String(validationError),
      );
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await onCreate({
        appId,
        openId: normalizedOpenId,
        displayName: displayName.trim() || null,
        email: email.trim() || null,
      });
      setOpenId("");
      setDisplayName("");
      setEmail("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setCreating(false);
    }
  }, [appId, displayName, email, onCreate, openId]);

  return (
    <Field
      label="创建联系人"
      hint="手动创建当前机器人下的本地联系人；ou_id 必填，用户名和邮箱可稍后编辑。"
      error={error}
    >
      <View style={styles.createFields}>
        <FormTextInput
          value={openId}
          onChangeText={setOpenId}
          placeholder="ou_id（必填）"
          autoCapitalize="none"
          testID="host-page-lark-contact-create-open-id"
        />
        <FormTextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="用户名（选填）"
          testID="host-page-lark-contact-create-name"
        />
        <FormTextInput
          value={email}
          onChangeText={setEmail}
          placeholder="邮箱（选填）"
          keyboardType="email-address"
          autoCapitalize="none"
          testID="host-page-lark-contact-create-email"
        />
        <Button
          variant="outline"
          onPress={handleCreate}
          loading={creating}
          disabled={!connected || creating || !appId || !openId.trim()}
          testID="host-page-lark-contact-create"
        >
          创建联系人
        </Button>
      </View>
    </Field>
  );
}

function ContactSelection({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  const accessibilityState = useMemo(() => ({ checked: selected }), [selected]);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={accessibilityState}
      onPress={onPress}
      style={[styles.checkbox, selected && styles.checkboxSelected]}
    >
      {selected ? <Text style={styles.checkmark}>✓</Text> : null}
    </Pressable>
  );
}

function ContactRow({
  user,
  isFirst,
  connected,
  selected,
  onToggleSelected,
  onEdit,
  onResolve,
}: {
  user: LarkDirectoryUser;
  isFirst: boolean;
  connected: boolean;
  selected: boolean;
  onToggleSelected: (openId: string) => void;
  onEdit: (user: LarkDirectoryUser) => void;
  onResolve?: (appId: string, openId: string) => Promise<LarkDirectoryUser>;
}) {
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const handleEdit = useCallback(() => onEdit(user), [onEdit, user]);
  const handleToggleSelected = useCallback(
    () => onToggleSelected(user.openId),
    [onToggleSelected, user.openId],
  );
  const handleResolve = useCallback(async () => {
    if (!onResolve) return;
    setResolving(true);
    setResolveError(null);
    try {
      await onResolve(user.appId, user.openId);
    } catch (error) {
      setResolveError(error instanceof Error ? error.message : String(error));
    } finally {
      setResolving(false);
    }
  }, [onResolve, user.appId, user.openId]);

  return (
    <View style={isFirst ? settingsStyles.row : [settingsStyles.row, settingsStyles.rowBorder]}>
      <ContactSelection
        selected={selected}
        label={`选择联系人 ${getLarkContactTitle(user)}`}
        onPress={handleToggleSelected}
      />
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{getLarkContactTitle(user)}</Text>
        <Text style={settingsStyles.rowHint}>{getLarkContactDescription(user)}</Text>
        <Text style={styles.messageText}>
          第一条消息：{user.firstMessageContent?.trim() || "暂无消息内容"}
        </Text>
        <Text style={settingsStyles.rowHint}>
          第一条消息时间：{formatLarkContactFirstMessageTime(user.firstMessageAt)}
        </Text>
        {resolveError ? <Text style={settingsStyles.rowError}>{resolveError}</Text> : null}
      </View>
      <View style={styles.rowActions}>
        {onResolve && needsLarkContactResolution(user) ? (
          <Button
            size="sm"
            variant="outline"
            onPress={handleResolve}
            loading={resolving}
            disabled={!connected || resolving}
            testID={`host-page-lark-contact-resolve-${user.openId}`}
          >
            自动获取
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onPress={handleEdit}
          testID={`host-page-lark-contact-edit-${user.openId}`}
        >
          编辑
        </Button>
      </View>
    </View>
  );
}

export function LarkContactDirectoryList({
  appId,
  contacts,
  contactsWithFirstMessageCount,
  connected,
  supportsOpenIdLookup,
  supportsClearFirstMessages,
  onEdit,
  onResolve,
  onDeleteMany,
  onClearFirstMessages,
}: {
  appId: string | null;
  contacts: LarkDirectoryUser[];
  contactsWithFirstMessageCount: number;
  connected: boolean;
  supportsOpenIdLookup: boolean;
  supportsClearFirstMessages: boolean;
  onEdit: (user: LarkDirectoryUser) => void;
  onResolve: (appId: string, openId: string) => Promise<LarkDirectoryUser>;
  onDeleteMany: (appId: string, openIds: string[]) => Promise<string[]>;
  onClearFirstMessages: (appId: string) => Promise<number>;
}) {
  const [selectedOpenIds, setSelectedOpenIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const visibleOpenIds = useMemo(() => contacts.map((user) => user.openId), [contacts]);
  const allVisibleSelected =
    visibleOpenIds.length > 0 &&
    visibleOpenIds.every((candidate) => selectedOpenIds.has(candidate));
  const selectAllAccessibilityState = useMemo(
    () => ({ checked: allVisibleSelected }),
    [allVisibleSelected],
  );

  useEffect(() => {
    const existingOpenIds = new Set(contacts.map((user) => user.openId));
    setSelectedOpenIds(
      (current) => new Set([...current].filter((candidate) => existingOpenIds.has(candidate))),
    );
  }, [contacts]);
  useEffect(() => {
    setSelectedOpenIds(new Set());
    setDeleteError(null);
  }, [appId]);

  const handleToggleSelected = useCallback((candidate: string) => {
    setSelectedOpenIds((current) => {
      const next = new Set(current);
      if (next.has(candidate)) next.delete(candidate);
      else next.add(candidate);
      return next;
    });
  }, []);
  const handleToggleAllVisible = useCallback(() => {
    setSelectedOpenIds((current) => {
      const next = new Set(current);
      if (visibleOpenIds.every((candidate) => next.has(candidate))) {
        for (const candidate of visibleOpenIds) next.delete(candidate);
      } else {
        for (const candidate of visibleOpenIds) next.add(candidate);
      }
      return next;
    });
  }, [visibleOpenIds]);
  const handleDeleteSelected = useCallback(async () => {
    const openIds = [...selectedOpenIds];
    if (!appId || openIds.length === 0) return;
    const confirmed = await confirmDialog({
      title: `删除 ${openIds.length} 个联系人？`,
      message: "将从当前飞书机器人的本地通讯录中删除所选联系人。此操作无法撤销。",
      confirmLabel: "删除",
      cancelLabel: "取消",
      destructive: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const deletedOpenIds = await onDeleteMany(appId, openIds);
      setSelectedOpenIds((current) => {
        const next = new Set(current);
        for (const candidate of deletedOpenIds) next.delete(candidate);
        return next;
      });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
    }
  }, [appId, onDeleteMany, selectedOpenIds]);

  return (
    <SettingsSection title={`联系人（${contacts.length}）`}>
      <View style={settingsStyles.card}>
        <LarkContactFirstMessageCleanup
          supported={supportsClearFirstMessages}
          appId={appId}
          contactCount={contactsWithFirstMessageCount}
          connected={connected}
          onClear={onClearFirstMessages}
        />
        {contacts.length > 0 ? (
          <>
            <View style={styles.selectionToolbar}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel="全选当前联系人"
                accessibilityState={selectAllAccessibilityState}
                onPress={handleToggleAllVisible}
                style={styles.selectAll}
                testID="host-page-lark-contacts-select-all"
              >
                <View style={[styles.checkbox, allVisibleSelected && styles.checkboxSelected]}>
                  {allVisibleSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <Text style={settingsStyles.rowHint}>
                  {allVisibleSelected ? "取消全选" : "全选当前结果"}
                </Text>
              </Pressable>
              <Button
                size="sm"
                variant="destructive"
                onPress={handleDeleteSelected}
                loading={deleting}
                disabled={!connected || deleting || selectedOpenIds.size === 0}
                testID="host-page-lark-contacts-delete-selected"
              >
                批量删除（{selectedOpenIds.size}）
              </Button>
            </View>
            {deleteError ? <Text style={settingsStyles.rowError}>{deleteError}</Text> : null}
            {contacts.map((user, index) => (
              <ContactRow
                key={`${user.appId}:${user.openId}`}
                user={user}
                isFirst={index === 0}
                connected={connected}
                selected={selectedOpenIds.has(user.openId)}
                onToggleSelected={handleToggleSelected}
                onEdit={onEdit}
                onResolve={supportsOpenIdLookup ? onResolve : undefined}
              />
            ))}
          </>
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
  );
}

const styles = StyleSheet.create((theme) => ({
  createFields: {
    gap: theme.spacing[2],
  },
  selectionToolbar: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    justifyContent: "space-between",
    padding: theme.spacing[4],
  },
  selectAll: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  checkbox: {
    alignItems: "center",
    borderColor: theme.colors.foregroundExtraMuted,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  checkboxSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkmark: {
    color: theme.colors.primaryForeground,
    fontSize: theme.fontSize.sm,
  },
  messageText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[2],
  },
  rowActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
  },
}));
