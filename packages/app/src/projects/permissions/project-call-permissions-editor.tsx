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
}

function ChoiceButtons<T extends string>({
  value,
  choices,
  onChange,
}: {
  value: T;
  choices: Array<{ value: T; label: string }>;
  onChange(value: T): void;
}) {
  return (
    <View style={styles.choiceRow}>
      {choices.map((choice) => (
        <Button
          key={choice.value}
          size="sm"
          variant={value === choice.value ? "default" : "outline"}
          onPress={() => onChange(choice.value)}
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
}: {
  id: string;
  action: "allow" | "deny";
  onIdChange(value: string): void;
  onActionChange(value: "allow" | "deny"): void;
  onRemove(): void;
}) {
  return (
    <View style={styles.ruleHeader}>
      <TextInput
        value={id}
        onChangeText={onIdChange}
        placeholder="规则 ID"
        accessibilityLabel="规则 ID"
        style={styles.flexInput}
      />
      <ChoiceButtons
        value={action}
        choices={[
          { value: "allow", label: "白名单" },
          { value: "deny", label: "黑名单" },
        ]}
        onChange={onActionChange}
      />
      <Button size="sm" variant="ghost" onPress={onRemove}>
        删除
      </Button>
    </View>
  );
}

function RpcRuleRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: ProjectRpcPermissionRuleDraft;
  onChange(rule: ProjectRpcPermissionRuleDraft): void;
  onRemove(): void;
}) {
  return (
    <View style={styles.ruleCard}>
      <RuleHeader
        id={rule.id}
        action={rule.action}
        onIdChange={(id) => onChange({ ...rule, id })}
        onActionChange={(action) => onChange({ ...rule, action })}
        onRemove={onRemove}
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
}: {
  rule: ProjectHttpPermissionRuleDraft;
  onChange(rule: ProjectHttpPermissionRuleDraft): void;
  onRemove(): void;
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
      />
      <View style={styles.httpFields}>
        <TextInput
          value={host.value}
          onChangeText={(value) => onChange({ ...rule, hosts: [{ ...host, value }] })}
          placeholder="主机，例如 api.example.com"
          accessibilityLabel="HTTP 主机"
          style={styles.flexInput}
        />
        <TextInput
          value={rule.methods?.[0] ?? ""}
          onChangeText={(method) => onChange({ ...rule, methods: method ? [method] : [] })}
          placeholder="GET"
          accessibilityLabel="HTTP 方法"
          style={styles.methodInput}
        />
        <TextInput
          value={path.value}
          onChangeText={(value) => onChange({ ...rule, path: { ...path, value } })}
          placeholder="/api/"
          accessibilityLabel="HTTP 路径"
          style={styles.flexInput}
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
          <SettingsSection title="网络强制模式">
            <ChoiceButtons
              value={value.enforcement}
              choices={[
                { value: "strict", label: "严格模式" },
                { value: "managed", label: "托管出口" },
              ]}
              onChange={(enforcement) => onChange({ ...value, configured: true, enforcement })}
            />
            {value.enforcement === "strict" ? (
              <Alert
                variant="warning"
                title="当前主机尚未启用严格网络隔离"
                description="保存后会阻止该 Project 启动新任务，不会静默降级。安装并启用系统网络隔离组件后才能运行；如需继续使用，可切换到“托管出口”。"
              />
            ) : (
              <Alert
                variant="warning"
                title="托管出口不能限制 shell 直连"
                description="RPC、Paseo MCP 和托管 HTTP 会被拦截，但 Agent 仍可能通过 curl、SDK 或直接 Socket 绕过。"
              />
            )}
          </SettingsSection>
          <SettingsSection
            title="RPC / MCP 规则"
            trailing={
              <Button
                size="sm"
                variant="ghost"
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
            {value.httpRules.length === 0 ? (
              <Text style={styles.empty}>暂无 HTTP 规则</Text>
            ) : (
              value.httpRules.map((rule) => (
                <HttpRuleRow
                  key={rule.rowId}
                  rule={rule}
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
}));
