import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  LarkDirectoryChat,
  LarkDirectoryUser,
  LarkSubstituteAudienceRule,
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
  createAudienceRule,
  createQuestionRule,
  type LarkSubstituteAudienceRuleType,
} from "./lark-substitute-rule-form-model";

const AUDIENCE_TYPE_OPTIONS: SelectFieldOption<LarkSubstituteAudienceRuleType>[] = [
  { id: "user", value: "user", label: "用户", description: "按用户名称、邮箱和 ou_xxx 匹配" },
  { id: "group", value: "group", label: "群", description: "按群名称和 oc_xxx 匹配" },
  {
    id: "group_ai_category",
    value: "group_ai_category",
    label: "群 AI 分类",
    description: "由 Agent 根据群名称和消息内容进行语义分类",
  },
  { id: "all", value: "all", label: "全部", description: "匹配全部用户和群" },
  {
    id: "group_name_regex",
    value: "group_name_regex",
    label: "群名称正则表达式",
    description: "使用正则表达式匹配群名称",
  },
];

function audienceTypeDisplay(type: LarkSubstituteAudienceRuleType): SelectFieldDisplay {
  const option = AUDIENCE_TYPE_OPTIONS.find((entry) => entry.value === type);
  return {
    label: option?.label ?? type,
    description: option?.description,
  };
}

function replaceRule<T extends { id: string }>(rules: readonly T[], next: T): T[] {
  return rules.map((rule) => (rule.id === next.id ? next : rule));
}

function removeRule<T extends { id: string }>(rules: readonly T[], id: string): T[] {
  return rules.filter((rule) => rule.id !== id);
}

function UserRuleFields({
  rule,
  appId,
  users,
  disabled,
  resolveUsers,
  onChange,
}: {
  rule: Extract<LarkSubstituteAudienceRule, { type: "user" }>;
  appId: string;
  users: readonly LarkDirectoryUser[];
  disabled: boolean;
  resolveUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  onChange: (rule: LarkSubstituteAudienceRule) => void;
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
  const selectedDisplay = useMemo<SelectFieldDisplay | null>(() => {
    const selected =
      availableUsers.find((user) => user.openId === rule.openId) ??
      (rule.openId
        ? {
            appId,
            openId: rule.openId,
            displayName: rule.name,
            email: rule.email,
            updatedAt: "",
          }
        : null);
    return selected
      ? {
          label: formatLarkUserIdentity(selected),
          description: selected.openId,
        }
      : null;
  }, [appId, availableUsers, rule.email, rule.name, rule.openId]);
  const handleSelect = useCallback(
    (user: LarkDirectoryUser) => {
      onChange({
        ...rule,
        openId: user.openId,
        name: user.displayName,
        email: user.email,
      });
    },
    [onChange, rule],
  );
  const handleResolve = useCallback(async () => {
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
      if (localMatches.length === 1) handleSelect(localMatches[0]!);
      setError(null);
      return;
    }
    if (/^ou_[A-Za-z0-9_-]+$/u.test(query)) {
      onChange({ ...rule, openId: query, name: null, email: null });
      setLookup("");
      setError(null);
      return;
    }
    if (!query.includes("@")) {
      setError("本地目录未找到该用户；首次查询请使用邮箱，查询后可按名称选择");
      return;
    }
    setResolving(true);
    setError(null);
    try {
      const resolved = await resolveUsers(appId, [query]);
      setResolvedUsers((current) => [...current, ...resolved]);
      if (resolved[0]) {
        handleSelect(resolved[0]);
        setLookup("");
      }
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : String(lookupError));
    } finally {
      setResolving(false);
    }
  }, [appId, availableUsers, handleSelect, lookup, onChange, resolveUsers, rule]);

  return (
    <View style={styles.ruleFields}>
      <View style={styles.lookupRow}>
        <FormTextInput
          value={lookup}
          onChangeText={setLookup}
          placeholder="输入用户名称、邮箱或 ou_xxx"
          editable={!disabled && !resolving}
          style={styles.lookupInput}
          onSubmitEditing={handleResolve}
        />
        <Button
          size="sm"
          variant="outline"
          onPress={handleResolve}
          loading={resolving}
          disabled={disabled || resolving || !appId}
        >
          搜索
        </Button>
      </View>
      <LarkUserDirectoryPicker
        appId={appId}
        users={availableUsers}
        selectedOpenId={rule.openId}
        selectedDisplay={selectedDisplay}
        onSelect={handleSelect}
        label="从通讯录选择用户"
        placeholder="搜索通讯录中的用户名、邮箱或 ou_xxx"
        disabled={disabled}
        field={false}
      />
      {error ? <Text style={settingsStyles.rowError}>{error}</Text> : null}
    </View>
  );
}

function GroupRuleFields({
  rule,
  appId,
  chats,
  disabled,
  resolveChats,
  onChange,
}: {
  rule: Extract<LarkSubstituteAudienceRule, { type: "group" }>;
  appId: string;
  chats: readonly LarkDirectoryChat[];
  disabled: boolean;
  resolveChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
  onChange: (rule: LarkSubstituteAudienceRule) => void;
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
      hint="通过群名称或 oc_xxx 搜索，并保存唯一 chatId。"
      appId={appId}
      chatId={rule.chatId}
      chats={chats}
      resolveChats={resolveChats}
      onChange={handleChatChange}
      disabled={disabled}
    />
  );
}

function AudienceRuleRow({
  rule,
  appId,
  users,
  chats,
  disabled,
  resolveUsers,
  resolveChats,
  onChange,
  onRemove,
}: {
  rule: LarkSubstituteAudienceRule;
  appId: string;
  users: readonly LarkDirectoryUser[];
  chats: readonly LarkDirectoryChat[];
  disabled: boolean;
  resolveUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  resolveChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
  onChange: (rule: LarkSubstituteAudienceRule) => void;
  onRemove: () => void;
}) {
  const handleTypeChange = useCallback(
    (type: LarkSubstituteAudienceRuleType) => {
      onChange({ ...createAudienceRule(type), id: rule.id });
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
    <View style={styles.ruleCard}>
      <View style={styles.ruleHeader}>
        <View style={styles.typeField}>
          <SelectField
            field={false}
            label="类型"
            value={rule.type}
            selectedDisplay={audienceTypeDisplay(rule.type)}
            options={AUDIENCE_TYPE_OPTIONS}
            onChange={handleTypeChange}
            placeholder="选择名单类型"
            emptyText="暂无名单类型"
            disabled={disabled}
          />
        </View>
        <Button size="sm" variant="ghost" onPress={onRemove} disabled={disabled}>
          删除
        </Button>
      </View>
      {rule.type === "user" ? (
        <UserRuleFields
          rule={rule}
          appId={appId}
          users={users}
          disabled={disabled}
          resolveUsers={resolveUsers}
          onChange={onChange}
        />
      ) : null}
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
        <Field label="群 AI 分类" hint="Agent 会结合群名称和当前问题上下文进行语义分类。">
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
      {rule.type === "all" ? (
        <Text style={settingsStyles.rowHint}>此规则匹配全部用户和群。</Text>
      ) : null}
    </View>
  );
}

function AudienceRuleListItem({
  rule,
  rules,
  appId,
  users,
  chats,
  disabled,
  resolveUsers,
  resolveChats,
  onChange,
}: {
  rule: LarkSubstituteAudienceRule;
  rules: LarkSubstituteAudienceRule[];
  appId: string;
  users: readonly LarkDirectoryUser[];
  chats: readonly LarkDirectoryChat[];
  disabled: boolean;
  resolveUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  resolveChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
  onChange: (rules: LarkSubstituteAudienceRule[]) => void;
}) {
  const handleChange = useCallback(
    (next: LarkSubstituteAudienceRule) => onChange(replaceRule(rules, next)),
    [onChange, rules],
  );
  const handleRemove = useCallback(
    () => onChange(removeRule(rules, rule.id)),
    [onChange, rule.id, rules],
  );
  return (
    <AudienceRuleRow
      rule={rule}
      appId={appId}
      users={users}
      chats={chats}
      disabled={disabled}
      resolveUsers={resolveUsers}
      resolveChats={resolveChats}
      onChange={handleChange}
      onRemove={handleRemove}
    />
  );
}

export function LarkSubstituteAudienceRuleListEditor({
  label,
  hint,
  rules,
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
  rules: LarkSubstituteAudienceRule[];
  appId: string;
  users: readonly LarkDirectoryUser[];
  chats: readonly LarkDirectoryChat[];
  resolveUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  resolveChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
  disabled?: boolean;
  onChange: (rules: LarkSubstituteAudienceRule[]) => void;
}) {
  const addRule = useCallback(() => onChange([...rules, createAudienceRule()]), [onChange, rules]);
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
        rules.map((rule) => (
          <AudienceRuleListItem
            key={rule.id}
            rule={rule}
            rules={rules}
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
  ruleCard: {
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    gap: theme.spacing[3],
    padding: theme.spacing[3],
  },
  ruleHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  typeField: {
    flex: 1,
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
