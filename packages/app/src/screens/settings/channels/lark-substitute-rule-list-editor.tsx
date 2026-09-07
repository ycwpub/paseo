import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  LarkDirectoryChat,
  LarkDirectoryUser,
  LarkSubstituteAudienceConversationRule,
  LarkSubstituteAudienceRuleGroup,
  LarkSubstituteAudienceUserRule,
  LarkSubstituteQuestionRule,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { settingsStyles } from "@/styles/settings";
import { LarkChatDirectoryField } from "./lark-directory-fields";
import { findLarkDirectoryChat, formatLarkUserIdentity } from "./lark-directory-format";
import { LarkUserDirectoryPicker } from "./lark-user-directory-picker";
import {
  createAudienceRuleGroup,
  createConversationRule,
  createQuestionRule,
  createUserRule,
  type LarkSubstituteConversationRuleType,
  type LarkSubstituteUserRuleType,
} from "./lark-substitute-rule-form-model";

const CONVERSATION_TYPE_OPTIONS: SelectFieldOption<LarkSubstituteConversationRuleType>[] = [
  { id: "group", value: "group", label: "群", description: "选择一个具体群" },
  {
    id: "group_ai_category",
    value: "group_ai_category",
    label: "群 AI 分类",
    description: "由 Agent 根据群名称和消息内容进行语义分类",
  },
  {
    id: "group_name_regex",
    value: "group_name_regex",
    label: "群名称正则表达式",
    description: "使用正则表达式匹配群名称",
  },
  { id: "private", value: "private", label: "私聊", description: "匹配授权用户收到的私聊" },
  {
    id: "bot",
    value: "bot",
    label: "机器人",
    description: "匹配由飞书机器人发送的消息",
  },
  {
    id: "all_groups",
    value: "all_groups",
    label: "全部群",
    description: "匹配机器人可访问的全部群聊",
  },
  {
    id: "all",
    value: "all",
    label: "全部（群+用户+机器人）",
    description: "匹配群、用户私聊和机器人消息",
  },
];

const USER_TYPE_OPTIONS: SelectFieldOption<LarkSubstituteUserRuleType>[] = [
  {
    id: "all_users",
    value: "all_users",
    label: "全部用户",
    description: "匹配会话范围内的全部发言用户",
  },
  {
    id: "user_name",
    value: "user_name",
    label: "用户名称",
    description: "按通讯录名称或消息发送者名称匹配",
  },
  {
    id: "user_email",
    value: "user_email",
    label: "用户邮箱",
    description: "按通讯录邮箱匹配",
  },
  {
    id: "bot_app_id",
    value: "bot_app_id",
    label: "机器人 app_id",
    description: "按发送机器人的 app_id 精确匹配",
  },
  {
    id: "all_bots",
    value: "all_bots",
    label: "全部机器人",
    description: "匹配全部机器人发送者",
  },
  {
    id: "all",
    value: "all",
    label: "全部（机器人+用户）",
    description: "匹配机器人和用户发送者",
  },
];

function optionDisplay<T extends string>(
  options: readonly SelectFieldOption<T>[],
  value: T,
): SelectFieldDisplay {
  const option = options.find((entry) => entry.value === value);
  return { label: option?.label ?? value, description: option?.description };
}

function replaceRule<T extends { id: string }>(rules: readonly T[], next: T): T[] {
  return rules.map((rule) => (rule.id === next.id ? next : rule));
}

function removeRule<T extends { id: string }>(rules: readonly T[], id: string): T[] {
  return rules.filter((rule) => rule.id !== id);
}

function GroupRuleFields({
  rule,
  appId,
  chats,
  disabled,
  resolveChats,
  onChange,
}: {
  rule: Extract<LarkSubstituteAudienceConversationRule, { type: "group" }>;
  appId: string;
  chats: readonly LarkDirectoryChat[];
  disabled: boolean;
  resolveChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
  onChange: (rule: LarkSubstituteAudienceConversationRule) => void;
}) {
  const handleChatChange = useCallback(
    (chatId: string) => {
      const chat = findLarkDirectoryChat(chats, appId, chatId);
      onChange({
        ...rule,
        chatId,
        groupId: chat?.groupId ?? null,
        name: chat?.name ?? null,
      });
    },
    [appId, chats, onChange, rule],
  );
  return (
    <LarkChatDirectoryField
      label="群"
      hint="通过群名称或 oc_xxx 搜索，并保存唯一 chatId"
      appId={appId}
      chatId={rule.chatId}
      chats={chats}
      resolveChats={resolveChats}
      onChange={handleChatChange}
      disabled={disabled}
    />
  );
}

function ConversationRuleRow({
  rule,
  appId,
  chats,
  disabled,
  resolveChats,
  onChange,
  onRemove,
}: {
  rule: LarkSubstituteAudienceConversationRule;
  appId: string;
  chats: readonly LarkDirectoryChat[];
  disabled: boolean;
  resolveChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
  onChange: (rule: LarkSubstituteAudienceConversationRule) => void;
  onRemove: () => void;
}) {
  const handleTypeChange = useCallback(
    (type: LarkSubstituteConversationRuleType) => {
      onChange({ ...createConversationRule(type), id: rule.id });
    },
    [onChange, rule.id],
  );
  const handleDescriptionChange = useCallback(
    (description: string) => {
      if (rule.type === "group_ai_category") onChange({ ...rule, description });
    },
    [onChange, rule],
  );
  const handlePatternChange = useCallback(
    (pattern: string) => {
      if (rule.type === "group_name_regex") onChange({ ...rule, pattern });
    },
    [onChange, rule],
  );
  return (
    <View style={styles.ruleRow}>
      <View style={styles.ruleContent}>
        <SelectField
          field={false}
          label="会话范围类型"
          value={rule.type}
          selectedDisplay={optionDisplay(CONVERSATION_TYPE_OPTIONS, rule.type)}
          options={CONVERSATION_TYPE_OPTIONS}
          onChange={handleTypeChange}
          placeholder="选择会话范围"
          emptyText="暂无会话范围类型"
          disabled={disabled}
        />
        {rule.type === "group" ? (
          <GroupRuleFields
            rule={rule}
            appId={appId}
            chats={chats}
            disabled={disabled}
            resolveChats={resolveChats}
            onChange={onChange}
          />
        ) : null}
        {rule.type === "group_ai_category" ? (
          <Field label="群 AI 分类" hint="Agent 会结合群名称和当前问题上下文进行语义分类">
            <FormTextInput
              value={rule.description}
              onChangeText={handleDescriptionChange}
              placeholder="例如：研发协作群、结算告警群"
              multiline
              editable={!disabled}
            />
          </Field>
        ) : null}
        {rule.type === "group_name_regex" ? (
          <Field label="群名称正则表达式">
            <FormTextInput
              value={rule.pattern}
              onChangeText={handlePatternChange}
              placeholder="例如：^研发.*群$"
              editable={!disabled}
            />
          </Field>
        ) : null}
      </View>
      <Button size="sm" variant="ghost" onPress={onRemove} disabled={disabled}>
        删除
      </Button>
    </View>
  );
}

function UserDirectoryFields({
  rule,
  appId,
  users,
  disabled,
  resolveUsers,
  onChange,
}: {
  rule: Extract<LarkSubstituteAudienceUserRule, { type: "user_name" | "user_email" }>;
  appId: string;
  users: readonly LarkDirectoryUser[];
  disabled: boolean;
  resolveUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  onChange: (rule: LarkSubstituteAudienceUserRule) => void;
}) {
  const [lookup, setLookup] = useState("");
  const [resolvedUsers, setResolvedUsers] = useState<LarkDirectoryUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const availableUsers = useMemo(() => {
    const merged = new Map<string, LarkDirectoryUser>();
    for (const user of [...users, ...resolvedUsers]) {
      if (user.appId === appId) merged.set(user.openId, user);
    }
    return [...merged.values()];
  }, [appId, resolvedUsers, users]);
  const selectedOpenId = rule.openId;
  const selectedDisplay = useMemo<SelectFieldDisplay | null>(() => {
    const selected = availableUsers.find((user) => user.openId === selectedOpenId);
    return selected
      ? { label: formatLarkUserIdentity(selected), description: selected.openId }
      : null;
  }, [availableUsers, selectedOpenId]);
  const selectUser = useCallback(
    (user: LarkDirectoryUser) => {
      if (rule.type === "user_name") {
        setError(null);
        onChange({
          ...rule,
          name: user.displayName || user.openId,
          openId: user.openId,
          email: user.email,
        });
        return;
      }
      if (!user.email) {
        setError("该联系人没有可用邮箱");
        return;
      }
      setError(null);
      onChange({
        ...rule,
        email: user.email,
        openId: user.openId,
        name: user.displayName,
      });
    },
    [onChange, rule],
  );
  const resolveUser = useCallback(async () => {
    const query = lookup.trim();
    if (!query) {
      setError("请输入用户名称、邮箱或 ou_xxx");
      return;
    }
    const normalized = query.toLocaleLowerCase();
    const localMatches = availableUsers.filter((user) =>
      [user.displayName, user.email, user.openId].some((value) =>
        value?.toLocaleLowerCase().includes(normalized),
      ),
    );
    if (localMatches.length > 0) {
      setResolvedUsers((current) => [...current, ...localMatches]);
      if (localMatches.length === 1) selectUser(localMatches[0]!);
      setError(null);
      return;
    }
    if (!query.includes("@")) {
      setError("本地通讯录未找到该用户；首次查询请使用邮箱");
      return;
    }
    setResolving(true);
    setError(null);
    try {
      const resolved = await resolveUsers(appId, [query]);
      setResolvedUsers((current) => [...current, ...resolved]);
      if (resolved[0]) {
        selectUser(resolved[0]);
        setLookup("");
      }
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : String(lookupError));
    } finally {
      setResolving(false);
    }
  }, [appId, availableUsers, lookup, resolveUsers, selectUser]);
  const changeIdentity = useCallback(
    (value: string) => {
      if (rule.type === "user_name") {
        onChange({ ...rule, name: value, openId: null, email: null });
      } else {
        onChange({ ...rule, email: value, openId: null, name: null });
      }
    },
    [onChange, rule],
  );

  return (
    <View style={styles.ruleFields}>
      <Field label={rule.type === "user_name" ? "用户名称" : "用户邮箱"}>
        <FormTextInput
          value={rule.type === "user_name" ? rule.name : rule.email}
          onChangeText={changeIdentity}
          placeholder={rule.type === "user_name" ? "输入用户名称" : "输入用户邮箱"}
          editable={!disabled}
        />
      </Field>
      <View style={styles.lookupRow}>
        <FormTextInput
          value={lookup}
          onChangeText={setLookup}
          placeholder="从通讯录搜索用户名、邮箱或 ou_xxx"
          editable={!disabled && !resolving}
          style={styles.lookupInput}
          onSubmitEditing={resolveUser}
        />
        <Button
          size="sm"
          variant="outline"
          onPress={resolveUser}
          loading={resolving}
          disabled={disabled || resolving || !appId}
        >
          搜索
        </Button>
      </View>
      <LarkUserDirectoryPicker
        appId={appId}
        users={availableUsers}
        selectedOpenId={selectedOpenId}
        selectedDisplay={selectedDisplay}
        onSelect={selectUser}
        label="从通讯录选择用户"
        placeholder="搜索通讯录中的用户名、邮箱或 ou_xxx"
        disabled={disabled}
        field={false}
      />
      {error ? <Text style={settingsStyles.rowError}>{error}</Text> : null}
    </View>
  );
}

function UserRuleRow({
  rule,
  appId,
  users,
  disabled,
  resolveUsers,
  onChange,
  onRemove,
}: {
  rule: LarkSubstituteAudienceUserRule;
  appId: string;
  users: readonly LarkDirectoryUser[];
  disabled: boolean;
  resolveUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  onChange: (rule: LarkSubstituteAudienceUserRule) => void;
  onRemove: () => void;
}) {
  const handleTypeChange = useCallback(
    (type: LarkSubstituteUserRuleType) => {
      onChange({ ...createUserRule(type), id: rule.id });
    },
    [onChange, rule.id],
  );
  const handleBotAppIdChange = useCallback(
    (nextAppId: string) => {
      if (rule.type === "bot_app_id") onChange({ ...rule, appId: nextAppId });
    },
    [onChange, rule],
  );
  return (
    <View style={styles.ruleRow}>
      <View style={styles.ruleContent}>
        <SelectField
          field={false}
          label="用户/机器人范围类型"
          value={rule.type}
          selectedDisplay={optionDisplay(USER_TYPE_OPTIONS, rule.type)}
          options={USER_TYPE_OPTIONS}
          onChange={handleTypeChange}
          placeholder="选择用户或机器人范围"
          emptyText="暂无用户或机器人范围类型"
          disabled={disabled}
        />
        {rule.type === "user_name" || rule.type === "user_email" ? (
          <UserDirectoryFields
            rule={rule}
            appId={appId}
            users={users}
            disabled={disabled}
            resolveUsers={resolveUsers}
            onChange={onChange}
          />
        ) : null}
        {rule.type === "bot_app_id" ? (
          <Field label="机器人 app_id" hint="输入飞书机器人的 app_id">
            <FormTextInput
              value={rule.appId}
              onChangeText={handleBotAppIdChange}
              placeholder="例如：cli_xxx"
              editable={!disabled}
            />
          </Field>
        ) : null}
      </View>
      <Button size="sm" variant="ghost" onPress={onRemove} disabled={disabled}>
        删除
      </Button>
    </View>
  );
}

function AudienceRuleGroupCard({
  group,
  index,
  appId,
  users,
  chats,
  disabled,
  resolveUsers,
  resolveChats,
  onChange,
  onRemove,
}: {
  group: LarkSubstituteAudienceRuleGroup;
  index: number;
  appId: string;
  users: readonly LarkDirectoryUser[];
  chats: readonly LarkDirectoryChat[];
  disabled: boolean;
  resolveUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  resolveChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
  onChange: (group: LarkSubstituteAudienceRuleGroup) => void;
  onRemove: () => void;
}) {
  const addConversationRule = useCallback(
    () =>
      onChange({
        ...group,
        conversationRules: [...group.conversationRules, createConversationRule()],
      }),
    [group, onChange],
  );
  const addUserRule = useCallback(
    () => onChange({ ...group, userRules: [...group.userRules, createUserRule()] }),
    [group, onChange],
  );
  return (
    <View style={styles.groupCard}>
      <View style={styles.groupHeader}>
        <Text style={settingsStyles.rowTitle}>名单 {index + 1}</Text>
        <Button size="sm" variant="ghost" onPress={onRemove} disabled={disabled}>
          删除名单
        </Button>
      </View>
      <View style={styles.layer}>
        <View style={styles.layerHeader}>
          <View style={styles.headingText}>
            <Text style={settingsStyles.rowTitle}>第一层：会话范围</Text>
            <Text style={settingsStyles.rowHint}>本层多条规则之间为“或”</Text>
          </View>
          <Button size="sm" variant="outline" onPress={addConversationRule} disabled={disabled}>
            添加会话范围
          </Button>
        </View>
        {group.conversationRules.map((rule) => (
          <ConversationRuleListItem
            key={rule.id}
            group={group}
            rule={rule}
            appId={appId}
            chats={chats}
            disabled={disabled}
            resolveChats={resolveChats}
            onChange={onChange}
          />
        ))}
      </View>
      <View style={styles.andDivider}>
        <Text style={styles.andText}>且</Text>
      </View>
      <View style={styles.layer}>
        <View style={styles.layerHeader}>
          <View style={styles.headingText}>
            <Text style={settingsStyles.rowTitle}>第二层：用户/机器人范围</Text>
            <Text style={settingsStyles.rowHint}>本层多条规则之间为“或”</Text>
          </View>
          <Button size="sm" variant="outline" onPress={addUserRule} disabled={disabled}>
            添加用户/机器人范围
          </Button>
        </View>
        {group.userRules.map((rule) => (
          <UserRuleListItem
            key={rule.id}
            group={group}
            rule={rule}
            appId={appId}
            users={users}
            disabled={disabled}
            resolveUsers={resolveUsers}
            onChange={onChange}
          />
        ))}
      </View>
    </View>
  );
}

function ConversationRuleListItem({
  group,
  rule,
  appId,
  chats,
  disabled,
  resolveChats,
  onChange,
}: {
  group: LarkSubstituteAudienceRuleGroup;
  rule: LarkSubstituteAudienceConversationRule;
  appId: string;
  chats: readonly LarkDirectoryChat[];
  disabled: boolean;
  resolveChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
  onChange: (group: LarkSubstituteAudienceRuleGroup) => void;
}) {
  const changeRule = useCallback(
    (next: LarkSubstituteAudienceConversationRule) =>
      onChange({
        ...group,
        conversationRules: replaceRule(group.conversationRules, next),
      }),
    [group, onChange],
  );
  const removeCurrentRule = useCallback(
    () =>
      onChange({
        ...group,
        conversationRules: removeRule(group.conversationRules, rule.id),
      }),
    [group, onChange, rule.id],
  );
  return (
    <ConversationRuleRow
      rule={rule}
      appId={appId}
      chats={chats}
      disabled={disabled}
      resolveChats={resolveChats}
      onChange={changeRule}
      onRemove={removeCurrentRule}
    />
  );
}

function UserRuleListItem({
  group,
  rule,
  appId,
  users,
  disabled,
  resolveUsers,
  onChange,
}: {
  group: LarkSubstituteAudienceRuleGroup;
  rule: LarkSubstituteAudienceUserRule;
  appId: string;
  users: readonly LarkDirectoryUser[];
  disabled: boolean;
  resolveUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  onChange: (group: LarkSubstituteAudienceRuleGroup) => void;
}) {
  const changeRule = useCallback(
    (next: LarkSubstituteAudienceUserRule) =>
      onChange({ ...group, userRules: replaceRule(group.userRules, next) }),
    [group, onChange],
  );
  const removeCurrentRule = useCallback(
    () => onChange({ ...group, userRules: removeRule(group.userRules, rule.id) }),
    [group, onChange, rule.id],
  );
  return (
    <UserRuleRow
      rule={rule}
      appId={appId}
      users={users}
      disabled={disabled}
      resolveUsers={resolveUsers}
      onChange={changeRule}
      onRemove={removeCurrentRule}
    />
  );
}

function AudienceRuleGroupListItem({
  group,
  index,
  ruleGroups,
  appId,
  users,
  chats,
  disabled,
  resolveUsers,
  resolveChats,
  onChange,
}: {
  group: LarkSubstituteAudienceRuleGroup;
  index: number;
  ruleGroups: LarkSubstituteAudienceRuleGroup[];
  appId: string;
  users: readonly LarkDirectoryUser[];
  chats: readonly LarkDirectoryChat[];
  disabled: boolean;
  resolveUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  resolveChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
  onChange: (groups: LarkSubstituteAudienceRuleGroup[]) => void;
}) {
  const changeGroup = useCallback(
    (next: LarkSubstituteAudienceRuleGroup) => onChange(replaceRule(ruleGroups, next)),
    [onChange, ruleGroups],
  );
  const removeGroup = useCallback(
    () => onChange(removeRule(ruleGroups, group.id)),
    [group.id, onChange, ruleGroups],
  );
  return (
    <AudienceRuleGroupCard
      group={group}
      index={index}
      appId={appId}
      users={users}
      chats={chats}
      disabled={disabled}
      resolveUsers={resolveUsers}
      resolveChats={resolveChats}
      onChange={changeGroup}
      onRemove={removeGroup}
    />
  );
}

export function LarkSubstituteAudienceRuleListEditor({
  label,
  hint,
  ruleGroups,
  appId,
  users,
  chats,
  resolveUsers,
  resolveChats,
  disabled = false,
  onChange,
}: {
  label: string;
  hint: string;
  ruleGroups: LarkSubstituteAudienceRuleGroup[];
  appId: string;
  users: readonly LarkDirectoryUser[];
  chats: readonly LarkDirectoryChat[];
  resolveUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  resolveChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
  disabled?: boolean;
  onChange: (groups: LarkSubstituteAudienceRuleGroup[]) => void;
}) {
  const addGroup = useCallback(
    () => onChange([...ruleGroups, createAudienceRuleGroup()]),
    [onChange, ruleGroups],
  );
  return (
    <View style={styles.listSection}>
      <View style={styles.listHeading}>
        <View style={styles.headingText}>
          <Text style={settingsStyles.rowTitle}>{label}</Text>
          <Text style={settingsStyles.rowHint}>{hint}</Text>
        </View>
        <Button size="sm" variant="outline" onPress={addGroup} disabled={disabled}>
          添加名单
        </Button>
      </View>
      {ruleGroups.length === 0 ? (
        <Text style={settingsStyles.rowHint}>未配置名单。</Text>
      ) : (
        ruleGroups.map((group, index) => (
          <AudienceRuleGroupListItem
            key={group.id}
            group={group}
            index={index}
            ruleGroups={ruleGroups}
            appId={appId}
            users={users}
            chats={chats}
            disabled={disabled}
            resolveUsers={resolveUsers}
            resolveChats={resolveChats}
            onChange={onChange}
          />
        ))
      )}
    </View>
  );
}

function QuestionRuleRow({
  rule,
  index,
  rules,
  disabled,
  onChange,
}: {
  rule: LarkSubstituteQuestionRule;
  index: number;
  rules: LarkSubstituteQuestionRule[];
  disabled: boolean;
  onChange: (rules: LarkSubstituteQuestionRule[]) => void;
}) {
  const handleDescriptionChange = useCallback(
    (description: string) => onChange(replaceRule(rules, { ...rule, description })),
    [onChange, rule, rules],
  );
  const handleRemove = useCallback(
    () => onChange(removeRule(rules, rule.id)),
    [onChange, rule.id, rules],
  );
  return (
    <View style={styles.questionRow}>
      <View style={styles.questionInput}>
        <FormTextInput
          value={rule.description}
          onChangeText={handleDescriptionChange}
          placeholder={`问题类型 ${index + 1}，例如：研发和代码问题`}
          multiline
          editable={!disabled}
        />
      </View>
      <Button size="sm" variant="ghost" onPress={handleRemove} disabled={disabled}>
        删除
      </Button>
    </View>
  );
}

export function LarkSubstituteQuestionRuleListEditor({
  label,
  hint,
  rules,
  disabled = false,
  onChange,
}: {
  label: string;
  hint: string;
  rules: LarkSubstituteQuestionRule[];
  disabled?: boolean;
  onChange: (rules: LarkSubstituteQuestionRule[]) => void;
}) {
  const addRule = useCallback(() => onChange([...rules, createQuestionRule()]), [onChange, rules]);
  return (
    <View style={styles.listSection}>
      <View style={styles.listHeading}>
        <View style={styles.headingText}>
          <Text style={settingsStyles.rowTitle}>{label}</Text>
          <Text style={settingsStyles.rowHint}>{hint}</Text>
        </View>
        <Button size="sm" variant="outline" onPress={addRule} disabled={disabled}>
          添加规则
        </Button>
      </View>
      {rules.length === 0 ? (
        <Text style={settingsStyles.rowHint}>未配置规则。</Text>
      ) : (
        rules.map((rule, index) => (
          <QuestionRuleRow
            key={rule.id}
            rule={rule}
            index={index}
            rules={rules}
            disabled={disabled}
            onChange={onChange}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  listSection: {
    gap: theme.spacing[2],
  },
  listHeading: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: theme.spacing[3],
    justifyContent: "space-between",
  },
  headingText: {
    flex: 1,
    gap: theme.spacing[1],
    minWidth: 0,
  },
  groupCard: {
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    gap: theme.spacing[3],
    padding: theme.spacing[3],
  },
  groupHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
    justifyContent: "space-between",
  },
  layer: {
    gap: theme.spacing[2],
  },
  layerHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: theme.spacing[2],
    justifyContent: "space-between",
  },
  ruleRow: {
    alignItems: "flex-start",
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: theme.spacing[2],
    padding: theme.spacing[2],
  },
  ruleContent: {
    flex: 1,
    gap: theme.spacing[2],
    minWidth: 0,
  },
  ruleFields: {
    gap: theme.spacing[2],
  },
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
  andDivider: {
    alignItems: "center",
  },
  andText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  questionRow: {
    alignItems: "flex-start",
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
  },
  questionInput: {
    flex: 1,
    minWidth: 0,
  },
}));
