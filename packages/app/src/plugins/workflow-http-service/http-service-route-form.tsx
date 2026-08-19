/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Route fields intentionally bind edits to the current route draft. */
import { useCallback } from "react";
import { Text, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PluginHttpRoute } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";

export function HttpServiceRouteForm({
  route,
  onChange,
  onDelete,
}: {
  route: PluginHttpRoute;
  onChange: (route: PluginHttpRoute) => void;
  onDelete: () => void;
}) {
  const setField = useCallback(
    <Key extends keyof PluginHttpRoute>(key: Key, value: PluginHttpRoute[Key]) => {
      onChange({ ...route, [key]: value });
    },
    [onChange, route],
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>{route.name}</Text>
          <Text style={styles.subtitle}>POST {route.path}</Text>
        </View>
        <Switch
          value={route.enabled}
          onValueChange={(value) => setField("enabled", value)}
          accessibilityLabel="开启处理路径"
        />
        <Button variant="ghost" size="xs" leftIcon={Trash2} onPress={onDelete}>
          删除
        </Button>
      </View>
      <View style={styles.row}>
        <View style={styles.flexField}>
          <Field label="路径名称">
            <FormTextInput value={route.name} onChangeText={(value) => setField("name", value)} />
          </Field>
        </View>
        <View style={styles.flexField}>
          <Field label="请求 Path">
            <FormTextInput
              value={route.path}
              onChangeText={(value) => setField("path", value)}
              placeholder="/review"
            />
          </Field>
        </View>
      </View>
      <Field label="Workflow 文件" hint="填写插件内或本机可访问的 Workflow JSON 绝对路径。">
        <FormTextInput
          value={route.workflowPath}
          onChangeText={(value) => setField("workflowPath", value)}
        />
      </Field>
      <Field label="处理节点 ID" hint="留空时执行完整 Workflow；填写后只运行指定节点。">
        <FormTextInput
          value={route.targetNodeId ?? ""}
          onChangeText={(value) => setField("targetNodeId", value.trim() ? value : undefined)}
          placeholder="例如：review"
        />
      </Field>
      <Field
        label="请求映射 JSON"
        hint='留空时原样传递请求。可使用 {{request}}、{{request.xxx}}，例如 {"data": "{{request}}"}。'
      >
        <FormTextInput
          multiline
          value={route.requestTemplate}
          onChangeText={(value) => setField("requestTemplate", value)}
          placeholder='{"data": "{{request}}"}'
          textInputStyle={styles.codeInput}
        />
      </Field>
      <Field
        label="响应映射 JSON"
        hint="留空时返回标准响应。可使用 {{job.id}}、{{job.status}}、{{result}}。"
      >
        <FormTextInput
          multiline
          value={route.responseTemplate}
          onChangeText={(value) => setField("responseTemplate", value)}
          placeholder='{"request_id": "{{job.id}}", "status": "{{job.status}}"}'
          textInputStyle={styles.codeInput}
        />
      </Field>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexWrap: "wrap",
  },
  titleGroup: {
    flex: 1,
    minWidth: 180,
  },
  title: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.semibold,
    fontSize: theme.fontSize.sm,
  },
  subtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  flexField: {
    flex: 1,
    minWidth: 220,
  },
  codeInput: {
    minHeight: 88,
    fontFamily: "monospace",
  },
}));
