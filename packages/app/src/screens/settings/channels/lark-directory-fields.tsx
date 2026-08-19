import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { LarkDirectoryChat, LarkDirectoryUser } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { settingsStyles } from "@/styles/settings";
import {
  findLarkDirectoryChat,
  formatLarkChatId,
  formatLarkUserOpenId,
} from "./lark-directory-format";

function splitEmails(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,，;；]+/u)
        .map((entry) => entry.trim().toLocaleLowerCase())
        .filter(Boolean),
    ),
  );
}

interface LarkUserDirectoryFieldProps {
  label: string;
  hint?: string;
  appId: string;
  openIds: string[];
  users: readonly LarkDirectoryUser[];
  multiple?: boolean;
  disabled?: boolean;
  testID?: string;
  onChange: (openIds: string[]) => void;
  resolveUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
}

function LarkUserSelectionRow({
  openId,
  label,
  disabled,
  onRemove,
}: {
  openId: string;
  label: string;
  disabled: boolean;
  onRemove: (openId: string) => void;
}) {
  const handleRemove = useCallback(() => onRemove(openId), [onRemove, openId]);
  return (
    <View style={styles.selectionRow}>
      <Text style={styles.selectionText} selectable>
        {label}
      </Text>
      <Button size="sm" variant="ghost" onPress={handleRemove} disabled={disabled}>
        移除
      </Button>
    </View>
  );
}

export function LarkUserDirectoryField({
  label,
  hint,
  appId,
  openIds,
  users,
  multiple = false,
  disabled = false,
  testID,
  onChange,
  resolveUsers,
}: LarkUserDirectoryFieldProps) {
  const [emailInput, setEmailInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const handleResolve = useCallback(async () => {
    const emails = splitEmails(emailInput);
    if (!appId.trim()) {
      setError("请先填写并保存飞书机器人的 App ID 和 App Secret");
      return;
    }
    if (emails.length === 0) {
      setError("请输入用户邮箱");
      return;
    }
    if (!multiple && emails.length > 1) {
      setError("这里只能选择一个用户");
      return;
    }
    setResolving(true);
    setError(null);
    try {
      const resolved = await resolveUsers(appId.trim(), emails);
      const nextOpenIds = multiple
        ? Array.from(new Set([...openIds, ...resolved.map((user) => user.openId)]))
        : resolved.slice(0, 1).map((user) => user.openId);
      onChange(nextOpenIds);
      setEmailInput("");
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : String(resolveError));
    } finally {
      setResolving(false);
    }
  }, [appId, emailInput, multiple, onChange, openIds, resolveUsers]);

  const removeOpenId = useCallback(
    (openId: string) => {
      onChange(openIds.filter((value) => value !== openId));
    },
    [onChange, openIds],
  );

  return (
    <Field label={label} hint={hint} testID={testID}>
      <View style={styles.lookupRow}>
        <FormTextInput
          value={emailInput}
          onChangeText={setEmailInput}
          placeholder={multiple ? "user1@example.com, user2@example.com" : "user@example.com"}
          editable={!disabled && !resolving}
          style={styles.lookupInput}
          onSubmitEditing={handleResolve}
        />
        <Button
          size="sm"
          variant="outline"
          onPress={handleResolve}
          loading={resolving}
          disabled={disabled || resolving}
        >
          通过邮箱查询
        </Button>
      </View>
      {openIds.length > 0 ? (
        <View style={styles.selectionList}>
          {openIds.map((openId) => (
            <LarkUserSelectionRow
              key={openId}
              openId={openId}
              label={formatLarkUserOpenId(users, appId, openId)}
              disabled={disabled}
              onRemove={removeOpenId}
            />
          ))}
        </View>
      ) : (
        <Text style={settingsStyles.rowHint}>尚未选择用户。</Text>
      )}
      {error ? <Text style={settingsStyles.rowError}>{error}</Text> : null}
    </Field>
  );
}

interface LarkChatDirectoryFieldProps {
  label: string;
  hint?: string;
  appId: string;
  chatId: string;
  chats: readonly LarkDirectoryChat[];
  disabled?: boolean;
  testID?: string;
  onChange: (chatId: string) => void;
  resolveChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
}

export function LarkChatDirectoryField({
  label,
  hint,
  appId,
  chatId,
  chats,
  disabled = false,
  testID,
  onChange,
  resolveChats,
}: LarkChatDirectoryFieldProps) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<LarkDirectoryChat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const selected = findLarkDirectoryChat(chats, appId, chatId);
  const options = useMemo<SelectFieldOption<string>[]>(
    () =>
      matches.map((chat) => ({
        id: `${chat.appId}:${chat.chatId}`,
        value: chat.chatId,
        label: chat.name,
        description: `${chat.groupId}，${chat.chatId}`,
      })),
    [matches],
  );
  const selectedDisplay = useMemo<SelectFieldDisplay | null>(() => {
    const match = matches.find((chat) => chat.chatId === chatId) ?? selected;
    return match
      ? {
          label: match.name,
          description: `${match.groupId}，${match.chatId}`,
        }
      : null;
  }, [chatId, matches, selected]);

  const handleResolve = useCallback(async () => {
    if (!appId.trim()) {
      setError("请先选择已配置 App ID 和 App Secret 的飞书机器人");
      return;
    }
    if (!query.trim()) {
      setError("请输入群名称、群 ID 或 chatId");
      return;
    }
    setResolving(true);
    setError(null);
    try {
      const resolved = await resolveChats(appId.trim(), query.trim());
      setMatches(resolved);
      if (resolved.length === 1) {
        onChange(resolved[0]!.chatId);
        setQuery("");
      }
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : String(resolveError));
      setMatches([]);
    } finally {
      setResolving(false);
    }
  }, [appId, onChange, query, resolveChats]);
  const handleClear = useCallback(() => onChange(""), [onChange]);

  return (
    <Field label={label} hint={hint} testID={testID}>
      <View style={styles.lookupRow}>
        <FormTextInput
          value={query}
          onChangeText={setQuery}
          placeholder="输入群名称、群 ID 或 oc_xxx"
          editable={!disabled && !resolving}
          style={styles.lookupInput}
          onSubmitEditing={handleResolve}
        />
        <Button
          size="sm"
          variant="outline"
          onPress={handleResolve}
          loading={resolving}
          disabled={disabled || resolving}
        >
          查询群聊
        </Button>
      </View>
      {options.length > 1 ? (
        <SelectField
          label="选择匹配的群聊"
          value={chatId || null}
          selectedDisplay={selectedDisplay}
          options={options}
          onChange={onChange}
          placeholder="请选择群聊"
          emptyText="未找到可见群聊"
          disabled={disabled}
          searchable
        />
      ) : null}
      {chatId ? (
        <View style={styles.selectionRow}>
          <Text style={styles.selectionText} selectable>
            {formatLarkChatId(chats, appId, chatId)}
          </Text>
          <Button size="sm" variant="ghost" onPress={handleClear} disabled={disabled}>
            移除
          </Button>
        </View>
      ) : (
        <Text style={settingsStyles.rowHint}>尚未选择群聊。</Text>
      )}
      {error ? <Text style={settingsStyles.rowError}>{error}</Text> : null}
    </Field>
  );
}

const styles = StyleSheet.create((theme) => ({
  lookupRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  lookupInput: {
    flex: 1,
    minWidth: 0,
  },
  selectionList: {
    gap: theme.spacing[1],
  },
  selectionRow: {
    alignItems: "center",
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    gap: theme.spacing[2],
    justifyContent: "space-between",
    minWidth: 0,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  selectionText: {
    color: theme.colors.foreground,
    flex: 1,
    flexShrink: 1,
    fontSize: theme.fontSize.sm,
  },
}));
