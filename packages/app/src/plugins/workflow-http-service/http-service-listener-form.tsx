/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Listener and route editors intentionally bind controls to the current draft. */
import { useCallback } from "react";
import { Text, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  PluginHttpJobStatus,
  PluginHttpListener,
  PluginHttpListenerRuntime,
  PluginHttpLocalAddress,
} from "@getpaseo/protocol/messages";
import type { WorkflowScriptSummary } from "@getpaseo/protocol/workflow/types";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import type { WorkflowRunTarget } from "@/workflows/run-targets";
import {
  EMPTY_HTTP_SERVICE_HANDLER_RESOURCES,
  HttpServiceHandlerFields,
  type HttpServiceHandlerEditorResources,
} from "./http-service-handler-fields";
import { HttpServiceHostField } from "./http-service-host-field";
import { HttpServiceRouteForm } from "./http-service-route-form";
import { createDefaultHttpHandler, createHttpRoute, updateHttpRoute } from "./http-service-model";

const RETENTION_STATUSES: Array<{ value: PluginHttpJobStatus; label: string }> = [
  { value: "succeeded", label: "成功" },
  { value: "failed", label: "失败" },
  { value: "cancelled", label: "已取消" },
  { value: "timed_out", label: "超时" },
];

export function HttpServiceListenerForm({
  listener,
  runtime,
  localAddresses,
  localAddressesLoading,
  localAddressesError,
  workflows,
  workflowsLoading,
  workflowsError,
  inspectWorkflowTargets,
  handlerResources = EMPTY_HTTP_SERVICE_HANDLER_RESOURCES,
  onChange,
  onDelete,
}: {
  listener: PluginHttpListener;
  runtime: PluginHttpListenerRuntime | null;
  localAddresses: PluginHttpLocalAddress[];
  localAddressesLoading: boolean;
  localAddressesError: string | null;
  workflows: WorkflowScriptSummary[];
  workflowsLoading: boolean;
  workflowsError: string | null;
  inspectWorkflowTargets: (workflowPath: string) => Promise<WorkflowRunTarget[]>;
  handlerResources?: HttpServiceHandlerEditorResources;
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
        queryPath: "/jobs",
        deletePath: "/jobs",
        handler: listener.routes[0]?.handler ?? createDefaultHttpHandler(),
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
                initialValue={listener.name}
                resetKey={`${listener.id}:name`}
                onChangeText={(value) => setField("name", value)}
              />
            </Field>
          </View>
          <View style={styles.flexField}>
            <HttpServiceHostField
              value={listener.host}
              addresses={localAddresses}
              loading={localAddressesLoading}
              error={localAddressesError}
              onChange={(value) => setField("host", value)}
            />
          </View>
          <View style={styles.portField}>
            <Field label="端口（0 为自动分配）">
              <FormTextInput
                keyboardType="numeric"
                initialValue={String(listener.port)}
                resetKey={`${listener.id}:port`}
                onChangeText={(value) => {
                  const parsed = Number(value);
                  setField("port", Number.isInteger(parsed) && parsed >= 0 ? parsed : 0);
                }}
              />
            </Field>
          </View>
        </View>
        <Text style={styles.runtimeText}>
          HTTP 服务只允许绑定当前 Host 的具体本机 IP，不支持 0.0.0.0、主机名或外部地址。
        </Text>
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
                    initialValue={listener.defaultJobApi.submitPath}
                    resetKey={`${listener.id}:submit-path`}
                    onChangeText={(value) => setDefaultApi({ submitPath: value })}
                  />
                </Field>
              </View>
              <View style={styles.flexField}>
                <Field
                  label="查询结果"
                  hint="请求 ID 通过 request_id 参数传入，例如 /jobs?request_id=123。"
                >
                  <FormTextInput
                    initialValue={listener.defaultJobApi.queryPath}
                    resetKey={`${listener.id}:query-path`}
                    onChangeText={(value) => setDefaultApi({ queryPath: value })}
                  />
                </Field>
              </View>
              <View style={styles.flexField}>
                <Field
                  label="删除请求"
                  hint="请求 ID 通过 request_id 参数传入，路径中无需填写参数。"
                >
                  <FormTextInput
                    initialValue={listener.defaultJobApi.deletePath}
                    resetKey={`${listener.id}:delete-path`}
                    onChangeText={(value) => setDefaultApi({ deletePath: value })}
                  />
                </Field>
              </View>
            </View>
            <HttpServiceHandlerFields
              handler={listener.defaultJobApi.handler}
              workflows={workflows}
              workflowsLoading={workflowsLoading}
              workflowsError={workflowsError}
              inspectWorkflowTargets={inspectWorkflowTargets}
              {...handlerResources}
              onChange={(handler) => setDefaultApi({ handler })}
            />
            <Field
              label="请求映射 JSON"
              hint="留空时原样传递。可使用 {{request}}、{{request.xxx}}。"
            >
              <FormTextInput
                multiline
                initialValue={listener.defaultJobApi.requestTemplate}
                resetKey={`${listener.id}:request-template`}
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
                initialValue={listener.defaultJobApi.responseTemplate}
                resetKey={`${listener.id}:response-template`}
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
          workflows={workflows}
          workflowsLoading={workflowsLoading}
          workflowsError={workflowsError}
          inspectWorkflowTargets={inspectWorkflowTargets}
          handlerResources={handlerResources}
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
                initialValue={String(listener.retention.maxAgeSeconds)}
                resetKey={`${listener.id}:retention-seconds`}
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
