/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Listener and route editors intentionally bind controls to the current draft. */
import { useCallback } from "react";
import { Text, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  PluginHttpJobStatus,
  PluginHttpListener,
  PluginHttpListenerRuntime,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import { HttpServiceRouteForm } from "./http-service-route-form";
import { createHttpRoute, updateHttpRoute } from "./http-service-model";

const RETENTION_STATUSES: Array<{ value: PluginHttpJobStatus; label: string }> = [
  { value: "succeeded", label: "成功" },
  { value: "failed", label: "失败" },
  { value: "cancelled", label: "已取消" },
  { value: "timed_out", label: "超时" },
];

export function HttpServiceListenerForm({
  listener,
  runtime,
  onChange,
  onDelete,
}: {
  listener: PluginHttpListener;
  runtime: PluginHttpListenerRuntime | null;
  onChange: (listener: PluginHttpListener) => void;
  onDelete: () => void;
}) {
  const setField = useCallback(
    <Key extends keyof PluginHttpListener>(key: Key, value: PluginHttpListener[Key]) => {
      onChange({ ...listener, [key]: value });
    },
    [listener, onChange],
  );
  const setDefaultApi = useCallback(
    (patch: Record<string, unknown>) => {
      const current = listener.defaultJobApi ?? {
        enabled: true,
        submitPath: "/jobs",
        queryPath: "/jobs/{requestId}",
        deletePath: "/jobs/{requestId}",
        workflowPath: listener.routes[0]?.workflowPath ?? "",
        requestTemplate: "",
        responseTemplate: "",
      };
      onChange({ ...listener, defaultJobApi: { ...current, ...patch } });
    },
    [listener, onChange],
  );
  const addRoute = useCallback(() => {
    onChange({ ...listener, routes: [...listener.routes, createHttpRoute(listener)] });
  }, [listener, onChange]);
  const toggleRetentionStatus = useCallback(
    (status: PluginHttpJobStatus, enabled: boolean) => {
      const statuses = enabled
        ? [...new Set([...listener.retention.statuses, status])]
        : listener.retention.statuses.filter((entry) => entry !== status);
      onChange({
        ...listener,
        retention: { ...listener.retention, statuses },
      });
    },
    [listener, onChange],
  );

  return (
    <View style={styles.container}>
      <View style={styles.sectionCard}>
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>{listener.name}</Text>
            <Text style={styles.runtimeText}>
              {runtime?.status ?? "stopped"}
              {runtime?.boundPort ? ` · 端口 ${runtime.boundPort}` : ""}
              {runtime?.error ? ` · ${runtime.error}` : ""}
            </Text>
          </View>
          <View style={styles.switchGroup}>
            <Text style={styles.switchLabel}>监听</Text>
            <Switch
              value={listener.enabled}
              onValueChange={(value) => setField("enabled", value)}
              accessibilityLabel="开启监听端口"
            />
          </View>
          <Button variant="ghost" size="xs" leftIcon={Trash2} onPress={onDelete}>
            删除端口
          </Button>
        </View>
        <View style={styles.row}>
          <View style={styles.flexField}>
            <Field label="端口名称">
              <FormTextInput
                value={listener.name}
                onChangeText={(value) => setField("name", value)}
              />
            </Field>
          </View>
          <View style={styles.flexField}>
            <Field label="监听地址">
              <FormTextInput
                value={listener.host}
                onChangeText={(value) => setField("host", value)}
                placeholder="127.0.0.1"
              />
            </Field>
          </View>
          <View style={styles.portField}>
            <Field label="端口（0 为自动分配）">
              <FormTextInput
                keyboardType="numeric"
                value={String(listener.port)}
                onChangeText={(value) => {
                  const parsed = Number(value);
                  setField("port", Number.isInteger(parsed) && parsed >= 0 ? parsed : 0);
                }}
              />
            </Field>
          </View>
        </View>
        <Field label="鉴权 Token 环境变量" hint="监听非本机地址时必填。">
          <FormTextInput
            value={listener.authTokenEnv ?? ""}
            onChangeText={(value) => setField("authTokenEnv", value.trim() ? value : undefined)}
            placeholder="PASEO_HTTP_TOKEN"
          />
        </Field>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>默认异步请求接口</Text>
            <Text style={styles.runtimeText}>提交、查询结果、删除请求三个标准接口</Text>
          </View>
          <Switch
            value={listener.defaultJobApi?.enabled ?? false}
            onValueChange={(value) => setDefaultApi({ enabled: value })}
            accessibilityLabel="开启默认请求接口"
          />
        </View>
        {listener.defaultJobApi?.enabled ? (
          <>
            <View style={styles.row}>
              <View style={styles.flexField}>
                <Field label="提交请求">
                  <FormTextInput
                    value={listener.defaultJobApi.submitPath}
                    onChangeText={(value) => setDefaultApi({ submitPath: value })}
                  />
                </Field>
              </View>
              <View style={styles.flexField}>
                <Field label="查询结果">
                  <FormTextInput
                    value={listener.defaultJobApi.queryPath}
                    onChangeText={(value) => setDefaultApi({ queryPath: value })}
                  />
                </Field>
              </View>
              <View style={styles.flexField}>
                <Field label="删除请求">
                  <FormTextInput
                    value={listener.defaultJobApi.deletePath}
                    onChangeText={(value) => setDefaultApi({ deletePath: value })}
                  />
                </Field>
              </View>
            </View>
            <Field label="Workflow 文件">
              <FormTextInput
                value={listener.defaultJobApi.workflowPath}
                onChangeText={(value) => setDefaultApi({ workflowPath: value })}
              />
            </Field>
            <Field label="处理节点 ID" hint="留空时运行完整 Workflow。">
              <FormTextInput
                value={listener.defaultJobApi.targetNodeId ?? ""}
                onChangeText={(value) =>
                  setDefaultApi({ targetNodeId: value.trim() ? value : undefined })
                }
              />
            </Field>
            <Field
              label="请求映射 JSON"
              hint="留空时原样传递。可使用 {{request}}、{{request.xxx}}。"
            >
              <FormTextInput
                multiline
                value={listener.defaultJobApi.requestTemplate}
                onChangeText={(value) => setDefaultApi({ requestTemplate: value })}
                placeholder='{"data": "{{request}}"}'
                textInputStyle={styles.codeInput}
              />
            </Field>
            <Field
              label="响应映射 JSON"
              hint="留空时返回 requestId、status、statusUrl；可使用 {{job.id}}、{{job.status}}。"
            >
              <FormTextInput
                multiline
                value={listener.defaultJobApi.responseTemplate}
                onChangeText={(value) => setDefaultApi({ responseTemplate: value })}
                textInputStyle={styles.codeInput}
              />
            </Field>
          </>
        ) : null}
      </View>

      <View style={styles.sectionHeader}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>自定义处理路径</Text>
          <Text style={styles.runtimeText}>每个 Path 可设置独立请求映射、响应映射和处理节点。</Text>
        </View>
        <Button variant="outline" size="sm" leftIcon={Plus} onPress={addRoute}>
          新增 Path
        </Button>
      </View>
      {listener.routes.map((route) => (
        <HttpServiceRouteForm
          key={route.id}
          route={route}
          onChange={(nextRoute) => onChange(updateHttpRoute(listener, route.id, () => nextRoute))}
          onDelete={() =>
            onChange({
              ...listener,
              routes: listener.routes.filter((entry) => entry.id !== route.id),
            })
          }
        />
      ))}

      <View style={styles.sectionCard}>
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>请求自动清理</Text>
            <Text style={styles.runtimeText}>仅清理终态请求，不会删除排队中或运行中的请求。</Text>
          </View>
          <Switch
            value={listener.retention.enabled}
            onValueChange={(enabled) =>
              onChange({ ...listener, retention: { ...listener.retention, enabled } })
            }
            accessibilityLabel="开启请求自动清理"
          />
        </View>
        {listener.retention.enabled ? (
          <>
            <Field label="保留秒数" hint="从请求创建时间开始计算。">
              <FormTextInput
                keyboardType="numeric"
                value={String(listener.retention.maxAgeSeconds)}
                onChangeText={(value) => {
                  const parsed = Number(value);
                  onChange({
                    ...listener,
                    retention: {
                      ...listener.retention,
                      maxAgeSeconds:
                        Number.isInteger(parsed) && parsed > 0
                          ? parsed
                          : listener.retention.maxAgeSeconds,
                    },
                  });
                }}
              />
            </Field>
            <View style={styles.statusGrid}>
              {RETENTION_STATUSES.map((option) => (
                <View key={option.value} style={styles.statusOption}>
                  <Text style={styles.switchLabel}>{option.label}</Text>
                  <Switch
                    value={listener.retention.statuses.includes(option.value)}
                    onValueChange={(enabled) => toggleRetentionStatus(option.value, enabled)}
                    accessibilityLabel={`自动清理${option.label}请求`}
                  />
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[4],
  },
  sectionCard: {
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  titleGroup: {
    flex: 1,
    minWidth: 200,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  runtimeText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  switchGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  switchLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  flexField: {
    flex: 1,
    minWidth: 210,
  },
  portField: {
    width: 180,
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  statusOption: {
    minWidth: 120,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    padding: theme.spacing[2],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
  },
  codeInput: {
    minHeight: 88,
    fontFamily: "monospace",
  },
}));
