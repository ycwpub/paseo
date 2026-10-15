/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop -- Dynamic permission rule rows bind edits and actions to their current draft values. */
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EditingTextInput as TextInput } from "@/components/ui/text-input";
import { SettingsGroup } from "@/screens/settings/settings-group";
import { SettingsSection } from "@/screens/settings/settings-section";
import {
  createEnabledProjectCallPermissionsDraft,
  createProjectHttpPermissionRuleDraft,
  createProjectRpcPermissionRuleDraft,
  type ProjectCallPermissionsDraft,
  type ProjectHttpPermissionRuleDraft,
  type ProjectRpcPermissionRuleDraft,
} from "./project-call-permissions-model";

export interface ProjectCallPermissionsEditorProps {
  value: ProjectCallPermissionsDraft;
  onChange(value: ProjectCallPermissionsDraft): void;
  httpRulesEditable: boolean;
  httpRulesDisabledReason: string | null;
}

function ChoiceButtons<T extends string>({
  value,
  choices,
  onChange,
  disabled = false,
}: {
  value: T;
  choices: Array<{ value: T; label: string }>;
  onChange(value: T): void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.choiceRow}>
      {choices.map((choice) => (
        <Button
          key={choice.value}
          size="sm"
          variant={value === choice.value ? "default" : "outline"}
          onPress={() => onChange(choice.value)}
          disabled={disabled}
        >
          {choice.label}
        </Button>
      ))}
    </View>
  );
}

function RuleHeader({
  id,
  action,
  onIdChange,
  onActionChange,
  onRemove,
  disabled = false,
}: {
  id: string;
  action: "allow" | "deny";
  onIdChange(value: string): void;
  onActionChange(value: "allow" | "deny"): void;
  onRemove(): void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.ruleHeader}>
      <TextInput
        value={id}
        onChangeText={onIdChange}
        placeholder="规则 ID"
        accessibilityLabel="规则 ID"
        style={styles.flexInput}
        editable={!disabled}
      />
      <ChoiceButtons
        value={action}
        choices={[
          { value: "allow", label: "白名单" },
          { value: "deny", label: "黑名单" },
        ]}
        onChange={onActionChange}
        disabled={disabled}
      />
      <Button size="sm" variant="ghost" onPress={onRemove} disabled={disabled}>
        删除
      </Button>
    </View>
  );
}

function RpcRuleRow({
  rule,
  onChange,
  onRemove,
  disabled = false,
}: {
  rule: ProjectRpcPermissionRuleDraft;
  onChange(rule: ProjectRpcPermissionRuleDraft): void;
  onRemove(): void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.ruleCard}>
      <RuleHeader
        id={rule.id}
        action={rule.action}
        onIdChange={(id) => onChange({ ...rule, id })}
        onActionChange={(action) => onChange({ ...rule, action })}
        onRemove={onRemove}
        disabled={disabled}
      />
      <ChoiceButtons
        value={rule.target.type}
        choices={[
          { value: "exact", label: "精确" },
          { value: "prefix", label: "前缀" },
          { value: "glob", label: "Glob" },
          { value: "regex", label: "正则" },
        ]}
        onChange={(type) => onChange({ ...rule, target: { ...rule.target, type } })}
      />
      <TextInput
        value={rule.target.value}
        onChangeText={(target) => onChange({ ...rule, target: { ...rule.target, value: target } })}
        placeholder="例如 mcp:paseo/read_agent"
        accessibilityLabel="RPC 目标"
      />
    </View>
  );
}

function HttpRuleRow({
  rule,
  onChange,
  onRemove,
  disabled = false,
}: {
  rule: ProjectHttpPermissionRuleDraft;
  onChange(rule: ProjectHttpPermissionRuleDraft): void;
  onRemove(): void;
  disabled?: boolean;
}) {
  const host = rule.hosts?.[0] ?? { type: "exact" as const, value: "" };
  const path = rule.path ?? { type: "prefix" as const, value: "/" };
  return (
    <View style={styles.ruleCard}>
      <RuleHeader
        id={rule.id}
        action={rule.action}
        onIdChange={(id) => onChange({ ...rule, id })}
        onActionChange={(action) => onChange({ ...rule, action })}
        onRemove={onRemove}
        disabled={disabled}
      />
      <View style={styles.httpFields}>
        <TextInput
          value={host.value}
          onChangeText={(value) => onChange({ ...rule, hosts: [{ ...host, value }] })}
          placeholder="主机，例如 api.example.com"
          accessibilityLabel="HTTP 主机"
          style={styles.flexInput}
          editable={!disabled}
        />
        <TextInput
          value={rule.methods?.[0] ?? ""}
          onChangeText={(method) => onChange({ ...rule, methods: method ? [method] : [] })}
          placeholder="GET"
          accessibilityLabel="HTTP 方法"
          style={styles.methodInput}
          editable={!disabled}
        />
        <TextInput
          value={path.value}
          onChangeText={(value) => onChange({ ...rule, path: { ...path, value } })}
          placeholder="/api/"
          accessibilityLabel="HTTP 路径"
          style={styles.flexInput}
          editable={!disabled}
        />
      </View>
      <Text style={styles.hint}>
        主机和路径默认分别使用精确、前缀匹配；高级 glob/正则规则可直接编辑 Project 配置。
      </Text>
    </View>
  );
}

export function ProjectCallPermissionsEditor({
  value,
  onChange,
  httpRulesEditable,
  httpRulesDisabledReason,
}: ProjectCallPermissionsEditorProps) {
  const setEnabled = (enabled: boolean) => {
    if (enabled && !value.configured) {
      onChange(createEnabledProjectCallPermissionsDraft());
      return;
    }
    onChange({ ...value, configured: true, enabled });
  };

  return (
    <SettingsGroup
      title="调用权限"
      info="限制该 Project 内 Agent、Workflow 和插件可以调用的 RPC、MCP Tool 与 HTTP 目标。黑名单优先。"
      testID="project-call-permissions-group"
    >
      <SettingsSection title="启用权限控制" flush>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.label}>Project 调用权限</Text>
            <Text style={styles.hint}>旧 Project 默认不启用；启用后未命中规则的请求默认拒绝。</Text>
          </View>
          <Switch
            value={value.enabled}
            onValueChange={setEnabled}
            accessibilityLabel="启用 Project 调用权限"
            testID="project-call-permissions-enabled"
          />
        </View>
      </SettingsSection>

      {value.enabled ? (
        <>
          <SettingsSection title="默认动作">
            <ChoiceButtons
              value={value.defaultAction}
              choices={[
                { value: "deny", label: "默认拒绝" },
                { value: "allow", label: "默认允许" },
              ]}
              onChange={(defaultAction) => onChange({ ...value, configured: true, defaultAction })}
            />
          </SettingsSection>
          <SettingsSection title="外部代理状态">
            {httpRulesEditable ? (
              <Alert
                variant="warning"
                title="服务器外部代理已开启"
                description="该 Project 的 Agent、Workflow 和插件请求会经过外部代理，并应用下面的 HTTP 白名单和黑名单。"
              />
            ) : (
              <Alert
                variant="warning"
                title="HTTP 规则当前未生效"
                description={httpRulesDisabledReason ?? "服务器未开启外部代理。"}
              />
            )}
          </SettingsSection>
          <SettingsSection
            title="RPC / MCP 规则"
            trailing={
              <Button
                size="sm"
                variant="ghost"
                disabled={!httpRulesEditable}
                onPress={() =>
                  onChange({
                    ...value,
                    rpcRules: [...value.rpcRules, createProjectRpcPermissionRuleDraft()],
                  })
                }
              >
                添加规则
              </Button>
            }
          >
            {value.rpcRules.length === 0 ? (
              <Text style={styles.empty}>暂无 RPC / MCP 规则</Text>
            ) : (
              value.rpcRules.map((rule) => (
                <RpcRuleRow
                  key={rule.rowId}
                  rule={rule}
                  onChange={(next) =>
                    onChange({
                      ...value,
                      rpcRules: value.rpcRules.map((entry) =>
                        entry.rowId === rule.rowId ? next : entry,
                      ),
                    })
                  }
                  onRemove={() =>
                    onChange({
                      ...value,
                      rpcRules: value.rpcRules.filter((entry) => entry.rowId !== rule.rowId),
                    })
                  }
                />
              ))
            )}
          </SettingsSection>
          <SettingsSection
            title="HTTP 规则"
            trailing={
              <Button
                size="sm"
                variant="ghost"
                onPress={() =>
                  onChange({
                    ...value,
                    httpRules: [...value.httpRules, createProjectHttpPermissionRuleDraft()],
                  })
                }
              >
                添加规则
              </Button>
            }
            flush
          >
            <View style={!httpRulesEditable ? styles.disabledRules : undefined}>
              {value.httpRules.length === 0 ? (
                <Text style={styles.empty}>暂无 HTTP 规则</Text>
              ) : (
                value.httpRules.map((rule) => (
                  <HttpRuleRow
                    key={rule.rowId}
                    rule={rule}
                    disabled={!httpRulesEditable}
                    onChange={(next) =>
                      onChange({
                        ...value,
                        httpRules: value.httpRules.map((entry) =>
                          entry.rowId === rule.rowId ? next : entry,
                        ),
                      })
                    }
                    onRemove={() =>
                      onChange({
                        ...value,
                        httpRules: value.httpRules.filter((entry) => entry.rowId !== rule.rowId),
                      })
                    }
                  />
                ))
              )}
            </View>
          </SettingsSection>
        </>
      ) : null}
    </SettingsGroup>
  );
}

const styles = StyleSheet.create((theme) => ({
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[4],
    padding: theme.spacing[4],
  },
  switchCopy: {
    flex: 1,
    gap: theme.spacing[1],
  },
  label: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
  },
  ruleCard: {
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  ruleHeader: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  httpFields: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  flexInput: {
    flex: 1,
    minWidth: 180,
  },
  methodInput: {
    width: 90,
  },
  empty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    padding: theme.spacing[4],
  },
  disabledRules: {
    opacity: theme.opacity[50],
  },
}));
